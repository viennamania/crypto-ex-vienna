import { NextResponse, type NextRequest } from 'next/server';

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
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);

    if (!isWalletAddress(requestedWalletAddress)) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
    }

    const ipAddress = getRequesterIpAddress(request) || 'unknown';
    const rate = evaluateRateLimit({
      key: `api:user:getPlatformFeeLogs:${ipAddress}:${requestedWalletAddress}`,
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
      path: '/api/user/getPlatformFeeLogs',
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

    const walletAddressRegex = {
      $regex: `^${escapeRegex(requestedWalletAddress)}$`,
      $options: 'i',
    };

    const filter: Record<string, unknown> = {
      walletAddress: walletAddressRegex,
    };
    if (effectiveStorecode) {
      filter.storecode = effectiveStorecode;
    }

    const client = await clientPromise;
    const logs = client.db(dbName).collection('platform_fee_logs');

    const result = await logs
      .find(filter)
      .sort({ changedAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({ result });
  } catch (error) {
    console.error('getPlatformFeeLogs failed', error);
    return NextResponse.json({ error: 'failed to load platform fee logs' }, { status: 500 });
  }
}
