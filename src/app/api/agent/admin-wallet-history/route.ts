import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId, type Collection, type Filter } from 'mongodb';

import clientPromise, { dbName } from '@/lib/mongodb';

type AgentDoc = {
  _id?: ObjectId;
  agentcode?: string;
  agentName?: string;
  agentLogo?: string;
  adminWalletAddress?: string;
  updatedAt?: string;
};

type AdminUserDoc = {
  _id?: ObjectId;
  storecode?: string;
  walletAddress?: string;
  nickname?: string;
  avatar?: string;
};

type AgentAdminWalletHistoryDoc = {
  _id?: ObjectId;
  agentcode: string;
  agentName: string;
  agentLogo?: string;
  previousAdminWalletAddress: string;
  previousAdminNickname?: string;
  previousAdminAvatar?: string;
  nextAdminWalletAddress: string;
  nextAdminNickname?: string;
  nextAdminAvatar?: string;
  changedByWalletAddress?: string;
  changedByName?: string;
  changedAt: string;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toSafeString = (value: unknown) => String(value || '').trim();
const normalizeAddress = (value: string) => String(value || '').trim().toLowerCase();
const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

const serializeHistory = (item: AgentAdminWalletHistoryDoc) => ({
  id: String(item._id || ''),
  agentcode: String(item.agentcode || ''),
  agentName: String(item.agentName || ''),
  agentLogo: String(item.agentLogo || ''),
  previousAdminWalletAddress: String(item.previousAdminWalletAddress || ''),
  previousAdminNickname: String(item.previousAdminNickname || ''),
  previousAdminAvatar: String(item.previousAdminAvatar || ''),
  nextAdminWalletAddress: String(item.nextAdminWalletAddress || ''),
  nextAdminNickname: String(item.nextAdminNickname || ''),
  nextAdminAvatar: String(item.nextAdminAvatar || ''),
  changedByWalletAddress: String(item.changedByWalletAddress || ''),
  changedByName: String(item.changedByName || ''),
  changedAt: String(item.changedAt || ''),
});

const findAdminUserByWallet = async (
  usersCollection: Collection<AdminUserDoc>,
  walletAddress: string,
) => {
  const normalizedWalletAddress = toSafeString(walletAddress);
  if (!isWalletAddress(normalizedWalletAddress)) {
    return null;
  }

  const user = await usersCollection.findOne({
    storecode: 'admin',
    walletAddress: {
      $regex: `^${escapeRegex(normalizedWalletAddress)}$`,
      $options: 'i',
    },
  });

  if (!user) {
    return null;
  }

  return {
    walletAddress: toSafeString(user.walletAddress),
    nickname: toSafeString(user.nickname),
    avatar: toSafeString(user.avatar),
  };
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = toSafeString(body?.action).toLowerCase() || 'list';

  const mongodbClient = await clientPromise;
  const db = mongodbClient.db(dbName);
  const agentsCollection = db.collection<AgentDoc>('agents');
  const usersCollection = db.collection<AdminUserDoc>('users');
  const historiesCollection = db.collection<AgentAdminWalletHistoryDoc>('agentAdminWalletAddressHistories');

  if (action === 'list') {
    const limit = Math.min(Math.max(Number(body?.limit || 50), 1), 200);
    const page = Math.max(Number(body?.page || 1), 1);
    const skip = (page - 1) * limit;
    const search = toSafeString(body?.search);

    const query: Filter<AgentAdminWalletHistoryDoc> = search
      ? {
          $or: [
            { agentcode: { $regex: escapeRegex(search), $options: 'i' } },
            { agentName: { $regex: escapeRegex(search), $options: 'i' } },
            { previousAdminWalletAddress: { $regex: escapeRegex(search), $options: 'i' } },
            { nextAdminWalletAddress: { $regex: escapeRegex(search), $options: 'i' } },
            { changedByName: { $regex: escapeRegex(search), $options: 'i' } },
            { changedByWalletAddress: { $regex: escapeRegex(search), $options: 'i' } },
          ],
        }
      : {};

    const [items, totalCount] = await Promise.all([
      historiesCollection
        .find(query)
        .sort({ changedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      historiesCollection.countDocuments(query),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    return NextResponse.json({
      result: {
        items: items.map((item) => serializeHistory(item)),
        totalCount,
        totalPages,
        page,
        limit,
      },
    });
  }

  if (action === 'update') {
    const agentcode = toSafeString(body?.agentcode);
    const nextAdminWalletAddress = toSafeString(body?.nextAdminWalletAddress);
    const changedByWalletAddress = toSafeString(body?.changedByWalletAddress);
    const changedByName = toSafeString(body?.changedByName);

    if (!agentcode) {
      return NextResponse.json({ error: 'agentcode is required' }, { status: 400 });
    }
    if (!isWalletAddress(nextAdminWalletAddress)) {
      return NextResponse.json({ error: 'nextAdminWalletAddress is invalid' }, { status: 400 });
    }

    const agent = await agentsCollection.findOne({
      agentcode: {
        $regex: `^${escapeRegex(agentcode)}$`,
        $options: 'i',
      },
    });
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const previousAdminWalletAddress = toSafeString(agent.adminWalletAddress);
    if (normalizeAddress(previousAdminWalletAddress) === normalizeAddress(nextAdminWalletAddress)) {
      return NextResponse.json({
        result: {
          changed: false,
          agentcode: toSafeString(agent.agentcode || agentcode),
          previousAdminWalletAddress,
          nextAdminWalletAddress,
        },
      });
    }

    const nextAdminUser = await findAdminUserByWallet(usersCollection, nextAdminWalletAddress);
    if (!nextAdminUser) {
      return NextResponse.json({ error: '선택한 관리 지갑의 admin 회원 정보를 찾을 수 없습니다.' }, { status: 400 });
    }

    const previousAdminUser = await findAdminUserByWallet(usersCollection, previousAdminWalletAddress);
    const nowIso = new Date().toISOString();

    await agentsCollection.updateOne(
      { _id: agent._id },
      {
        $set: {
          adminWalletAddress: nextAdminWalletAddress,
          updatedAt: nowIso,
        },
      },
    );

    await historiesCollection.insertOne({
      agentcode: toSafeString(agent.agentcode || agentcode),
      agentName: toSafeString(agent.agentName || ''),
      agentLogo: toSafeString(agent.agentLogo || ''),
      previousAdminWalletAddress,
      previousAdminNickname: toSafeString(previousAdminUser?.nickname || ''),
      previousAdminAvatar: toSafeString(previousAdminUser?.avatar || ''),
      nextAdminWalletAddress,
      nextAdminNickname: toSafeString(nextAdminUser.nickname || ''),
      nextAdminAvatar: toSafeString(nextAdminUser.avatar || ''),
      changedByWalletAddress,
      changedByName,
      changedAt: nowIso,
    });

    return NextResponse.json({
      result: {
        changed: true,
        agentcode: toSafeString(agent.agentcode || agentcode),
        previousAdminWalletAddress,
        nextAdminWalletAddress,
        nextAdminNickname: toSafeString(nextAdminUser.nickname || ''),
        nextAdminAvatar: toSafeString(nextAdminUser.avatar || ''),
        changedByWalletAddress,
        changedByName,
        changedAt: nowIso,
      },
    });
  }

  return NextResponse.json({ error: 'unsupported action' }, { status: 400 });
}
