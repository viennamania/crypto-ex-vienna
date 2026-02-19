import { NextResponse, type NextRequest } from 'next/server';

import { cancelPrivateBuyOrderByAdminToBuyer } from '@lib/api/order';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const adminWalletAddress =
      typeof body?.adminWalletAddress === 'string' ? body.adminWalletAddress.trim() : '';

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required.' },
        { status: 400 },
      );
    }

    const result = await cancelPrivateBuyOrderByAdminToBuyer({
      orderId,
      adminWalletAddress,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'FAILED_TO_CANCEL_BUY_ORDER' },
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
