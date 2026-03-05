import { NextResponse, type NextRequest } from "next/server";

import { getAllBuyOrdersBySellerEscrowWallet } from '@lib/api/order';
import { verifyWalletAuthFromBody } from '@/lib/security/requestAuth';

const toText = (value: unknown) => String(value ?? '').trim();

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as Record<string, unknown>)
      : {};

  const signatureAuth = await verifyWalletAuthFromBody({
    body,
    path: '/api/order/getAllBuyOrdersBySellerEscrowWallet',
    method: 'POST',
    consumeNonceValue: false,
    maxAgeMs: 2 * 60 * 1000,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  const {
    limit,
    page,
    startDate,
    endDate,
    walletAddress,
    requesterWalletAddress: requestedRequesterWalletAddress,
    status,
  } = body;

  const requesterWalletAddress =
    signatureAuth.ok === true
      ? signatureAuth.walletAddress
      : toText(requestedRequesterWalletAddress);
  const walletAddressText = toText(walletAddress);
  const limitValue = Number(limit || 10);
  const pageValue = Number(page || 1);
  const startDateText = toText(startDate);
  const endDateText = toText(endDate);
  const statusValue = Array.isArray(status)
    ? status.map((item) => toText(item)).filter(Boolean)
    : toText(status);

  if (!walletAddressText) {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }

  const result = await getAllBuyOrdersBySellerEscrowWallet({
    limit: Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 10,
    page: Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1,
    startDate: startDateText || undefined,
    endDate: endDateText || undefined,
    walletAddress: walletAddressText,
    requesterWalletAddress,
    status: statusValue,
  });

  return NextResponse.json({ result });
}
