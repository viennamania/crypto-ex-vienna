import { NextResponse } from 'next/server';

const APPLICATION_ID =
  process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID || process.env.NEXT_PUBLIC_SENDBIRD_APP_ID || '';
const API_BASE = APPLICATION_ID ? `https://api-${APPLICATION_ID}.sendbird.com/v3` : '';

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

export async function POST(request: Request) {
  const headers = getHeaders();
  if (!headers) {
    return NextResponse.json({ error: 'Sendbird API token is missing.' }, { status: 500 });
  }
  if (!APPLICATION_ID) {
    return NextResponse.json({ error: 'Sendbird application id is missing.' }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as { userId?: string } | null;
  if (!body?.userId) {
    return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_BASE}/users/${encodeURIComponent(body.userId)}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      return NextResponse.json(
        { error: error?.message || 'Failed to fetch Sendbird user.' },
        { status: response.status },
      );
    }

    const data = await response.json().catch(() => null);
    return NextResponse.json({ ok: true, user: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Sendbird user.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
