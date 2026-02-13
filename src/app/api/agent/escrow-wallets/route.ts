import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { createThirdwebClient, Engine } from 'thirdweb';

import clientPromise, { dbName } from '@/lib/mongodb';

type AgentDoc = {
  _id?: ObjectId;
  agentcode?: string;
  agentName?: string;
  agentLogo?: string;
  adminWalletAddress?: string;
};

type AgentEscrowWalletDoc = {
  _id?: ObjectId;
  agentcode: string;
  label: string;
  walletAddress: string;
  createdByWalletAddress: string;
  createdAt: string;
  engineWalletId?: string;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeAddress = (value?: string | null) => String(value || '').trim().toLowerCase();

const getAgentByCode = async (agentcode: string): Promise<AgentDoc | null> => {
  const client = await clientPromise;
  const collection = client.db(dbName).collection<AgentDoc>('agents');
  return collection.findOne({
    agentcode: { $regex: `^${escapeRegex(agentcode)}$`, $options: 'i' },
  });
};

const isAgentAdminWallet = (agent: AgentDoc | null, requesterWalletAddress: string) => {
  const adminWallet = normalizeAddress(agent?.adminWalletAddress);
  const requester = normalizeAddress(requesterWalletAddress);
  if (!adminWallet || !requester) return false;
  return adminWallet === requester;
};

const toSerializableItem = (item: AgentEscrowWalletDoc) => ({
  id: String(item._id || ''),
  agentcode: item.agentcode,
  label: item.label,
  walletAddress: item.walletAddress,
  createdByWalletAddress: item.createdByWalletAddress,
  createdAt: item.createdAt,
  engineWalletId: item.engineWalletId || '',
});

const validateAgentAndRequester = async (agentcode: string, requesterWalletAddress: string) => {
  if (!agentcode) {
    return NextResponse.json({ error: 'agentcode is required' }, { status: 400 });
  }
  if (!requesterWalletAddress) {
    return NextResponse.json({ error: 'requesterWalletAddress is required' }, { status: 400 });
  }
  const agent = await getAgentByCode(agentcode);
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }
  if (!isAgentAdminWallet(agent, requesterWalletAddress)) {
    return NextResponse.json({ error: 'Only agent admin wallet can manage escrow wallets' }, { status: 403 });
  }
  return { agent };
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentcode = searchParams.get('agentcode')?.trim() || '';
  const requesterWalletAddress = searchParams.get('requesterWalletAddress')?.trim() || '';
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 100)));

  const validation = await validateAgentAndRequester(agentcode, requesterWalletAddress);
  if (validation instanceof NextResponse) {
    return validation;
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection<AgentEscrowWalletDoc>('agentEscrowWallets');
  const matchQuery = {
    agentcode: { $regex: `^${escapeRegex(agentcode)}$`, $options: 'i' },
  };

  const [items, totalCount] = await Promise.all([
    collection.find(matchQuery).sort({ createdAt: -1 }).limit(limit).toArray(),
    collection.countDocuments(matchQuery),
  ]);

  return NextResponse.json({
    result: {
      items: items.map(toSerializableItem),
      totalCount,
      agent: {
        agentcode: validation.agent.agentcode || agentcode,
        agentName: validation.agent.agentName || '',
        agentLogo: validation.agent.agentLogo || '',
        adminWalletAddress: validation.agent.adminWalletAddress || '',
      },
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const agentcode = String(body?.agentcode || '').trim();
  const requesterWalletAddress = String(body?.requesterWalletAddress || '').trim();
  const inputLabel = String(body?.label || '').trim();

  const validation = await validateAgentAndRequester(agentcode, requesterWalletAddress);
  if (validation instanceof NextResponse) {
    return validation;
  }

  const secretKey = process.env.THIRDWEB_SECRET_KEY || '';
  if (!secretKey) {
    return NextResponse.json({ error: 'THIRDWEB_SECRET_KEY is not configured' }, { status: 500 });
  }

  try {
    const client = createThirdwebClient({ secretKey });
    const label = inputLabel || `agent-${agentcode}-escrow-${Date.now()}`;
    const created = (await Engine.createServerWallet({
      client,
      label,
    })) as any;

    const walletAddress = String(
      created?.smartAccountAddress ||
        created?.address ||
        created?.walletAddress ||
        ''
    ).trim();
    const engineWalletId = String(
      created?.id ||
        created?.walletId ||
        created?.serverWalletId ||
        ''
    ).trim();

    if (!walletAddress) {
      return NextResponse.json({ error: 'Failed to create server wallet' }, { status: 500 });
    }

    const dbClient = await clientPromise;
    const collection = dbClient.db(dbName).collection<AgentEscrowWalletDoc>('agentEscrowWallets');

    const existing = await collection.findOne({
      walletAddress: { $regex: `^${escapeRegex(walletAddress)}$`, $options: 'i' },
    });
    if (existing) {
      return NextResponse.json({
        result: {
          item: toSerializableItem(existing),
          duplicated: true,
        },
      });
    }

    const doc: AgentEscrowWalletDoc = {
      agentcode,
      label,
      walletAddress,
      createdByWalletAddress: requesterWalletAddress,
      createdAt: new Date().toISOString(),
      engineWalletId: engineWalletId || undefined,
    };
    const insertResult = await collection.insertOne(doc);
    const saved = await collection.findOne({ _id: insertResult.insertedId });

    return NextResponse.json({
      result: {
        item: saved ? toSerializableItem(saved) : null,
        duplicated: false,
      },
    });
  } catch (error) {
    console.error('Error creating agent escrow wallet', error);
    return NextResponse.json({ error: 'Failed to create agent escrow wallet' }, { status: 500 });
  }
}
