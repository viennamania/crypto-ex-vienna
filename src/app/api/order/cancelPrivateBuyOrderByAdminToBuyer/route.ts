import { NextResponse, type NextRequest } from 'next/server';

import { cancelPrivateBuyOrderByAdminToBuyer } from '@lib/api/order';

const toText = (value: unknown) => String(value ?? '').trim();

const getClientIp = (request: NextRequest) => {
  const xForwardedFor = toText(request.headers.get('x-forwarded-for'));
  if (xForwardedFor) {
    const [firstIp] = xForwardedFor.split(',');
    return toText(firstIp);
  }
  return toText(request.headers.get('x-real-ip'));
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const adminWalletAddress =
      typeof body?.adminWalletAddress === 'string' ? body.adminWalletAddress.trim() : '';
    const cancelledByRole =
      typeof body?.cancelledByRole === 'string' ? body.cancelledByRole.trim() : '';
    const cancelledByNickname =
      typeof body?.cancelledByNickname === 'string' ? body.cancelledByNickname.trim() : '';
    const cancelledByIpAddress =
      typeof body?.cancelledByIpAddress === 'string' ? body.cancelledByIpAddress.trim() : '';

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required.' },
        { status: 400 },
      );
    }

    const result = await cancelPrivateBuyOrderByAdminToBuyer({
      orderId,
      adminWalletAddress,
      cancelledByRole,
      cancelledByNickname,
      cancelledByIpAddress: cancelledByIpAddress || getClientIp(request),
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
