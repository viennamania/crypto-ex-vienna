import { NextResponse } from 'next/server';

import clientPromise, { dbName } from '@/lib/mongodb';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        agentcode?: string;
        page?: number;
        limit?: number;
        searchTerm?: string;
        status?: string;
        hasBankInfo?: 'all' | 'yes' | 'no';
        startDate?: string;
        endDate?: string;
      }
    | null;

  const agentcode = String(body?.agentcode || '').trim();
  const page = Math.max(1, Number(body?.page || 1));
  const limit = Math.max(1, Math.min(200, Number(body?.limit || 20)));
  const searchTerm = String(body?.searchTerm || '').trim();
  const status = String(body?.status || 'all').trim();
  const hasBankInfo = (body?.hasBankInfo as 'all' | 'yes' | 'no') || 'all';
  const startDate = String(body?.startDate || '').trim();
  const endDate = String(body?.endDate || '').trim();

  if (!agentcode) {
    return NextResponse.json({ error: 'agentcode is required.' }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const collection = client.db(dbName).collection('buyorders');

    const agentRegex = { $regex: `^${escapeRegex(agentcode)}$`, $options: 'i' };

    const match: Record<string, unknown> = {
      // User requested: match only buyorders.agentcode.
      agentcode: agentRegex,
    };

    if (status && status !== 'all') {
      match.status = { $regex: `^${escapeRegex(status)}$`, $options: 'i' };
    }

    if (hasBankInfo === 'yes') {
      match['seller.bankInfo.bankName'] = { $exists: true, $nin: ['', null] };
    } else if (hasBankInfo === 'no') {
      match['seller.bankInfo.bankName'] = { $in: ['', null] };
    }

    if (searchTerm) {
      const termRegex = { $regex: escapeRegex(searchTerm), $options: 'i' };
      match.$and = [
        {
          $or: [
            { tradeId: termRegex },
            { status: termRegex },
            { nickname: termRegex },
            { walletAddress: termRegex },
            { storecode: termRegex },
            { 'buyer.nickname': termRegex },
            { 'buyer.walletAddress': termRegex },
            { 'seller.nickname': termRegex },
            { 'store.storeName': termRegex },
          ],
        },
      ];
    }

    if (startDate || endDate) {
      const createdAtRange: Record<string, string> = {};
      if (startDate) {
        const parsedStart = new Date(startDate);
        if (!Number.isNaN(parsedStart.getTime())) {
          createdAtRange.$gte = parsedStart.toISOString();
        }
      }
      if (endDate) {
        const parsedEnd = new Date(endDate);
        if (!Number.isNaN(parsedEnd.getTime())) {
          parsedEnd.setHours(23, 59, 59, 999);
          createdAtRange.$lte = parsedEnd.toISOString();
        }
      }
      if (Object.keys(createdAtRange).length > 0) {
        match.createdAt = createdAtRange;
      }
    }

    const [items, totalCount, totals] = await Promise.all([
      collection
        .find(match)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(match),
      collection
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              totalKrwAmount: {
                $sum: {
                  $convert: {
                    input: '$krwAmount',
                    to: 'double',
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
              totalUsdtAmount: {
                $sum: {
                  $convert: {
                    input: '$usdtAmount',
                    to: 'double',
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
              totalPlatformFeeAmount: {
                $sum: {
                  $convert: {
                    input: {
                      $ifNull: [
                        '$platformFeeAmount',
                        {
                          $ifNull: [
                            '$platform_fee_amount',
                            { $ifNull: ['$settlement.platformFeeAmount', 0] },
                          ],
                        },
                      ],
                    },
                    to: 'double',
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
        ])
        .toArray(),
    ]);

    return NextResponse.json({
      items,
      totalCount: toNumber(totalCount),
      totalKrwAmount: toNumber(totals?.[0]?.totalKrwAmount),
      totalUsdtAmount: toNumber(totals?.[0]?.totalUsdtAmount),
      totalPlatformFeeAmount: toNumber(totals?.[0]?.totalPlatformFeeAmount),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load buy orders.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
