import { NextResponse, type NextRequest } from 'next/server';

import {
  acceptBuyOrderPrivateSale,
  getPrivateTradeStatusByBuyerAndSeller,
} from '@lib/api/order';

import { getSellerBySellerWalletAddress } from '@lib/api/user';

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

    const seller = await getSellerBySellerWalletAddress(sellerWalletAddress);
    if (!seller) {
      return NextResponse.json(
        { error: 'Seller not found for wallet address.', sellerWalletAddress },
        { status: 404 },
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

    if (!hasActiveTradeBefore) {
      const created = await acceptBuyOrderPrivateSale({
        buyerWalletAddress,
        sellerWalletAddress,
        usdtAmount,
        krwAmount,
      });
      if (!created) {
        return NextResponse.json(
          { error: 'Buy order creation failed' },
          { status: 400 },
        );
      }
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
      order: tradeStatus.order,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR' },
      { status: 500 },
    );
  }
}
