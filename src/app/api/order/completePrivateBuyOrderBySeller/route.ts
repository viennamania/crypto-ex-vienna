import { NextResponse, type NextRequest } from 'next/server';
import { completePrivateBuyOrderBySeller } from '@lib/api/order';
import { getRoleForWalletAddress, verifyWalletAuthFromBody } from '@/lib/security/requestAuth';
import { isWalletAddress } from '@/lib/security/walletSignature';

const toText = (value: unknown) => String(value ?? '').trim();
const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};
const APPLICATION_ID =
  process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID || process.env.NEXT_PUBLIC_SENDBIRD_APP_ID || '';
const SENDBIRD_API_BASE = APPLICATION_ID ? `https://api-${APPLICATION_ID}.sendbird.com/v3` : '';
const SENDBIRD_REQUEST_TIMEOUT_MS = Number(process.env.SENDBIRD_REQUEST_TIMEOUT_MS ?? 8000);

const formatKrwAmount = (value: number) => {
  const normalized = toNumber(value);
  if (normalized <= 0) {
    return '미확인 금액';
  }
  return `${Math.floor(normalized).toLocaleString('ko-KR')}원`;
};

const formatUsdtAmount = (value: number) => {
  const normalized = toNumber(value);
  return normalized.toLocaleString('ko-KR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 6,
  });
};

const buildSellerCompletionNoticeMessage = ({
  tradeId,
  krwAmount,
  buyerTransferUsdtAmount,
  buyerWalletAddress,
  transactionHash,
}: {
  tradeId: string;
  krwAmount: number;
  buyerTransferUsdtAmount: number;
  buyerWalletAddress: string;
  transactionHash: string;
}) => {
  const buyerWalletLabel = toText(buyerWalletAddress) || '-';
  const lines = [
    tradeId ? `구매주문번호: ${tradeId}` : '',
    `입금액 ${formatKrwAmount(krwAmount)} 입금 확인이 완료되었습니다.`,
    `에스크로 USDT ${formatUsdtAmount(buyerTransferUsdtAmount)}가 구매자 지갑(${buyerWalletLabel})으로 전송되었습니다.`,
    transactionHash ? `전송 Tx: ${transactionHash}` : '',
  ].filter(Boolean);
  return lines.join('\n');
};

const sendbirdFetchWithTimeout = async (url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SENDBIRD_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const sendSellerCompletionNoticeMessage = async ({
  channelUrl,
  sellerWalletAddress,
  message,
}: {
  channelUrl: string;
  sellerWalletAddress: string;
  message: string;
}) => {
  const normalizedChannelUrl = toText(channelUrl);
  const normalizedSellerWalletAddress = toText(sellerWalletAddress);
  const normalizedMessage = toText(message);

  if (!normalizedChannelUrl || !normalizedSellerWalletAddress || !normalizedMessage) {
    return { sent: false, reason: 'channelUrl/sellerWalletAddress/message is missing', messageId: '' };
  }
  if (!SENDBIRD_API_BASE) {
    return { sent: false, reason: 'sendbird_application_id_missing', messageId: '' };
  }

  const apiToken = toText(process.env.SENDBIRD_API_TOKEN || process.env.SENDBIRD_MASTER_API_TOKEN);
  if (!apiToken) {
    return { sent: false, reason: 'sendbird_api_token_missing', messageId: '' };
  }

  const response = await sendbirdFetchWithTimeout(
    `${SENDBIRD_API_BASE}/group_channels/${encodeURIComponent(normalizedChannelUrl)}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Token': apiToken,
      },
      body: JSON.stringify({
        message_type: 'MESG',
        user_id: normalizedSellerWalletAddress,
        message: normalizedMessage,
      }),
    },
  );

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    return {
      sent: false,
      reason: toText(errorPayload?.message) || `sendbird_http_${response.status}`,
      messageId: '',
    };
  }

  const payload = await response.json().catch(() => null);
  return {
    sent: true,
    reason: '',
    messageId: toText(payload?.message_id),
  };
};

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

    const completionNotice = {
      attempted: false,
      sent: false,
      reason: '',
      messageId: '',
    };

    const channelUrl = toText(result.consentChannelUrl);
    const sellerSenderWalletAddress = toText(result.sellerWalletAddress || sellerWalletAddress);
    const buyerWalletAddress = toText(result.buyerWalletAddress);
    if (channelUrl && isWalletAddress(sellerSenderWalletAddress)) {
      completionNotice.attempted = true;
      try {
        const message = buildSellerCompletionNoticeMessage({
          tradeId: toText(result.tradeId),
          krwAmount: toNumber(result.krwAmount),
          buyerTransferUsdtAmount: toNumber(result.buyerTransferUsdtAmount),
          buyerWalletAddress,
          transactionHash: toText(result.transactionHash),
        });
        const sendResult = await sendSellerCompletionNoticeMessage({
          channelUrl,
          sellerWalletAddress: sellerSenderWalletAddress,
          message,
        });
        completionNotice.sent = sendResult.sent;
        completionNotice.reason = sendResult.reason;
        completionNotice.messageId = sendResult.messageId;
      } catch (sendError) {
        completionNotice.reason = sendError instanceof Error ? sendError.message : 'sendbird_notice_failed';
      }
    } else if (!channelUrl) {
      completionNotice.reason = 'consent_channel_missing';
    } else {
      completionNotice.reason = 'invalid_seller_wallet_for_sendbird';
    }

    if (completionNotice.reason && !completionNotice.sent) {
      console.warn('[completePrivateBuyOrderBySeller] completion notice not sent', {
        orderId,
        tradeId: toText(result.tradeId),
        channelUrl,
        reason: completionNotice.reason,
      });
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
      completionNotice,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR' },
      { status: 500 },
    );
  }
}
