import { NextResponse, type NextRequest } from 'next/server';
import { completePrivateBuyOrderBySeller } from '@lib/api/order';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId =
      typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const sellerWalletAddress =
      typeof body?.sellerWalletAddress === 'string' ? body.sellerWalletAddress.trim() : '';

    if (!orderId || !sellerWalletAddress) {
      return NextResponse.json(
        { error: 'orderId and sellerWalletAddress are required.' },
        { status: 400 },
      );
    }

    const result = await completePrivateBuyOrderBySeller({
      orderId,
      sellerWalletAddress,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'FAILED_TO_COMPLETE_PRIVATE_BUY_ORDER' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      result: true,
      transactionHash: result.transactionHash || '',
      paymentConfirmedAt: result.paymentConfirmedAt || '',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR' },
      { status: 500 },
    );
  }
}
