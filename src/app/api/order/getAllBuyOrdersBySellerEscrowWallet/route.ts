import { NextResponse, type NextRequest } from "next/server";

import { getAllBuyOrdersBySellerEscrowWallet } from '@lib/api/order';
import { verifyWalletAuthFromBody } from '@/lib/security/requestAuth';

const toText = (value: unknown) => String(value ?? '').trim();
const toBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  const normalized = toText(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

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
    ownerOnly,
    searchTradeId,
    searchBuyer,
    searchDepositName,
    searchBuyerWalletAddress,
  } = body;
  const ownerOnlyValue = toBoolean(ownerOnly);

  if (ownerOnlyValue && signatureAuth.ok !== true) {
    return NextResponse.json(
      { error: '판매자 전용 조회는 지갑 서명 인증이 필요합니다.' },
      { status: 401 },
    );
  }

  const requesterWalletAddress =
    signatureAuth.ok === true
      ? signatureAuth.walletAddress
      : ownerOnlyValue
      ? ''
      : toText(requestedRequesterWalletAddress);
  const walletAddressText = toText(walletAddress);
  const limitValue = Number(limit || 10);
  const pageValue = Number(page || 1);
  const startDateText = toText(startDate);
  const endDateText = toText(endDate);
  const searchTradeIdText = toText(searchTradeId);
  const searchBuyerText = toText(searchBuyer);
  const searchDepositNameText = toText(searchDepositName);
  const searchBuyerWalletAddressText = toText(searchBuyerWalletAddress);
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
    searchTradeId: searchTradeIdText || undefined,
    searchBuyer: searchBuyerText || undefined,
    searchDepositName: searchDepositNameText || undefined,
    searchBuyerWalletAddress: searchBuyerWalletAddressText || undefined,
  });

  if (ownerOnlyValue && result?.isOwnerView !== true) {
    return NextResponse.json(
      { error: '판매자 권한이 확인되지 않아 거래내역을 조회할 수 없습니다.' },
      { status: 403 },
    );
  }

  return NextResponse.json({ result });
}
