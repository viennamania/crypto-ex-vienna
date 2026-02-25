import { NextResponse } from 'next/server';

import clientPromise, { dbName } from '@/lib/mongodb';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};
const toIsoDateBoundary = (value: unknown, isStart: boolean) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;

  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyPattern.test(normalized)) {
    const time = isStart ? 'T00:00:00+09:00' : 'T23:59:59+09:00';
    const parsedKst = new Date(`${normalized}${time}`);
    if (!Number.isNaN(parsedKst.getTime())) {
      return parsedKst.toISOString();
    }
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  if (isStart) {
    parsed.setHours(0, 0, 0, 0);
  } else {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed.toISOString();
};

const normalizeAgentcode = (value: unknown) => String(value || '').trim();
const toAgentcodeKey = (value: unknown) => normalizeAgentcode(value).toLowerCase();

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
      const startDateIso = toIsoDateBoundary(startDate, true);
      const endDateIso = toIsoDateBoundary(endDate, false);
      if (startDateIso) {
        createdAtRange.$gte = startDateIso;
      }
      if (endDateIso) {
        createdAtRange.$lte = endDateIso;
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

    const pageAgentcodeKeys = Array.from(
      new Set(
        items
          .map((order: any) => toAgentcodeKey(order?.agentcode || order?.seller?.agentcode))
          .filter(Boolean),
      ),
    );

    const agentByCode = new Map<
      string,
      {
        agentcode: string;
        agentName: string;
        agentLogo: string;
        creditWalletSmartAccountAddress: string;
      }
    >();

    if (pageAgentcodeKeys.length > 0) {
      const agentsCollection = client.db(dbName).collection('agents');
      const agentRows = await agentsCollection
        .aggregate([
          {
            $addFields: {
              normalizedAgentcode: {
                $toLower: {
                  $trim: {
                    input: {
                      $toString: { $ifNull: ['$agentcode', ''] },
                    },
                  },
                },
              },
            },
          },
          {
            $match: {
              normalizedAgentcode: { $in: pageAgentcodeKeys },
            },
          },
          {
            $project: {
              _id: 0,
              agentcode: {
                $trim: {
                  input: {
                    $toString: { $ifNull: ['$agentcode', ''] },
                  },
                },
              },
              agentName: {
                $trim: {
                  input: {
                    $toString: { $ifNull: ['$agentName', ''] },
                  },
                },
              },
              agentLogo: {
                $trim: {
                  input: {
                    $toString: { $ifNull: ['$agentLogo', ''] },
                  },
                },
              },
              creditWalletSmartAccountAddress: {
                $trim: {
                  input: {
                    $toString: {
                      $ifNull: [
                        '$creditWallet.smartAccountAddress',
                        { $ifNull: ['$smartAccountAddress', ''] },
                      ],
                    },
                  },
                },
              },
              normalizedAgentcode: 1,
            },
          },
        ])
        .toArray();

      agentRows.forEach((item: any) => {
        const key = toAgentcodeKey(item?.normalizedAgentcode || item?.agentcode);
        if (!key) return;
        agentByCode.set(key, {
          agentcode: normalizeAgentcode(item?.agentcode),
          agentName: String(item?.agentName || '').trim(),
          agentLogo: String(item?.agentLogo || '').trim(),
          creditWalletSmartAccountAddress: String(item?.creditWalletSmartAccountAddress || '').trim(),
        });
      });
    }

    const enrichedItems = items.map((order: any) => {
      const resolvedAgentcode = normalizeAgentcode(order?.agentcode || order?.seller?.agentcode);
      const agentInfo = agentByCode.get(toAgentcodeKey(resolvedAgentcode));

      return {
        ...order,
        agentcode: resolvedAgentcode || agentInfo?.agentcode || '',
        agent: agentInfo
          ? {
              agentcode: agentInfo.agentcode || resolvedAgentcode,
              agentName: agentInfo.agentName || '',
              agentLogo: agentInfo.agentLogo || '',
              creditWallet: {
                smartAccountAddress: agentInfo.creditWalletSmartAccountAddress || '',
              },
              smartAccountAddress: agentInfo.creditWalletSmartAccountAddress || '',
            }
          : order?.agent,
        agentName: agentInfo?.agentName || String(order?.agentName || '').trim(),
        agentLogo: agentInfo?.agentLogo || String(order?.agentLogo || '').trim(),
      };
    });

    return NextResponse.json({
      items: enrichedItems,
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
