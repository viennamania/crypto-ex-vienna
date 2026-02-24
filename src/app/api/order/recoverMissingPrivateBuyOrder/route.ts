import { NextResponse, type NextRequest } from 'next/server';
import { pickFirstPublicIpAddress, normalizeIpAddress } from '@/lib/ip-address';
import { recoverMissingPrivateBuyOrder } from '@lib/api/order';

const normalizeUsdtAmount = (value: number) =>
  Math.floor(Number(value || 0) * 1_000_000) / 1_000_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const buyerWalletAddress =
      typeof body?.buyerWalletAddress === 'string' ? body.buyerWalletAddress.trim() : '';
    const sellerEscrowWalletAddress =
      typeof body?.sellerEscrowWalletAddress === 'string' ? body.sellerEscrowWalletAddress.trim() : '';
    const buyerEscrowWalletAddress =
      typeof body?.buyerEscrowWalletAddress === 'string' ? body.buyerEscrowWalletAddress.trim() : '';
    const transactionHash =
      typeof body?.transactionHash === 'string' ? body.transactionHash.trim() : '';
    const transactionId =
      typeof body?.transactionId === 'string' ? body.transactionId.trim() : '';
    const requesterWalletAddress =
      typeof body?.requesterWalletAddress === 'string' ? body.requesterWalletAddress.trim() : '';
    const confirmedAt =
      typeof body?.confirmedAt === 'string' ? body.confirmedAt.trim() : '';
    const usdtAmount = normalizeUsdtAmount(Number(body?.usdtAmount || 0));

    const bodyPublicIpAddress =
      typeof body?.publicIpAddress === 'string' ? body.publicIpAddress.trim() : '';
    const bodyRequesterIpAddress =
      typeof body?.requesterIpAddress === 'string' ? body.requesterIpAddress.trim() : '';
    const requesterIpAddress = pickFirstPublicIpAddress([
      bodyPublicIpAddress,
      bodyRequesterIpAddress,
      request.headers.get('x-forwarded-for'),
      request.headers.get('x-vercel-forwarded-for'),
      request.headers.get('x-real-ip'),
      request.headers.get('cf-connecting-ip'),
      request.headers.get('true-client-ip'),
      request.headers.get('x-client-ip'),
      request.headers.get('x-original-forwarded-for'),
    ]) || normalizeIpAddress(bodyPublicIpAddress || bodyRequesterIpAddress);

    const recovered = await recoverMissingPrivateBuyOrder({
      buyerWalletAddress,
      sellerEscrowWalletAddress,
      buyerEscrowWalletAddress,
      transactionHash,
      transactionId,
      usdtAmount,
      confirmedAt,
      requesterWalletAddress,
      requesterIpAddress,
    });

    if (!recovered.success) {
      const messageByReason: Record<string, string> = {
        INVALID_INPUT: '요청 파라미터가 유효하지 않습니다.',
        SELLER_NOT_FOUND: '판매자 정보를 찾을 수 없습니다.',
        SELLER_ESCROW_WALLET_MISSING: '판매자 에스크로 지갑이 설정되지 않았습니다.',
        BUYER_NOT_FOUND: '구매자 정보를 찾을 수 없습니다.',
        BUYER_ACCOUNT_HOLDER_MISSING: '구매자 입금자명 정보가 없습니다.',
        INVALID_USDT_AMOUNT: 'USDT 수량이 유효하지 않습니다.',
        PLATFORM_FEE_WALLET_NOT_CONFIGURED: '플랫폼 수수료 지갑이 설정되지 않았습니다.',
        ACTIVE_TRADE_EXISTS: '이미 같은 구매자/판매자의 진행중 거래가 있습니다.',
        BUYORDER_INSERT_FAILED: '보정 주문 저장에 실패했습니다.',
      };

      return NextResponse.json(
        {
          error: 'RECOVERY_FAILED',
          reason: recovered.error,
          detail: recovered.detail || '',
          message: recovered.detail
            ? `${messageByReason[recovered.error] || recovered.error}: ${recovered.detail}`
            : (messageByReason[recovered.error] || recovered.error),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      result: {
        success: true,
        existed: recovered.existed,
        orderId: recovered.orderId,
        tradeId: recovered.tradeId,
      },
    });
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: '누락 구매주문 보정 중 서버 오류가 발생했습니다.',
        detail,
      },
      { status: 500 },
    );
  }
}
