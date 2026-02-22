import { NextResponse, type NextRequest } from 'next/server';
import { createThirdwebClient, Engine } from 'thirdweb';
import { ObjectId } from 'mongodb';

import clientPromise, { dbName } from '@/lib/mongodb';

type AgentDoc = {
  _id?: ObjectId;
  agentcode?: string;
  agentName?: string;
  creditWallet?: {
    signerAddress?: string;
    smartAccountAddress?: string;
  };
  // Legacy fields (migration fallback)
  signerAddress?: string;
  smartAccountAddress?: string;
  updatedAt?: string;
};

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveSignerAddress = (createdWallet: any): string => {
  const candidates = [
    createdWallet?.address,
    createdWallet?.walletAddress,
    createdWallet?.serverWalletAddress,
    createdWallet?.account?.address,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
};

const resolveSmartAccountAddress = (createdWallet: any): string => {
  const value = createdWallet?.smartAccountAddress;
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return '';
};

const findAgentByCode = async (agentcode: string): Promise<AgentDoc | null> => {
  const client = await clientPromise;
  const collection = client.db(dbName).collection<AgentDoc>('agents');
  return collection.findOne({
    agentcode: {
      $regex: `^${escapeRegex(agentcode)}$`,
      $options: 'i',
    },
  });
};

const resolveAgentUpdateFilter = (agent: AgentDoc, fallbackAgentcode: string) => {
  if (agent?._id) {
    return { _id: agent._id };
  }
  return {
    agentcode: {
      $regex: `^${escapeRegex(fallbackAgentcode)}$`,
      $options: 'i',
    },
  };
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const agentcode = String(body?.agentcode || '').trim();

  if (!agentcode) {
    return NextResponse.json({ error: 'agentcode is required' }, { status: 400 });
  }

  const agent = await findAgentByCode(agentcode);
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const normalizedExistingSmartAccountAddress = String(
    agent?.creditWallet?.smartAccountAddress || agent?.smartAccountAddress || ''
  ).trim();
  const normalizedExistingSignerAddress = String(
    agent?.creditWallet?.signerAddress || agent?.signerAddress || ''
  ).trim();

  if (isWalletAddress(normalizedExistingSmartAccountAddress)) {
    const signerAddress = isWalletAddress(normalizedExistingSignerAddress)
      ? normalizedExistingSignerAddress
      : '';

    const nowIso = new Date().toISOString();
    const shouldBackfill =
      signerAddress !== String(agent?.creditWallet?.signerAddress || '').trim()
      || normalizedExistingSmartAccountAddress !== String(agent?.creditWallet?.smartAccountAddress || '').trim()
      || Boolean(String(agent?.signerAddress || '').trim())
      || Boolean(String(agent?.smartAccountAddress || '').trim());

    if (shouldBackfill) {
      const client = await clientPromise;
      const collection = client.db(dbName).collection<AgentDoc>('agents');
      const updateFilter = resolveAgentUpdateFilter(agent, agentcode);
      await collection.updateOne(
        updateFilter,
        {
          $set: {
            creditWallet: {
              signerAddress,
              smartAccountAddress: normalizedExistingSmartAccountAddress,
            },
            updatedAt: nowIso,
          },
          $unset: {
            signerAddress: '',
            smartAccountAddress: '',
          },
        }
      );
    }

    return NextResponse.json({
      result: {
        agentcode: agent.agentcode || agentcode,
        agentName: agent.agentName || '',
        creditWallet: {
          signerAddress,
          smartAccountAddress: normalizedExistingSmartAccountAddress,
        },
        created: false,
      },
    });
  }

  const secretKey = process.env.THIRDWEB_SECRET_KEY || '';
  if (!secretKey) {
    return NextResponse.json({ error: 'THIRDWEB_SECRET_KEY is not configured' }, { status: 500 });
  }

  try {
    const thirdwebClient = createThirdwebClient({ secretKey });
    const createdWallet = (await Engine.createServerWallet({
      client: thirdwebClient,
      label: `agent-${agentcode}-fee-${Date.now()}`,
    })) as any;

    const signerAddress = resolveSignerAddress(createdWallet);
    const maybeSmartAccountAddress = resolveSmartAccountAddress(createdWallet);
    const smartAccountAddress = isWalletAddress(maybeSmartAccountAddress)
      ? maybeSmartAccountAddress
      : signerAddress;

    if (!isWalletAddress(signerAddress) || !isWalletAddress(smartAccountAddress)) {
      return NextResponse.json({ error: 'Failed to create fee wallet address' }, { status: 500 });
    }

    const nowIso = new Date().toISOString();
    const client = await clientPromise;
    const collection = client.db(dbName).collection<AgentDoc>('agents');
    const updateFilter = resolveAgentUpdateFilter(agent, agentcode);

    const updateResult = await collection.updateOne(
      updateFilter,
      {
        $set: {
          creditWallet: {
            signerAddress,
            smartAccountAddress,
          },
          updatedAt: nowIso,
        },
        $unset: {
          signerAddress: '',
          smartAccountAddress: '',
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json({
      result: {
        agentcode: agent.agentcode || agentcode,
        agentName: agent.agentName || '',
        creditWallet: {
          signerAddress,
          smartAccountAddress,
        },
        created: true,
      },
    });
  } catch (error) {
    console.error('createFeeWalletAddress error', error);
    return NextResponse.json({ error: 'Failed to create fee wallet address' }, { status: 500 });
  }
}
