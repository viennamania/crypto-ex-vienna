import { NextResponse, type NextRequest } from 'next/server';

import { updateStoreUsdtToKrwRate } from '@lib/api/store';
import clientPromise, { dbName } from '@/lib/mongodb';
import {
  isWalletAddressAuthorizedForExpectedWallet,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toText = (value: unknown) => String(value ?? '').trim();

const normalizeRate = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Number(numeric.toFixed(2));
  if (rounded <= 0) return null;
  return rounded;
};

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as Record<string, unknown>)
      : {};

  const normalizedStorecode = toText(body.storecode);
  const normalizedChangedByName = toText(body.changedByName);
  const nextUsdtToKrwRate = normalizeRate(body?.usdtToKrwRate);

  if (!normalizedStorecode || nextUsdtToKrwRate === null) {
    return NextResponse.json(
      { error: 'storecode and valid usdtToKrwRate are required' },
      { status: 400 },
    );
  }

  const signatureAuth = await verifyWalletAuthFromBody({
    body,
    path: '/api/store/updateStoreUsdtToKrwRate',
    method: 'POST',
    storecode: normalizedStorecode,
    consumeNonceValue: true,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  const client = await clientPromise;
  const storeCollection = client.db(dbName).collection('stores');
  const agentCollection = client.db(dbName).collection('agents');
  const historyCollection = client.db(dbName).collection('store_usdt_to_krw_rate_logs');

  const store = await storeCollection.findOne<any>(
    { storecode: { $regex: `^${escapeRegex(normalizedStorecode)}$`, $options: 'i' } },
    { projection: { _id: 0, storecode: 1, storeName: 1, usdtToKrwRate: 1, agentcode: 1 } },
  );
  if (!store) {
    return NextResponse.json({ error: 'store not found' }, { status: 404 });
  }

  if (signatureAuth.ok === true) {
    const agentcode = toText(store?.agentcode);
    if (!agentcode) {
      return NextResponse.json({ error: 'store agentcode is missing' }, { status: 400 });
    }

    const agent = await agentCollection.findOne<Record<string, unknown>>(
      {
        agentcode: {
          $regex: `^${escapeRegex(agentcode)}$`,
          $options: 'i',
        },
      },
      {
        projection: {
          _id: 0,
          adminWalletAddress: 1,
        },
      },
    );

    const adminWalletAddress = toText(agent?.adminWalletAddress);
    if (!adminWalletAddress) {
      return NextResponse.json({ error: 'agent admin wallet address is not configured' }, { status: 400 });
    }

    const isAuthorized = await isWalletAddressAuthorizedForExpectedWallet({
      expectedWalletAddress: adminWalletAddress,
      candidateWalletAddress: signatureAuth.walletAddress,
    });
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Only agent admin wallet can update store rate' }, { status: 403 });
    }
  }

  const resolvedStorecode = String(store?.storecode || normalizedStorecode).trim();
  const normalizedChangedByWalletAddress = signatureAuth.ok === true
    ? signatureAuth.walletAddress
    : toText(body.changedByWalletAddress || body.walletAddress);
  const previousUsdtToKrwRate = Number.isFinite(Number(store?.usdtToKrwRate))
    ? Number(Number(store?.usdtToKrwRate).toFixed(2))
    : 0;
  const isChanged = previousUsdtToKrwRate !== nextUsdtToKrwRate;

  const result = await updateStoreUsdtToKrwRate({
    storecode: resolvedStorecode,
    usdtToKrwRate: nextUsdtToKrwRate,
  });

  if (!result) {
    return NextResponse.json({ error: 'failed to update usdtToKrwRate' }, { status: 500 });
  }

  if (isChanged) {
    await historyCollection.insertOne({
      storecode: resolvedStorecode,
      storeName: String(store?.storeName || ''),
      prevUsdtToKrwRate: previousUsdtToKrwRate,
      nextUsdtToKrwRate: nextUsdtToKrwRate,
      changedByWalletAddress: normalizedChangedByWalletAddress,
      changedByName: normalizedChangedByName,
      changedAt: new Date(),
    });
  }

  return NextResponse.json({
    result: true,
    changed: isChanged,
    previousUsdtToKrwRate,
    nextUsdtToKrwRate,
  });
}
