import { NextResponse, type NextRequest } from 'next/server';

import clientPromise, { dbName } from '@/lib/mongodb';

const BUY_ORDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const agentcode = String(body?.agentcode || '').trim();

    if (!agentcode) {
      return NextResponse.json({ error: 'agentcode is required.' }, { status: 400 });
    }

    const now = Date.now();
    const lookbackIso = new Date(now - BUY_ORDER_LOOKBACK_MS).toISOString();
    const nowIso = new Date(now).toISOString();

    const filter: Record<string, unknown> = {
      agentcode: {
        $regex: `^${escapeRegex(agentcode)}$`,
        $options: 'i',
      },
      status: 'paymentRequested',
      privateSale: true,
      createdAt: { $gte: lookbackIso, $lte: nowIso },
    };

    const client = await clientPromise;
    const collection = client.db(dbName).collection('buyorders');
    const count = await collection.countDocuments(filter);

    return NextResponse.json({
      result: {
        count,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch payment requested buy order count.',
      },
      { status: 500 },
    );
  }
}
