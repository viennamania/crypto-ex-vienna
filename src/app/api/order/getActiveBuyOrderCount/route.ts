import { NextResponse, type NextRequest } from 'next/server';
import clientPromise, { dbName } from '@lib/mongodb';

const ACTIVE_BUY_ORDER_STATUSES = ['ordered', 'accepted', 'paymentRequested'];
const ACTIVE_BUY_ORDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const storecode = String(body?.storecode || '').trim();
    const now = Date.now();
    const lookbackIso = new Date(now - ACTIVE_BUY_ORDER_LOOKBACK_MS).toISOString();
    const nowIso = new Date(now).toISOString();

    const filter: Record<string, unknown> = {
      status: { $in: ACTIVE_BUY_ORDER_STATUSES },
      privateSale: true,
      createdAt: { $gte: lookbackIso, $lte: nowIso },
    };

    if (storecode) {
      filter.storecode = {
        $regex: `^${escapeRegex(storecode)}$`,
        $options: 'i',
      };
    }

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
        error: 'Failed to fetch active buy order count.',
      },
      { status: 500 },
    );
  }
}
