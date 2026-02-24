import { NextResponse, type NextRequest } from "next/server";

import {
  cancelBuyOrderByAdmin,
  cancelPrivateBuyOrderByAdminToBuyer,
  buyOrderGetOrderById,
} from '@lib/api/order';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    const adminWalletAddress = String(body?.adminWalletAddress || body?.walletAddress || '').trim();

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required.' },
        { status: 400 },
      );
    }

    const order = await buyOrderGetOrderById(orderId);
    if (!order) {
      return NextResponse.json(
        { error: 'ORDER_NOT_FOUND' },
        { status: 404 },
      );
    }

    if ((order as any)?.privateSale === true && (order as any)?.status === 'paymentRequested') {
      const privateCancelResult = await cancelPrivateBuyOrderByAdminToBuyer({
        orderId,
        adminWalletAddress,
        cancelledByRole: 'admin',
        cancelledByNickname: '관리자',
      });

      if (!privateCancelResult.success) {
        return NextResponse.json(
          { error: privateCancelResult.error || 'FAILED_TO_CANCEL_PRIVATE_BUY_ORDER' },
          { status: 400 },
        );
      }

      return NextResponse.json({
        result: privateCancelResult,
      });
    }

    const result = await cancelBuyOrderByAdmin({
      orderId,
    });

    const modifiedCount = Number((result as any)?.modifiedCount || 0);
    if (modifiedCount !== 1) {
      return NextResponse.json(
        { error: 'FAILED_TO_CANCEL_BUY_ORDER' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR' },
      { status: 500 },
    );
  }
}
