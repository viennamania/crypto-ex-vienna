import { NextResponse, type NextRequest } from 'next/server';

import { updateStoreUsdtToKrwRate } from '@lib/api/store';
import clientPromise, { dbName } from '@/lib/mongodb';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeRate = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Number(numeric.toFixed(2));
  if (rounded <= 0) return null;
  return rounded;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const normalizedStorecode = String(body?.storecode || '').trim();
  const normalizedChangedByWalletAddress = String(
    body?.changedByWalletAddress || body?.walletAddress || '',
  ).trim();
  const normalizedChangedByName = String(body?.changedByName || '').trim();
  const nextUsdtToKrwRate = normalizeRate(body?.usdtToKrwRate);

  if (!normalizedStorecode || nextUsdtToKrwRate === null) {
    return NextResponse.json(
      { error: 'storecode and valid usdtToKrwRate are required' },
      { status: 400 },
    );
  }

  const client = await clientPromise;
  const storeCollection = client.db(dbName).collection('stores');
  const historyCollection = client.db(dbName).collection('store_usdt_to_krw_rate_logs');

  const store = await storeCollection.findOne<any>(
    { storecode: { $regex: `^${escapeRegex(normalizedStorecode)}$`, $options: 'i' } },
    { projection: { _id: 0, storecode: 1, storeName: 1, usdtToKrwRate: 1 } },
  );
  if (!store) {
    return NextResponse.json({ error: 'store not found' }, { status: 404 });
  }

  const resolvedStorecode = String(store?.storecode || normalizedStorecode).trim();
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

