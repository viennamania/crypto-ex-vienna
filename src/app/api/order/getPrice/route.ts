import { NextResponse, type NextRequest } from 'next/server';

import { getUsdtPrice } from '@lib/api/order';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import {
  getRoleForWalletAddress,
  getRequesterIpAddress,
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

  const storecode = toText(body.storecode);
  const requestedWalletAddress = normalizeWalletAddress(body.walletAddress);

  const ipAddress = getRequesterIpAddress(request) || 'unknown';
  const rate = evaluateRateLimit({
    key: `api:order:getPrice:${ipAddress}:${requestedWalletAddress || 'unknown'}`,
    limit: 120,
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

  let walletAddress = requestedWalletAddress;

  const signatureAuth = await verifyWalletAuthFromBody({
    body,
    path: '/api/order/getPrice',
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

    if (storecode.toLowerCase() === 'admin') {
      const requester = await getRoleForWalletAddress({
        storecode,
        walletAddress,
      });

      if (!requester || requester.role !== 'admin') {
        return NextResponse.json(
          {
            error: 'Only admin can read admin USDT price.',
          },
          {
            status: 403,
          },
        );
      }
    }
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

  const result = await getUsdtPrice({
    walletAddress,
  });

  const priceResult = result as
    | {
        walletAddress?: unknown;
        usdtPrice?: unknown;
      }
    | null;

  const safeResult = priceResult
    ? {
        walletAddress: toText(priceResult.walletAddress),
        usdtPrice: Number(priceResult.usdtPrice || 0),
      }
    : null;

  return NextResponse.json({
    result: safeResult,
  });
}
