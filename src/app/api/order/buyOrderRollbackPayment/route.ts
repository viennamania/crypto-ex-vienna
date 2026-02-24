import { NextResponse, type NextRequest } from 'next/server';

import {
  buyOrderRollbackPayment,
  buyOrderGetOrderById,
  cancelPrivateBuyOrderByAdminToBuyer,
} from '@lib/api/order';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    const storecode = String(body?.storecode || 'admin').trim();
    const lang = String(body?.lang || '').trim();
    const paymentAmount = Number(body?.paymentAmount || 0) || 0;
    const queueId = String(body?.queueId || '').trim();
    const adminWalletAddress = String(body?.adminWalletAddress || body?.walletAddress || '').trim();
    const transactionHash = String(body?.transactionHash || '').trim();

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

    if (!transactionHash) {
      return NextResponse.json(
        { error: 'transactionHash is required for legacy rollback.' },
        { status: 400 },
      );
    }

    const result = await buyOrderRollbackPayment({
      lang,
      storecode,
      orderId,
      paymentAmount,
      queueId,
      transactionHash,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'FAILED_TO_ROLLBACK_BUY_ORDER' },
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
