import { NextResponse, type NextRequest } from 'next/server';

import clientPromise, { dbName } from '@/lib/mongodb';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const normalizedStorecode = String(body?.storecode || '').trim();
    const normalizedWalletAddress = String(body?.walletAddress || '').trim();
    const normalizedFeeWalletAddress = String(body?.feeWalletAddress || '').trim();
    const normalizedFeeRate = Number(body?.feeRate);
    const normalizedChangedBy = String(body?.changedBy || 'admin').trim() || 'admin';

    if (!normalizedWalletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
    }
    if (!normalizedFeeWalletAddress) {
      return NextResponse.json({ error: 'feeWalletAddress is required' }, { status: 400 });
    }
    if (!Number.isFinite(normalizedFeeRate) || normalizedFeeRate < 0) {
      return NextResponse.json({ error: 'feeRate must be a number greater than or equal to 0' }, { status: 400 });
    }

    const client = await clientPromise;
    const usersCollection = client.db(dbName).collection('users');
    const platformFeeLogsCollection = client.db(dbName).collection('platform_fee_logs');

    const walletRegex = {
      $regex: `^${escapeRegex(normalizedWalletAddress)}$`,
      $options: 'i',
    };

    const primaryFilter: Record<string, unknown> = {
      walletAddress: walletRegex,
    };
    if (normalizedStorecode) {
      primaryFilter.storecode = normalizedStorecode;
    }

    let user = await usersCollection.findOne<any>(primaryFilter, {
      projection: { walletAddress: 1, storecode: 1, seller: 1 },
    });

    if (!user && normalizedStorecode) {
      user = await usersCollection.findOne<any>(
        { walletAddress: walletRegex },
        { projection: { walletAddress: 1, storecode: 1, seller: 1 } },
      );
    }

    if (!user?._id) {
      return NextResponse.json({ error: 'user not found' }, { status: 404 });
    }

    const nextFee = {
      walletAddress: normalizedFeeWalletAddress,
      rate: normalizedFeeRate,
    };
    const prevFee = user?.seller?.platformFee || null;
    const changedAt = new Date().toISOString();

    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          'seller.platformFee': nextFee,
          updatedAt: changedAt,
        },
      },
    );

    await platformFeeLogsCollection.insertOne({
      walletAddress: String(user?.walletAddress || normalizedWalletAddress),
      storecode: String(user?.storecode || normalizedStorecode || 'admin'),
      prev: prevFee,
      next: nextFee,
      changedAt,
      changedBy: normalizedChangedBy,
    });

    return NextResponse.json({
      result: nextFee,
    });
  } catch (error) {
    console.error('updateSellerPlatformFee failed', error);
    return NextResponse.json({ error: 'failed to update seller platform fee' }, { status: 500 });
  }
}
