import { NextResponse } from 'next/server';

const APPLICATION_ID = 'CCD67D05-55A6-4CA2-A6B1-187A5B62EC9D';
const API_BASE = `https://api-${APPLICATION_ID}.sendbird.com/v3`;
const DEFAULT_PROFILE_URL = 'https://crypto-ex-vienna.vercel.app/logo.png';

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
    profileUrl?: string,
) => {
    const response = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            user_id: userId,
            nickname: nickname || userId,
            profile_url: profileUrl || DEFAULT_PROFILE_URL,
        }),
    });

    if (response.ok) {
        return;
    }

    const error = await response.json().catch(() => null);
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
    if (message.includes('already') || message.includes('exist') || message.includes('unique constraint')) {
        return;
    }

    throw new Error(error?.message || 'Failed to create user');
};

const issueSessionToken = async (headers: Record<string, string>, userId: string) => {
    const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/token`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || 'Failed to issue session token');
    }

    const data = (await response.json()) as { token?: string };
    if (!data.token) {
        throw new Error('Session token missing from Sendbird response');
    }
    return data.token;
};

export async function POST(request: Request) {
    const headers = getHeaders();
    if (!headers) {
        return NextResponse.json({ error: 'Sendbird API token is missing.' }, { status: 500 });
    }

    const body = (await request.json().catch(() => null)) as {
        userId?: string;
        nickname?: string;
        profileUrl?: string;
    } | null;
    if (!body?.userId) {
        return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
    }

    try {
        await createUserIfNeeded(headers, body.userId, body.nickname, body.profileUrl);
        const sessionToken = await issueSessionToken(headers, body.userId);

        return NextResponse.json({
            userId: body.userId,
            sessionToken,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to issue session token';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
