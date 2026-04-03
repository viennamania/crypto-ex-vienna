import { NextResponse, type NextRequest } from 'next/server';

import { listWalletTokens } from '@/lib/api/walletToken';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import {
  getRequesterIpAddress,
  isWalletAddressAuthorizedForExpectedWallet,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';

const toText = (value: unknown) => String(value ?? '').trim();

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as Record<string, unknown>)
      : {};

  const requestedOwnerWalletAddress = normalizeWalletAddress(body.ownerWalletAddress);
  const chainId = Number(body.chainId);
  const storecode = toText(body.storecode);
  const ipAddress = getRequesterIpAddress(request) || 'unknown';

  const rate = evaluateRateLimit({
    key: `api:wallet:tokens:list:${ipAddress}:${requestedOwnerWalletAddress || 'unknown'}`,
    limit: 120,
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
    path: '/api/wallet/tokens/list',
    method: 'POST',
    storecode: storecode || 'admin',
    consumeNonceValue: false,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  const requesterWalletAddress =
    signatureAuth.ok === true ? signatureAuth.walletAddress : requestedOwnerWalletAddress;
  const ownerWalletAddress = requestedOwnerWalletAddress || requesterWalletAddress;

  if (!isWalletAddress(ownerWalletAddress)) {
    return NextResponse.json({ error: 'ownerWalletAddress is required' }, { status: 400 });
  }

  if (signatureAuth.ok === true) {
    const isAuthorized = await isWalletAddressAuthorizedForExpectedWallet({
      expectedWalletAddress: ownerWalletAddress,
      candidateWalletAddress: requesterWalletAddress,
    });

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'ownerWalletAddress must match the signed wallet.' },
        { status: 403 },
      );
    }
  }

  const result = await listWalletTokens(
    ownerWalletAddress,
    Number.isInteger(chainId) && chainId > 0 ? chainId : undefined,
  );

  return NextResponse.json({ result });
}
