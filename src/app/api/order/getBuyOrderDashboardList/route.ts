import { NextResponse, type NextRequest } from 'next/server';
import clientPromise, { dbName } from '@lib/mongodb';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toRegexFilter = (value: unknown) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  return { $regex: escapeRegex(normalized), $options: 'i' };
};

const toIsoDateBoundary = (value: unknown, isStart: boolean) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  const time = isStart ? 'T00:00:00+09:00' : 'T23:59:59+09:00';
  const parsed = new Date(`${normalized}${time}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const normalizeAgentcode = (value: unknown) => String(value || '').trim();
const toAgentcodeKey = (value: unknown) => normalizeAgentcode(value).toLowerCase();
const normalizeStatusFilter = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'ordered') return 'ordered';
  if (normalized === 'accepted') return 'accepted';
  if (normalized === 'paymentrequested') return 'paymentRequested';
  if (normalized === 'paymentconfirmed') return 'paymentConfirmed';
  if (normalized === 'completed') return 'completed';
  if (normalized === 'cancelled') return 'cancelled';
  return '';
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const pageRaw = Number(body?.page || 1);
    const limitRaw = Number(body?.limit || 20);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(200, Math.floor(limitRaw)) : 20;

    const storecodeRegex = toRegexFilter(body?.storecode);
    const searchTradeIdRegex = toRegexFilter(body?.searchTradeId);
    const searchBuyerRegex = toRegexFilter(body?.searchBuyer);
    const searchSellerIdRegex = toRegexFilter(body?.searchSellerId);
    const searchSellerWalletAddressRegex = toRegexFilter(body?.searchSellerWalletAddress);
    const searchDepositNameRegex = toRegexFilter(body?.searchDepositName);
    const statusFilter = normalizeStatusFilter(body?.status);
    const privateSaleMode =
      body?.privateSaleMode === 'private' || body?.privateSaleMode === 'normal' || body?.privateSaleMode === 'all'
        ? body.privateSaleMode
        : 'all';

    const fromDateIso = toIsoDateBoundary(body?.fromDate, true) || '1970-01-01T00:00:00.000Z';
    const toDateIso = toIsoDateBoundary(body?.toDate, false) || new Date().toISOString();

    const andFilters: Record<string, any>[] = [
      { createdAt: { $gte: fromDateIso, $lte: toDateIso } },
      storecodeRegex ? { storecode: storecodeRegex } : { storecode: { $ne: null } },
    ];

    if (searchTradeIdRegex) {
      andFilters.push({ tradeId: searchTradeIdRegex });
    }
    if (searchBuyerRegex) {
      andFilters.push({ nickname: searchBuyerRegex });
    }
    if (searchSellerIdRegex) {
      andFilters.push({
        $or: [
          { 'seller.nickname': searchSellerIdRegex },
          { 'seller.walletAddress': searchSellerIdRegex },
        ],
      });
    }
    if (searchSellerWalletAddressRegex) {
      andFilters.push({ 'seller.walletAddress': searchSellerWalletAddressRegex });
    }
    if (searchDepositNameRegex) {
      andFilters.push({
        $or: [
          { 'buyer.depositName': searchDepositNameRegex },
          { 'seller.bankInfo.accountHolder': searchDepositNameRegex },
        ],
      });
    }
    if (statusFilter) {
      andFilters.push({
        status: { $regex: `^${escapeRegex(statusFilter)}$`, $options: 'i' },
      });
    }

    if (privateSaleMode === 'private') {
      andFilters.push({ privateSale: true });
    } else if (privateSaleMode === 'normal') {
      andFilters.push({ privateSale: { $ne: true } });
    }

    const filter: Record<string, any> = andFilters.length > 1 ? { $and: andFilters } : andFilters[0];

    const client = await clientPromise;
    const collection = client.db(dbName).collection('buyorders');

    const [orders, totalCount, totalAmountRows, sellerSalesRows] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
      collection
        .aggregate([
          { $match: filter },
          {
            $addFields: {
              normalizedStatus: {
                $toLower: {
                  $trim: {
                    input: {
                      $toString: { $ifNull: ['$status', ''] },
                    },
                  },
                },
              },
              normalizedKrwAmount: {
                $convert: {
                  input: { $ifNull: ['$krwAmount', 0] },
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
              normalizedUsdtAmount: {
                $convert: {
                  input: { $ifNull: ['$usdtAmount', 0] },
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
              normalizedPlatformFeeAmount: {
                $convert: {
                  input: {
                    $ifNull: [
                      '$platformFeeAmount',
                      {
                        $ifNull: [
                          '$platformFee.amountUsdt',
                          {
                            $ifNull: [
                              '$platformFee.amount',
                              { $ifNull: ['$settlement.platformFeeAmount', 0] },
                            ],
                          },
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
          {
            $group: {
              _id: null,
              totalKrwAmount: {
                $sum: {
                  $cond: [{ $eq: ['$normalizedStatus', 'paymentconfirmed'] }, '$normalizedKrwAmount', 0],
                },
              },
              totalUsdtAmount: {
                $sum: {
                  $cond: [{ $eq: ['$normalizedStatus', 'paymentconfirmed'] }, '$normalizedUsdtAmount', 0],
                },
              },
              totalPlatformFeeAmount: { $sum: '$normalizedPlatformFeeAmount' },
            },
          },
        ])
        .toArray(),
      collection
        .aggregate([
          { $match: filter },
          {
            $addFields: {
              normalizedSellerWalletAddress: {
                $trim: {
                  input: {
                    $toString: { $ifNull: ['$seller.walletAddress', ''] },
                  },
                },
              },
              normalizedSellerNickname: {
                $trim: {
                  input: {
                    $toString: {
                      $ifNull: ['$seller.nickname', { $ifNull: ['$nickname', ''] }],
                    },
                  },
                },
              },
              normalizedSellerAvatar: {
                $trim: {
                  input: {
                    $toString: {
                      $ifNull: ['$seller.avatar', ''],
                    },
                  },
                },
              },
              normalizedKrwAmount: {
                $convert: {
                  input: { $ifNull: ['$krwAmount', 0] },
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
              normalizedUsdtAmount: {
                $convert: {
                  input: { $ifNull: ['$usdtAmount', 0] },
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
              normalizedStatus: {
                $toLower: {
                  $trim: {
                    input: {
                      $toString: { $ifNull: ['$status', ''] },
                    },
                  },
                },
              },
              sellerGroupKey: {
                $let: {
                  vars: {
                    wallet: {
                      $trim: {
                        input: {
                          $toString: { $ifNull: ['$seller.walletAddress', ''] },
                        },
                      },
                    },
                    nickname: {
                      $trim: {
                        input: {
                          $toString: {
                            $ifNull: ['$seller.nickname', { $ifNull: ['$nickname', ''] }],
                          },
                        },
                      },
                    },
                  },
                  in: {
                    $cond: [
                      { $ne: ['$$wallet', ''] },
                      { $toLower: '$$wallet' },
                      { $concat: ['nickname:', '$$nickname'] },
                    ],
                  },
                },
              },
            },
          },
          {
            $match: {
              normalizedStatus: 'paymentconfirmed',
            },
          },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: '$sellerGroupKey',
              sellerWalletAddress: { $first: '$normalizedSellerWalletAddress' },
              sellerNickname: { $first: '$normalizedSellerNickname' },
              sellerAvatar: { $first: '$normalizedSellerAvatar' },
              totalKrwAmount: { $sum: '$normalizedKrwAmount' },
              totalUsdtAmount: { $sum: '$normalizedUsdtAmount' },
              paymentConfirmedCount: { $sum: 1 },
              latestCreatedAt: { $max: '$createdAt' },
            },
          },
          {
            $project: {
              _id: 0,
              sellerWalletAddress: '$sellerWalletAddress',
              sellerNickname: '$sellerNickname',
              sellerAvatar: '$sellerAvatar',
              totalKrwAmount: 1,
              totalUsdtAmount: 1,
              paymentConfirmedCount: 1,
              latestCreatedAt: 1,
            },
          },
          {
            $match: {
              $or: [
                { sellerWalletAddress: { $ne: '' } },
                { sellerNickname: { $ne: '' } },
              ],
            },
          },
          { $sort: { totalKrwAmount: -1, totalUsdtAmount: -1, paymentConfirmedCount: -1 } },
        ])
        .toArray(),
    ]);

    const pageAgentcodeKeys = Array.from(
      new Set(
        orders
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

    const enrichedOrders = orders.map((order: any) => {
      const agentcode = normalizeAgentcode(order?.agentcode || order?.seller?.agentcode);
      const agentInfo = agentByCode.get(toAgentcodeKey(agentcode));

      return {
        ...order,
        agentcode: agentcode || agentInfo?.agentcode || '',
        agent: agentInfo
          ? {
              agentcode: agentInfo.agentcode || agentcode,
              agentName: agentInfo.agentName || '',
              agentLogo: agentInfo.agentLogo || '',
              creditWallet: {
                smartAccountAddress: agentInfo.creditWalletSmartAccountAddress || '',
              },
              smartAccountAddress: agentInfo.creditWalletSmartAccountAddress || '',
            }
          : undefined,
        agentName: agentInfo?.agentName || '',
        agentLogo: agentInfo?.agentLogo || '',
      };
    });

    const totalAmount = totalAmountRows?.[0] || {};
    const sellerSalesSummary = Array.isArray(sellerSalesRows) ? sellerSalesRows : [];

    return NextResponse.json({
      result: {
        orders: enrichedOrders,
        totalCount,
        totalKrwAmount: Number(totalAmount?.totalKrwAmount || 0),
        totalUsdtAmount: Number(totalAmount?.totalUsdtAmount || 0),
        totalPlatformFeeAmount: Number(totalAmount?.totalPlatformFeeAmount || 0),
        sellerSalesSummary: sellerSalesSummary.map((item: any) => ({
          sellerWalletAddress: String(item?.sellerWalletAddress || ''),
          sellerNickname: String(item?.sellerNickname || ''),
          sellerAvatar: String(item?.sellerAvatar || ''),
          totalKrwAmount: Number(item?.totalKrwAmount || 0),
          totalUsdtAmount: Number(item?.totalUsdtAmount || 0),
          paymentConfirmedCount: Number(item?.paymentConfirmedCount || item?.orderCount || 0),
          latestCreatedAt: String(item?.latestCreatedAt || ''),
        })),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch buy order dashboard list.' }, { status: 500 });
  }
}
