import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId, type Filter } from 'mongodb';

import clientPromise, { dbName } from '@/lib/mongodb';

type AgentDoc = {
  _id?: ObjectId;
  agentcode?: string;
  agentName?: string;
  agentLogo?: string;
  agentFeePercent?: number;
  platformFeePercent?: number;
  updatedAt?: string;
};

type AgentPlatformFeeRateHistoryDoc = {
  _id?: ObjectId;
  agentcode: string;
  agentName: string;
  agentLogo?: string;
  previousFeePercent: number;
  nextFeePercent: number;
  changedByWalletAddress?: string;
  changedByName?: string;
  changedBy: string;
  changedAt: string;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toSafeFeePercent = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0 || numeric > 100) return null;
  return Math.round(numeric * 100) / 100;
};

const toSafeString = (value: unknown) => String(value || '').trim();
const toSafeWalletAddress = (value: unknown) => {
  const normalized = toSafeString(value);
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) return '';
  return normalized;
};
const buildChangedByLabel = (changedByName: string, changedByWalletAddress: string, fallback: string) => {
  if (changedByName && changedByWalletAddress) {
    return `${changedByName} (${changedByWalletAddress})`;
  }
  if (changedByName) return changedByName;
  if (changedByWalletAddress) return changedByWalletAddress;
  return fallback;
};

const serializeHistoryItem = (item: AgentPlatformFeeRateHistoryDoc) => ({
  id: String(item._id || ''),
  agentcode: String(item.agentcode || ''),
  agentName: String(item.agentName || ''),
  agentLogo: String(item.agentLogo || ''),
  previousFeePercent: Number(item.previousFeePercent || 0),
  nextFeePercent: Number(item.nextFeePercent || 0),
  changedByWalletAddress: String(item.changedByWalletAddress || ''),
  changedByName: String(item.changedByName || ''),
  changedBy: String(item.changedBy || ''),
  changedAt: String(item.changedAt || ''),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = toSafeString(body?.action).toLowerCase();

  const mongodbClient = await clientPromise;
  const agentsCollection = mongodbClient.db(dbName).collection<AgentDoc>('agents');
  const historiesCollection = mongodbClient
    .db(dbName)
    .collection<AgentPlatformFeeRateHistoryDoc>('agentPlatformFeeRateHistories');

  if (action === 'history') {
    const limit = Math.min(Math.max(Number(body?.limit || 50), 1), 200);
    const page = Math.max(Number(body?.page || 1), 1);
    const skip = (page - 1) * limit;
    const search = toSafeString(body?.search);

    const query: Filter<AgentPlatformFeeRateHistoryDoc> = search
      ? {
          $or: [
            {
              agentcode: {
                $regex: escapeRegex(search),
                $options: 'i',
              },
            },
            {
              agentName: {
                $regex: escapeRegex(search),
                $options: 'i',
              },
            },
            {
              changedBy: {
                $regex: escapeRegex(search),
                $options: 'i',
              },
            },
            {
              changedByName: {
                $regex: escapeRegex(search),
                $options: 'i',
              },
            },
            {
              changedByWalletAddress: {
                $regex: escapeRegex(search),
                $options: 'i',
              },
            },
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
        items: items.map((item) => serializeHistoryItem(item)),
        totalCount,
        totalPages,
        page,
        limit,
      },
    });
  }

  if (action === 'update') {
    const agentcode = toSafeString(body?.agentcode);
    const feePercent = toSafeFeePercent(body?.feePercent);
    const changedByName = toSafeString(body?.changedByName);
    const changedByWalletAddress = toSafeWalletAddress(body?.changedByWalletAddress);
    const changedBy =
      toSafeString(body?.changedBy)
      || buildChangedByLabel(changedByName, changedByWalletAddress, 'admin');

    if (!agentcode) {
      return NextResponse.json({ error: 'agentcode is required' }, { status: 400 });
    }
    if (feePercent === null) {
      return NextResponse.json({ error: 'feePercent must be a number between 0 and 100' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const agent = await agentsCollection.findOne({
      agentcode: {
        $regex: `^${escapeRegex(agentcode)}$`,
        $options: 'i',
      },
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const previousFeePercent = toSafeFeePercent(agent.platformFeePercent ?? agent.agentFeePercent ?? 0) || 0;
    const nextFeePercent = feePercent;

    await agentsCollection.updateOne(
      { _id: agent._id },
      {
        $set: {
          platformFeePercent: nextFeePercent,
          agentFeePercent: nextFeePercent,
          updatedAt: nowIso,
        },
      },
    );

    await historiesCollection.insertOne({
      agentcode: String(agent.agentcode || agentcode),
      agentName: String(agent.agentName || ''),
      agentLogo: String(agent.agentLogo || ''),
      previousFeePercent,
      nextFeePercent,
      changedByWalletAddress,
      changedByName,
      changedBy,
      changedAt: nowIso,
    });

    return NextResponse.json({
      result: {
        agentcode: String(agent.agentcode || agentcode),
        agentLogo: String(agent.agentLogo || ''),
        previousFeePercent,
        nextFeePercent,
        changedByWalletAddress,
        changedByName,
        changedBy,
        changedAt: nowIso,
      },
    });
  }

  return NextResponse.json({ error: 'unsupported action' }, { status: 400 });
}
