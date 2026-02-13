import { NextResponse, type NextRequest } from 'next/server';
import { cancelPrivateBuyOrderByBuyer } from '@lib/api/order';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId =
      typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const buyerWalletAddress =
      typeof body?.buyerWalletAddress === 'string' ? body.buyerWalletAddress.trim() : '';
    const sellerWalletAddress =
      typeof body?.sellerWalletAddress === 'string' ? body.sellerWalletAddress.trim() : '';

    if (!orderId || !buyerWalletAddress || !sellerWalletAddress) {
      return NextResponse.json(
        { error: 'orderId, buyerWalletAddress, sellerWalletAddress are required.' },
        { status: 400 },
      );
    }

    const result = await cancelPrivateBuyOrderByBuyer({
      orderId,
      buyerWalletAddress,
      sellerWalletAddress,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'FAILED_TO_CANCEL_BUY_ORDER' },
        { status: 400 },
      );
    }

    return NextResponse.json({ result: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR' },
      { status: 500 },
    );
  }
}
