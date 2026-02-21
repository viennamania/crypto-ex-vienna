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
    const searchDepositNameRegex = toRegexFilter(body?.searchDepositName);
    const searchStoreNameRegex = toRegexFilter(body?.searchStoreName);
    const privateSaleMode =
      body?.privateSaleMode === 'private' || body?.privateSaleMode === 'normal' || body?.privateSaleMode === 'all'
        ? body.privateSaleMode
        : 'all';

    const fromDateIso = toIsoDateBoundary(body?.fromDate, true) || '1970-01-01T00:00:00.000Z';
    const toDateIso = toIsoDateBoundary(body?.toDate, false) || new Date().toISOString();

    const filter: Record<string, any> = {
      createdAt: { $gte: fromDateIso, $lte: toDateIso },
      ...(storecodeRegex ? { storecode: storecodeRegex } : { storecode: { $ne: null } }),
      ...(searchTradeIdRegex ? { tradeId: searchTradeIdRegex } : {}),
      ...(searchBuyerRegex ? { nickname: searchBuyerRegex } : {}),
      ...(searchStoreNameRegex ? { 'store.storeName': searchStoreNameRegex } : {}),
      ...(searchDepositNameRegex
        ? {
            $or: [
              { 'buyer.depositName': searchDepositNameRegex },
              { 'seller.bankInfo.accountHolder': searchDepositNameRegex },
            ],
          }
        : {}),
    };

    if (privateSaleMode === 'private') {
      filter.privateSale = true;
    } else if (privateSaleMode === 'normal') {
      filter.privateSale = { $ne: true };
    }

    const client = await clientPromise;
    const collection = client.db(dbName).collection('buyorders');

    const [orders, totalCount, totalAmountRows] = await Promise.all([
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
              totalKrwAmount: { $sum: { $ifNull: ['$krwAmount', 0] } },
              totalUsdtAmount: { $sum: { $ifNull: ['$usdtAmount', 0] } },
              totalPlatformFeeAmount: { $sum: '$normalizedPlatformFeeAmount' },
            },
          },
        ])
        .toArray(),
    ]);

    const totalAmount = totalAmountRows?.[0] || {};

    return NextResponse.json({
      result: {
        orders,
        totalCount,
        totalKrwAmount: Number(totalAmount?.totalKrwAmount || 0),
        totalUsdtAmount: Number(totalAmount?.totalUsdtAmount || 0),
        totalPlatformFeeAmount: Number(totalAmount?.totalPlatformFeeAmount || 0),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch buy order dashboard list.' }, { status: 500 });
  }
}
