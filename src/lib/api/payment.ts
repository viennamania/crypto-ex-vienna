import { ObjectId } from 'mongodb';

import clientPromise from '../mongodb';

import { dbName } from '../mongodb';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pad2 = (value: number) => String(value).padStart(2, '0');

// payments collection
/*
{
  "_id": {
    "$oid": "68233a6fd590cf24cf1726f5"
  },
  "order": {
    "_id": {
      "$oid": "68232ac057fd8f91442809a9"
    },
    "storecode": "yudejfss",
    "walletAddress": "0xDD25d881E66B1bF1D6b711eF2a1Ea4C39054b654",
    "usdtAmount": 2.03,
    "user": {
      "_id": {
        "$oid": "68230420fc6a1d75386837dd"
      },
      "id": 8068058,
      "email": null,
      "nickname": "oss1114",
      "mobile": "+821012345678",
      "storecode": "yudejfss",
      "store": {
        "_id": {
          "$oid": "68219f5518fb58e5f4a220b2"
        },
        "storecode": "yudejfss",
        "storeName": "test99",
        "storeType": "test",
        "storeUrl": "https://test.com",
        "storeDescription": "설명입니다.",
        "storeLogo": "https://vzrcy5vcsuuocnf3.public.blob.vercel-storage.com/5M8446y-TT1KF2HDXnBNi0ESO5gFaWcbjJAQHi.png",
        "storeBanner": "https://crypto-ex-vienna.vercel.app/logo.png",
        "createdAt": "2025-05-12T07:12:21.336Z",
        "totalBuyerCount": 11,
        "settlementWalletAddress": "0xB35e743dA3d53f869a1b705fF91365715aC55DD4",
        "totalKrwAmount": 37000,
        "totalPaymentConfirmedCount": 7,
        "totalUsdtAmount": 26.15,
        "totalDealerAmount": 0.026149,
        "totalDealerAmountKRW": 0,
        "totalDealerCount": 7,
        "totalFeeAmount": 0.078446,
        "totalFeeAmountKRW": 100,
        "totalFeeCount": 7,
        "totalSettlementAmount": 26.045405000000002,
        "totalSettlementAmountKRW": 36500,
        "totalSettlementCount": 7
      },
      "walletAddress": "0xDD25d881E66B1bF1D6b711eF2a1Ea4C39054b654",
      "walletPrivateKey": "0x89b7a4b1e7c956faac7ac4cfaf6c8c292382edc2bede7cc4edf900c6f432683a",
      "createdAt": "2025-05-13T08:34:40.736Z",
      "settlementAmountOfFee": "0",
      "password": "12345678",
      "buyer": {
        "depositBankAccountNumber": "5172764425175",
        "depositBankName": "농협은행",
        "depositName": "오성수"
      }
    },
    "store": {
      "_id": {
        "$oid": "68219f5518fb58e5f4a220b2"
      },
      "storecode": "yudejfss",
      "storeName": "test99",
      "storeType": "test",
      "storeUrl": "https://test.com",
      "storeDescription": "설명입니다.",
      "storeLogo": null,
      "storeBanner": "https://crypto-ex-vienna.vercel.app/logo.png",
      "createdAt": "2025-05-12T07:12:21.336Z",
      "totalBuyerCount": 15,
      "settlementWalletAddress": "0xB35e743dA3d53f869a1b705fF91365715aC55DD4",
      "totalKrwAmount": 93000,
      "totalPaymentConfirmedCount": 20,
      "totalUsdtAmount": 64.00999999999999,
      "totalDealerAmount": 0.053863,
      "totalDealerAmountKRW": "80",
      "totalDealerCount": 17,
      "totalFeeAmount": 0.161606,
      "totalFeeAmountKRW": "239",
      "totalFeeCount": 17,
      "totalSettlementAmount": 53.654531,
      "totalSettlementAmountKRW": "79409",
      "totalSettlementCount": 17,
      "storeMemo": "12131231231"
    }
  },
  "store": {
    "_id": {
      "$oid": "68219f5518fb58e5f4a220b2"
    },
    "storecode": "yudejfss",
    "storeName": "test99",
    "storeType": "test",
    "storeUrl": "https://test.com",
    "storeDescription": "설명입니다.",
    "storeLogo": null,
    "storeBanner": "https://crypto-ex-vienna.vercel.app/logo.png",
    "createdAt": "2025-05-12T07:12:21.336Z",
    "totalBuyerCount": 15,
    "settlementWalletAddress": "0xB35e743dA3d53f869a1b705fF91365715aC55DD4",
    "totalKrwAmount": 93000,
    "totalPaymentConfirmedCount": 20,
    "totalUsdtAmount": 64.00999999999999,
    "totalDealerAmount": 0.053863,
    "totalDealerAmountKRW": "80",
    "totalDealerCount": 17,
    "totalFeeAmount": 0.161606,
    "totalFeeAmountKRW": "239",
    "totalFeeCount": 17,
    "totalSettlementAmount": 53.654531,
    "totalSettlementAmountKRW": "79409",
    "totalSettlementCount": 17,
    "storeMemo": "12131231231"
  },
  "user": {
    "_id": {
      "$oid": "68230420fc6a1d75386837dd"
    },
    "id": 8068058,
    "email": null,
    "nickname": "oss1114",
    "mobile": "+821012345678",
    "storecode": "yudejfss",
    "store": {
      "_id": {
        "$oid": "68219f5518fb58e5f4a220b2"
      },
      "storecode": "yudejfss",
      "storeName": "test99",
      "storeType": "test",
      "storeUrl": "https://test.com",
      "storeDescription": "설명입니다.",
      "storeLogo": "https://vzrcy5vcsuuocnf3.public.blob.vercel-storage.com/5M8446y-TT1KF2HDXnBNi0ESO5gFaWcbjJAQHi.png",
      "storeBanner": "https://crypto-ex-vienna.vercel.app/logo.png",
      "createdAt": "2025-05-12T07:12:21.336Z",
      "totalBuyerCount": 11,
      "settlementWalletAddress": "0xB35e743dA3d53f869a1b705fF91365715aC55DD4",
      "totalKrwAmount": 37000,
      "totalPaymentConfirmedCount": 7,
      "totalUsdtAmount": 26.15,
      "totalDealerAmount": 0.026149,
      "totalDealerAmountKRW": 0,
      "totalDealerCount": 7,
      "totalFeeAmount": 0.078446,
      "totalFeeAmountKRW": 100,
      "totalFeeCount": 7,
      "totalSettlementAmount": 26.045405000000002,
      "totalSettlementAmountKRW": 36500,
      "totalSettlementCount": 7
    },
    "walletAddress": "0xDD25d881E66B1bF1D6b711eF2a1Ea4C39054b654",
    "walletPrivateKey": "0x89b7a4b1e7c956faac7ac4cfaf6c8c292382edc2bede7cc4edf900c6f432683a",
    "createdAt": "2025-05-13T08:34:40.736Z",
    "settlementAmountOfFee": "0",
    "password": "12345678",
    "buyer": {
      "depositBankAccountNumber": "5172764425175",
      "depositBankName": "농협은행",
      "depositName": "오성수"
    }
  },
  "settlement": {
    "txid": "0x821886a239cc3144e923415e99fdeaababdc9b4c15f51b1ef7b3cd7236e0e252",
    "paymentAmount": 2.03,
    "settlementAmount": 2.021881,
    "feeAmount": 0.00609,
    "agentFeeAmount": 0.002029,
    "status": "paymentSettled",
    "createdAt": {
      "$date": "2025-05-13T12:26:23.173Z"
    }
  },
  "createdAt": {
    "$date": "2025-05-13T12:26:23.247Z"
  }
}
*/


// get all payments by storecode
export async function getAllPaymentsByStorecode(
{
    storecode,
    limit = 10,
    page = 1,
}: {
    storecode: string;
    limit?: number;
    page?: number;
}): Promise<any[]> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('payments');

  // get all payments by storecode
  const payments = await collection
    .find({ 'order.storecode': storecode })
    .skip((page - 1) * limit)
    .limit(limit)
    .project({
      'order.storecode': 1,
      'order.walletAddress': 1,
      'order.usdtAmount': 1,
      'order.user.nickname': 1,
      'order.user.mobile': 1,
      'order.user.store.storeName': 1,
      'order.user.store.storeType': 1,
      'order.user.store.storeUrl': 1,
      'order.user.store.storeDescription': 1,
      'order.user.store.storeLogo': 1,
      'order.user.store.storeBanner': 1,
      'settlement.txid': 1,
      'settlement.paymentAmount': 1,
      'settlement.settlementAmount': 1,
      'settlement.feeAmount': 1,
      'settlement.agentFeeAmount': 1,
      'settlement.status': 1,
    })
    .sort({ createdAt: -1 })
    .toArray();

  return payments;

}

export async function getAllWalletUsdtPaymentsByAgentcode(
{
    agentcode,
    limit = 20,
    page = 1,
    searchTerm = '',
    status = 'confirmed',
}: {
    agentcode: string;
    limit?: number;
    page?: number;
    searchTerm?: string;
    status?: 'prepared' | 'confirmed' | 'all';
}): Promise<{
  totalCount: number;
  totalKrwAmount: number;
  totalUsdtAmount: number;
  payments: any[];
}> {
  const normalizedAgentcode = String(agentcode || '').trim();
  if (!normalizedAgentcode) {
    return {
      totalCount: 0,
      totalKrwAmount: 0,
      totalUsdtAmount: 0,
      payments: [],
    };
  }

  const normalizedLimit = Math.min(Math.max(Number(limit || 20), 1), 100);
  const normalizedPage = Math.max(Number(page || 1), 1);
  const skip = (normalizedPage - 1) * normalizedLimit;

  const normalizedStatus = String(status || 'confirmed').trim().toLowerCase();
  const normalizedSearchTerm = String(searchTerm || '').trim();
  const searchRegex = normalizedSearchTerm
    ? { $regex: escapeRegex(normalizedSearchTerm), $options: 'i' }
    : null;

  const client = await clientPromise;
  const collection = client.db(dbName).collection('walletUsdtPayments');

  const matchQuery: any = {
    agentcode: {
      $regex: `^${escapeRegex(normalizedAgentcode)}$`,
      $options: 'i',
    },
  };

  if (normalizedStatus === 'prepared' || normalizedStatus === 'confirmed') {
    matchQuery.status = normalizedStatus;
  }

  const basePipeline: any[] = [
    { $match: matchQuery },
    {
      $lookup: {
        from: 'stores',
        localField: 'storecode',
        foreignField: 'storecode',
        as: 'storeDocs',
      },
    },
    {
      $addFields: {
        store: {
          $let: {
            vars: { storeDoc: { $arrayElemAt: ['$storeDocs', 0] } },
            in: {
              storecode: { $ifNull: ['$$storeDoc.storecode', '$storecode'] },
              storeName: { $ifNull: ['$$storeDoc.storeName', '$storeName'] },
              storeLogo: { $ifNull: ['$$storeDoc.storeLogo', ''] },
            },
          },
        },
      },
    },
  ];

  if (searchRegex) {
    basePipeline.push({
      $match: {
        $or: [
          { storecode: searchRegex },
          { 'store.storeName': searchRegex },
          { 'member.nickname': searchRegex },
          { fromWalletAddress: searchRegex },
          { toWalletAddress: searchRegex },
          { transactionHash: searchRegex },
        ],
      },
    });
  }

  const [payments, countRows, totalRows] = await Promise.all([
    collection
      .aggregate([
        ...basePipeline,
        {
          $project: {
            _id: 1,
            storecode: 1,
            status: 1,
            orderProcessing: { $ifNull: ['$order_processing', 'PROCESSING'] },
            orderProcessingUpdatedAt: { $ifNull: ['$order_processing_updated_at', ''] },
            fromWalletAddress: 1,
            toWalletAddress: 1,
            transactionHash: 1,
            usdtAmount: { $ifNull: ['$usdtAmount', 0] },
            krwAmount: { $ifNull: ['$krwAmount', 0] },
            exchangeRate: { $ifNull: ['$exchangeRate', 0] },
            createdAt: 1,
            confirmedAt: 1,
            memberNickname: { $ifNull: ['$member.nickname', ''] },
            store: 1,
          },
        },
        { $sort: { confirmedAt: -1, createdAt: -1 } },
        { $skip: skip },
        { $limit: normalizedLimit },
      ])
      .toArray(),
    collection
      .aggregate([
        ...basePipeline,
        { $count: 'totalCount' },
      ])
      .toArray(),
    collection
      .aggregate([
        ...basePipeline,
        {
          $group: {
            _id: null,
            totalKrwAmount: { $sum: { $ifNull: ['$krwAmount', 0] } },
            totalUsdtAmount: { $sum: { $ifNull: ['$usdtAmount', 0] } },
          },
        },
      ])
      .toArray(),
  ]);

  return {
    totalCount: Number(countRows?.[0]?.totalCount || 0),
    totalKrwAmount: Number(totalRows?.[0]?.totalKrwAmount || 0),
    totalUsdtAmount: Number(totalRows?.[0]?.totalUsdtAmount || 0),
    payments: payments.map((payment: any) => ({
      id: String(payment?._id || ''),
      storecode: String(payment?.storecode || ''),
      status: String(payment?.status || ''),
      orderProcessing: String(payment?.orderProcessing || 'PROCESSING'),
      orderProcessingUpdatedAt: String(payment?.orderProcessingUpdatedAt || ''),
      fromWalletAddress: String(payment?.fromWalletAddress || ''),
      toWalletAddress: String(payment?.toWalletAddress || ''),
      transactionHash: String(payment?.transactionHash || ''),
      usdtAmount: Number(payment?.usdtAmount || 0),
      krwAmount: Number(payment?.krwAmount || 0),
      exchangeRate: Number(payment?.exchangeRate || 0),
      createdAt: String(payment?.createdAt || ''),
      confirmedAt: String(payment?.confirmedAt || ''),
      memberNickname: String(payment?.memberNickname || ''),
      store: {
        storecode: String(payment?.store?.storecode || payment?.storecode || ''),
        storeName: String(payment?.store?.storeName || ''),
        storeLogo: String(payment?.store?.storeLogo || ''),
      },
    })),
  };
}

export async function updateWalletUsdtPaymentOrderProcessing({
  paymentId,
  orderProcessing = 'COMPLETED',
}: {
  paymentId: string;
  orderProcessing?: 'PROCESSING' | 'COMPLETED';
}): Promise<{
  id: string;
  orderProcessing: string;
  orderProcessingUpdatedAt: string;
}> {
  const normalizedPaymentId = String(paymentId || '').trim();
  if (!ObjectId.isValid(normalizedPaymentId)) {
    throw new Error('invalid paymentId');
  }

  const normalizedOrderProcessing = String(orderProcessing || '').trim().toUpperCase();
  if (normalizedOrderProcessing !== 'PROCESSING' && normalizedOrderProcessing !== 'COMPLETED') {
    throw new Error('invalid orderProcessing');
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection('walletUsdtPayments');

  const _id = new ObjectId(normalizedPaymentId);
  const now = new Date().toISOString();

  const updateResult = await collection.updateOne(
    { _id },
    {
      $set: {
        order_processing: normalizedOrderProcessing,
        order_processing_updated_at: now,
      },
    },
  );

  if (updateResult.matchedCount === 0) {
    throw new Error('payment not found');
  }

  const updated = await collection.findOne(
    { _id },
    { projection: { order_processing: 1, order_processing_updated_at: 1 } },
  );

  return {
    id: normalizedPaymentId,
    orderProcessing: String(updated?.order_processing || normalizedOrderProcessing),
    orderProcessingUpdatedAt: String(updated?.order_processing_updated_at || now),
  };
}

export async function getWalletUsdtPaymentStatsByAgentcode({
  agentcode,
  hourlyHours = 24,
  dailyDays = 14,
  monthlyMonths = 12,
}: {
  agentcode: string;
  hourlyHours?: number;
  dailyDays?: number;
  monthlyMonths?: number;
}): Promise<{
  generatedAt: string;
  totals: {
    count: number;
    usdtAmount: number;
    krwAmount: number;
  };
  hourly: {
    hours: number;
    points: Array<{
      bucket: string;
      label: string;
      count: number;
      usdtAmount: number;
      krwAmount: number;
    }>;
  };
  daily: {
    days: number;
    points: Array<{
      bucket: string;
      label: string;
      count: number;
      usdtAmount: number;
      krwAmount: number;
    }>;
  };
  monthly: {
    months: number;
    points: Array<{
      bucket: string;
      label: string;
      count: number;
      usdtAmount: number;
      krwAmount: number;
    }>;
  };
}> {
  const normalizedAgentcode = String(agentcode || '').trim();
  if (!normalizedAgentcode) {
    return {
      generatedAt: new Date().toISOString(),
      totals: {
        count: 0,
        usdtAmount: 0,
        krwAmount: 0,
      },
      hourly: { hours: 0, points: [] },
      daily: { days: 0, points: [] },
      monthly: { months: 0, points: [] },
    };
  }

  const normalizedHourlyHours = Math.min(Math.max(Number(hourlyHours || 24), 6), 72);
  const normalizedDailyDays = Math.min(Math.max(Number(dailyDays || 14), 7), 62);
  const normalizedMonthlyMonths = Math.min(Math.max(Number(monthlyMonths || 12), 6), 24);

  const now = new Date();
  const hourlyStart = new Date(now.getTime() - (normalizedHourlyHours - 1) * 60 * 60 * 1000);
  const dailyStart = new Date(now.getTime() - (normalizedDailyDays - 1) * 24 * 60 * 60 * 1000);
  const monthlyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (normalizedMonthlyMonths - 1), 1));

  const client = await clientPromise;
  const collection = client.db(dbName).collection('walletUsdtPayments');

  const baseMatch: any = {
    agentcode: {
      $regex: `^${escapeRegex(normalizedAgentcode)}$`,
      $options: 'i',
    },
    status: 'confirmed',
  };

  const basePipeline: any[] = [
    { $match: baseMatch },
    {
      $addFields: {
        eventAt: {
          $ifNull: [
            { $convert: { input: '$confirmedAt', to: 'date', onError: null, onNull: null } },
            { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } },
          ],
        },
      },
    },
    { $match: { eventAt: { $ne: null } } },
  ];

  const [totalRows, hourlyRows, dailyRows, monthlyRows] = await Promise.all([
    collection
      .aggregate([
        ...basePipeline,
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            usdtAmount: { $sum: { $ifNull: ['$usdtAmount', 0] } },
            krwAmount: { $sum: { $ifNull: ['$krwAmount', 0] } },
          },
        },
      ])
      .toArray(),
    collection
      .aggregate([
        ...basePipeline,
        { $match: { eventAt: { $gte: hourlyStart, $lte: now } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$eventAt', timezone: 'UTC' } },
            count: { $sum: 1 },
            usdtAmount: { $sum: { $ifNull: ['$usdtAmount', 0] } },
            krwAmount: { $sum: { $ifNull: ['$krwAmount', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
    collection
      .aggregate([
        ...basePipeline,
        { $match: { eventAt: { $gte: dailyStart, $lte: now } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$eventAt', timezone: 'UTC' } },
            count: { $sum: 1 },
            usdtAmount: { $sum: { $ifNull: ['$usdtAmount', 0] } },
            krwAmount: { $sum: { $ifNull: ['$krwAmount', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
    collection
      .aggregate([
        ...basePipeline,
        { $match: { eventAt: { $gte: monthlyStart, $lte: now } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$eventAt', timezone: 'UTC' } },
            count: { $sum: 1 },
            usdtAmount: { $sum: { $ifNull: ['$usdtAmount', 0] } },
            krwAmount: { $sum: { $ifNull: ['$krwAmount', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
  ]);

  const buildHourlyBucket = (date: Date) =>
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:00`;
  const buildDailyBucket = (date: Date) =>
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  const buildMonthlyBucket = (date: Date) =>
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;

  const hourlySeed = Array.from({ length: normalizedHourlyHours }, (_, index) => {
    const date = new Date(now.getTime() - (normalizedHourlyHours - 1 - index) * 60 * 60 * 1000);
    return {
      bucket: buildHourlyBucket(date),
      label: `${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}시`,
    };
  });
  const dailySeed = Array.from({ length: normalizedDailyDays }, (_, index) => {
    const date = new Date(now.getTime() - (normalizedDailyDays - 1 - index) * 24 * 60 * 60 * 1000);
    return {
      bucket: buildDailyBucket(date),
      label: `${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`,
    };
  });
  const monthlySeed = Array.from({ length: normalizedMonthlyMonths }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (normalizedMonthlyMonths - 1 - index), 1));
    return {
      bucket: buildMonthlyBucket(date),
      label: `${String(date.getUTCFullYear()).slice(-2)}.${pad2(date.getUTCMonth() + 1)}`,
    };
  });

  const toSeriesMap = (rows: any[]) =>
    new Map(
      rows.map((row: any) => [
        String(row?._id || ''),
        {
          count: Number(row?.count || 0),
          usdtAmount: Number(row?.usdtAmount || 0),
          krwAmount: Number(row?.krwAmount || 0),
        },
      ]),
    );

  const hourlyMap = toSeriesMap(hourlyRows);
  const dailyMap = toSeriesMap(dailyRows);
  const monthlyMap = toSeriesMap(monthlyRows);

  const hydrateSeries = (
    seed: Array<{ bucket: string; label: string }>,
    sourceMap: Map<string, { count: number; usdtAmount: number; krwAmount: number }>,
  ) =>
    seed.map((item) => {
      const source = sourceMap.get(item.bucket);
      return {
        bucket: item.bucket,
        label: item.label,
        count: Number(source?.count || 0),
        usdtAmount: Number(source?.usdtAmount || 0),
        krwAmount: Number(source?.krwAmount || 0),
      };
    });

  return {
    generatedAt: now.toISOString(),
    totals: {
      count: Number(totalRows?.[0]?.count || 0),
      usdtAmount: Number(totalRows?.[0]?.usdtAmount || 0),
      krwAmount: Number(totalRows?.[0]?.krwAmount || 0),
    },
    hourly: {
      hours: normalizedHourlyHours,
      points: hydrateSeries(hourlySeed, hourlyMap),
    },
    daily: {
      days: normalizedDailyDays,
      points: hydrateSeries(dailySeed, dailyMap),
    },
    monthly: {
      months: normalizedMonthlyMonths,
      points: hydrateSeries(monthlySeed, monthlyMap),
    },
  };
}

export async function getWalletUsdtPendingOrderProcessingSummaryByAgentcode({
  agentcode,
  limit = 5,
}: {
  agentcode: string;
  limit?: number;
}): Promise<{
  pendingCount: number;
  oldestPendingAt: string;
  recentPayments: Array<{
    id: string;
    tradeId: string;
    storecode: string;
    storeName: string;
    storeLogo: string;
    memberNickname: string;
    usdtAmount: number;
    krwAmount: number;
    createdAt: string;
    confirmedAt: string;
    orderProcessing: string;
    orderProcessingUpdatedAt: string;
  }>;
}> {
  const normalizedAgentcode = String(agentcode || '').trim();
  if (!normalizedAgentcode) {
    return {
      pendingCount: 0,
      oldestPendingAt: '',
      recentPayments: [],
    };
  }

  const normalizedLimit = Math.min(Math.max(Number(limit || 5), 1), 20);

  const client = await clientPromise;
  const collection = client.db(dbName).collection('walletUsdtPayments');

  const baseMatch: any = {
    agentcode: {
      $regex: `^${escapeRegex(normalizedAgentcode)}$`,
      $options: 'i',
    },
    status: 'confirmed',
  };

  const pendingPipeline: any[] = [
    { $match: baseMatch },
    {
      $addFields: {
        normalizedOrderProcessing: {
          $toUpper: { $ifNull: ['$order_processing', 'PROCESSING'] },
        },
      },
    },
    {
      $match: {
        normalizedOrderProcessing: { $ne: 'COMPLETED' },
      },
    },
  ];

  const [countRows, oldestRows, recentRows] = await Promise.all([
    collection
      .aggregate([
        ...pendingPipeline,
        { $count: 'pendingCount' },
      ])
      .toArray(),
    collection
      .aggregate([
        ...pendingPipeline,
        { $sort: { confirmedAt: 1, createdAt: 1 } },
        { $limit: 1 },
        {
          $project: {
            _id: 0,
            oldestPendingAt: { $ifNull: ['$confirmedAt', '$createdAt'] },
          },
        },
      ])
      .toArray(),
    collection
      .aggregate([
        ...pendingPipeline,
        {
          $lookup: {
            from: 'stores',
            localField: 'storecode',
            foreignField: 'storecode',
            as: 'storeDocs',
          },
        },
        {
          $addFields: {
            store: {
              $let: {
                vars: { storeDoc: { $arrayElemAt: ['$storeDocs', 0] } },
                in: {
                  storecode: { $ifNull: ['$$storeDoc.storecode', '$storecode'] },
                  storeName: { $ifNull: ['$$storeDoc.storeName', '$storeName'] },
                  storeLogo: { $ifNull: ['$$storeDoc.storeLogo', ''] },
                },
              },
            },
          },
        },
        { $sort: { confirmedAt: -1, createdAt: -1 } },
        { $limit: normalizedLimit },
        {
          $project: {
            _id: 1,
            transactionHash: 1,
            storecode: 1,
            store: 1,
            memberNickname: { $ifNull: ['$member.nickname', ''] },
            usdtAmount: { $ifNull: ['$usdtAmount', 0] },
            krwAmount: { $ifNull: ['$krwAmount', 0] },
            createdAt: 1,
            confirmedAt: 1,
            orderProcessing: '$normalizedOrderProcessing',
            orderProcessingUpdatedAt: { $ifNull: ['$order_processing_updated_at', ''] },
          },
        },
      ])
      .toArray(),
  ]);

  return {
    pendingCount: Number(countRows?.[0]?.pendingCount || 0),
    oldestPendingAt: String(oldestRows?.[0]?.oldestPendingAt || ''),
    recentPayments: recentRows.map((payment: any) => ({
      id: String(payment?._id || ''),
      tradeId: String(payment?.transactionHash || payment?._id || ''),
      storecode: String(payment?.storecode || payment?.store?.storecode || ''),
      storeName: String(payment?.store?.storeName || payment?.storecode || ''),
      storeLogo: String(payment?.store?.storeLogo || ''),
      memberNickname: String(payment?.memberNickname || ''),
      usdtAmount: Number(payment?.usdtAmount || 0),
      krwAmount: Number(payment?.krwAmount || 0),
      createdAt: String(payment?.createdAt || ''),
      confirmedAt: String(payment?.confirmedAt || ''),
      orderProcessing: String(payment?.orderProcessing || 'PROCESSING'),
      orderProcessingUpdatedAt: String(payment?.orderProcessingUpdatedAt || ''),
    })),
  };
}
