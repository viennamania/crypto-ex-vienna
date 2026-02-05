import { NextRequest, NextResponse } from 'next/server';
import clientPromise, { dbName } from '@lib/mongodb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const walletAddress: string | undefined = body?.walletAddress;

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const collection = client.db(dbName).collection('buyorders');

    const cursor = await collection
      .aggregate([
        {
          $match: {
            'escrowWallet.address': walletAddress,
            status: { $in: ['ordered', 'paymentRequested'] },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $ifNull: ['$escrowWallet.balance', 0],
              },
            },
          },
        },
      ])
      .toArray();

    const inUseAmount = cursor[0]?.total ?? 0;

    return NextResponse.json({ result: { inUseAmount } });
  } catch (error) {
    console.error('getEscrowInUseAmount error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
