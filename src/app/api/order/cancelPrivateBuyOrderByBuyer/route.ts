import { NextResponse, type NextRequest } from 'next/server';
import { cancelPrivateBuyOrderByBuyer } from '@lib/api/order';

const toText = (value: unknown) => String(value ?? '').trim();

const getClientIp = (request: NextRequest) => {
  const xForwardedFor = toText(request.headers.get('x-forwarded-for'));
  if (xForwardedFor) {
    const [firstIp] = xForwardedFor.split(',');
    const normalizedFirstIp = toText(firstIp);
    if (normalizedFirstIp) {
      return normalizedFirstIp;
    }
  }

  const fallbackHeaders = [
    'x-real-ip',
    'cf-connecting-ip',
    'x-vercel-forwarded-for',
  ];
  for (const headerName of fallbackHeaders) {
    const headerValue = toText(request.headers.get(headerName));
    if (headerValue) {
      return headerValue;
    }
  }

  return '';
};

const getClientUserAgent = (request: NextRequest) =>
  toText(request.headers.get('user-agent'));

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId =
      typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const buyerWalletAddress =
      typeof body?.buyerWalletAddress === 'string' ? body.buyerWalletAddress.trim() : '';
    const sellerWalletAddress =
      typeof body?.sellerWalletAddress === 'string' ? body.sellerWalletAddress.trim() : '';
    const cancelledByIpAddress =
      typeof body?.cancelledByIpAddress === 'string' ? body.cancelledByIpAddress.trim() : '';
    const cancelledByUserAgent =
      typeof body?.cancelledByUserAgent === 'string' ? body.cancelledByUserAgent.trim() : '';

    if (!orderId || !buyerWalletAddress) {
      return NextResponse.json(
        { error: 'orderId and buyerWalletAddress are required.' },
        { status: 400 },
      );
    }

    const result = await cancelPrivateBuyOrderByBuyer({
      orderId,
      buyerWalletAddress,
      sellerWalletAddress,
      cancelledByIpAddress: cancelledByIpAddress || getClientIp(request),
      cancelledByUserAgent: cancelledByUserAgent || getClientUserAgent(request),
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
