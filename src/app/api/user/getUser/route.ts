import { NextResponse, type NextRequest } from 'next/server';

import { getOneByWalletAddress } from '@lib/api/user';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import { getRequesterIpAddress, verifyWalletAuthFromBody } from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';

const toText = (value: unknown) => String(value ?? '').trim();

const SAFE_USER_PROJECTION: Record<string, number> = {
  password: 0,
  walletPrivateKey: 0,
  escrowWalletPrivateKey: 0,
  'vaultWallet.privateKey': 0,
};

const withRateLimit = ({
  ipAddress,
  walletAddress,
}: {
  ipAddress: string;
  walletAddress: string;
}) =>
  evaluateRateLimit({
    key: `api:user:getUser:${ipAddress || 'unknown'}:${walletAddress || 'unknown'}`,
    limit: 120,
    windowMs: 60_000,
  });

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as Record<string, unknown>)
      : {};

  const storecode = toText(body.storecode);
  const ipAddress = getRequesterIpAddress(request) || 'unknown';

  const requestedWalletAddress = normalizeWalletAddress(body.walletAddress);
  const rate = withRateLimit({
    ipAddress,
    walletAddress: requestedWalletAddress,
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

  let walletAddress = requestedWalletAddress;

  const signatureAuth = await verifyWalletAuthFromBody({
    body,
    path: '/api/user/getUser',
    method: 'POST',
    storecode,
    consumeNonceValue: false,
    maxAgeMs: 2 * 60 * 1000,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  if (signatureAuth.ok === true) {
    walletAddress = signatureAuth.walletAddress;
  }

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

  const result = await getOneByWalletAddress(storecode || undefined, walletAddress, {
    projection: SAFE_USER_PROJECTION,
  });

  return NextResponse.json({
    result,
  });
}
