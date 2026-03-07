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
const normalizeStatusValue = (value: unknown) => {
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

const parseStatusFilters = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return [] as string[];

  if (normalized === 'completedlike' || normalized === 'tradecompleted') {
    return ['paymentConfirmed', 'completed'];
  }

  const segments = normalized.includes(',') ? normalized.split(',') : [normalized];
  const uniqueValues = new Set<string>();

  segments.forEach((segment) => {
    const statusValue = normalizeStatusValue(segment);
    if (statusValue) {
      uniqueValues.add(statusValue);
    }
  });

  return Array.from(uniqueValues);
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
    const statusFilters = parseStatusFilters(body?.status);
    const privateSaleMode =
      body?.privateSaleMode === 'private' || body?.privateSaleMode === 'normal' || body?.privateSaleMode === 'all'
        ? body.privateSaleMode
        : 'all';
    const searchBuyerWalletAddressRegex = toRegexFilter(body?.searchBuyerWalletAddress);
    const searchAgentcodeRegex = toRegexFilter(body?.searchAgentcode);
    const searchPaymentMethodRegex = toRegexFilter(body?.searchPaymentMethod);
    const searchBuyerStoreReferralStorecodeRegex = toRegexFilter(body?.searchBuyerStoreReferralStorecode);

    const fromDateIso = toIsoDateBoundary(body?.fromDate, true) || '1970-01-01T00:00:00.000Z';
    const toDateIso = toIsoDateBoundary(body?.toDate, false) || new Date().toISOString();
    const summaryStatusKeys = (
      statusFilters.length > 0
        ? statusFilters.map((value) => value.toLowerCase())
        : ['paymentconfirmed']
    ).filter(Boolean);

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
    if (statusFilters.length === 1) {
      andFilters.push({
        status: { $regex: `^${escapeRegex(statusFilters[0])}$`, $options: 'i' },
      });
    } else if (statusFilters.length > 1) {
      andFilters.push({
        $or: statusFilters.map((statusValue) => ({
          status: { $regex: `^${escapeRegex(statusValue)}$`, $options: 'i' },
        })),
      });
    }

    if (searchBuyerWalletAddressRegex) {
      andFilters.push({
        $or: [
          { walletAddress: searchBuyerWalletAddressRegex },
          { 'buyer.walletAddress': searchBuyerWalletAddressRegex },
        ],
      });
    }

    if (searchAgentcodeRegex) {
      andFilters.push({
        $or: [
          { agentcode: searchAgentcodeRegex },
          { 'agent.agentcode': searchAgentcodeRegex },
          { 'seller.agentcode': searchAgentcodeRegex },
        ],
      });
    }

    if (searchPaymentMethodRegex) {
      andFilters.push({
        $or: [
          { paymentMethod: searchPaymentMethodRegex },
          { 'seller.bankInfo.bankName': searchPaymentMethodRegex },
        ],
      });
    }

    if (privateSaleMode === 'private') {
      andFilters.push({ privateSale: true });
    } else if (privateSaleMode === 'normal') {
      andFilters.push({ privateSale: { $ne: true } });
    }

    const groupingAndFilters = [...andFilters];

    if (searchBuyerStoreReferralStorecodeRegex) {
      andFilters.push({
        'buyer.storeReferral.storecode': searchBuyerStoreReferralStorecodeRegex,
      });
    }

    const filter: Record<string, any> = andFilters.length > 1 ? { $and: andFilters } : andFilters[0];
    const groupingFilter: Record<string, any> =
      groupingAndFilters.length > 1
        ? { $and: groupingAndFilters }
        : groupingAndFilters[0];

    const client = await clientPromise;
    const collection = client.db(dbName).collection('buyorders');

    const [orders, totalCount, totalAmountRows, sellerSalesRows, buyerStoreReferralGroupRows] = await Promise.all([
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
              normalizedAgentFeeRate: {
                $let: {
                  vars: {
                    candidateRates: [
                      {
                        $convert: {
                          input: { $ifNull: ['$agentFeeRate', 0] },
                          to: 'double',
                          onError: 0,
                          onNull: 0,
                        },
                      },
                      {
                        $convert: {
                          input: { $ifNull: ['$agentFeePercent', 0] },
                          to: 'double',
                          onError: 0,
                          onNull: 0,
                        },
                      },
                      {
                        $convert: {
                          input: { $ifNull: ['$settlement.agentFeePercent', 0] },
                          to: 'double',
                          onError: 0,
                          onNull: 0,
                        },
                      },
                      {
                        $convert: {
                          input: { $ifNull: ['$store.agentFeePercent', 0] },
                          to: 'double',
                          onError: 0,
                          onNull: 0,
                        },
                      },
                      {
                        $convert: {
                          input: { $ifNull: ['$agent.agentFeePercent', 0] },
                          to: 'double',
                          onError: 0,
                          onNull: 0,
                        },
                      },
                      {
                        $convert: {
                          input: { $ifNull: ['$agent.platformFeePercent', 0] },
                          to: 'double',
                          onError: 0,
                          onNull: 0,
                        },
                      },
                      {
                        $convert: {
                          input: { $ifNull: ['$seller.agentFeePercent', 0] },
                          to: 'double',
                          onError: 0,
                          onNull: 0,
                        },
                      },
                    ],
                  },
                  in: {
                    $ifNull: [
                      {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: '$$candidateRates',
                              as: 'rate',
                              cond: { $gt: ['$$rate', 0] },
                            },
                          },
                          0,
                        ],
                      },
                      0,
                    ],
                  },
                },
              },
              normalizedStoredAgentFeeAmount: {
                $let: {
                  vars: {
                    candidateAmounts: [
                      {
                        $convert: {
                          input: { $ifNull: ['$agentFeeAmount', 0] },
                          to: 'double',
                          onError: 0,
                          onNull: 0,
                        },
                      },
                      {
                        $convert: {
                          input: { $ifNull: ['$agentFeeUsdtAmount', 0] },
                          to: 'double',
                          onError: 0,
                          onNull: 0,
                        },
                      },
                      {
                        $convert: {
                          input: { $ifNull: ['$settlement.agentFeeAmount', 0] },
                          to: 'double',
                          onError: 0,
                          onNull: 0,
                        },
                      },
                      {
                        $convert: {
                          input: { $ifNull: ['$settlement.agentFeeAmountUSDT', 0] },
                          to: 'double',
                          onError: 0,
                          onNull: 0,
                        },
                      },
                    ],
                  },
                  in: {
                    $ifNull: [
                      {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: '$$candidateAmounts',
                              as: 'amount',
                              cond: { $gt: ['$$amount', 0] },
                            },
                          },
                          0,
                        ],
                      },
                      0,
                    ],
                  },
                },
              },
            },
          },
          {
            $addFields: {
              normalizedAgentFeeAmount: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$normalizedAgentFeeRate', 0] },
                      { $gt: ['$normalizedUsdtAmount', 0] },
                    ],
                  },
                  {
                    $trunc: [
                      { $divide: [{ $multiply: ['$normalizedUsdtAmount', '$normalizedAgentFeeRate'] }, 100] },
                      6,
                    ],
                  },
                  {
                    $trunc: ['$normalizedStoredAgentFeeAmount', 6],
                  },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalKrwAmount: {
                $sum: {
                  $cond: [{ $in: ['$normalizedStatus', summaryStatusKeys] }, '$normalizedKrwAmount', 0],
                },
              },
              totalUsdtAmount: {
                $sum: {
                  $cond: [{ $in: ['$normalizedStatus', summaryStatusKeys] }, '$normalizedUsdtAmount', 0],
                },
              },
              totalAgentFeeAmount: {
                $sum: {
                  $cond: [{ $in: ['$normalizedStatus', summaryStatusKeys] }, '$normalizedAgentFeeAmount', 0],
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
      collection
        .aggregate([
          { $match: groupingFilter },
          {
            $addFields: {
              normalizedBuyerStoreReferralStorecode: {
                $trim: {
                  input: {
                    $toString: {
                      $ifNull: ['$buyer.storeReferral.storecode', ''],
                    },
                  },
                },
              },
              normalizedBuyerStoreReferralStoreName: {
                $trim: {
                  input: {
                    $toString: {
                      $ifNull: ['$buyer.storeReferral.storeName', ''],
                    },
                  },
                },
              },
              normalizedBuyerStoreReferralStoreLogo: {
                $trim: {
                  input: {
                    $toString: {
                      $ifNull: ['$buyer.storeReferral.storeLogo', ''],
                    },
                  },
                },
              },
            },
          },
          {
            $match: {
              normalizedBuyerStoreReferralStorecode: { $ne: '' },
            },
          },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: {
                storecodeKey: {
                  $toLower: '$normalizedBuyerStoreReferralStorecode',
                },
              },
              storecode: { $first: '$normalizedBuyerStoreReferralStorecode' },
              storeName: { $first: '$normalizedBuyerStoreReferralStoreName' },
              storeLogo: { $first: '$normalizedBuyerStoreReferralStoreLogo' },
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              storecode: 1,
              storeName: 1,
              storeLogo: 1,
              count: 1,
            },
          },
          { $sort: { count: -1, storeName: 1, storecode: 1 } },
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
        agentFeePercent: number;
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
              agentFeePercent: {
                $convert: {
                  input: { $ifNull: ['$agentFeePercent', 0] },
                  to: 'double',
                  onError: 0,
                  onNull: 0,
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
          agentFeePercent: Number(item?.agentFeePercent || 0) || 0,
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
              agentFeePercent: Number(agentInfo.agentFeePercent || 0) || 0,
            }
          : undefined,
        agentName: agentInfo?.agentName || '',
        agentLogo: agentInfo?.agentLogo || '',
      };
    });

    const totalAmount = totalAmountRows?.[0] || {};
    const sellerSalesSummary = Array.isArray(sellerSalesRows) ? sellerSalesRows : [];
    const buyerStoreReferralGroups = Array.isArray(buyerStoreReferralGroupRows)
      ? buyerStoreReferralGroupRows
      : [];

    return NextResponse.json({
      result: {
        orders: enrichedOrders,
        totalCount,
        totalKrwAmount: Number(totalAmount?.totalKrwAmount || 0),
        totalUsdtAmount: Number(totalAmount?.totalUsdtAmount || 0),
        totalAgentFeeAmount: Number(totalAmount?.totalAgentFeeAmount || 0),
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
        buyerStoreReferralGroups: buyerStoreReferralGroups.map((item: any) => ({
          storecode: String(item?.storecode || '').trim(),
          storeName: String(item?.storeName || '').trim(),
          storeLogo: String(item?.storeLogo || '').trim(),
          count: Number(item?.count || 0),
        })),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch buy order dashboard list.' }, { status: 500 });
  }
}
