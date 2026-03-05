import { NextResponse, type NextRequest } from 'next/server';

import { updateSellerStatus } from '@lib/api/user';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import {
  getRequesterIpAddress,
  getRoleForWalletAddress,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';

const toText = (value: unknown) => String(value ?? '').trim();
const isAdminStorecode = (storecode: string) => storecode.toLowerCase() === 'admin';

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as Record<string, unknown>)
      : {};

  const storecode = toText(body.storecode);
  const nickname = toText(body.nickname);
  const sellerStatus = toText(body.sellerStatus);
  const bankName = toText(body.bankName);
  const accountNumber = toText(body.accountNumber);
  const accountHolder = toText(body.accountHolder);
  const requestedWalletAddress = normalizeWalletAddress(body.walletAddress);

  const ipAddress = getRequesterIpAddress(request) || 'unknown';
  const rate = evaluateRateLimit({
    key: `api:user:updateSeller:${ipAddress}:${requestedWalletAddress || 'unknown'}`,
    limit: 20,
    windowMs: 60_000,
  });

  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: 'Too many requests',
      },
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
    path: '/api/user/updateSeller',
    method: 'POST',
    storecode,
    consumeNonceValue: true,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  const walletAddress =
    signatureAuth.ok === true
      ? signatureAuth.walletAddress
      : requestedWalletAddress;

  if (!isWalletAddress(walletAddress)) {
    return NextResponse.json(
      {
        error: 'walletAddress is invalid.',
      },
      {
        status: 400,
      },
    );
  }

  if (isAdminStorecode(storecode)) {
    if (signatureAuth.ok !== true) {
      return NextResponse.json(
        {
          error: 'wallet signature is required for admin storecode.',
        },
        {
          status: 401,
        },
      );
    }

    const requester = await getRoleForWalletAddress({
      storecode,
      walletAddress,
    });

    if (!requester || requester.role !== 'admin') {
      return NextResponse.json(
        {
          error: 'Only admin can update admin seller profile.',
        },
        {
          status: 403,
        },
      );
    }
  }

  const result = await updateSellerStatus({
    storecode,
    walletAddress,
    nickname,
    sellerStatus,
    bankName,
    accountNumber,
    accountHolder,
  });

  return NextResponse.json({
    result,
  });
}
