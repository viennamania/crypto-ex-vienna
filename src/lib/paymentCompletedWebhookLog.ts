import { ObjectId, type Collection } from 'mongodb';

import clientPromise, { dbName } from '@/lib/mongodb';

export const PAYMENT_COMPLETED_WEBHOOK_LOG_COLLECTION = 'paymentCompletedWebhookLogs';

export type PaymentCompletedWebhookLogDoc = {
  _id?: ObjectId;
  receivedAt: string;
  event: string;
  version: number;
  storecode: string;
  storeName: string;
  paymentObjectId: string;
  paymentId: string;
  productId: string;
  status: string;
  occurredAt: string;
  transactionHash: string;
  usdtAmount: number;
  krwAmount: number;
  memberNickname: string;
  memberDepositName: string;
  actorWalletAddress: string;
  actorNickname: string;
  actorRole: string;
  requestMethod: string;
  requestUrl: string;
  sourceIp: string;
  userAgent: string;
  headers: Record<string, string>;
  payload: Record<string, unknown> | null;
  rawBody: string;
  parseError: string;
};

export type PaymentCompletedWebhookLogListItem = Omit<PaymentCompletedWebhookLogDoc, '_id'> & {
  id: string;
};

const toTrimmedString = (value: unknown) => String(value ?? '').trim();

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toNonNegativeInteger = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }
  return Math.floor(numeric);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStringRecord = (value: Headers) =>
  Object.fromEntries(Array.from(value.entries()).map(([key, item]) => [key, String(item)]));

const resolveSourceIp = (headers: Headers) => {
  const candidates = [
    headers.get('x-forwarded-for'),
    headers.get('x-real-ip'),
    headers.get('x-vercel-forwarded-for'),
    headers.get('cf-connecting-ip'),
    headers.get('fastly-client-ip'),
  ];

  for (const candidate of candidates) {
    const normalized = toTrimmedString(candidate).split(',')[0]?.trim() || '';
    if (normalized) {
      return normalized;
    }
  }

  return '';
};

const toListItem = (doc: PaymentCompletedWebhookLogDoc): PaymentCompletedWebhookLogListItem => ({
  id: String(doc._id || ''),
  receivedAt: toTrimmedString(doc.receivedAt),
  event: toTrimmedString(doc.event),
  version: toNonNegativeInteger(doc.version, 1),
  storecode: toTrimmedString(doc.storecode),
  storeName: toTrimmedString(doc.storeName),
  paymentObjectId: toTrimmedString(doc.paymentObjectId),
  paymentId: toTrimmedString(doc.paymentId),
  productId: toTrimmedString(doc.productId),
  status: toTrimmedString(doc.status),
  occurredAt: toTrimmedString(doc.occurredAt),
  transactionHash: toTrimmedString(doc.transactionHash),
  usdtAmount: toFiniteNumber(doc.usdtAmount),
  krwAmount: toFiniteNumber(doc.krwAmount),
  memberNickname: toTrimmedString(doc.memberNickname),
  memberDepositName: toTrimmedString(doc.memberDepositName),
  actorWalletAddress: toTrimmedString(doc.actorWalletAddress),
  actorNickname: toTrimmedString(doc.actorNickname),
  actorRole: toTrimmedString(doc.actorRole),
  requestMethod: toTrimmedString(doc.requestMethod),
  requestUrl: toTrimmedString(doc.requestUrl),
  sourceIp: toTrimmedString(doc.sourceIp),
  userAgent: toTrimmedString(doc.userAgent),
  headers: isRecord(doc.headers) ? Object.fromEntries(Object.entries(doc.headers).map(([key, value]) => [key, toTrimmedString(value)])) : {},
  payload: isRecord(doc.payload) ? doc.payload : null,
  rawBody: String(doc.rawBody || ''),
  parseError: toTrimmedString(doc.parseError),
});

let ensureIndexesPromise: Promise<void> | null = null;

const ensureIndexes = async (collection: Collection<PaymentCompletedWebhookLogDoc>) => {
  if (!ensureIndexesPromise) {
    ensureIndexesPromise = collection.createIndexes([
      { key: { receivedAt: -1 }, name: 'receivedAt_desc' },
      { key: { storecode: 1, receivedAt: -1 }, name: 'storecode_receivedAt_desc' },
      { key: { paymentId: 1, receivedAt: -1 }, name: 'paymentId_receivedAt_desc' },
      { key: { productId: 1, receivedAt: -1 }, name: 'productId_receivedAt_desc' },
    ]).then(() => undefined).catch((error) => {
      ensureIndexesPromise = null;
      throw error;
    });
  }

  await ensureIndexesPromise;
};

const getCollection = async () => {
  const client = await clientPromise;
  const collection = client.db(dbName).collection<PaymentCompletedWebhookLogDoc>(PAYMENT_COMPLETED_WEBHOOK_LOG_COLLECTION);
  await ensureIndexes(collection);
  return collection;
};

export const buildPaymentCompletedWebhookLogDocument = ({
  request,
  rawBody,
  payload,
  parseError,
}: {
  request: Request;
  rawBody: string;
  payload: Record<string, unknown> | null;
  parseError?: string;
}): PaymentCompletedWebhookLogDoc => {
  const normalizedPayload = isRecord(payload) ? payload : null;
  const storeRecord = normalizedPayload && isRecord(normalizedPayload.store) ? normalizedPayload.store : null;
  const paymentRecord = normalizedPayload && isRecord(normalizedPayload.payment) ? normalizedPayload.payment : null;
  const memberRecord = normalizedPayload && isRecord(normalizedPayload.member) ? normalizedPayload.member : null;
  const actorRecord = normalizedPayload && isRecord(normalizedPayload.actor) ? normalizedPayload.actor : null;
  const headers = toStringRecord(request.headers);
  const receivedAt = new Date().toISOString();
  const eventFromHeader = toTrimmedString(headers['x-gobyte-event']);
  const storecodeFromHeader = toTrimmedString(headers['x-gobyte-storecode']);

  return {
    receivedAt,
    event: toTrimmedString(normalizedPayload?.event) || eventFromHeader,
    version: toNonNegativeInteger(normalizedPayload?.version, 1),
    storecode: toTrimmedString(storeRecord?.storecode) || storecodeFromHeader,
    storeName: toTrimmedString(storeRecord?.storeName),
    paymentObjectId: toTrimmedString(paymentRecord?.id),
    paymentId: toTrimmedString(paymentRecord?.paymentId),
    productId: toTrimmedString(paymentRecord?.productId) || toTrimmedString(paymentRecord?.product_id),
    status: toTrimmedString(paymentRecord?.status),
    occurredAt: toTrimmedString(normalizedPayload?.occurredAt) || receivedAt,
    transactionHash: toTrimmedString(paymentRecord?.transactionHash),
    usdtAmount: toFiniteNumber(paymentRecord?.usdtAmount),
    krwAmount: toFiniteNumber(paymentRecord?.krwAmount),
    memberNickname: toTrimmedString(memberRecord?.nickname),
    memberDepositName: toTrimmedString(memberRecord?.depositName),
    actorWalletAddress: toTrimmedString(actorRecord?.walletAddress),
    actorNickname: toTrimmedString(actorRecord?.nickname),
    actorRole: toTrimmedString(actorRecord?.role),
    requestMethod: toTrimmedString(request.method) || 'POST',
    requestUrl: toTrimmedString(request.url),
    sourceIp: resolveSourceIp(request.headers),
    userAgent: toTrimmedString(request.headers.get('user-agent')),
    headers,
    payload: normalizedPayload,
    rawBody,
    parseError: toTrimmedString(parseError),
  };
};

export const insertPaymentCompletedWebhookLog = async (doc: PaymentCompletedWebhookLogDoc) => {
  const collection = await getCollection();
  const result = await collection.insertOne(doc);
  return {
    insertedId: String(result.insertedId),
  };
};

export const listPaymentCompletedWebhookLogs = async ({
  limit = 50,
  storecode = '',
}: {
  limit?: number;
  storecode?: string;
}) => {
  const collection = await getCollection();
  const normalizedStorecode = toTrimmedString(storecode);
  const normalizedLimit = Math.min(Math.max(toNonNegativeInteger(limit, 50), 1), 200);
  const docs = await collection
    .find(normalizedStorecode ? { storecode: normalizedStorecode } : {})
    .sort({ receivedAt: -1, _id: -1 })
    .limit(normalizedLimit)
    .toArray();

  return docs.map((doc) => toListItem(doc));
};
