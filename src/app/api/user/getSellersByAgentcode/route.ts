import { NextResponse, type NextRequest } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { dbName } from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const agentcode = body?.agentcode;
  const limit = Math.min(500, Number(body?.limit) || 200);

  if (!agentcode) {
    return NextResponse.json({ error: 'agentcode is required' }, { status: 400 });
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection('users');

  const cursor = collection
    .find(
      {
        agentcode,
        seller: { $exists: true },
      },
      {
        projection: {
          password: 0,
          walletPrivateKey: 0,
        },
      },
    )
    .limit(limit);

  const items = await cursor.toArray();

  return NextResponse.json({
    items,
    total: items.length,
  });
}
