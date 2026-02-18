import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

import clientPromise, { dbName } from '@/lib/mongodb';

const toText = (value: unknown) => String(value ?? '').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const storecode = toText(body?.storecode);
    const memberId = toText(body?.memberId);
    const memberNickname = toText(body?.memberNickname);
    const memberWalletAddress = toText(body?.memberWalletAddress);
    const unlinkedByWalletAddress = toText(body?.unlinkedByWalletAddress);

    if (!storecode || !memberId) {
      return NextResponse.json(
        { error: 'storecode and memberId are required' },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const usersCollection = client.db(dbName).collection('users');

    const memberFilterCandidates: Array<Record<string, unknown>> = [];
    if (ObjectId.isValid(memberId)) {
      memberFilterCandidates.push({ _id: new ObjectId(memberId) });
    }
    const numericMemberId = Number(memberId);
    if (Number.isFinite(numericMemberId)) {
      memberFilterCandidates.push({ id: numericMemberId });
    }
    memberFilterCandidates.push({ id: memberId });

    const baseFilter: Record<string, unknown> = {
      storecode: { $regex: `^${escapeRegex(storecode)}$`, $options: 'i' },
      $or: memberFilterCandidates,
    };

    const targetUser = await usersCollection.findOne<Record<string, unknown>>(baseFilter);
    if (!targetUser) {
      return NextResponse.json(
        { error: '해당 회원을 찾지 못했습니다.' },
        { status: 404 },
      );
    }

    const targetObjectId = targetUser._id instanceof ObjectId ? targetUser._id : null;
    const currentWalletAddress = toText(targetUser.walletAddress);
    if (!currentWalletAddress) {
      return NextResponse.json({
        result: true,
        alreadyUnlinked: true,
        member: {
          memberId,
          storecode: toText(targetUser.storecode) || storecode,
          nickname: toText(targetUser.nickname) || memberNickname,
          walletAddress: '',
        },
      });
    }

    const updateFilter = targetObjectId
      ? { _id: targetObjectId }
      : baseFilter;

    const updateResult = await usersCollection.updateOne(updateFilter, {
      $set: {
        walletAddress: '',
        updatedAt: new Date().toISOString(),
        walletUnlinkedAt: new Date().toISOString(),
        walletUnlinkedByWalletAddress: unlinkedByWalletAddress,
      },
    });

    if (updateResult.matchedCount !== 1) {
      return NextResponse.json(
        { error: '회원 지갑 연동 해제에 실패했습니다.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      result: true,
      member: {
        memberId,
        storecode: toText(targetUser.storecode) || storecode,
        nickname: toText(targetUser.nickname) || memberNickname,
        previousWalletAddress: currentWalletAddress || memberWalletAddress,
        walletAddress: '',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '회원 지갑 연동 해제 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
