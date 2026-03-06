import { NextResponse } from 'next/server';

const APPLICATION_ID =
  process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID || process.env.NEXT_PUBLIC_SENDBIRD_APP_ID || '';
const API_BASE = APPLICATION_ID ? `https://api-${APPLICATION_ID}.sendbird.com/v3` : '';
const DEFAULT_PROFILE_URL = 'https://crypto-ex-vienna.vercel.app/logo.png';
const REQUEST_TIMEOUT_MS = Number(process.env.SENDBIRD_REQUEST_TIMEOUT_MS ?? 8000);

const toText = (value: unknown) => String(value || '').trim();

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

const getHeaders = () => {
  const apiToken = process.env.SENDBIRD_API_TOKEN;
  if (!apiToken) {
    return null;
  }
  return {
    'Content-Type': 'application/json',
    'Api-Token': apiToken,
  };
};

const createUserIfNeeded = async (
  headers: Record<string, string>,
  userId: string,
  nickname?: string,
) => {
  const response = await fetchWithTimeout(`create-user:${userId}`, `${API_BASE}/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: userId,
      nickname: toText(nickname) || userId,
      profile_url: DEFAULT_PROFILE_URL,
    }),
  });

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

const getChannelMemberIds = async (
  headers: Record<string, string>,
  channelUrl: string,
): Promise<string[]> => {
  const response = await fetchWithTimeout(
    `get-channel:${channelUrl}`,
    `${API_BASE}/group_channels/${encodeURIComponent(channelUrl)}?show_member=true`,
    {
      method: 'GET',
      headers,
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(toText(error?.message) || 'Failed to fetch Sendbird channel');
  }

  const payload = await response.json().catch(() => ({}));
  const members = Array.isArray(payload?.members) ? payload.members : [];
  return members
    .map((member: any) => toText(member?.user_id || member?.userId))
    .filter(Boolean);
};

const inviteChannelMember = async (
  headers: Record<string, string>,
  channelUrl: string,
  userId: string,
) => {
  const response = await fetchWithTimeout(
    `invite-member:${channelUrl}:${userId}`,
    `${API_BASE}/group_channels/${encodeURIComponent(channelUrl)}/invite`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_ids: [userId],
      }),
    },
  );

  if (response.ok) {
    return;
  }

  const error = await response.json().catch(() => null);
  const message = toText(error?.message).toLowerCase();
  if (message.includes('already') || message.includes('member') || message.includes('exist')) {
    return;
  }

  throw new Error(toText(error?.message) || 'Failed to invite channel member');
};

export async function POST(request: Request) {
  if (!APPLICATION_ID) {
    return NextResponse.json(
      { error: 'Sendbird application id is missing.' },
      { status: 500 },
    );
  }

  const headers = getHeaders();
  if (!headers) {
    return NextResponse.json(
      { error: 'Sendbird API token is missing.' },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    channelUrl?: string;
    userId?: string;
    nickname?: string;
  } | null;

  const channelUrl = toText(body?.channelUrl);
  const userId = toText(body?.userId);
  const nickname = toText(body?.nickname);

  if (!channelUrl || !userId) {
    return NextResponse.json(
      { error: 'channelUrl and userId are required.' },
      { status: 400 },
    );
  }

  try {
    await createUserIfNeeded(headers, userId, nickname);

    const memberIds = await getChannelMemberIds(headers, channelUrl);
    const isAlreadyMember = memberIds.some((memberId: string) => memberId === userId);

    if (isAlreadyMember) {
      return NextResponse.json({
        ok: true,
        channelUrl,
        userId,
        invited: false,
        alreadyMember: true,
      });
    }

    await inviteChannelMember(headers, channelUrl, userId);

    return NextResponse.json({
      ok: true,
      channelUrl,
      userId,
      invited: true,
      alreadyMember: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to ensure channel member';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
