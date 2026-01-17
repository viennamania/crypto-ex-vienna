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

const createUserIfNeeded = async (headers: Record<string, string>, userId: string) => {
    const response = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            user_id: userId,
            nickname: userId,
            profile_url: DEFAULT_PROFILE_URL,
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

export async function POST(request: Request) {
    const headers = getHeaders();
    if (!headers) {
        return NextResponse.json({ error: 'Sendbird API token is missing.' }, { status: 500 });
    }

    const body = (await request.json().catch(() => null)) as {
        buyerId?: string;
        sellerId?: string;
    } | null;

    if (!body?.buyerId || !body?.sellerId) {
        return NextResponse.json({ error: 'buyerId and sellerId are required.' }, { status: 400 });
    }

    if (body.buyerId === body.sellerId) {
        return NextResponse.json({ error: 'buyerId and sellerId must differ.' }, { status: 400 });
    }

    try {
        await createUserIfNeeded(headers, body.buyerId);
        await createUserIfNeeded(headers, body.sellerId);

        const response = await fetch(`${API_BASE}/group_channels`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: `escrow-${body.buyerId.slice(0, 6)}-${body.sellerId.slice(0, 6)}`,
                user_ids: [body.buyerId, body.sellerId],
                is_distinct: true,
                custom_type: 'escrow',
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => null);
            throw new Error(error?.message || 'Failed to create group channel');
        }

        const data = (await response.json()) as { channel_url?: string };
        if (!data.channel_url) {
            throw new Error('channel_url missing from Sendbird response');
        }

        return NextResponse.json({
            channelUrl: data.channel_url,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create group channel';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
