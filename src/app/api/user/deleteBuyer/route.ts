import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId, type Db } from 'mongodb';

import clientPromise, { dbName } from '@/lib/mongodb';

const BUYER_DELETION_LOG_COLLECTION = 'buyer_deletion_logs';

const toText = (value: unknown) => String(value ?? '').trim();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getClientIp = (request: NextRequest) => {
  const xForwardedFor = toText(request.headers.get('x-forwarded-for'));
  if (xForwardedFor) {
    const [firstIp] = xForwardedFor.split(',');
    return toText(firstIp);
  }
  return toText(request.headers.get('x-real-ip'));
};

const ensureDeletionLogCollection = async (db: Db) => {
  const exists = await db
    .listCollections({ name: BUYER_DELETION_LOG_COLLECTION }, { nameOnly: true })
    .hasNext();

  if (!exists) {
    await db.createCollection(BUYER_DELETION_LOG_COLLECTION);
  }

  const logsCollection = db.collection(BUYER_DELETION_LOG_COLLECTION);
  await Promise.allSettled([
    logsCollection.createIndex({ walletAddress: 1, deletedAt: -1 }),
    logsCollection.createIndex({ storecode: 1, deletedAt: -1 }),
    logsCollection.createIndex({ deletedAt: -1 }),
  ]);

  return logsCollection;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const buyerId = toText(body?.buyerId);
    const walletAddress = toText(body?.walletAddress);
    const storecode = toText(body?.storecode);
    const deletedByWalletAddress = toText(body?.deletedByWalletAddress);
    const deletedByName = toText(body?.deletedByName);

    if (!buyerId && !walletAddress) {
      return NextResponse.json(
        { error: 'buyerId or walletAddress is required' },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db(dbName);
    const usersCollection = db.collection<any>('users');

    const filter: Record<string, unknown> = {
      buyer: { $exists: true, $ne: null },
    };

    if (buyerId) {
      if (!ObjectId.isValid(buyerId)) {
        return NextResponse.json(
          { error: 'Invalid buyerId' },
          { status: 400 },
        );
      }
      filter._id = new ObjectId(buyerId);
    } else if (walletAddress) {
      filter.walletAddress = {
        $regex: `^${escapeRegex(walletAddress)}$`,
        $options: 'i',
      };
    }

    if (storecode) {
      filter.storecode = {
        $regex: `^${escapeRegex(storecode)}$`,
        $options: 'i',
      };
    }

    const targetBuyer = await usersCollection.findOne(filter);
    if (!targetBuyer) {
      return NextResponse.json(
        { error: '삭제할 구매자 정보를 찾지 못했습니다.' },
        { status: 404 },
      );
    }

    const deleteResult = await usersCollection.deleteOne({ _id: targetBuyer._id });
    if (deleteResult.deletedCount !== 1) {
      return NextResponse.json(
        { error: '구매자 삭제에 실패했습니다.' },
        { status: 500 },
      );
    }

    const logsCollection = await ensureDeletionLogCollection(db);
    const targetWalletAddress = toText(targetBuyer.walletAddress) || walletAddress;
    const targetStorecode = toText(targetBuyer.storecode) || storecode;
    const targetNickname = toText(targetBuyer.nickname);
    const targetId =
      targetBuyer?._id instanceof ObjectId
        ? targetBuyer._id.toString()
        : toText(targetBuyer?._id);

    await logsCollection.insertOne({
      buyerId: targetId,
      walletAddress: targetWalletAddress,
      storecode: targetStorecode,
      nickname: targetNickname,
      deletedAt: new Date(),
      deletedByWalletAddress,
      deletedByName,
      deletedByIp: getClientIp(request),
      deletedByUserAgent: toText(request.headers.get('user-agent')),
      reason: 'manual_delete_from_buyer_management',
      snapshot: {
        ...targetBuyer,
        _id: targetId,
      },
    });

    return NextResponse.json({
      result: true,
      deletedBuyer: {
        buyerId: targetId,
        walletAddress: targetWalletAddress,
        storecode: targetStorecode,
        nickname: targetNickname,
      },
      deletionLogCollection: BUYER_DELETION_LOG_COLLECTION,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '구매자 삭제 처리 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
