import { NextResponse, type NextRequest } from 'next/server';
import { createThirdwebClient, Engine } from 'thirdweb';
import { ObjectId } from 'mongodb';

import clientPromise, { dbName } from '@/lib/mongodb';
import {
  AGENT_PLATFORM_FEE_TYPE,
  AGENT_PLATFORM_FEE_VERSION,
  buildAgentPlatformFeeReceivableFromOrder,
  ensureAgentPlatformFeeCollections,
  escapeRegex,
  isLowBalanceError,
  roundDownUsdtAmount,
  toCollectStatus,
  toErrorMessage,
} from '@/lib/agentPlatformFeeCollection';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;
const BACKFILL_LIMIT = 2000;
const SYNC_PENDING_LIMIT = 120;
const COMPLETED_ORDER_STATUS_REGEX = /^(completed|paymentconfirmed)$/i;

const toRegexFilter = (value: unknown) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return { $regex: escapeRegex(normalized), $options: 'i' };
};

const toIsoDateBoundary = (value: unknown, isStart: boolean) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const time = isStart ? 'T00:00:00+09:00' : 'T23:59:59+09:00';
  const parsed = new Date(`${normalized}${time}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const normalizeCount = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
};

const normalizeAmount = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return roundDownUsdtAmount(parsed);
};

const toText = (value: unknown) => String(value || '').trim();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const pageRaw = Number(body?.page || 1);
    const limitRaw = Number(body?.limit || DEFAULT_LIMIT);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(MAX_LIMIT, Math.floor(limitRaw))
      : DEFAULT_LIMIT;

    const selectedDate = String(body?.date || '').trim();
    const fromDateIso = selectedDate ? toIsoDateBoundary(selectedDate, true) : null;
    const toDateIso = selectedDate ? toIsoDateBoundary(selectedDate, false) : null;
    const hasDateFilter = Boolean(selectedDate && fromDateIso && toDateIso);

    const tradeIdRegex = toRegexFilter(body?.searchTradeId);
    const sellerRegex = toRegexFilter(body?.searchSeller);
    const agentRegex = toRegexFilter(body?.searchAgent);
    const onlyUncollected = body?.onlyUncollected === true;

    const client = await clientPromise;
    const db = client.db(dbName);
    const buyordersCollection = db.collection('buyorders');
    const { receivablesCollection } = await ensureAgentPlatformFeeCollections(db);

    // Backfill legacy orders into receivables for stable list/read model.
    const backfillQuery: Record<string, unknown> = {
      storecode: { $regex: '^admin$', $options: 'i' },
      status: { $regex: '^(completed|paymentconfirmed)$', $options: 'i' },
    };
    if (hasDateFilter) {
      backfillQuery.createdAt = { $gte: fromDateIso!, $lte: toDateIso! };
    }

    const backfillOrders = await buyordersCollection
      .find(
        backfillQuery,
        {
          projection: {
            _id: 1,
            tradeId: 1,
            status: 1,
            usdtAmount: 1,
            chain: 1,
            clientId: 1,
            storecode: 1,
            createdAt: 1,
            nickname: 1,
            walletAddress: 1,
            buyer: 1,
            seller: 1,
            agent: 1,
            agentcode: 1,
            agentName: 1,
            agentLogo: 1,
            agentPlatformFee: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .limit(BACKFILL_LIMIT)
      .toArray();

    if (backfillOrders.length > 0) {
      const nowIso = new Date().toISOString();
      const upserts = backfillOrders
        .map((order) =>
          buildAgentPlatformFeeReceivableFromOrder({
            order: order as Record<string, unknown>,
            orderId: String(order._id || ''),
            nowIso,
          }),
        )
        .filter((item) => item.doc !== null)
        .map((item) => {
          const doc = item.doc!;
          const { createdAt, ...receivableSetDoc } = doc;
          return {
            updateOne: {
              filter: {
                orderId: doc.orderId,
                feeType: AGENT_PLATFORM_FEE_TYPE,
                feeVersion: AGENT_PLATFORM_FEE_VERSION,
              },
              update: {
                $set: {
                  ...receivableSetDoc,
                  updatedAt: nowIso,
                },
                $setOnInsert: {
                  createdAt: createdAt || nowIso,
                },
              },
              upsert: true,
            },
          };
        });

      if (upserts.length > 0) {
        await receivablesCollection.bulkWrite(upserts, { ordered: false });
      }
    }

    // Sync pending receivable states (REQUESTING/QUEUED/SUBMITTED) with thirdweb queue status.
    const thirdwebSecretKey = String(process.env.THIRDWEB_SECRET_KEY || '').trim();
    if (thirdwebSecretKey) {
      const pendingReceivables = await receivablesCollection
        .find(
          {
            feeType: AGENT_PLATFORM_FEE_TYPE,
            feeVersion: AGENT_PLATFORM_FEE_VERSION,
            storecode: { $regex: '^admin$', $options: 'i' },
            status: { $in: ['REQUESTING', 'QUEUED', 'SUBMITTED'] },
            transactionId: { $exists: true, $ne: '' },
          },
          {
            projection: {
              orderId: 1,
              status: 1,
              transactionId: 1,
              transactionHash: 1,
              onchainStatus: 1,
              error: 1,
            },
          },
        )
        .sort({ updatedAt: 1 })
        .limit(SYNC_PENDING_LIMIT)
        .toArray();

      if (pendingReceivables.length > 0) {
        const thirdwebClient = createThirdwebClient({ secretKey: thirdwebSecretKey });
        const syncNow = new Date().toISOString();
        const receivableStatusUpdates: Array<Record<string, unknown>> = [];
        const orderStatusUpdates: Array<Record<string, unknown>> = [];

        for (const pending of pendingReceivables as Array<Record<string, unknown>>) {
          const transactionId = toText(pending.transactionId);
          if (!transactionId) continue;

          try {
            const executionResult = await Engine.getTransactionStatus({
              client: thirdwebClient,
              transactionId,
            });

            let nextStatus = toCollectStatus(executionResult?.status);
            if (nextStatus === 'PENDING') nextStatus = 'QUEUED';
            if (nextStatus === 'FAILED' && isLowBalanceError((executionResult as any)?.error)) {
              nextStatus = 'BLOCKED_LOW_BALANCE';
            }

            const nextTransactionHash = toText(
              (executionResult as any)?.transactionHash || pending.transactionHash,
            );
            const nextOnchainStatus = toText((executionResult as any)?.onchainStatus);
            const nextError = toErrorMessage((executionResult as any)?.error);

            const currentStatus = toText(pending.status);
            const currentTransactionHash = toText(pending.transactionHash);
            const currentOnchainStatus = toText(pending.onchainStatus);
            const currentError = toText(pending.error);

            if (
              currentStatus === nextStatus
              && currentTransactionHash === nextTransactionHash
              && currentOnchainStatus === nextOnchainStatus
              && currentError === nextError
            ) {
              continue;
            }

            const orderId = toText(pending.orderId);
            receivableStatusUpdates.push({
              updateOne: {
                filter: {
                  orderId,
                  feeType: AGENT_PLATFORM_FEE_TYPE,
                  feeVersion: AGENT_PLATFORM_FEE_VERSION,
                },
                update: {
                  $set: {
                    status: nextStatus,
                    transactionHash: nextTransactionHash,
                    onchainStatus: nextOnchainStatus,
                    error: nextError,
                    updatedAt: syncNow,
                    ...(nextStatus === 'CONFIRMED' ? { collectedAt: syncNow } : {}),
                  },
                },
              },
            });

            if (orderId) {
              orderStatusUpdates.push({
                updateOne: {
                  filter: {
                    _id: orderId,
                  },
                  update: {
                    $set: {
                      'agentPlatformFee.collectionStatus': nextStatus,
                      'agentPlatformFee.transactionHash': nextTransactionHash,
                      'agentPlatformFee.onchainStatus': nextOnchainStatus,
                      'agentPlatformFee.collectionError': nextError,
                      'agentPlatformFee.collectionUpdatedAt': syncNow,
                      ...(nextStatus === 'CONFIRMED' ? { 'agentPlatformFee.collectedAt': syncNow } : {}),
                    },
                  },
                },
              });
            }
          } catch {
            // Ignore transient status fetch failures.
          }
        }

        if (receivableStatusUpdates.length > 0) {
          await receivablesCollection.bulkWrite(receivableStatusUpdates as any, { ordered: false });
        }
        if (orderStatusUpdates.length > 0) {
          const normalizedOrderUpdates = (orderStatusUpdates as any[]).map((op) => {
            const rawOrderId = String(op?.updateOne?.filter?._id || '').trim();
            if (!rawOrderId) return null;
            if (!ObjectId.isValid(rawOrderId)) return null;
            return {
              updateOne: {
                ...op.updateOne,
                filter: {
                  _id: new ObjectId(rawOrderId),
                },
              },
            };
          }).filter(Boolean);
          if (normalizedOrderUpdates.length > 0) {
            await buyordersCollection.bulkWrite(normalizedOrderUpdates as any, { ordered: false });
          }
        }
      }
    }

    const baseQuery: Record<string, unknown> = {
      feeType: AGENT_PLATFORM_FEE_TYPE,
      feeVersion: AGENT_PLATFORM_FEE_VERSION,
      storecode: { $regex: '^admin$', $options: 'i' },
      orderStatus: { $regex: COMPLETED_ORDER_STATUS_REGEX },
    };
    if (hasDateFilter) {
      baseQuery.createdAt = { $gte: fromDateIso!, $lte: toDateIso! };
    }

    const andFilters: Record<string, unknown>[] = [];
    if (tradeIdRegex) {
      andFilters.push({ tradeId: tradeIdRegex });
    }
    if (sellerRegex) {
      andFilters.push({
        $or: [
          { 'seller.nickname': sellerRegex },
          { 'seller.walletAddress': sellerRegex },
          { 'seller.escrowWalletAddress': sellerRegex },
        ],
      });
    }
    if (agentRegex) {
      andFilters.push({
        $or: [
          { 'agent.name': agentRegex },
          { 'agent.agentcode': agentRegex },
          { fromAddress: agentRegex },
          { toAddress: agentRegex },
        ],
      });
    }
    if (onlyUncollected) {
      andFilters.push({
        $or: [
          { transactionHash: '' },
          { transactionHash: { $exists: false } },
        ],
      });
    }

    const query = andFilters.length > 0
      ? { ...baseQuery, $and: andFilters }
      : baseQuery;

    const [itemsRaw, totalCount, summaryRaw] = await Promise.all([
      receivablesCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      receivablesCollection.countDocuments(query),
      receivablesCollection
        .aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              totalExpectedFeeAmount: { $sum: '$expectedFeeAmountUsdt' },
              totalUncollectedExpectedFeeAmount: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ['$transactionHash', ''] },
                        { $not: ['$transactionHash'] },
                      ],
                    },
                    '$expectedFeeAmountUsdt',
                    0,
                  ],
                },
              },
              uncollectedCount: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ['$transactionHash', ''] },
                        { $not: ['$transactionHash'] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              collectedCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$transactionHash', ''] },
                        { $ifNull: ['$transactionHash', false] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
        .toArray(),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const normalizedPage = Math.min(page, totalPages);
    const summarySource = summaryRaw[0] || {};

    const items = itemsRaw.map((item: any) => {
      const transactionHash = toText(item?.transactionHash);

      return {
        _id: toText(item?.orderId),
        tradeId: toText(item?.tradeId),
        createdAt: toText(item?.createdAt),
        status: toText(item?.orderStatus),
        usdtAmount: Number(item?.usdtAmount || 0),
        krwAmount: Number(item?.krwAmount || 0),
        buyerNickname: toText(item?.buyer?.nickname),
        sellerNickname: toText(item?.seller?.nickname),
        sellerWalletAddress: toText(item?.seller?.walletAddress),
        sellerEscrowWalletAddress: toText(item?.seller?.escrowWalletAddress),
        agentcode: toText(item?.agent?.agentcode),
        agentName: toText(item?.agent?.name),
        agentLogo: toText(item?.agent?.logo),
        agentPlatformFeePercentage: Number(item?.feePercent || 0),
        agentPlatformFeeFromAddress: toText(item?.fromAddress),
        agentPlatformFeeToAddress: toText(item?.toAddress),
        agentPlatformFeeTransactionHash: transactionHash,
        agentPlatformFeeTransactionId: toText(item?.transactionId),
        expectedAgentFeeAmount: normalizeAmount(item?.expectedFeeAmountUsdt),
        collectionStatus: toText(item?.status),
        collectionError: toText(item?.error),
        isUncollected: !transactionHash,
      };
    });

    return NextResponse.json({
      result: {
        items,
        pagination: {
          page: normalizedPage,
          limit,
          totalCount,
          totalPages,
        },
        summary: {
          totalExpectedFeeAmount: normalizeAmount(summarySource?.totalExpectedFeeAmount),
          totalUncollectedExpectedFeeAmount: normalizeAmount(summarySource?.totalUncollectedExpectedFeeAmount),
          uncollectedCount: normalizeCount(summarySource?.uncollectedCount),
          collectedCount: normalizeCount(summarySource?.collectedCount),
        },
        filters: {
          date: selectedDate,
          status: 'completed|paymentConfirmed',
          onlyUncollected,
        },
      },
    });
  } catch (error) {
    console.error('getAgentPlatformFeeCollectionList error', error);
    return NextResponse.json(
      { error: '플랫폼 수수료 수납 목록을 불러오지 못했습니다.' },
      { status: 500 },
    );
  }
}
