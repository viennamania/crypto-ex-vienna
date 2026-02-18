import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId, type Db } from 'mongodb';

import clientPromise, { dbName } from '@/lib/mongodb';

const DELETION_LOG_COLLECTION_NAME = 'store_member_deletion_logs';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toText = (value: unknown) => String(value ?? '').trim();

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
    .listCollections({ name: DELETION_LOG_COLLECTION_NAME }, { nameOnly: true })
    .hasNext();

  if (!exists) {
    await db.createCollection(DELETION_LOG_COLLECTION_NAME);
  }

  const logsCollection = db.collection(DELETION_LOG_COLLECTION_NAME);
  await Promise.allSettled([
    logsCollection.createIndex({ storecode: 1, deletedAt: -1 }),
    logsCollection.createIndex({ memberWalletAddress: 1, deletedAt: -1 }),
    logsCollection.createIndex({ memberId: 1, deletedAt: -1 }),
  ]);

  return logsCollection;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const storecode = toText(body?.storecode);
    const memberId = toText(body?.memberId);
    const requestedWalletAddress = toText(body?.walletAddress);
    const requestedNickname = toText(body?.nickname);
    const deletedByWalletAddress = toText(body?.deletedByWalletAddress);
    const deletedByName = toText(body?.deletedByName);

    if (!storecode || !memberId) {
      return NextResponse.json(
        { error: 'storecode and memberId are required' },
        { status: 400 },
      );
    }

    if (!ObjectId.isValid(memberId)) {
      return NextResponse.json(
        { error: 'Invalid memberId' },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db(dbName);
    const usersCollection = db.collection('users');
    const storesCollection = db.collection('stores');

    const memberObjectId = new ObjectId(memberId);
    const memberFilter = {
      _id: memberObjectId,
      storecode: { $regex: `^${escapeRegex(storecode)}$`, $options: 'i' },
    };

    const targetMember = await usersCollection.findOne<Record<string, unknown>>(memberFilter);
    if (!targetMember) {
      return NextResponse.json(
        { error: '삭제할 회원을 찾지 못했습니다.' },
        { status: 404 },
      );
    }

    const deleteResult = await usersCollection.deleteOne(memberFilter);
    if (deleteResult.deletedCount !== 1) {
      return NextResponse.json(
        { error: '회원 삭제에 실패했습니다.' },
        { status: 500 },
      );
    }

    const normalizedStorecode = toText(targetMember.storecode) || storecode;
    const store = await storesCollection.findOne<Record<string, unknown>>(
      { storecode: { $regex: `^${escapeRegex(normalizedStorecode)}$`, $options: 'i' } },
      { projection: { _id: 0, storecode: 1, storeName: 1 } },
    );

    const logsCollection = await ensureDeletionLogCollection(db);
    const memberWalletAddress = toText(targetMember.walletAddress) || requestedWalletAddress;
    const memberNickname = toText(targetMember.nickname) || requestedNickname || '-';

    await logsCollection.insertOne({
      storecode: normalizedStorecode,
      storeName: toText(store?.storeName),
      memberId,
      memberWalletAddress,
      memberNickname,
      deletedAt: new Date(),
      deletedByWalletAddress,
      deletedByName,
      deletedByIp: getClientIp(request),
      deletedByUserAgent: toText(request.headers.get('user-agent')),
      reason: 'manual_delete_from_store_member_management',
      snapshot: {
        ...targetMember,
        _id: memberId,
      },
    });

    return NextResponse.json({
      result: true,
      deletedMember: {
        memberId,
        storecode: normalizedStorecode,
        walletAddress: memberWalletAddress,
        nickname: memberNickname,
      },
      deletionLogCollection: DELETION_LOG_COLLECTION_NAME,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '회원 삭제 처리 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
