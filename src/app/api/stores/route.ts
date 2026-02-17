import { NextRequest, NextResponse } from 'next/server';

import clientPromise, { dbName } from '@/lib/mongodb';

type StoreDoc = {
  storecode: string;
  storeName?: string;
  storeLogo?: string;
  adminWalletAddress?: string;
  paymentWalletAddress?: string;
  createdAt?: string;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() ?? '';
  const adminWalletAddress = searchParams.get('adminWalletAddress')?.trim() ?? '';
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 30));
  const skip = Math.max(0, Number(searchParams.get('skip')) || 0);

  const client = await clientPromise;
  const collection = client.db(dbName).collection<StoreDoc>('stores');

  const query: Record<string, unknown> = {
    storecode: { $nin: ['admin', 'agent'] },
  };

  if (search) {
    query.$or = [
      { storeName: { $regex: search, $options: 'i' } },
      { storecode: { $regex: search, $options: 'i' } },
    ];
  }

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
        _id: 0,
        storecode: 1,
        storeName: 1,
        storeLogo: 1,
        adminWalletAddress: 1,
        paymentWalletAddress: 1,
        createdAt: 1,
        adminNickname: '$adminUser.nickname',
        adminAvatar: '$adminUser.avatar',
      },
    },
  ];

  const [items, total] = await Promise.all([
    collection.aggregate(pipeline).toArray(),
    collection.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    total,
  });
}

