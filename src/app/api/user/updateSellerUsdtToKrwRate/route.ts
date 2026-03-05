import { NextResponse, type NextRequest } from 'next/server';

import { updateSellerUsdtToKrwRate } from '@lib/api/user';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import {
  getRequesterIpAddress,
  getRoleForWalletAddress,
  isWalletAddressAuthorizedForExpectedWallet,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';

const toText = (value: unknown) => String(value ?? '').trim();
const MAX_USDT_TO_KRW_RATE = 1_000_000;

const resolveTargetWalletAddress = async ({
  storecode,
  requestedWalletAddress,
  signerWalletAddress,
}: {
  storecode: string;
  requestedWalletAddress: string;
  signerWalletAddress: string;
}) => {
  if (!isWalletAddress(signerWalletAddress)) {
    return '';
  }
  if (!isWalletAddress(requestedWalletAddress) || requestedWalletAddress === signerWalletAddress) {
    return signerWalletAddress;
  }

  const requester = await getRoleForWalletAddress({
    storecode,
    walletAddress: signerWalletAddress,
  });
  if (requester?.role === 'admin') {
    return requestedWalletAddress;
  }

  const isAuthorized = await isWalletAddressAuthorizedForExpectedWallet({
    expectedWalletAddress: requestedWalletAddress,
    candidateWalletAddress: signerWalletAddress,
  });
  return isAuthorized ? requestedWalletAddress : '';
};

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as Record<string, unknown>)
      : {};

  const storecode = toText(body.storecode) || 'admin';
  const requestedWalletAddress = normalizeWalletAddress(body.walletAddress);
  const usdtToKrwRate = Number(body.usdtToKrwRate || 0);
  if (!Number.isFinite(usdtToKrwRate) || usdtToKrwRate < 0 || usdtToKrwRate > MAX_USDT_TO_KRW_RATE) {
    return NextResponse.json(
      {
        error: 'usdtToKrwRate is invalid.',
      },
      {
        status: 400,
      },
    );
  }

  const ipAddress = getRequesterIpAddress(request) || 'unknown';
  const rate = evaluateRateLimit({
    key: `api:user:updateSellerUsdtToKrwRate:${ipAddress}:${requestedWalletAddress || 'unknown'}`,
    limit: 30,
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
    path: '/api/user/updateSellerUsdtToKrwRate',
    method: 'POST',
    storecode,
    consumeNonceValue: true,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  if (signatureAuth.ok !== true) {
    return NextResponse.json(
      {
        error: 'wallet signature is required.',
      },
      {
        status: 401,
      },
    );
  }

  const requester = await getRoleForWalletAddress({
    storecode,
    walletAddress: signatureAuth.walletAddress,
  });
  const signerWalletAddress = toText(requester?.walletAddress) || signatureAuth.walletAddress;

  const walletAddress = await resolveTargetWalletAddress({
    storecode,
    requestedWalletAddress,
    signerWalletAddress,
  });
  if (!isWalletAddress(walletAddress)) {
    return NextResponse.json(
      {
        error: 'walletAddress is not authorized.',
      },
      {
        status: 403,
      },
    );
  }

  const result = await updateSellerUsdtToKrwRate({
    storecode,
    walletAddress,
    usdtToKrwRate,
  });

  return NextResponse.json({
    result,
  });
}
