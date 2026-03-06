import { NextResponse, type NextRequest } from 'next/server';

import clientPromise, { dbName } from '@/lib/mongodb';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import {
  getRequesterIpAddress,
  getRoleForWalletAddress,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toText = (value: unknown) => String(value ?? '').trim();
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const PLATFORM_FEE_RATE_MAX = 5;

export async function POST(request: NextRequest) {
  try {
    const bodyRaw = await request.json().catch(() => ({}));
    const body = isRecord(bodyRaw) ? bodyRaw : {};

    const normalizedStorecode = toText(body.storecode) || 'admin';
    const normalizedWalletAddress = normalizeWalletAddress(body.walletAddress);
    const normalizedFeeWalletAddress = normalizeWalletAddress(body.feeWalletAddress);
    const normalizedFeeRate = Number(body.feeRate);

    if (!isWalletAddress(normalizedWalletAddress)) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
    }
    if (!isWalletAddress(normalizedFeeWalletAddress)) {
      return NextResponse.json({ error: 'feeWalletAddress must be a valid wallet address' }, { status: 400 });
    }
    if (!Number.isFinite(normalizedFeeRate) || normalizedFeeRate < 0 || normalizedFeeRate > PLATFORM_FEE_RATE_MAX) {
      return NextResponse.json(
        { error: `feeRate must be a number between 0 and ${PLATFORM_FEE_RATE_MAX}` },
        { status: 400 },
      );
    }

    const ipAddress = getRequesterIpAddress(request) || 'unknown';
    const rate = evaluateRateLimit({
      key: `api:user:updateSellerPlatformFee:${ipAddress}:${normalizedWalletAddress}`,
      limit: 30,
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
      path: '/api/user/updateSellerPlatformFee',
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
    if (toText(requester?.role) !== 'admin') {
      return NextResponse.json({ error: 'Only admin can update seller platform fee.' }, { status: 403 });
    }

    const client = await clientPromise;
    const usersCollection = client.db(dbName).collection('users');
    const platformFeeLogsCollection = client.db(dbName).collection('platform_fee_logs');

    const walletRegex = {
      $regex: `^${escapeRegex(normalizedWalletAddress)}$`,
      $options: 'i',
    };
    const feeWalletRegex = {
      $regex: `^${escapeRegex(normalizedFeeWalletAddress)}$`,
      $options: 'i',
    };

    const primaryFilter: Record<string, unknown> = {
      storecode: normalizedStorecode,
      walletAddress: walletRegex,
    };

    let user = await usersCollection.findOne<any>(primaryFilter, {
      projection: { walletAddress: 1, storecode: 1, seller: 1 },
    });

    if (!user?._id) {
      return NextResponse.json({ error: 'user not found' }, { status: 404 });
    }

    const feeWalletProjection = { projection: { _id: 1, walletAddress: 1, storecode: 1 } };
    const registeredFeeWalletUser =
      (await usersCollection.findOne<any>(
        {
          storecode: normalizedStorecode,
          walletAddress: feeWalletRegex,
        },
        feeWalletProjection,
      ))
      || (await usersCollection.findOne<any>(
        {
          walletAddress: feeWalletRegex,
        },
        feeWalletProjection,
      ));

    if (!registeredFeeWalletUser?._id) {
      return NextResponse.json(
        { error: 'feeWalletAddress must be a registered member wallet address' },
        { status: 400 },
      );
    }

    const feeWalletAddressForSave =
      normalizeWalletAddress(registeredFeeWalletUser.walletAddress)
      || normalizedFeeWalletAddress;

    const nextFee = {
      walletAddress: feeWalletAddressForSave,
      rate: normalizedFeeRate,
    };
    const prevFee = user?.seller?.platformFee || null;
    const changedAt = new Date().toISOString();

    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          'seller.platformFee': nextFee,
          updatedAt: changedAt,
        },
      },
    );

    await platformFeeLogsCollection.insertOne({
      walletAddress: String(user?.walletAddress || normalizedWalletAddress),
      storecode: String(user?.storecode || normalizedStorecode || 'admin'),
      prev: prevFee,
      next: nextFee,
      changedAt,
      changedBy: toText(requester?.nickname) || toText(requester?.walletAddress) || 'admin',
      changedByWalletAddress: toText(requester?.walletAddress) || signatureAuth.walletAddress,
    });

    return NextResponse.json({
      result: nextFee,
    });
  } catch (error) {
    console.error('updateSellerPlatformFee failed', error);
    return NextResponse.json({ error: 'failed to update seller platform fee' }, { status: 500 });
  }
}
