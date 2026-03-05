import { NextResponse, type NextRequest } from "next/server";
import { upsertFavoriteWallet } from "@lib/api/favoriteWallet";
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import { getRequesterIpAddress, verifyWalletAuthFromBody } from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as Record<string, unknown>)
      : {};
  const requestedOwnerWalletAddress = normalizeWalletAddress(body.ownerWalletAddress);
  const walletAddress = normalizeWalletAddress(body.walletAddress);
  const label = typeof body.label === 'string' ? body.label : null;
  const chainId = typeof body.chainId === 'number' ? body.chainId : null;
  const storecode = String(body.storecode || '').trim();
  const ipAddress = getRequesterIpAddress(request) || 'unknown';

  const rate = evaluateRateLimit({
    key: `api:favorite-wallets:add:${ipAddress}:${requestedOwnerWalletAddress || 'unknown'}`,
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
    path: '/api/favorite-wallets/add',
    method: 'POST',
    storecode: storecode || 'admin',
    consumeNonceValue: true,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  const ownerWalletAddress =
    signatureAuth.ok === true
      ? signatureAuth.walletAddress
      : requestedOwnerWalletAddress;

  if (!ownerWalletAddress || !walletAddress) {
    return NextResponse.json({ error: "ownerWalletAddress and walletAddress are required" }, { status: 400 });
  }

  if (!isWalletAddress(ownerWalletAddress) || !isWalletAddress(walletAddress)) {
    return NextResponse.json({ error: "walletAddress must be a valid EVM address" }, { status: 400 });
  }

  if (
    signatureAuth.ok === true &&
    requestedOwnerWalletAddress &&
    requestedOwnerWalletAddress !== signatureAuth.walletAddress
  ) {
    return NextResponse.json(
      { error: 'ownerWalletAddress must match the signed wallet.' },
      { status: 403 },
    );
  }

  const result = await upsertFavoriteWallet({
    ownerWalletAddress,
    walletAddress,
    label,
    chainId,
  });

  return NextResponse.json({ result });
}
