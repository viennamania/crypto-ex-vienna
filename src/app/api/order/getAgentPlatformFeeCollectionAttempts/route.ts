import { NextResponse, type NextRequest } from 'next/server';

import clientPromise, { dbName } from '@/lib/mongodb';
import {
  AGENT_PLATFORM_FEE_TYPE,
  AGENT_PLATFORM_FEE_VERSION,
  ensureAgentPlatformFeeCollections,
  escapeRegex,
  isWalletAddress,
  roundDownUsdtAmount,
  type AgentPlatformFeeCollectionAttemptDoc,
  type AgentPlatformFeeReceivableStatus,
} from '@/lib/agentPlatformFeeCollection';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;
const DEFAULT_PERIOD_DAYS = 7;
const ALLOWED_PERIOD_DAYS = new Set([1, 7, 30]);
const ALLOWED_STATUS = new Set<AgentPlatformFeeReceivableStatus>([
  'PENDING',
  'REQUESTING',
  'QUEUED',
  'SUBMITTED',
  'CONFIRMED',
  'FAILED',
  'BLOCKED_LOW_BALANCE',
]);
const REQUEST_SOURCE = 'administration-platform-fee-collection';

const toText = (value: unknown) => String(value || '').trim();
const toStatusText = (value: unknown) => toText(value).toUpperCase();

const getKstDayStartIso = (date: Date) => {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return new Date(`${ymd}T00:00:00+09:00`).toISOString();
};

const resolveDateRange = (periodDays: number) => {
  const now = new Date();
  const normalizedPeriodDays = ALLOWED_PERIOD_DAYS.has(periodDays) ? periodDays : DEFAULT_PERIOD_DAYS;
  if (normalizedPeriodDays === 1) {
    return {
      fromDateIso: getKstDayStartIso(now),
      toDateIso: now.toISOString(),
      periodDays: normalizedPeriodDays,
    };
  }

  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - (normalizedPeriodDays - 1));
  return {
    fromDateIso: getKstDayStartIso(fromDate),
    toDateIso: now.toISOString(),
    periodDays: normalizedPeriodDays,
  };
};

const normalizePage = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
};

const normalizeLimit = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(parsed));
};

const normalizeAmount = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return roundDownUsdtAmount(parsed);
};

const normalizeCount = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const requesterWalletAddress = toText(body?.requesterWalletAddress);
    if (!isWalletAddress(requesterWalletAddress)) {
      return NextResponse.json({ error: 'requesterWalletAddress is invalid.' }, { status: 400 });
    }

    const page = normalizePage(body?.page);
    const limit = normalizeLimit(body?.limit);
    const periodDays = Number(body?.periodDays || DEFAULT_PERIOD_DAYS);
    const { fromDateIso, toDateIso, periodDays: normalizedPeriodDays } = resolveDateRange(periodDays);

    const requestedStatus = toStatusText(body?.status);
    const normalizedStatus = requestedStatus === 'ALL' ? 'ALL' : (
      ALLOWED_STATUS.has(requestedStatus as AgentPlatformFeeReceivableStatus) ? requestedStatus : 'ALL'
    );
    const batchKeyKeyword = toText(body?.batchKey);
    const agentcodeKeyword = toText(body?.agentcode);

    const client = await clientPromise;
    const db = client.db(dbName);

    const usersCollection = db.collection('users');
    const adminUser = await usersCollection.findOne(
      {
        storecode: { $regex: '^admin$', $options: 'i' },
        walletAddress: { $regex: `^${escapeRegex(requesterWalletAddress)}$`, $options: 'i' },
      },
      { projection: { role: 1 } },
    );
    if (!adminUser || toText((adminUser as any)?.role).toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Only admin can access collection attempts.' }, { status: 403 });
    }

    const { attemptsCollection } = await ensureAgentPlatformFeeCollections(db);

    const query: Record<string, unknown> = {
      feeType: AGENT_PLATFORM_FEE_TYPE,
      feeVersion: AGENT_PLATFORM_FEE_VERSION,
      source: REQUEST_SOURCE,
      requestedAt: {
        $gte: fromDateIso,
        $lte: toDateIso,
      },
      ...(normalizedStatus !== 'ALL' ? { status: normalizedStatus } : {}),
      ...(batchKeyKeyword
        ? { batchKey: { $regex: escapeRegex(batchKeyKeyword), $options: 'i' } }
        : {}),
      ...(agentcodeKeyword
        ? { agentcode: { $regex: `^${escapeRegex(agentcodeKeyword)}$`, $options: 'i' } }
        : {}),
    };

    const [itemsRaw, totalCount, summaryRaw] = await Promise.all([
      attemptsCollection
        .find(query)
        .sort({ requestedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      attemptsCollection.countDocuments(query),
      attemptsCollection
        .aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              totalFeeAmountUsdt: { $sum: '$feeAmountUsdt' },
              confirmedCount: {
                $sum: { $cond: [{ $eq: ['$status', 'CONFIRMED'] }, 1, 0] },
              },
              failedCount: {
                $sum: {
                  $cond: [
                    { $in: ['$status', ['FAILED', 'BLOCKED_LOW_BALANCE']] },
                    1,
                    0,
                  ],
                },
              },
              pendingCount: {
                $sum: {
                  $cond: [
                    { $in: ['$status', ['REQUESTING', 'QUEUED', 'SUBMITTED']] },
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
    const summary = (summaryRaw[0] || {}) as Record<string, unknown>;

    const items = itemsRaw.map((item) => {
      const source = item as AgentPlatformFeeCollectionAttemptDoc & { _id?: unknown };
      return {
        id: toText((source as any)?._id),
        orderId: toText(source.orderId),
        agentcode: toText((source as any).agentcode),
        tradeId: toText(source.tradeId),
        status: toStatusText(source.status),
        previousStatus: toStatusText(source.previousStatus),
        chain: toText(source.chain),
        fromAddress: toText(source.fromAddress),
        toAddress: toText(source.toAddress),
        usdtAmount: normalizeAmount(source.usdtAmount),
        feePercent: Number(source.feePercent || 0),
        feeAmountUsdt: normalizeAmount(source.feeAmountUsdt),
        transactionId: toText(source.transactionId),
        transactionHash: toText(source.transactionHash),
        onchainStatus: toText(source.onchainStatus),
        error: toText(source.error),
        requestedByWalletAddress: toText(source.requestedByWalletAddress),
        requestIdempotencyKey: toText(source.requestIdempotencyKey),
        batchKey: toText(source.batchKey),
        mode: toText(source.mode),
        source: toText(source.source),
        requestedAt: toText(source.requestedAt),
        updatedAt: toText(source.updatedAt),
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
          totalFeeAmountUsdt: normalizeAmount(summary.totalFeeAmountUsdt),
          confirmedCount: normalizeCount(summary.confirmedCount),
          failedCount: normalizeCount(summary.failedCount),
          pendingCount: normalizeCount(summary.pendingCount),
        },
        filters: {
          periodDays: normalizedPeriodDays,
          status: normalizedStatus,
          batchKey: batchKeyKeyword,
          agentcode: agentcodeKeyword,
          fromDateIso,
          toDateIso,
        },
      },
    });
  } catch (error) {
    console.error('getAgentPlatformFeeCollectionAttempts error', error);
    return NextResponse.json(
      { error: '수납 이력을 불러오지 못했습니다.' },
      { status: 500 },
    );
  }
}
