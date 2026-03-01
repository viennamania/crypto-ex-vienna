import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { pickFirstPublicIpAddress, normalizeIpAddress } from '@/lib/ip-address';
import clientPromise, { dbName } from '@/lib/mongodb';
import {
  BUYER_CONSENT_KEYWORD,
  buildBuyerConsentRequestMessage,
} from '@/lib/sendbird/privateSaleConsent';

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
  storecode?: string;
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
      requestMessage: string;
    }
  | {
      sent: false;
      reason: string;
    };

type BuyerPrivateSaleConsentState = {
  hasAcceptedConsent: boolean;
  acceptedAt: string;
  consentMessage: string;
  sourceSellerWalletAddress: string;
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
const isObjectIdHex = (value: string) => /^[a-fA-F0-9]{24}$/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const updateBuyOrderConsentRequestState = async ({
  orderId,
  channelUrl,
  requestMessage,
  sellerWalletAddress,
}: {
  orderId: string;
  channelUrl: string;
  requestMessage: string;
  sellerWalletAddress: string;
}) => {
  const normalizedOrderId = toTrimmedString(orderId);
  const normalizedChannelUrl = toTrimmedString(channelUrl);
  const normalizedRequestMessage = toTrimmedString(requestMessage);
  const normalizedSellerWalletAddress = toTrimmedString(sellerWalletAddress);

  if (!isObjectIdHex(normalizedOrderId) || !normalizedChannelUrl) {
    return;
  }

  const client = await clientPromise;
  const buyordersCollection = client.db(dbName).collection('buyorders');
  const nowIso = new Date().toISOString();

  const consentSet: Record<string, unknown> = {
    'buyerConsent.required': true,
    'buyerConsent.keyword': BUYER_CONSENT_KEYWORD,
    'buyerConsent.status': 'pending',
    'buyerConsent.accepted': false,
    'buyerConsent.channelUrl': normalizedChannelUrl,
    'buyerConsent.requestMessageSentAt': nowIso,
    'buyerConsent.requestedAt': nowIso,
    updatedAt: nowIso,
  };
  if (normalizedRequestMessage) {
    consentSet['buyerConsent.requestMessage'] = normalizedRequestMessage;
  }
  if (normalizedSellerWalletAddress) {
    consentSet['buyerConsent.requestSellerWalletAddress'] = normalizedSellerWalletAddress;
  }

  await buyordersCollection.updateOne(
    {
      _id: new ObjectId(normalizedOrderId),
    },
    {
      $set: consentSet,
    },
  );
};

const getBuyerPrivateSaleConsentState = async ({
  buyerWalletAddress,
}: {
  buyerWalletAddress: string;
}): Promise<BuyerPrivateSaleConsentState> => {
  const normalizedBuyerWalletAddress = toTrimmedString(buyerWalletAddress);
  if (!normalizedBuyerWalletAddress) {
    return {
      hasAcceptedConsent: false,
      acceptedAt: '',
      consentMessage: '',
      sourceSellerWalletAddress: '',
    };
  }

  const walletAddressQuery = {
    $regex: `^${escapeRegex(normalizedBuyerWalletAddress)}$`,
    $options: 'i',
  };

  const client = await clientPromise;
  const usersCollection = client.db(dbName).collection('users');
  const matchedUser = await usersCollection.findOne(
    {
      walletAddress: walletAddressQuery,
      $or: [
        { 'buyer.privateSaleConsent.accepted': true },
        { 'buyer.privateSaleConsent.status': 'accepted' },
      ],
    },
    {
      sort: {
        'buyer.privateSaleConsent.acceptedAt': -1,
        updatedAt: -1,
      },
      projection: {
        _id: 1,
        walletAddress: 1,
        buyer: 1,
      },
    },
  );

  const buyerRecord = isRecord(matchedUser?.buyer) ? matchedUser.buyer : null;
  const consentRecord = isRecord(buyerRecord?.privateSaleConsent)
    ? buyerRecord.privateSaleConsent
    : null;
  const consentStatus = toTrimmedString(consentRecord?.status).toLowerCase();
  const hasAcceptedConsent = consentRecord?.accepted === true || consentStatus === 'accepted';

  return {
    hasAcceptedConsent,
    acceptedAt: toTrimmedString(consentRecord?.acceptedAt),
    consentMessage: toTrimmedString(consentRecord?.consentMessage),
    sourceSellerWalletAddress: toTrimmedString(
      consentRecord?.sourceSellerWalletAddress || consentRecord?.sellerWalletAddress,
    ),
  };
};

const updateBuyOrderConsentAcceptedStateFromUser = async ({
  orderId,
  sellerWalletAddress,
  buyerConsentState,
}: {
  orderId: string;
  sellerWalletAddress: string;
  buyerConsentState: BuyerPrivateSaleConsentState;
}) => {
  const normalizedOrderId = toTrimmedString(orderId);
  if (!isObjectIdHex(normalizedOrderId)) {
    return;
  }

  const normalizedSellerWalletAddress = toTrimmedString(sellerWalletAddress);
  const nowIso = new Date().toISOString();
  const acceptedAt = toTrimmedString(buyerConsentState.acceptedAt) || nowIso;

  const consentSet: Record<string, unknown> = {
    'buyerConsent.required': false,
    'buyerConsent.keyword': BUYER_CONSENT_KEYWORD,
    'buyerConsent.status': 'accepted',
    'buyerConsent.accepted': true,
    'buyerConsent.acceptedAt': acceptedAt,
    'buyerConsent.acceptedSource': 'buyer_user_profile',
    'buyerConsent.requestSkippedAt': nowIso,
    'buyerConsent.requestSkippedReason': 'buyer_has_user_consent',
    updatedAt: nowIso,
  };
  if (buyerConsentState.consentMessage) {
    consentSet['buyerConsent.requestMessage'] = buyerConsentState.consentMessage;
  }
  if (buyerConsentState.sourceSellerWalletAddress) {
    consentSet['buyerConsent.requestSellerWalletAddress'] = buyerConsentState.sourceSellerWalletAddress;
  } else if (normalizedSellerWalletAddress) {
    consentSet['buyerConsent.requestSellerWalletAddress'] = normalizedSellerWalletAddress;
  }

  const client = await clientPromise;
  const buyordersCollection = client.db(dbName).collection('buyorders');
  await buyordersCollection.updateOne(
    {
      _id: new ObjectId(normalizedOrderId),
    },
    {
      $set: consentSet,
    },
  );
};

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

  const requestMessage = buildBuyerConsentRequestMessage(tradeId);

  const response = await sendbirdFetchWithTimeout(
    `send-consent-request:${tradeId || 'unknown'}`,
    `${SENDBIRD_API_BASE}/group_channels/${encodeURIComponent(channelUrl)}/messages`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message_type: 'MESG',
        user_id: normalizedSellerWalletAddress,
        message: requestMessage,
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
    requestMessage,
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
  const storecode = typeof body?.storecode === 'string' ? body.storecode.trim() : '';
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
    ...(storecode ? { storecode } : {}),
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
    storecode,
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
      ...(storecode ? { buyerStorecode: storecode } : {}),
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
      description: '구매자 이용동의 상태를 확인하고, 필요 시 판매자 명의로 동의 요청 메시지를 전송합니다.',
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
    const orderId = toTrimmedString(order?.orderId || tradeStatus?.order?.orderId);

    try {
      const buyerConsentState = await getBuyerPrivateSaleConsentState({
        buyerWalletAddress: resolvedBuyerWalletAddress,
      });

      if (buyerConsentState.hasAcceptedConsent) {
        try {
          await updateBuyOrderConsentAcceptedStateFromUser({
            orderId,
            sellerWalletAddress: resolvedSellerWalletAddress,
            buyerConsentState,
          });
        } catch (consentUpdateError) {
          console.error('buyOrderPrivateSale: failed to mark buyorder consent from buyer user profile', consentUpdateError);
        }

        await emitProgress({
          step: 'CONSENT_REQUEST_MESSAGE',
          title: '동의 요청 메시지 발송',
          description: '구매자 user 이용동의 기록이 있어 동의 요청 메시지 전송을 건너뛰었습니다.',
          status: 'completed',
          detail: buyerConsentState.acceptedAt
            ? `기존 동의 시각: ${buyerConsentState.acceptedAt}`
            : '기존 동의 기록 확인됨',
        });
      } else {
        const sendResult = await sendSellerConsentRequestMessage({
          buyerWalletAddress: resolvedBuyerWalletAddress,
          sellerWalletAddress: resolvedSellerWalletAddress,
          tradeId,
        });

        if (sendResult.sent) {
          try {
            await updateBuyOrderConsentRequestState({
              orderId,
              channelUrl: sendResult.channelUrl,
              requestMessage: sendResult.requestMessage,
              sellerWalletAddress: resolvedSellerWalletAddress,
            });
          } catch (consentUpdateError) {
            console.error('buyOrderPrivateSale: failed to update buyerConsent request state', consentUpdateError);
          }

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
