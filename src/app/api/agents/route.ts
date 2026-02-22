import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

import clientPromise from '@/lib/mongodb';
import { dbName } from '@/lib/mongodb';

type AgentDoc = {
  _id?: ObjectId;
  agentcode: string;
  agentName: string;
  agentType?: string;
  agentUrl?: string;
  agentDescription?: string;
  agentLogo?: string;
  agentBanner?: string;
  adminWalletAddress?: string;
  createdAt?: string;
  updatedAt?: string;
};

const AGENT_FIELDS: (keyof AgentDoc)[] = [
  'agentcode',
  'agentName',
  'agentType',
  'agentUrl',
  'agentDescription',
  'agentLogo',
  'agentBanner',
  'adminWalletAddress',
];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getCollection = async () => {
  const client = await clientPromise;
  return client.db(dbName).collection<AgentDoc>('agents');
};

const generateAgentCode = async () => {
  const collection = await getCollection();
  let code = '';
  let tries = 0;
  do {
    code = Math.random().toString(36).slice(2, 10);
    // ensure starts with a letter for readability
    if (!/^[a-z]/i.test(code)) {
      code = `a${code.slice(1)}`;
    }
    const exists = await collection.findOne({ agentcode: code });
    if (!exists) return code;
    tries += 1;
  } while (tries < 5);
  // fallback to timestamp if collision persists
  return `ag${Date.now().toString(36)}`;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() ?? '';
  const adminWalletAddress = searchParams.get('adminWalletAddress')?.trim() ?? '';
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 50));
  const skip = Math.max(0, Number(searchParams.get('skip')) || 0);

  const collection = await getCollection();

  const query: Record<string, unknown> =
    search.length > 0
      ? {
          $or: [
            { agentName: { $regex: search, $options: 'i' } },
            { agentcode: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

  if (adminWalletAddress) {
    query.adminWalletAddress = {
      $regex: `^${escapeRegex(adminWalletAddress)}$`,
      $options: 'i',
    };
  }

  const pipeline = [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        let: { adminWalletAddress: '$adminWalletAddress' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$storecode', 'admin'] },
                  {
                    $eq: [
                      { $toLower: { $ifNull: ['$walletAddress', ''] } },
                      { $toLower: { $ifNull: ['$$adminWalletAddress', ''] } },
                    ],
                  },
                ],
              },
            },
          },
          {
            $project: {
              _id: 0,
              nickname: 1,
              avatar: 1,
            },
          },
          { $limit: 1 },
        ],
        as: 'adminUser',
      },
    },
    {
      $addFields: {
        adminUser: { $arrayElemAt: ['$adminUser', 0] },
      },
    },
    {
      $project: {
        agentcode: 1,
        agentName: 1,
        agentType: 1,
        agentUrl: 1,
        agentDescription: 1,
        agentLogo: 1,
        agentBanner: 1,
        adminWalletAddress: 1,
        createdAt: 1,
        updatedAt: 1,
        adminNickname: '$adminUser.nickname',
        adminAvatar: '$adminUser.avatar',
      },
    },
  ];

  const aggCursor = collection.aggregate(pipeline);
  const [items, total] = await Promise.all([
    aggCursor.toArray(),
    collection.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    total,
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as Partial<AgentDoc>;
  if (!payload.agentName) {
    return NextResponse.json({ error: 'agentName is required' }, { status: 400 });
  }

  const collection = await getCollection();
  const agentcode = payload.agentcode?.trim() || (await generateAgentCode());

  if (payload.agentName) {
    const dupName = await collection.findOne({ agentName: payload.agentName.trim() });
    if (dupName) {
      return NextResponse.json({ error: 'Agent name already exists' }, { status: 409 });
    }
  }
  const dupCode = await collection.findOne({ agentcode });
  if (dupCode) {
    return NextResponse.json({ error: 'Generated agent code conflict, try again' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const doc: AgentDoc = {
    agentcode,
    agentName: payload.agentName.trim(),
    agentType: payload.agentType?.trim(),
    agentUrl: payload.agentUrl?.trim(),
    agentDescription: payload.agentDescription?.trim(),
    agentLogo: payload.agentLogo?.trim(),
    agentBanner: payload.agentBanner?.trim(),
    adminWalletAddress: payload.adminWalletAddress?.trim(),
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(doc);
  const created = await collection.findOne({ _id: result.insertedId });

  return NextResponse.json({ item: created }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const payload = (await request.json()) as Partial<AgentDoc> & { id?: string };
  const id = payload.id;
  const agentcode = payload.agentcode;

  if (!id && !agentcode) {
    return NextResponse.json({ error: 'id or agentcode is required' }, { status: 400 });
  }

  const collection = await getCollection();
  const filter = id
    ? { _id: new ObjectId(id) }
    : { agentcode: agentcode as string };

  const set: Partial<AgentDoc> = {};
  AGENT_FIELDS.forEach((field) => {
    if (payload[field] !== undefined) {
      // @ts-expect-error index signature
      set[field] = typeof payload[field] === 'string' ? payload[field]?.trim() : payload[field];
    }
  });
  set.updatedAt = new Date().toISOString();

  const result = await collection.updateOne(filter, { $set: set });
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const updated = await collection.findOne(filter);
  return NextResponse.json({ item: updated });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const agentcode = searchParams.get('agentcode');

  if (!id && !agentcode) {
    return NextResponse.json({ error: 'id or agentcode is required' }, { status: 400 });
  }

  const collection = await getCollection();
  const filter = id ? { _id: new ObjectId(id) } : { agentcode: agentcode as string };
  const result = await collection.deleteOne(filter);

  if (result.deletedCount === 0) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
