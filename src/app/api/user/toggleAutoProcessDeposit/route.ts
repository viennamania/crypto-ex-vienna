import { NextResponse, type NextRequest } from 'next/server';

import { toggleAutoProcessDeposit } from '@lib/api/user';
import { getRoleForWalletAddress, verifyWalletAuthFromBody } from '@/lib/security/requestAuth';
import { isWalletAddress } from '@/lib/security/walletSignature';

const toText = (value: unknown) => String(value ?? '').trim();

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as Record<string, unknown>)
      : {};

  const storecode = toText(body.storecode);
  const requestedWalletAddress = toText(body.walletAddress);
  const autoProcessDeposit = Boolean(body.autoProcessDeposit);

  const signatureAuth = await verifyWalletAuthFromBody({
    body,
    path: '/api/user/toggleAutoProcessDeposit',
    method: 'POST',
    storecode,
    consumeNonceValue: true,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  let walletAddress = requestedWalletAddress;
  if (signatureAuth.ok === true) {
    const requester = await getRoleForWalletAddress({
      storecode,
      walletAddress: signatureAuth.walletAddress,
    });
    walletAddress = toText(requester?.walletAddress) || signatureAuth.walletAddress;
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

  const result = await toggleAutoProcessDeposit({
    storecode,
    walletAddress,
    autoProcessDeposit,
  });

  return NextResponse.json({
    result,
  });
}
