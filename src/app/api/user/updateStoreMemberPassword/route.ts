import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId, type Db } from 'mongodb';

import clientPromise, { dbName } from '@/lib/mongodb';

const PASSWORD_CHANGE_LOG_COLLECTION_NAME = 'store_member_password_change_logs';

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

const maskPassword = (value: string) => {
  if (!value) return '';
  if (value.length <= 2) return `${value[0] || '*'}*`;
  if (value.length <= 4) return `${value[0]}**${value[value.length - 1]}`;
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

const ensurePasswordChangeLogCollection = async (db: Db) => {
  const exists = await db
    .listCollections({ name: PASSWORD_CHANGE_LOG_COLLECTION_NAME }, { nameOnly: true })
    .hasNext();

  if (!exists) {
    await db.createCollection(PASSWORD_CHANGE_LOG_COLLECTION_NAME);
  }

  const historyCollection = db.collection(PASSWORD_CHANGE_LOG_COLLECTION_NAME);
  await Promise.allSettled([
    historyCollection.createIndex({ storecode: 1, changedAt: -1 }),
    historyCollection.createIndex({ memberObjectId: 1, changedAt: -1 }),
    historyCollection.createIndex({ memberWalletAddress: 1, changedAt: -1 }),
    historyCollection.createIndex({ changedByWalletAddress: 1, changedAt: -1 }),
  ]);

  return historyCollection;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const storecode = toText(body?.storecode);
    const memberId = toText(body?.memberId);
    const memberNickname = toText(body?.memberNickname);
    const memberWalletAddress = toText(body?.memberWalletAddress);
    const nextPassword = toText(body?.nextPassword);
    const changedByWalletAddress = toText(body?.changedByWalletAddress);
    const changedByName = toText(body?.changedByName);

    if (!storecode || !memberId || !nextPassword) {
      return NextResponse.json(
        { error: 'storecode, memberId, nextPassword are required' },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db(dbName);
    const usersCollection = db.collection('users');
    const storesCollection = db.collection('stores');

    const storeQuery = { $regex: `^${escapeRegex(storecode)}$`, $options: 'i' };
    const memberFilterCandidates: Array<Record<string, unknown>> = [];

    if (ObjectId.isValid(memberId)) {
      memberFilterCandidates.push({ _id: new ObjectId(memberId) });
    }

    const numericMemberId = Number(memberId);
    if (Number.isFinite(numericMemberId)) {
      memberFilterCandidates.push({ id: numericMemberId });
    }

    memberFilterCandidates.push({ id: memberId });

    if (memberFilterCandidates.length === 0) {
      return NextResponse.json(
        { error: 'Invalid memberId' },
        { status: 400 },
      );
    }

    const baseFilter: Record<string, unknown> = {
      storecode: storeQuery,
      $or: memberFilterCandidates,
    };

    const targetMember = await usersCollection.findOne<Record<string, unknown>>(baseFilter);
    if (!targetMember) {
      return NextResponse.json(
        { error: '비밀번호를 변경할 회원을 찾지 못했습니다.' },
        { status: 404 },
      );
    }

    const previousPassword = toText(targetMember.password);
    const targetObjectId = targetMember._id instanceof ObjectId ? targetMember._id : null;
    const strictFilter = targetObjectId
      ? { _id: targetObjectId }
      : {
          storecode: storeQuery,
          nickname: { $regex: `^${escapeRegex(toText(targetMember.nickname))}$`, $options: 'i' },
          walletAddress: toText(targetMember.walletAddress),
        };

    const updateResult = await usersCollection.updateOne(strictFilter, {
      $set: {
        password: nextPassword,
        updatedAt: new Date().toISOString(),
      },
    });

    if (updateResult.matchedCount !== 1) {
      return NextResponse.json(
        { error: '회원 비밀번호 업데이트에 실패했습니다.' },
        { status: 500 },
      );
    }

    const normalizedStorecode = toText(targetMember.storecode) || storecode;
    const store = await storesCollection.findOne<Record<string, unknown>>(
      { storecode: { $regex: `^${escapeRegex(normalizedStorecode)}$`, $options: 'i' } },
      { projection: { _id: 0, storeName: 1 } },
    );

    const historyCollection = await ensurePasswordChangeLogCollection(db);
    await historyCollection.insertOne({
      storecode: normalizedStorecode,
      storeName: toText(store?.storeName),
      memberObjectId: targetObjectId ? String(targetObjectId) : '',
      memberId,
      memberNickname: toText(targetMember.nickname) || memberNickname,
      memberWalletAddress: toText(targetMember.walletAddress) || memberWalletAddress,
      previousPasswordMasked: maskPassword(previousPassword),
      nextPasswordMasked: maskPassword(nextPassword),
      previousPasswordLength: previousPassword.length,
      nextPasswordLength: nextPassword.length,
      changed: previousPassword !== nextPassword,
      changedAt: new Date(),
      changedByWalletAddress,
      changedByName,
      changedByIp: getClientIp(request),
      changedByUserAgent: toText(request.headers.get('user-agent')),
      reason: 'manual_update_from_p2p_store_member_management',
    });

    return NextResponse.json({
      result: true,
      updatedMember: {
        memberId,
        storecode: normalizedStorecode,
        nickname: toText(targetMember.nickname),
        walletAddress: toText(targetMember.walletAddress),
      },
      passwordChangeLogCollection: PASSWORD_CHANGE_LOG_COLLECTION_NAME,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '비밀번호 변경 처리 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
