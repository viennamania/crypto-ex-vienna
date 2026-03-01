import crypto from 'crypto';
import { NextResponse } from 'next/server';
import clientPromise, { dbName } from '@/lib/mongodb';

export const runtime = 'nodejs';

const SENDBIRD_APPLICATION_ID =
  process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID || process.env.NEXT_PUBLIC_SENDBIRD_APP_ID || '';
const SENDBIRD_API_BASE = SENDBIRD_APPLICATION_ID ? `https://api-${SENDBIRD_APPLICATION_ID}.sendbird.com/v3` : '';
const SENDBIRD_REQUEST_TIMEOUT_MS = Number(process.env.SENDBIRD_REQUEST_TIMEOUT_MS ?? 8000);
const BUYER_CONSENT_KEYWORD = '동의함';
const BUYER_CONSENT_REMINDER_MESSAGE = '반드시 동의함이라고 적어주세요';
const ACTIVE_PRIVATE_SALE_ORDER_STATUSES = ['ordered', 'accepted', 'paymentRequested'];
const EVM_WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

type SendbirdActiveBuyOrder = {
  _id: unknown;
  tradeId?: unknown;
  status?: unknown;
  walletAddress?: unknown;
  buyer?: {
    walletAddress?: unknown;
  };
  seller?: {
    walletAddress?: unknown;
  };
  buyerConsent?: {
    status?: unknown;
    accepted?: unknown;
    channelUrl?: unknown;
    lastProcessedMessageId?: unknown;
  };
  createdAt?: unknown;
};

const toTrimmedString = (value: unknown) => String(value ?? '').trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeWalletAddress = (value: unknown) => {
  const normalized = toTrimmedString(value);
  return EVM_WALLET_ADDRESS_REGEX.test(normalized) ? normalized : '';
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toWalletAddressRegexQuery = (walletAddress: string) => ({
  $regex: `^${escapeRegex(walletAddress)}$`,
  $options: 'i',
});

const toIsoFromUnixTimestamp = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return new Date().toISOString();
  }
  const unixMs = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  return new Date(unixMs).toISOString();
};

const safeCompare = (valueA: string, valueB: string) => {
  const normalizedA = toTrimmedString(valueA).toLowerCase();
  const normalizedB = toTrimmedString(valueB).toLowerCase();
  if (!normalizedA || !normalizedB || normalizedA.length !== normalizedB.length) {
    return false;
  }

  const bufferA = Buffer.from(normalizedA, 'utf8');
  const bufferB = Buffer.from(normalizedB, 'utf8');
  return crypto.timingSafeEqual(bufferA, bufferB);
};

const getSendbirdSignatureSecrets = () =>
  Array.from(
    new Set(
      [
        process.env.SENDBIRD_MASTER_API_TOKEN,
        process.env.SENDBIRD_API_TOKEN,
      ]
        .map((item) => toTrimmedString(item))
        .filter(Boolean),
    ),
  );

const verifySendbirdWebhookSignature = ({
  rawBody,
  signature,
}: {
  rawBody: string;
  signature: string;
}) => {
  const normalizedSignature = toTrimmedString(signature).toLowerCase();
  if (!normalizedSignature) {
    return false;
  }

  const secrets = getSendbirdSignatureSecrets();
  if (secrets.length === 0) {
    return false;
  }

  for (const secret of secrets) {
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex').toLowerCase();
    if (safeCompare(digest, normalizedSignature)) {
      return true;
    }
  }

  return false;
};

const buildSendbirdHeaders = () => {
  const apiToken = toTrimmedString(process.env.SENDBIRD_API_TOKEN || process.env.SENDBIRD_MASTER_API_TOKEN);
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

const sendReminderMessageToBuyer = async ({
  channelUrl,
  sellerWalletAddress,
}: {
  channelUrl: string;
  sellerWalletAddress: string;
}): Promise<{ sent: boolean; reminderMessageId: string; reason: string }> => {
  const normalizedChannelUrl = toTrimmedString(channelUrl);
  const normalizedSellerWalletAddress = normalizeWalletAddress(sellerWalletAddress);

  if (!normalizedChannelUrl || !normalizedSellerWalletAddress) {
    return {
      sent: false,
      reminderMessageId: '',
      reason: 'channelUrl/sellerWalletAddress is missing',
    };
  }
  if (!SENDBIRD_API_BASE) {
    return {
      sent: false,
      reminderMessageId: '',
      reason: 'Sendbird application id is missing',
    };
  }

  const headers = buildSendbirdHeaders();
  if (!headers) {
    return {
      sent: false,
      reminderMessageId: '',
      reason: 'Sendbird API token is missing',
    };
  }

  const response = await sendbirdFetchWithTimeout(
    'send-buyer-consent-reminder',
    `${SENDBIRD_API_BASE}/group_channels/${encodeURIComponent(normalizedChannelUrl)}/messages`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message_type: 'MESG',
        user_id: normalizedSellerWalletAddress,
        message: BUYER_CONSENT_REMINDER_MESSAGE,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    return {
      sent: false,
      reminderMessageId: '',
      reason: toTrimmedString(error?.message) || 'failed to send reminder message',
    };
  }

  const data = await response.json().catch(() => null);
  const reminderMessageId = toTrimmedString(data?.message_id || data?.msg_id);

  return {
    sent: true,
    reminderMessageId,
    reason: '',
  };
};

const resolveCategory = (body: Record<string, unknown>) =>
  toTrimmedString(body.category || body.event || body.type);

const resolvePayload = (body: Record<string, unknown>) => {
  if (isRecord(body.payload)) {
    return body.payload;
  }
  return body;
};

const resolveSenderWalletAddress = ({
  body,
  payload,
}: {
  body: Record<string, unknown>;
  payload: Record<string, unknown>;
}) => {
  const senderRecord = isRecord(payload.sender)
    ? payload.sender
    : isRecord(body.sender)
      ? body.sender
      : null;
  const candidate = senderRecord?.user_id ?? payload.user_id ?? body.user_id ?? '';
  return normalizeWalletAddress(candidate);
};

const resolveChannelUrl = ({
  body,
  payload,
}: {
  body: Record<string, unknown>;
  payload: Record<string, unknown>;
}) => {
  const payloadChannel = isRecord(payload.channel) ? payload.channel : null;
  const bodyChannel = isRecord(body.channel) ? body.channel : null;
  return toTrimmedString(
    payloadChannel?.channel_url
    || bodyChannel?.channel_url
    || payload.channel_url
    || body.channel_url,
  );
};

const resolveMessageText = ({
  body,
  payload,
}: {
  body: Record<string, unknown>;
  payload: Record<string, unknown>;
}) => {
  const payloadMessage = isRecord(payload.message) ? payload.message : null;
  const bodyMessage = isRecord(body.message) ? body.message : null;

  if (typeof payloadMessage?.message === 'string') {
    return payloadMessage.message;
  }
  if (typeof bodyMessage?.message === 'string') {
    return bodyMessage.message;
  }
  if (typeof payload.message === 'string') {
    return payload.message;
  }
  if (typeof body.message === 'string') {
    return body.message;
  }
  return '';
};

const resolveMessageId = ({
  body,
  payload,
}: {
  body: Record<string, unknown>;
  payload: Record<string, unknown>;
}) => {
  const payloadMessage = isRecord(payload.message) ? payload.message : null;
  const bodyMessage = isRecord(body.message) ? body.message : null;
  return toTrimmedString(
    payloadMessage?.message_id
    || bodyMessage?.message_id
    || payload.message_id
    || body.message_id,
  );
};

const resolveMessageCreatedAtIso = ({
  body,
  payload,
}: {
  body: Record<string, unknown>;
  payload: Record<string, unknown>;
}) => {
  const payloadMessage = isRecord(payload.message) ? payload.message : null;
  const bodyMessage = isRecord(body.message) ? body.message : null;
  return toIsoFromUnixTimestamp(
    payloadMessage?.created_at
    || bodyMessage?.created_at
    || payload.created_at
    || body.created_at,
  );
};

const resolveChannelMemberWalletAddresses = ({
  body,
  payload,
}: {
  body: Record<string, unknown>;
  payload: Record<string, unknown>;
}) => {
  const payloadChannel = isRecord(payload.channel) ? payload.channel : null;
  const bodyChannel = isRecord(body.channel) ? body.channel : null;
  const members = Array.isArray(payloadChannel?.members)
    ? payloadChannel.members
    : Array.isArray(bodyChannel?.members)
      ? bodyChannel.members
      : [];

  const normalized = members
    .map((member) => {
      if (!isRecord(member)) {
        return '';
      }
      return normalizeWalletAddress(member.user_id);
    })
    .filter(Boolean);

  return Array.from(new Set(normalized));
};

const resolveOrderBuyerWalletAddress = (order: SendbirdActiveBuyOrder) =>
  normalizeWalletAddress(order?.buyer?.walletAddress || order?.walletAddress || '');

const resolveOrderSellerWalletAddress = (order: SendbirdActiveBuyOrder) =>
  normalizeWalletAddress(order?.seller?.walletAddress || '');

const BUY_ORDER_PROJECTION = {
  _id: 1,
  tradeId: 1,
  status: 1,
  walletAddress: 1,
  buyer: 1,
  seller: 1,
  buyerConsent: 1,
  createdAt: 1,
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const webhookSignature = toTrimmedString(
    request.headers.get('x-sendbird-signature')
    || request.headers.get('x-signature')
    || '',
  );

  if (!webhookSignature) {
    return NextResponse.json({ error: 'UNAUTHORIZED_WEBHOOK' }, { status: 401 });
  }

  if (!verifySendbirdWebhookSignature({ rawBody, signature: webhookSignature })) {
    return NextResponse.json({ error: 'UNAUTHORIZED_WEBHOOK' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const category = resolveCategory(body);
  if (category !== 'group_channel:message_send') {
    return NextResponse.json({ result: true, ignored: true, reason: 'category_not_supported' });
  }

  const payload = resolvePayload(body);
  const senderWalletAddress = resolveSenderWalletAddress({ body, payload });
  const buyerMessage = toTrimmedString(resolveMessageText({ body, payload }));
  const buyerMessageId = resolveMessageId({ body, payload });
  const buyerMessageCreatedAtIso = resolveMessageCreatedAtIso({ body, payload });
  const channelUrlFromWebhook = resolveChannelUrl({ body, payload });
  const channelMemberWalletAddresses = resolveChannelMemberWalletAddresses({ body, payload });

  if (!senderWalletAddress) {
    return NextResponse.json({ result: true, ignored: true, reason: 'sender_wallet_not_found' });
  }

  try {
    const client = await clientPromise;
    const buyordersCollection = client.db(dbName).collection('buyorders');

    const senderWalletRegexQuery = toWalletAddressRegexQuery(senderWalletAddress);
    const counterPartyWalletAddress =
      channelMemberWalletAddresses.find(
        (walletAddress) => walletAddress.toLowerCase() !== senderWalletAddress.toLowerCase(),
      ) || '';

    let activeOrder = null as SendbirdActiveBuyOrder | null;

    if (channelUrlFromWebhook) {
      activeOrder = await buyordersCollection.findOne<SendbirdActiveBuyOrder>(
        {
          privateSale: true,
          status: { $in: ACTIVE_PRIVATE_SALE_ORDER_STATUSES },
          'buyerConsent.channelUrl': channelUrlFromWebhook,
        },
        {
          sort: { createdAt: -1 },
          projection: BUY_ORDER_PROJECTION,
          maxTimeMS: 3000,
        },
      );

      if (activeOrder) {
        const orderBuyerWalletAddress = resolveOrderBuyerWalletAddress(activeOrder);
        if (!orderBuyerWalletAddress || orderBuyerWalletAddress.toLowerCase() !== senderWalletAddress.toLowerCase()) {
          activeOrder = null;
        }
      }
    }

    if (!activeOrder) {
      const andFilters: Record<string, unknown>[] = [
        {
          $or: [
            { 'buyer.walletAddress': senderWalletRegexQuery },
            { walletAddress: senderWalletRegexQuery },
          ],
        },
      ];

      if (counterPartyWalletAddress) {
        const counterPartyWalletRegexQuery = toWalletAddressRegexQuery(counterPartyWalletAddress);
        andFilters.push({
          $or: [
            { 'seller.walletAddress': counterPartyWalletRegexQuery },
            { sellerWalletAddress: counterPartyWalletRegexQuery },
          ],
        });
      }

      activeOrder = await buyordersCollection.findOne<SendbirdActiveBuyOrder>(
        {
          privateSale: true,
          status: { $in: ACTIVE_PRIVATE_SALE_ORDER_STATUSES },
          $and: andFilters,
        },
        {
          sort: { createdAt: -1 },
          projection: BUY_ORDER_PROJECTION,
          maxTimeMS: 3000,
        },
      );
    }

    if (!activeOrder || !activeOrder._id) {
      return NextResponse.json({ result: true, ignored: true, reason: 'active_order_not_found' });
    }

    const orderBuyerWalletAddress = resolveOrderBuyerWalletAddress(activeOrder);
    const orderSellerWalletAddress = resolveOrderSellerWalletAddress(activeOrder);
    const orderConsent = isRecord(activeOrder.buyerConsent) ? activeOrder.buyerConsent : null;
    const orderConsentStatus = toTrimmedString(orderConsent?.status).toLowerCase();
    const orderConsentAccepted = orderConsent?.accepted === true || orderConsentStatus === 'accepted';
    const orderLastProcessedMessageId = toTrimmedString(orderConsent?.lastProcessedMessageId);
    const resolvedChannelUrl = channelUrlFromWebhook || toTrimmedString(orderConsent?.channelUrl);

    if (!orderBuyerWalletAddress || orderBuyerWalletAddress.toLowerCase() !== senderWalletAddress.toLowerCase()) {
      return NextResponse.json({ result: true, ignored: true, reason: 'sender_is_not_buyer' });
    }

    if (orderConsentAccepted) {
      return NextResponse.json({ result: true, ignored: true, reason: 'consent_already_accepted' });
    }

    if (buyerMessageId && orderLastProcessedMessageId && buyerMessageId === orderLastProcessedMessageId) {
      return NextResponse.json({ result: true, ignored: true, reason: 'duplicate_webhook_message' });
    }

    const nowIso = new Date().toISOString();

    if (buyerMessage === BUYER_CONSENT_KEYWORD) {
      const acceptFilter: Record<string, unknown> = {
        _id: activeOrder._id,
        privateSale: true,
        status: { $in: ACTIVE_PRIVATE_SALE_ORDER_STATUSES },
        $or: [
          { 'buyerConsent.accepted': { $ne: true } },
          { 'buyerConsent.status': { $ne: 'accepted' } },
        ],
      };
      if (buyerMessageId) {
        acceptFilter['buyerConsent.lastProcessedMessageId'] = { $ne: buyerMessageId };
      }

      const acceptedSet: Record<string, unknown> = {
        'buyerConsent.required': true,
        'buyerConsent.keyword': BUYER_CONSENT_KEYWORD,
        'buyerConsent.status': 'accepted',
        'buyerConsent.accepted': true,
        'buyerConsent.acceptedAt': nowIso,
        'buyerConsent.channelUrl': resolvedChannelUrl,
        'buyerConsent.lastBuyerMessage': buyerMessage,
        'buyerConsent.lastBuyerMessageAt': buyerMessageCreatedAtIso,
        updatedAt: nowIso,
      };
      if (buyerMessageId) {
        acceptedSet['buyerConsent.acceptedMessageId'] = buyerMessageId;
        acceptedSet['buyerConsent.lastBuyerMessageId'] = buyerMessageId;
        acceptedSet['buyerConsent.lastProcessedMessageId'] = buyerMessageId;
      }

      await buyordersCollection.updateOne(acceptFilter, { $set: acceptedSet });

      return NextResponse.json({
        result: true,
        accepted: true,
        tradeId: toTrimmedString(activeOrder.tradeId),
      });
    }

    const invalidFilter: Record<string, unknown> = {
      _id: activeOrder._id,
      privateSale: true,
      status: { $in: ACTIVE_PRIVATE_SALE_ORDER_STATUSES },
      'buyerConsent.accepted': { $ne: true },
    };
    if (buyerMessageId) {
      invalidFilter['buyerConsent.lastProcessedMessageId'] = { $ne: buyerMessageId };
    }

    const invalidSet: Record<string, unknown> = {
      'buyerConsent.required': true,
      'buyerConsent.keyword': BUYER_CONSENT_KEYWORD,
      'buyerConsent.status': 'pending',
      'buyerConsent.accepted': false,
      'buyerConsent.channelUrl': resolvedChannelUrl,
      'buyerConsent.lastBuyerMessage': buyerMessage,
      'buyerConsent.lastBuyerMessageAt': buyerMessageCreatedAtIso,
      updatedAt: nowIso,
    };
    if (buyerMessageId) {
      invalidSet['buyerConsent.lastBuyerMessageId'] = buyerMessageId;
      invalidSet['buyerConsent.lastProcessedMessageId'] = buyerMessageId;
    }

    const markInvalidResult = await buyordersCollection.updateOne(
      invalidFilter,
      {
        $set: invalidSet,
        $inc: { 'buyerConsent.reminderCount': 1 },
      },
    );

    if (markInvalidResult.matchedCount === 0) {
      return NextResponse.json({
        result: true,
        ignored: true,
        reason: 'already_processed_or_no_pending_order',
      });
    }

    const reminderResult = await sendReminderMessageToBuyer({
      channelUrl: resolvedChannelUrl,
      sellerWalletAddress: orderSellerWalletAddress,
    });

    const reminderSet: Record<string, unknown> = {
      'buyerConsent.lastReminderMessage': BUYER_CONSENT_REMINDER_MESSAGE,
      'buyerConsent.lastReminderMessageAt': nowIso,
      updatedAt: nowIso,
    };
    if (reminderResult.reminderMessageId) {
      reminderSet['buyerConsent.lastReminderMessageId'] = reminderResult.reminderMessageId;
    }

    await buyordersCollection.updateOne(
      { _id: activeOrder._id },
      { $set: reminderSet },
    );

    return NextResponse.json({
      result: true,
      accepted: false,
      reminderSent: reminderResult.sent,
      reminderReason: reminderResult.reason,
      tradeId: toTrimmedString(activeOrder.tradeId),
    });
  } catch (error) {
    console.error('sendbird webhook consent validation failed', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: '동의 메시지 처리 중 서버 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}

