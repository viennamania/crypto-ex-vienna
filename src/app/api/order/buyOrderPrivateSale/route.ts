import { NextResponse, type NextRequest } from 'next/server';
import { pickFirstPublicIpAddress, normalizeIpAddress } from '@/lib/ip-address';

import {
  acceptBuyOrderPrivateSale,
  getPrivateTradeStatusByBuyerAndSeller,
  type AcceptBuyOrderPrivateSaleProgressEvent,
} from '@lib/api/order';

const normalizeUsdtAmount = (value: number) =>
  Math.floor(Number(value || 0) * 1_000_000) / 1_000_000;

const SENDBIRD_APPLICATION_ID =
  process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID || process.env.NEXT_PUBLIC_SENDBIRD_APP_ID || '';
const SENDBIRD_API_BASE = SENDBIRD_APPLICATION_ID ? `https://api-${SENDBIRD_APPLICATION_ID}.sendbird.com/v3` : '';
const SENDBIRD_REQUEST_TIMEOUT_MS = Number(process.env.SENDBIRD_REQUEST_TIMEOUT_MS ?? 8000);
const BUYER_CONSENT_REQUEST_MESSAGE = [
  '—————————————————————————',
  '네 안녕하세요',
  '',
  '본 거래를 진행하기전 숙지 부탁드립니다.',
  '',
  '*단 지정된 은행에서 연락처 송금으로만 가능합니다*',
  '(신한/우리/케이뱅크/카카오뱅크/국민은행)',
  '*은행별 개인 한도가 상이합니다*',
  '',
  '코인(USDT) 거래를 원칙으로 합니다.',
  '트레이더와 코인(USDT)거래는 불법자금은 받지 않습니다.',
  '거래를 이용하여 불법도박 재테크 마약 거래용으로 사용시 법적 책임이 따른다는 것에 동의하셔야합니다.',
  '',
  '판매자의 의무는 입금된 금원에 해당하는 가상화폐를 지급 및 전송하는 것 이외의 다른 의무는 없으며 본 가상화폐거래로 인해 발생되는 모든 민·형사상의 대한 책임은 구매자에 있으며 구매자는 이를 동의하셔야 합니다.',
].join('\n');

const FAILURE_MESSAGE_BY_REASON: Record<string, string> = {
  SELLER_NOT_FOUND: '판매자 정보를 찾을 수 없습니다.',
  SELLER_ESCROW_WALLET_MISSING: '판매자 에스크로 지갑이 설정되지 않았습니다.',
  BUYER_NOT_FOUND: '구매자 정보를 찾을 수 없습니다.',
  BUYER_ACCOUNT_HOLDER_MISSING: '구매자 입금자명 정보가 없습니다.',
  INVALID_USDT_AMOUNT: '유효하지 않은 USDT 수량입니다.',
  THIRDWEB_SECRET_KEY_MISSING: '서버 지갑 설정이 누락되었습니다.',
  BUYER_ESCROW_WALLET_CREATE_FAILED: '구매자 에스크로 지갑 생성에 실패했습니다.',
  BUYER_ESCROW_WALLET_EMPTY: '구매자 에스크로 지갑 주소가 비어 있습니다.',
  PLATFORM_FEE_WALLET_NOT_CONFIGURED: '플랫폼 수수료 지갑이 설정되지 않았습니다.',
  ESCROW_TRANSFER_FAILED: '에스크로 전송에 실패했습니다.',
  BUYORDER_INSERT_FAILED: '구매 주문 저장에 실패했습니다.',
};

type RequestPayload = {
  buyerWalletAddress: string;
  sellerWalletAddress: string;
  usdtAmount: number;
  krwAmount?: number;
  requesterIpAddress: string;
  liveProgress: boolean;
};

type BuyOrderPrivateSaleSuccessResponse = {
  result: true;
  created: boolean;
  reason: 'CREATED_NEW_ORDER' | 'ACTIVE_ORDER_EXISTS';
  order: Record<string, unknown>;
};

type BuyOrderPrivateSaleProgressResponse = {
  type: 'progress';
} & AcceptBuyOrderPrivateSaleProgressEvent;

type BuyOrderPrivateSaleResultResponse = {
  type: 'result';
  payload: BuyOrderPrivateSaleSuccessResponse;
};

type BuyOrderPrivateSaleErrorResponse = {
  type: 'error';
  status: number;
  payload: Record<string, unknown>;
};

type BuyOrderPrivateSaleStreamEvent =
  | BuyOrderPrivateSaleProgressResponse
  | BuyOrderPrivateSaleResultResponse
  | BuyOrderPrivateSaleErrorResponse;

type SendSellerConsentRequestResult =
  | {
      sent: true;
      channelUrl: string;
    }
  | {
      sent: false;
      reason: string;
    };

class RouteError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(String(payload?.error || payload?.message || 'ROUTE_ERROR'));
    this.name = 'RouteError';
    this.status = status;
    this.payload = payload;
  }
}

const toErrorDetailMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';

const toCreationFailurePayload = (
  created: { success: false; error: string; detail?: string },
) => ({
  error: 'BUY_ORDER_CREATION_FAILED',
  reason: created.error,
  detail: created.detail || '',
  message: created.detail
    ? `${FAILURE_MESSAGE_BY_REASON[created.error] || `구매 주문 생성 실패 (${created.error})`}: ${created.detail}`
    : (FAILURE_MESSAGE_BY_REASON[created.error] || `구매 주문 생성 실패 (${created.error})`),
});

const toTrimmedString = (value: unknown) => String(value ?? '').trim();

const buildSendbirdHeaders = () => {
  const apiToken = process.env.SENDBIRD_API_TOKEN;
  if (!apiToken) {
    return null;
  }
  return {
    'Content-Type': 'application/json',
    'Api-Token': apiToken,
  };
};

const sendbirdFetchWithTimeout = async (
  label: string,
  url: string,
  init: RequestInit,
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SENDBIRD_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    throw new Error(isTimeout ? `[${label}] Sendbird request timed out` : `[${label}] Sendbird request failed`);
  } finally {
    clearTimeout(timeoutId);
  }
};

const createSendbirdUserIfNeeded = async (
  headers: Record<string, string>,
  userId: string,
) => {
  const response = await sendbirdFetchWithTimeout(
    `create-user:${userId}`,
    `${SENDBIRD_API_BASE}/users`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        nickname: userId,
      }),
    },
  );

  if (response.ok) {
    return;
  }

  const error = await response.json().catch(() => null);
  const message = toTrimmedString(error?.message).toLowerCase();
  if (message.includes('already') || message.includes('exist') || message.includes('unique constraint')) {
    return;
  }

  throw new Error(toTrimmedString(error?.message) || 'Failed to create Sendbird user');
};

const ensureSendbirdGroupChannel = async ({
  headers,
  buyerWalletAddress,
  sellerWalletAddress,
}: {
  headers: Record<string, string>;
  buyerWalletAddress: string;
  sellerWalletAddress: string;
}) => {
  await createSendbirdUserIfNeeded(headers, buyerWalletAddress);
  await createSendbirdUserIfNeeded(headers, sellerWalletAddress);

  const response = await sendbirdFetchWithTimeout(
    `group-channel:${buyerWalletAddress}:${sellerWalletAddress}`,
    `${SENDBIRD_API_BASE}/group_channels`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `escrow-${buyerWalletAddress.slice(0, 6)}-${sellerWalletAddress.slice(0, 6)}`,
        user_ids: [buyerWalletAddress, sellerWalletAddress],
        is_distinct: true,
        custom_type: 'escrow',
      }),
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(toTrimmedString(error?.message) || 'Failed to create Sendbird group channel');
  }

  const data = await response.json().catch(() => null);
  const channelUrl = toTrimmedString(data?.channel_url);
  if (!channelUrl) {
    throw new Error('channel_url missing from Sendbird response');
  }

  return channelUrl;
};

const sendSellerConsentRequestMessage = async ({
  buyerWalletAddress,
  sellerWalletAddress,
  tradeId,
}: {
  buyerWalletAddress: string;
  sellerWalletAddress: string;
  tradeId: string;
}): Promise<SendSellerConsentRequestResult> => {
  const normalizedBuyerWalletAddress = toTrimmedString(buyerWalletAddress);
  const normalizedSellerWalletAddress = toTrimmedString(sellerWalletAddress);

  if (!normalizedBuyerWalletAddress || !normalizedSellerWalletAddress) {
    return { sent: false, reason: 'buyer/seller wallet address is missing' };
  }
  if (normalizedBuyerWalletAddress.toLowerCase() === normalizedSellerWalletAddress.toLowerCase()) {
    return { sent: false, reason: 'buyer and seller wallet addresses are identical' };
  }
  if (!SENDBIRD_API_BASE) {
    return { sent: false, reason: 'Sendbird application id is missing' };
  }

  const headers = buildSendbirdHeaders();
  if (!headers) {
    return { sent: false, reason: 'Sendbird API token is missing' };
  }

  const channelUrl = await ensureSendbirdGroupChannel({
    headers,
    buyerWalletAddress: normalizedBuyerWalletAddress,
    sellerWalletAddress: normalizedSellerWalletAddress,
  });

  const message = BUYER_CONSENT_REQUEST_MESSAGE;

  const response = await sendbirdFetchWithTimeout(
    `send-consent-request:${tradeId || 'unknown'}`,
    `${SENDBIRD_API_BASE}/group_channels/${encodeURIComponent(channelUrl)}/messages`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message_type: 'MESG',
        user_id: normalizedSellerWalletAddress,
        message,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(toTrimmedString(error?.message) || 'Failed to send consent request message');
  }

  return {
    sent: true,
    channelUrl,
  };
};

const parseRequestPayload = (body: any, request: NextRequest): RequestPayload => {
  const buyerWalletAddress =
    typeof body?.buyerWalletAddress === 'string' ? body.buyerWalletAddress.trim() : '';
  const sellerWalletAddress =
    typeof body?.sellerWalletAddress === 'string' ? body.sellerWalletAddress.trim() : '';
  const usdtAmount = normalizeUsdtAmount(Number(body?.usdtAmount || 0));
  const krwAmountRaw = Number(body?.krwAmount || 0);
  const krwAmount =
    Number.isFinite(krwAmountRaw) && krwAmountRaw > 0 ? Math.floor(krwAmountRaw) : undefined;
  const bodyPublicIpAddress =
    typeof body?.publicIpAddress === 'string' ? body.publicIpAddress.trim() : '';
  const bodyBuyerIpAddress =
    typeof body?.buyerIpAddress === 'string' ? body.buyerIpAddress.trim() : '';
  const requesterIpAddress = pickFirstPublicIpAddress([
    bodyPublicIpAddress,
    bodyBuyerIpAddress,
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-vercel-forwarded-for'),
    request.headers.get('x-real-ip'),
    request.headers.get('cf-connecting-ip'),
    request.headers.get('true-client-ip'),
    request.headers.get('x-client-ip'),
    request.headers.get('x-original-forwarded-for'),
  ]) || normalizeIpAddress(bodyPublicIpAddress || bodyBuyerIpAddress);
  const liveProgress = body?.liveProgress === true;

  return {
    buyerWalletAddress,
    sellerWalletAddress,
    usdtAmount,
    krwAmount,
    requesterIpAddress,
    liveProgress,
  };
};

const executeBuyOrderPrivateSale = async (
  payload: RequestPayload,
  onProgress?: (
    event: AcceptBuyOrderPrivateSaleProgressEvent,
  ) => void | Promise<void>,
): Promise<BuyOrderPrivateSaleSuccessResponse> => {
  const {
    buyerWalletAddress,
    sellerWalletAddress,
    usdtAmount,
    krwAmount,
    requesterIpAddress,
  } = payload;

  if (!buyerWalletAddress || !sellerWalletAddress || !Number.isFinite(usdtAmount) || usdtAmount <= 0) {
    throw new RouteError(400, {
      error: 'buyerWalletAddress, sellerWalletAddress and valid usdtAmount are required.',
    });
  }

  const emitProgress = async (
    event: Omit<AcceptBuyOrderPrivateSaleProgressEvent, 'occurredAt'>,
  ) => {
    if (!onProgress) {
      return;
    }
    await onProgress({
      ...event,
      occurredAt: new Date().toISOString(),
    });
  };

  const tradableStatuses = new Set(['ordered', 'accepted', 'paymentRequested']);

  await emitProgress({
    step: 'REQUEST_VALIDATED',
    title: '요청 검증',
    description: '구매 주문 요청값을 확인했습니다.',
    status: 'completed',
  });

  await emitProgress({
    step: 'ACTIVE_ORDER_CHECKING',
    title: '기존 거래 확인',
    description: '구매자와 판매자 사이 진행중 주문을 확인 중입니다.',
    status: 'processing',
  });

  const beforeTradeStatus = await getPrivateTradeStatusByBuyerAndSeller({
    buyerWalletAddress,
    sellerWalletAddress,
  });
  const hasActiveTradeBefore =
    Boolean(beforeTradeStatus?.order?.status)
    && tradableStatuses.has(String(beforeTradeStatus.order?.status));
  let createdNewOrder = false;

  if (hasActiveTradeBefore) {
    await emitProgress({
      step: 'ACTIVE_ORDER_FOUND',
      title: '기존 거래 재사용',
      description: '이미 진행중인 주문이 있어 기존 주문 상태를 사용합니다.',
      status: 'completed',
      data: {
        status: String(beforeTradeStatus?.order?.status || ''),
        tradeId: String(beforeTradeStatus?.order?.tradeId || ''),
      },
    });
  } else {
    await emitProgress({
      step: 'ORDER_CREATE_STARTED',
      title: '주문 생성 시작',
      description: '새 구매 주문 생성을 시작합니다.',
      status: 'processing',
    });

    const created = await acceptBuyOrderPrivateSale({
      buyerWalletAddress,
      sellerWalletAddress,
      usdtAmount,
      krwAmount,
      requesterIpAddress,
      onProgress,
    });

    if (!created.success) {
      throw new RouteError(
        400,
        toCreationFailurePayload(created as { success: false; error: string; detail?: string }),
      );
    }
    createdNewOrder = true;
  }

  await emitProgress({
    step: 'ORDER_STATUS_CHECKING',
    title: '주문 상태 조회',
    description: '최종 주문 상태를 조회하고 있습니다.',
    status: 'processing',
  });

  const tradeStatus = await getPrivateTradeStatusByBuyerAndSeller({
    buyerWalletAddress,
    sellerWalletAddress,
  });

  if (!tradeStatus?.order?.status || !tradableStatuses.has(String(tradeStatus.order.status))) {
    throw new RouteError(409, {
      error: 'Buy order was not created with a tradable status.',
    });
  }

  await emitProgress({
    step: 'ORDER_READY',
    title: '주문 준비 완료',
    description: '주문이 입금요청 상태로 준비되었습니다.',
    status: 'completed',
    data: {
      status: String(tradeStatus.order.status || ''),
      tradeId: String(tradeStatus.order.tradeId || ''),
      orderId: String(tradeStatus.order.orderId || ''),
    },
  });

  if (createdNewOrder) {
    await emitProgress({
      step: 'CONSENT_REQUEST_MESSAGE',
      title: '동의 요청 메시지 발송',
      description: '판매자 명의로 구매자에게 동의 요청 메시지를 전송하고 있습니다.',
      status: 'processing',
    });

    const order = tradeStatus.order as Record<string, unknown>;
    const orderBuyer = order?.buyer && typeof order.buyer === 'object'
      ? (order.buyer as Record<string, unknown>)
      : null;
    const orderSeller = order?.seller && typeof order.seller === 'object'
      ? (order.seller as Record<string, unknown>)
      : null;

    const resolvedBuyerWalletAddress =
      toTrimmedString(orderBuyer?.walletAddress)
      || toTrimmedString(order?.walletAddress)
      || buyerWalletAddress;
    const resolvedSellerWalletAddress =
      toTrimmedString(orderSeller?.walletAddress)
      || sellerWalletAddress;
    const tradeId = toTrimmedString(order?.tradeId);

    try {
      const sendResult = await sendSellerConsentRequestMessage({
        buyerWalletAddress: resolvedBuyerWalletAddress,
        sellerWalletAddress: resolvedSellerWalletAddress,
        tradeId,
      });

      if (sendResult.sent) {
        await emitProgress({
          step: 'CONSENT_REQUEST_MESSAGE',
          title: '동의 요청 메시지 발송',
          description: '동의 요청 메시지를 채팅에 전송했습니다.',
          status: 'completed',
          data: {
            channelUrl: sendResult.channelUrl,
          },
        });
      } else {
        await emitProgress({
          step: 'CONSENT_REQUEST_MESSAGE',
          title: '동의 요청 메시지 발송',
          description: '동의 요청 메시지 전송을 건너뛰었습니다.',
          status: 'completed',
          detail: sendResult.reason,
        });
      }
    } catch (sendError) {
      console.error('buyOrderPrivateSale: failed to send consent request message', sendError);
      await emitProgress({
        step: 'CONSENT_REQUEST_MESSAGE',
        title: '동의 요청 메시지 발송',
        description: '동의 요청 메시지 전송에 실패했습니다.',
        status: 'error',
        detail: toErrorDetailMessage(sendError),
      });
    }
  }

  return {
    result: true,
    created: createdNewOrder,
    reason: createdNewOrder ? 'CREATED_NEW_ORDER' : 'ACTIVE_ORDER_EXISTS',
    order: tradeStatus.order as unknown as Record<string, unknown>,
  };
};

const handleLiveProgressResponse = (
  payload: RequestPayload,
): Response => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const write = (event: BuyOrderPrivateSaleStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void (async () => {
        try {
          const result = await executeBuyOrderPrivateSale(payload, async (event) => {
            write({
              type: 'progress',
              ...event,
            });
          });

          write({
            type: 'result',
            payload: result,
          });
        } catch (error) {
          if (error instanceof RouteError) {
            write({
              type: 'error',
              status: error.status,
              payload: error.payload,
            });
          } else {
            write({
              type: 'error',
              status: 500,
              payload: {
                error: 'INTERNAL_SERVER_ERROR',
                message: '구매 주문 생성 중 서버 오류가 발생했습니다.',
                detail: toErrorDetailMessage(error),
              },
            });
          }
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = parseRequestPayload(body, request);

    if (payload.liveProgress) {
      return handleLiveProgressResponse(payload);
    }

    const result = await executeBuyOrderPrivateSale(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json(error.payload, { status: error.status });
    }
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: '구매 주문 생성 중 서버 오류가 발생했습니다.',
        detail: toErrorDetailMessage(error),
      },
      { status: 500 },
    );
  }
}
