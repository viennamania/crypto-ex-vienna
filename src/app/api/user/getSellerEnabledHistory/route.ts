import { NextRequest, NextResponse } from 'next/server';

import clientPromise, { dbName } from '@/lib/mongodb';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import {
  getRequesterIpAddress,
  getRoleForWalletAddress,
  isWalletAddressAuthorizedForExpectedWallet,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';

const toText = (value: unknown) => String(value ?? '').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export async function POST(request: NextRequest) {
  try {
    const bodyRaw = await request.json().catch(() => ({}));
    const body = isRecord(bodyRaw) ? bodyRaw : {};

    const normalizedStorecode = toText(body.storecode) || 'admin';
    const requestedWalletAddress = normalizeWalletAddress(body.walletAddress);
    const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 50);
    const page = Math.max(Number(body.page) || 1, 1);

    if (!isWalletAddress(requestedWalletAddress)) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
    }

    const ipAddress = getRequesterIpAddress(request) || 'unknown';
    const rate = evaluateRateLimit({
      key: `api:user:getSellerEnabledHistory:${ipAddress}:${requestedWalletAddress}`,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(Math.ceil(rate.retryAfterMs / 1000), 1)),
          },
        },
      );
    }

    const signatureAuth = await verifyWalletAuthFromBody({
      body,
      path: '/api/user/getSellerEnabledHistory',
      method: 'POST',
      storecode: normalizedStorecode,
      consumeNonceValue: true,
    });
    if (signatureAuth.ok === false) {
      return signatureAuth.response;
    }
    if (signatureAuth.ok !== true) {
      return NextResponse.json({ error: 'wallet signature is required.' }, { status: 401 });
    }

    const requester = await getRoleForWalletAddress({
      storecode: normalizedStorecode,
      walletAddress: signatureAuth.walletAddress,
    });
    const requesterRole = toText(requester?.role).toLowerCase();
    const isRequesterAdmin = requesterRole === 'admin';
    const requesterStorecode = toText(requester?.storecode);
    const signerWalletAddress = toText(requester?.walletAddress) || signatureAuth.walletAddress;

    const isSelfAuthorized = await isWalletAddressAuthorizedForExpectedWallet({
      expectedWalletAddress: requestedWalletAddress,
      candidateWalletAddress: signerWalletAddress,
    });
    if (!isRequesterAdmin && !isSelfAuthorized) {
      return NextResponse.json({ error: 'walletAddress is not authorized.' }, { status: 403 });
    }

    const effectiveStorecode = isRequesterAdmin
      ? normalizedStorecode
      : requesterStorecode || normalizedStorecode;

    const client = await clientPromise;
    const collection = client.db(dbName).collection('seller_enabled_logs');

    const query: Record<string, unknown> = {
      walletAddress: {
        $regex: `^${escapeRegex(requestedWalletAddress)}$`,
        $options: 'i',
      },
    };
    if (effectiveStorecode) {
      query.storecode = effectiveStorecode;
    }

    const items = await collection
      .find(query, {
        limit,
        skip: (page - 1) * limit,
      })
      .sort({ changedAt: -1 })
      .toArray();

    const totalCount = await collection.countDocuments(query);

    return NextResponse.json({ result: { items, totalCount } });
  } catch (error) {
    console.error('getSellerEnabledHistory failed', error);
    return NextResponse.json({ error: 'failed to load seller enabled history' }, { status: 500 });
  }
}
