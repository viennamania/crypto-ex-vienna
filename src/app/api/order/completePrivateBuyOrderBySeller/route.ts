import { NextResponse, type NextRequest } from 'next/server';
import { completePrivateBuyOrderBySeller } from '@lib/api/order';
import { getRoleForWalletAddress, verifyWalletAuthFromBody } from '@/lib/security/requestAuth';
import { isWalletAddress } from '@/lib/security/walletSignature';

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
    const bodyRaw = await request.json().catch(() => ({}));
    const body =
      bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
        ? (bodyRaw as Record<string, unknown>)
        : {};

    const signatureAuth = await verifyWalletAuthFromBody({
      body,
      path: '/api/order/completePrivateBuyOrderBySeller',
      method: 'POST',
      storecode: 'admin',
      consumeNonceValue: true,
    });

    if (signatureAuth.ok !== true) {
      if (signatureAuth.ok === false) {
        return signatureAuth.response;
      }
      return NextResponse.json(
        { error: 'wallet signature is required.' },
        { status: 401 },
      );
    }

    const requester = await getRoleForWalletAddress({
      storecode: 'admin',
      walletAddress: signatureAuth.walletAddress,
    });

    const sellerWalletAddress =
      toText(requester?.walletAddress) || signatureAuth.walletAddress;
    const orderId =
      typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const publicIpAddress =
      typeof body?.publicIpAddress === 'string' ? body.publicIpAddress.trim() : '';

    if (!orderId || !sellerWalletAddress || !isWalletAddress(sellerWalletAddress)) {
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
      agentFeeRatePercent: Number(result.agentFeeRatePercent || 0),
      agentFeeUsdtAmount: Number(result.agentFeeUsdtAmount || 0),
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
