import { NextResponse, type NextRequest } from 'next/server';

import { upsertWalletToken } from '@/lib/api/walletToken';
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
  const tokenAddress = normalizeWalletAddress(body.tokenAddress);
  const chainId = Number(body.chainId);
  const chainSlug = toText(body.chainSlug || 'bsc');
  const tokenName = toText(body.tokenName);
  const tokenSymbol = toText(body.tokenSymbol).toUpperCase();
  const logoUrl = toText(body.logoUrl);
  const initialSupply = toText(body.initialSupply);
  const mintTxHash = toText(body.mintTxHash);
  const storecode = toText(body.storecode);
  const ipAddress = getRequesterIpAddress(request) || 'unknown';

  const rate = evaluateRateLimit({
    key: `api:wallet:tokens:save:${ipAddress}:${requestedOwnerWalletAddress || 'unknown'}`,
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
    path: '/api/wallet/tokens/save',
    method: 'POST',
    storecode: storecode || 'admin',
    consumeNonceValue: true,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  if (signatureAuth.ok !== true) {
    return NextResponse.json({ error: 'Signed wallet authentication is required' }, { status: 401 });
  }

  const requesterWalletAddress = signatureAuth.walletAddress;
  const ownerWalletAddress = requestedOwnerWalletAddress || requesterWalletAddress;

  if (!isWalletAddress(ownerWalletAddress) || !isWalletAddress(tokenAddress)) {
    return NextResponse.json(
      { error: 'ownerWalletAddress and tokenAddress must be valid EVM addresses' },
      { status: 400 },
    );
  }

  if (!tokenName || !tokenSymbol) {
    return NextResponse.json({ error: 'tokenName and tokenSymbol are required' }, { status: 400 });
  }

  if (!Number.isInteger(chainId) || chainId <= 0) {
    return NextResponse.json({ error: 'chainId must be a positive integer' }, { status: 400 });
  }

  const isAuthorized = await isWalletAddressAuthorizedForExpectedWallet({
    expectedWalletAddress: ownerWalletAddress,
    candidateWalletAddress: requesterWalletAddress,
  });

  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Only the connected wallet can save deployed token metadata' },
      { status: 403 },
    );
  }

  const result = await upsertWalletToken({
    ownerWalletAddress,
    tokenAddress,
    chainId,
    chainSlug,
    tokenName,
    tokenSymbol,
    logoUrl: logoUrl || null,
    initialSupply: initialSupply || null,
    mintTxHash: mintTxHash || null,
  });

  return NextResponse.json({ result });
}
