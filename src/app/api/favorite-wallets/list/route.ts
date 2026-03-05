import { NextResponse, type NextRequest } from "next/server";
import { listFavoriteWallets } from "@lib/api/favoriteWallet";
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
  const storecode = String(body.storecode || '').trim();
  const ipAddress = getRequesterIpAddress(request) || 'unknown';

  const rate = evaluateRateLimit({
    key: `api:favorite-wallets:list:${ipAddress}:${requestedOwnerWalletAddress || 'unknown'}`,
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
    path: '/api/favorite-wallets/list',
    method: 'POST',
    storecode: storecode || 'admin',
    consumeNonceValue: false,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  const ownerWalletAddress =
    signatureAuth.ok === true
      ? signatureAuth.walletAddress
      : requestedOwnerWalletAddress;

  if (!ownerWalletAddress) {
    return NextResponse.json({ error: "ownerWalletAddress is required" }, { status: 400 });
  }

  if (!isWalletAddress(ownerWalletAddress)) {
    return NextResponse.json({ error: "ownerWalletAddress must be a valid EVM address" }, { status: 400 });
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

  const result = await listFavoriteWallets(ownerWalletAddress);
  return NextResponse.json({ result });
}
