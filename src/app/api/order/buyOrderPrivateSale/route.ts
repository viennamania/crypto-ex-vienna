import { NextResponse, type NextRequest } from 'next/server';

import {
  acceptBuyOrderPrivateSale,
  getPrivateTradeStatusByBuyerAndSeller,
} from '@lib/api/order';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const buyerWalletAddress =
      typeof body?.buyerWalletAddress === 'string' ? body.buyerWalletAddress.trim() : '';
    const sellerWalletAddress =
      typeof body?.sellerWalletAddress === 'string' ? body.sellerWalletAddress.trim() : '';
    const usdtAmount = Number(body?.usdtAmount || 0);
    const krwAmountRaw = Number(body?.krwAmount || 0);
    const krwAmount =
      Number.isFinite(krwAmountRaw) && krwAmountRaw > 0 ? Math.floor(krwAmountRaw) : undefined;

    if (!buyerWalletAddress || !sellerWalletAddress || !Number.isFinite(usdtAmount) || usdtAmount <= 0) {
      return NextResponse.json(
        { error: 'buyerWalletAddress, sellerWalletAddress and valid usdtAmount are required.' },
        { status: 400 },
      );
    }

    const tradableStatuses = new Set(['ordered', 'accepted', 'paymentRequested']);
    const beforeTradeStatus = await getPrivateTradeStatusByBuyerAndSeller({
      buyerWalletAddress,
      sellerWalletAddress,
    });
    const hasActiveTradeBefore =
      Boolean(beforeTradeStatus?.order?.status)
      && tradableStatuses.has(String(beforeTradeStatus.order?.status));
    let createdNewOrder = false;

    if (!hasActiveTradeBefore) {
      const created = await acceptBuyOrderPrivateSale({
        buyerWalletAddress,
        sellerWalletAddress,
        usdtAmount,
        krwAmount,
      });
      if (!created.success) {
        const failureMessageByReason: Record<string, string> = {
          SELLER_NOT_FOUND: '판매자 정보를 찾을 수 없습니다.',
          SELLER_ESCROW_WALLET_MISSING: '판매자 에스크로 지갑이 설정되지 않았습니다.',
          BUYER_NOT_FOUND: '구매자 정보를 찾을 수 없습니다.',
          BUYER_ACCOUNT_HOLDER_MISSING: '구매자 입금자명 정보가 없습니다.',
          INVALID_USDT_AMOUNT: '유효하지 않은 USDT 수량입니다.',
          THIRDWEB_SECRET_KEY_MISSING: '서버 지갑 설정이 누락되었습니다.',
          BUYER_ESCROW_WALLET_CREATE_FAILED: '구매자 에스크로 지갑 생성에 실패했습니다.',
          BUYER_ESCROW_WALLET_EMPTY: '구매자 에스크로 지갑 주소가 비어 있습니다.',
          PLATFORM_FEE_WALLET_NOT_CONFIGURED: '플랫폼 수수료 지갑이 설정되지 않았습니다.',
          ESCROW_TRANSFER_FAILED: '에스크로 전송에 실패했습니다.',
          BUYORDER_INSERT_FAILED: '구매 주문 저장에 실패했습니다.',
        };
        return NextResponse.json(
          {
            error: 'BUY_ORDER_CREATION_FAILED',
            reason: created.error,
            detail: created.detail || '',
            message: created.detail
              ? `${failureMessageByReason[created.error] || `구매 주문 생성 실패 (${created.error})`}: ${created.detail}`
              : (failureMessageByReason[created.error] || `구매 주문 생성 실패 (${created.error})`),
          },
          { status: 400 },
        );
      }
      createdNewOrder = true;
    }

    const tradeStatus = await getPrivateTradeStatusByBuyerAndSeller({
      buyerWalletAddress,
      sellerWalletAddress,
    });

    if (!tradeStatus?.order?.status || !tradableStatuses.has(String(tradeStatus.order.status))) {
      return NextResponse.json(
        { error: 'Buy order was not created with a tradable status.' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      result: true,
      created: createdNewOrder,
      reason: createdNewOrder ? 'CREATED_NEW_ORDER' : 'ACTIVE_ORDER_EXISTS',
      order: tradeStatus.order,
    });
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: '구매 주문 생성 중 서버 오류가 발생했습니다.',
        detail,
      },
      { status: 500 },
    );
  }
}
