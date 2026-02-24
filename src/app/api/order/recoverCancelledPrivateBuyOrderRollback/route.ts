import { NextResponse, type NextRequest } from 'next/server';

import { pickFirstPublicIpAddress, normalizeIpAddress } from '@/lib/ip-address';
import { recoverCancelledPrivateBuyOrderRollbackByAdmin } from '@lib/api/order';

const toText = (value: unknown) => String(value ?? '').trim();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const orderId = toText(body?.orderId);
    const requesterWalletAddress =
      toText(body?.requesterWalletAddress)
      || toText(body?.adminWalletAddress)
      || toText(body?.walletAddress);
    const recoveredByRole = toText(body?.recoveredByRole) || 'admin';
    const recoveredByNickname = toText(body?.recoveredByNickname);
    const recoveredByIpAddressFromBody = toText(body?.recoveredByIpAddress);
    const recoveredByUserAgent =
      toText(body?.recoveredByUserAgent)
      || toText(request.headers.get('user-agent'));
    const recoveredByIpAddress = pickFirstPublicIpAddress([
      recoveredByIpAddressFromBody,
      request.headers.get('x-forwarded-for'),
      request.headers.get('x-vercel-forwarded-for'),
      request.headers.get('x-real-ip'),
      request.headers.get('cf-connecting-ip'),
      request.headers.get('true-client-ip'),
      request.headers.get('x-client-ip'),
      request.headers.get('x-original-forwarded-for'),
    ]) || normalizeIpAddress(recoveredByIpAddressFromBody);

    const recovered = await recoverCancelledPrivateBuyOrderRollbackByAdmin({
      orderId,
      requesterWalletAddress,
      recoveredByRole,
      recoveredByNickname,
      recoveredByIpAddress,
      recoveredByUserAgent,
    });

    if (!recovered.success) {
      const messageByReason: Record<string, string> = {
        INVALID_ORDER_ID: '유효한 주문 ID가 아닙니다.',
        ORDER_NOT_FOUND: '주문을 찾을 수 없습니다.',
        INVALID_ORDER_STATUS: '취소 상태 주문만 회수 처리할 수 있습니다.',
        WALLET_ADDRESS_MISSING: '에스크로 지갑 주소 정보가 올바르지 않습니다.',
        INVALID_USDT_AMOUNT: '회수 금액 정보가 유효하지 않습니다.',
        THIRDWEB_SECRET_KEY_MISSING: '서버 지갑 설정이 누락되었습니다.',
        BUYER_ESCROW_BALANCE_EMPTY: '구매자 에스크로 지갑 잔액이 없어 회수할 수 없습니다.',
        TRANSFER_FAILED: 'USDT 회수 전송에 실패했습니다.',
        FAILED_TO_UPDATE_ORDER: '회수 결과를 주문에 저장하지 못했습니다.',
      };

      return NextResponse.json(
        {
          error: 'ROLLBACK_RECOVERY_FAILED',
          reason: recovered.error || '',
          detail: recovered.detail || '',
          message: recovered.detail
            ? `${messageByReason[String(recovered.error || '')] || recovered.error}: ${recovered.detail}`
            : (messageByReason[String(recovered.error || '')] || recovered.error || '회수 처리에 실패했습니다.'),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      result: {
        success: true,
        alreadyRecovered: recovered.alreadyRecovered === true,
        transactionHash: recovered.transactionHash || '',
        recoveredAt: recovered.recoveredAt || '',
        recoveredUsdtAmount: Number(recovered.recoveredUsdtAmount || 0),
        recoveredRawAmount: recovered.recoveredRawAmount || '',
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
        message: '취소 주문 회수 처리 중 서버 오류가 발생했습니다.',
        detail,
      },
      { status: 500 },
    );
  }
}
