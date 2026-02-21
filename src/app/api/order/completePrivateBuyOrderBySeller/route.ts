import { NextResponse, type NextRequest } from 'next/server';
import { completePrivateBuyOrderBySeller } from '@lib/api/order';

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
    const orderId =
      typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const sellerWalletAddress =
      typeof body?.sellerWalletAddress === 'string' ? body.sellerWalletAddress.trim() : '';
    const publicIpAddress =
      typeof body?.publicIpAddress === 'string' ? body.publicIpAddress.trim() : '';

    if (!orderId || !sellerWalletAddress) {
      return NextResponse.json(
        { error: 'orderId and sellerWalletAddress are required.' },
        { status: 400 },
      );
    }

    const result = await completePrivateBuyOrderBySeller({
      orderId,
      sellerWalletAddress,
      requesterIpAddress: publicIpAddress || getClientIp(request),
      requesterUserAgent: toText(request.headers.get('user-agent')),
    });

    if (!result.success) {
      const errorCode = result.error || 'FAILED_TO_COMPLETE_PRIVATE_BUY_ORDER';
      const status =
        errorCode === 'SELLER_MISMATCH' || errorCode === 'SELLER_WALLET_NOT_ALLOWED'
          ? 403
          : 400;
      return NextResponse.json(
        { error: errorCode },
        { status },
      );
    }

    return NextResponse.json({
      result: true,
      transactionHash: result.transactionHash || '',
      paymentConfirmedAt: result.paymentConfirmedAt || '',
      platformFeeRatePercent: Number(result.platformFeeRatePercent || 0),
      platformFeeUsdtAmount: Number(result.platformFeeUsdtAmount || 0),
      platformFeeWalletAddress: String(result.platformFeeWalletAddress || ''),
      buyerTransferUsdtAmount: Number(result.buyerTransferUsdtAmount || 0),
      totalTransferUsdtAmount: Number(result.totalTransferUsdtAmount || 0),
      transferCount: Number(result.transferCount || 0),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR' },
      { status: 500 },
    );
  }
}
