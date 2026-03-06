import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { pickFirstPublicIpAddress, normalizeIpAddress } from '@/lib/ip-address';
import clientPromise, { dbName } from '@/lib/mongodb';
import { verifyWalletAuthFromBody } from '@/lib/security/requestAuth';
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
const SENDBIRD_DEFAULT_PROFILE_URL = 'https://crypto-ex-vienna.vercel.app/logo.png';

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
const toNormalizedSendbirdUserIds = (values: string[]): string[] => {
  const byLowerValue = new Map<string, string>();
  for (const source of values) {
    const normalized = toTrimmedString(source);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!byLowerValue.has(key)) {
      byLowerValue.set(key, normalized);
    }
  }
  return Array.from(byLowerValue.values());
};

const parseCenterAdminIdsFromEnv = () =>
  toNormalizedSendbirdUserIds([
    toTrimmedString(process.env.NEXT_PUBLIC_SENDBIRD_MANAGER_ID),
    toTrimmedString(process.env.SENDBIRD_MANAGER_ID),
    ...String(process.env.SENDBIRD_CENTER_ADMIN_USER_IDS || '')
      .split(',')
      .map((item) => toTrimmedString(item))
      .filter(Boolean),
  ]);

const resolveCenterAdminChatUserIds = async (): Promise<string[]> => {
  const centerAdminUserIds = parseCenterAdminIdsFromEnv();
  if (!centerAdminUserIds.length) {
    console.warn(
      'buyOrderPrivateSale: center admin chat user id is not configured (NEXT_PUBLIC_SENDBIRD_MANAGER_ID)',
    );
  }
  return centerAdminUserIds;
};

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

const getSendbirdHeadersOrThrow = () => {
  if (!SENDBIRD_API_BASE) {
    throw new Error('Sendbird application id is missing');
  }
  const headers = buildSendbirdHeaders();
  if (!headers) {
    throw new Error('Sendbird API token is missing');
  }
  return headers;
};

const ensureAndPersistOrderConsentChannel = async ({
  orderId,
  buyerWalletAddress,
  sellerWalletAddress,
  tradeId,
  centerAdminUserIds,
}: {
  orderId: string;
  buyerWalletAddress: string;
  sellerWalletAddress: string;
  tradeId: string;
  centerAdminUserIds: string[];
}) => {
  const headers = getSendbirdHeadersOrThrow();
  const channelUrl = await ensureSendbirdGroupChannel({
    headers,
    buyerWalletAddress,
    sellerWalletAddress,
    tradeId,
    centerAdminUserIds,
  });
  try {
    await updateBuyOrderConsentRequestState({
      orderId,
      channelUrl,
      requestMessage: '',
      sellerWalletAddress,
    });
  } catch (consentUpdateError) {
    console.error('buyOrderPrivateSale: failed to persist repaired buyerConsent channel', consentUpdateError);
  }
  return channelUrl;
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
        profile_url: SENDBIRD_DEFAULT_PROFILE_URL,
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

const toChannelToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const buildPrivateSaleOrderChannelUrl = ({
  tradeId,
  buyerWalletAddress,
  sellerWalletAddress,
}: {
  tradeId: string;
  buyerWalletAddress: string;
  sellerWalletAddress: string;
}) => {
  const tradeToken = toChannelToken(tradeId);
  if (tradeToken) {
    return `private-sale-order-${tradeToken}`;
  }
  const buyerToken = toChannelToken(buyerWalletAddress).slice(0, 14);
  const sellerToken = toChannelToken(sellerWalletAddress).slice(0, 14);
  const nowToken = Date.now().toString(36);
  return `private-sale-order-${buyerToken}-${sellerToken}-${nowToken}`;
};

const ensureSendbirdGroupChannel = async ({
  headers,
  buyerWalletAddress,
  sellerWalletAddress,
  tradeId,
  centerAdminUserIds = [],
}: {
  headers: Record<string, string>;
  buyerWalletAddress: string;
  sellerWalletAddress: string;
  tradeId: string;
  centerAdminUserIds?: string[];
}) => {
  const coreParticipantUserIds = toNormalizedSendbirdUserIds([
    buyerWalletAddress,
    sellerWalletAddress,
  ]);

  if (coreParticipantUserIds.length < 2) {
    throw new Error('At least two participant user ids are required');
  }

  for (const participantUserId of coreParticipantUserIds) {
    await createSendbirdUserIfNeeded(headers, participantUserId);
  }

  const coreParticipantIdSet = new Set(coreParticipantUserIds.map((item) => item.toLowerCase()));
  const optionalCenterAdminUserIds = toNormalizedSendbirdUserIds(centerAdminUserIds)
    .filter((item) => !coreParticipantIdSet.has(item.toLowerCase()));
  const activeCenterAdminUserIds: string[] = [];
  for (const centerAdminUserId of optionalCenterAdminUserIds) {
    try {
      await createSendbirdUserIfNeeded(headers, centerAdminUserId);
      activeCenterAdminUserIds.push(centerAdminUserId);
    } catch (centerAdminError) {
      console.warn('buyOrderPrivateSale: failed to register center admin Sendbird user, skipping participant', {
        centerAdminUserId,
        detail: toErrorDetailMessage(centerAdminError),
      });
    }
  }

  const participantUserIds = [
    ...coreParticipantUserIds,
    ...activeCenterAdminUserIds,
  ];

  const preferredChannelUrl = buildPrivateSaleOrderChannelUrl({
    tradeId,
    buyerWalletAddress,
    sellerWalletAddress,
  });

  const response = await sendbirdFetchWithTimeout(
    `group-channel:${tradeId || `${buyerWalletAddress}:${sellerWalletAddress}`}`,
    `${SENDBIRD_API_BASE}/group_channels`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `escrow-order-${tradeId || Date.now()}`,
        user_ids: participantUserIds,
        is_distinct: false,
        channel_url: preferredChannelUrl,
        custom_type: 'escrow-private-sale-order',
      }),
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const errorMessage = toTrimmedString(error?.message).toLowerCase();
    if (
      preferredChannelUrl
      && (errorMessage.includes('already') || errorMessage.includes('exist') || errorMessage.includes('unique'))
    ) {
      const getResponse = await sendbirdFetchWithTimeout(
        `group-channel-get:${preferredChannelUrl}`,
        `${SENDBIRD_API_BASE}/group_channels/${encodeURIComponent(preferredChannelUrl)}`,
        {
          method: 'GET',
          headers,
        },
      );
      if (getResponse.ok) {
        const getData = await getResponse.json().catch(() => null);
        const existingChannelUrl = toTrimmedString(getData?.channel_url);
        if (existingChannelUrl) {
          return existingChannelUrl;
        }
      }
    }
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
  centerAdminUserIds = [],
}: {
  buyerWalletAddress: string;
  sellerWalletAddress: string;
  tradeId: string;
  centerAdminUserIds?: string[];
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
    tradeId,
    centerAdminUserIds,
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
  const currentConsentChannelUrl = toTrimmedString(order?.consentChannelUrl);
  const centerAdminChatUserIds = await resolveCenterAdminChatUserIds();
  const ensureAndPersistChannel = async () =>
    ensureAndPersistOrderConsentChannel({
      orderId,
      buyerWalletAddress: resolvedBuyerWalletAddress,
      sellerWalletAddress: resolvedSellerWalletAddress,
      tradeId,
      centerAdminUserIds: centerAdminChatUserIds,
    });

  if (createdNewOrder || !currentConsentChannelUrl) {
    await emitProgress({
      step: 'CONSENT_REQUEST_MESSAGE',
      title: '동의 요청 메시지 발송',
      description: createdNewOrder
        ? '판매자 명의로 주문 이용동의 요청 메시지를 채팅에 전송합니다.'
        : '누락된 주문 채팅 채널 정보를 복구합니다.',
      status: 'processing',
    });

    try {
      if (createdNewOrder) {
        const sendResult = await sendSellerConsentRequestMessage({
          buyerWalletAddress: resolvedBuyerWalletAddress,
          sellerWalletAddress: resolvedSellerWalletAddress,
          tradeId,
          centerAdminUserIds: centerAdminChatUserIds,
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
              centerAdminMemberCount: centerAdminChatUserIds.length,
            },
          });
        } else {
          const repairedChannelUrl = await ensureAndPersistChannel();
          await emitProgress({
            step: 'CONSENT_REQUEST_MESSAGE',
            title: '주문 채팅 채널 복구',
            description: '동의 요청 메시지는 전송되지 않았지만 주문 채팅 채널은 생성했습니다.',
            status: 'completed',
            detail: sendResult.reason,
            data: {
              channelUrl: repairedChannelUrl,
              centerAdminMemberCount: centerAdminChatUserIds.length,
            },
          });
        }
      } else {
        const repairedChannelUrl = await ensureAndPersistChannel();
        await emitProgress({
          step: 'CONSENT_REQUEST_MESSAGE',
          title: '주문 채팅 채널 복구',
          description: '누락된 주문 채팅 채널 정보를 복구했습니다.',
          status: 'completed',
          data: {
            channelUrl: repairedChannelUrl,
            centerAdminMemberCount: centerAdminChatUserIds.length,
          },
        });
      }
    } catch (sendError) {
      console.error('buyOrderPrivateSale: failed to send consent request message', sendError);
      let repairedChannelUrl = '';
      if (createdNewOrder) {
        try {
          repairedChannelUrl = await ensureAndPersistChannel();
          await emitProgress({
            step: 'CONSENT_REQUEST_MESSAGE',
            title: '주문 채팅 채널 복구',
            description: '동의 요청 메시지 전송 실패 후 채널 정보 복구를 완료했습니다.',
            status: 'completed',
            data: {
              channelUrl: repairedChannelUrl,
              centerAdminMemberCount: centerAdminChatUserIds.length,
            },
          });
        } catch (repairError) {
          console.error('buyOrderPrivateSale: failed to repair channel after consent send failure', repairError);
        }
      }

      if (!repairedChannelUrl) {
        await emitProgress({
          step: 'CONSENT_REQUEST_MESSAGE',
          title: createdNewOrder ? '동의 요청 메시지 발송' : '주문 채팅 채널 복구',
          description: createdNewOrder
            ? '동의 요청 메시지 전송에 실패했습니다.'
            : '주문 채팅 채널 복구에 실패했습니다.',
          status: 'error',
          detail: toErrorDetailMessage(sendError),
        });
      }
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
    const bodyRaw = await request.json().catch(() => ({}));
    const body =
      bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
        ? (bodyRaw as Record<string, unknown>)
        : {};
    const payload = parseRequestPayload(body, request);

    const signatureAuth = await verifyWalletAuthFromBody({
      body,
      path: '/api/order/buyOrderPrivateSale',
      method: 'POST',
      storecode: payload.storecode || 'admin',
      consumeNonceValue: true,
    });

    if (signatureAuth.ok === false) {
      return signatureAuth.response;
    }

    if (signatureAuth.ok === true) {
      if (
        payload.buyerWalletAddress &&
        payload.buyerWalletAddress.toLowerCase() !== signatureAuth.walletAddress
      ) {
        return NextResponse.json(
          {
            error: 'buyerWalletAddress must match the signed wallet.',
          },
          { status: 403 },
        );
      }
      payload.buyerWalletAddress = signatureAuth.walletAddress;
    }

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
