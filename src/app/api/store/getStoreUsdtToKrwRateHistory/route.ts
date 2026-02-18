import { NextResponse, type NextRequest } from 'next/server';

import clientPromise, { dbName } from '@/lib/mongodb';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const storecode = String(body?.storecode || '').trim();
  const limit = Math.min(100, Math.max(1, Number(body?.limit || 20)));
  const page = Math.max(1, Number(body?.page || 1));

  if (!storecode) {
    return NextResponse.json({ error: 'storecode is required' }, { status: 400 });
  }

  const client = await clientPromise;
  const historyCollection = client.db(dbName).collection('store_usdt_to_krw_rate_logs');

  const query = {
    storecode: { $regex: `^${escapeRegex(storecode)}$`, $options: 'i' },
  };

  const [items, totalCount] = await Promise.all([
    historyCollection
      .find(query, {
        limit,
        skip: (page - 1) * limit,
      })
      .sort({ changedAt: -1 })
      .toArray(),
    historyCollection.countDocuments(query),
  ]);

  return NextResponse.json({
    result: {
      items,
      totalCount,
      page,
      limit,
    },
  });
}

