import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import clientPromise, { dbName } from '@lib/mongodb';

const APPLICATION_ID =
  process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID || process.env.NEXT_PUBLIC_SENDBIRD_APP_ID || '';
const API_BASE = APPLICATION_ID ? `https://api-${APPLICATION_ID}.sendbird.com/v3` : '';
const REQUEST_TIMEOUT_MS = Number(process.env.SENDBIRD_REQUEST_TIMEOUT_MS ?? 8000);
const DEFAULT_PROFILE_URL = 'https://crypto-ex-vienna.vercel.app/logo.png';

const toText = (value: unknown) => String(value ?? '').trim();
const isObjectIdHex = (value: string) => /^[a-fA-F0-9]{24}$/.test(value);

const toChannelToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const toNormalizedUserIds = (values: string[]) => {
  const byLower = new Map<string, string>();
  for (const value of values) {
    const normalized = toText(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!byLower.has(key)) {
      byLower.set(key, normalized);
    }
  }
  return Array.from(byLower.values());
};

const parseCenterAdminUserIds = () =>
  toNormalizedUserIds([
    toText(process.env.NEXT_PUBLIC_SENDBIRD_MANAGER_ID),
    toText(process.env.SENDBIRD_MANAGER_ID),
    ...String(process.env.SENDBIRD_CENTER_ADMIN_USER_IDS || '')
      .split(',')
      .map((value) => toText(value))
      .filter(Boolean),
  ]);

const fetchWithTimeout = async (label: string, url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    throw new Error(isTimeout ? `[${label}] Sendbird request timed out` : `[${label}] Sendbird request failed`);
  } finally {
    clearTimeout(timeoutId);
  }
};

const createUserIfNeeded = async (
  headers: Record<string, string>,
  userId: string,
) => {
  const response = await fetchWithTimeout(
    `create-user:${userId}`,
    `${API_BASE}/users`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        nickname: userId,
        profile_url: DEFAULT_PROFILE_URL,
      }),
    },
  );

  if (response.ok) {
    return;
  }

  const error = await response.json().catch(() => null);
  const message = toText(error?.message).toLowerCase();
  if (message.includes('already') || message.includes('exist') || message.includes('unique constraint')) {
    return;
  }

  throw new Error(toText(error?.message) || 'Failed to create Sendbird user');
};

const ensureGroupChannel = async ({
  headers,
  channelUrl,
  tradeId,
  userIds,
  privateSale,
}: {
  headers: Record<string, string>;
  channelUrl: string;
  tradeId: string;
  userIds: string[];
  privateSale: boolean;
}) => {
  const response = await fetchWithTimeout(
    `create-group-channel:${channelUrl}`,
    `${API_BASE}/group_channels`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: privateSale
          ? `escrow-order-${tradeId || channelUrl}`
          : `거래번호: #${tradeId || channelUrl}`,
        channel_url: channelUrl,
        user_ids: userIds,
        is_distinct: false,
        custom_type: privateSale ? 'escrow-private-sale-order' : 'trade',
      }),
    },
  );

  if (response.ok) {
    const payload = await response.json().catch(() => null);
    const createdUrl = toText(payload?.channel_url);
    if (!createdUrl) {
      throw new Error('channel_url missing from Sendbird response');
    }
    return createdUrl;
  }

  const error = await response.json().catch(() => null);
  const message = toText(error?.message).toLowerCase();
  if (message.includes('already') || message.includes('exist') || message.includes('unique')) {
    const getResponse = await fetchWithTimeout(
      `get-group-channel:${channelUrl}`,
      `${API_BASE}/group_channels/${encodeURIComponent(channelUrl)}`,
      {
        method: 'GET',
        headers,
      },
    );
    if (getResponse.ok) {
      const getPayload = await getResponse.json().catch(() => null);
      const existingUrl = toText(getPayload?.channel_url);
      if (existingUrl) {
        return existingUrl;
      }
    }
  }

  throw new Error(toText(error?.message) || 'Failed to create Sendbird group channel');
};

export async function POST(request: Request) {
  if (!APPLICATION_ID) {
    return NextResponse.json({ error: 'Sendbird application id is missing.' }, { status: 500 });
  }

  const apiToken = process.env.SENDBIRD_API_TOKEN;
  if (!apiToken) {
    return NextResponse.json({ error: 'Sendbird API token is missing.' }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as { orderId?: string } | null;
  const orderId = toText(body?.orderId);
  if (!isObjectIdHex(orderId)) {
    return NextResponse.json({ error: 'Valid orderId is required.' }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const collection = client.db(dbName).collection('buyorders');
    const order = await collection.findOne<any>(
      { _id: new ObjectId(orderId) },
      {
        projection: {
          _id: 1,
          tradeId: 1,
          privateSale: 1,
          walletAddress: 1,
          buyer: 1,
          seller: 1,
          buyerConsent: 1,
        },
      },
    );

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const tradeId = toText(order?.tradeId);
    const buyerWalletAddress =
      toText(order?.buyer?.walletAddress) || toText(order?.walletAddress);
    const sellerWalletAddress = toText(order?.seller?.walletAddress);
    if (!buyerWalletAddress || !sellerWalletAddress) {
      return NextResponse.json({ error: 'Order buyer/seller wallet address is missing.' }, { status: 400 });
    }

    const privateSale = order?.privateSale === true;
    const derivedChannelUrl = privateSale
      ? `private-sale-order-${toChannelToken(tradeId)}`
      : orderId;
    const preferredChannelUrl = toText(order?.buyerConsent?.channelUrl) || derivedChannelUrl;
    if (!preferredChannelUrl) {
      return NextResponse.json({ error: 'Cannot derive channel url for order.' }, { status: 400 });
    }

    const coreUserIds = toNormalizedUserIds([
      buyerWalletAddress,
      sellerWalletAddress,
    ]);
    if (coreUserIds.length < 2) {
      return NextResponse.json({ error: 'At least two channel participants are required.' }, { status: 400 });
    }

    const headers = {
      'Content-Type': 'application/json',
      'Api-Token': apiToken,
    };

    for (const userId of coreUserIds) {
      await createUserIfNeeded(headers, userId);
    }

    const coreIdSet = new Set(coreUserIds.map((value) => value.toLowerCase()));
    const optionalCenterAdminIds = parseCenterAdminUserIds()
      .filter((value) => !coreIdSet.has(value.toLowerCase()));
    const activeCenterAdminIds: string[] = [];
    for (const centerAdminId of optionalCenterAdminIds) {
      try {
        await createUserIfNeeded(headers, centerAdminId);
        activeCenterAdminIds.push(centerAdminId);
      } catch (centerAdminError) {
        console.warn('repair-buyorder-channel: failed to register center admin Sendbird user, skipping participant', {
          centerAdminId,
          detail: centerAdminError instanceof Error ? centerAdminError.message : String(centerAdminError),
        });
      }
    }

    const userIds = [
      ...coreUserIds,
      ...activeCenterAdminIds,
    ];

    const channelUrl = await ensureGroupChannel({
      headers,
      channelUrl: preferredChannelUrl,
      tradeId,
      userIds,
      privateSale,
    });

    const nowIso = new Date().toISOString();
    await collection.updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          'buyerConsent.channelUrl': channelUrl,
          'buyerConsent.requestedAt': toText(order?.buyerConsent?.requestedAt) || nowIso,
          updatedAt: nowIso,
        },
      },
    );

    return NextResponse.json({
      ok: true,
      orderId,
      channelUrl,
      userIds,
      privateSale,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to repair buyorder channel';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
