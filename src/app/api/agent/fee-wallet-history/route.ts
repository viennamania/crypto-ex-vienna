import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId, type Collection } from 'mongodb';
import { createThirdwebClient, Engine } from 'thirdweb';

import clientPromise, { dbName } from '@/lib/mongodb';

type FeeWalletHistoryActionType = 'CHARGE' | 'RECOVER';
type FeeWalletHistoryStatus = 'REQUESTING' | 'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
type ChainKey = 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';

type AgentDoc = {
  _id?: ObjectId;
  agentcode?: string;
  agentName?: string;
  adminWalletAddress?: string;
};

type AgentFeeWalletHistoryDoc = {
  _id?: ObjectId;
  agentcode: string;
  agentName: string;
  chain: ChainKey;
  actionType: FeeWalletHistoryActionType;
  status: FeeWalletHistoryStatus;
  fromWalletAddress: string;
  toWalletAddress: string;
  requestedByWalletAddress: string;
  amount: number;
  transactionHash?: string;
  transactionId?: string;
  onchainStatus?: string;
  error?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
};

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const isTransactionHash = (value: string) => /^0x[a-fA-F0-9]{64}$/.test(String(value || '').trim());
const normalizeAddress = (value: unknown) => String(value || '').trim().toLowerCase();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeErrorText = (value: unknown): string => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (value instanceof Error) {
    return String(value.message || '').trim();
  }

  if (typeof value === 'object') {
    const valueRecord = value as Record<string, unknown>;
    const message = typeof valueRecord.message === 'string' ? valueRecord.message.trim() : '';
    if (message) {
      return message;
    }

    const error = typeof valueRecord.error === 'string' ? valueRecord.error.trim() : '';
    if (error) {
      return error;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value).trim();
};

const toErrorMessage = (error: unknown) => {
  const normalized = normalizeErrorText(error);
  return normalized || 'failed to refresh status';
};

const syncRecoverHistoryStatus = async ({
  historyCollection,
  thirdwebClient,
  history,
}: {
  historyCollection: Collection<AgentFeeWalletHistoryDoc>;
  thirdwebClient: ReturnType<typeof createThirdwebClient>;
  history: AgentFeeWalletHistoryDoc;
}) => {
  const historyId = history._id;
  const targetTransactionId = String(history.transactionId || '').trim();
  if (!historyId || !targetTransactionId) {
    return history;
  }

  const now = new Date().toISOString();

  try {
    const executionResult = await Engine.getTransactionStatus({
      client: thirdwebClient,
      transactionId: targetTransactionId,
    });

    const status = normalizeStatus(executionResult?.status || history.status || 'QUEUED');
    const onchainStatus =
      executionResult && typeof executionResult === 'object' && 'onchainStatus' in executionResult
        ? String(executionResult.onchainStatus || '')
        : '';
    const transactionHash =
      executionResult && typeof executionResult === 'object' && 'transactionHash' in executionResult
        ? String(executionResult.transactionHash || '').trim()
        : '';
    const error =
      executionResult && typeof executionResult === 'object' && 'error' in executionResult
        ? normalizeErrorText(executionResult.error)
        : '';

    await historyCollection.updateOne(
      { _id: historyId },
      {
        $set: {
          status,
          onchainStatus,
          transactionHash: transactionHash || history.transactionHash || '',
          error,
          updatedAt: now,
          ...(status === 'CONFIRMED' ? { confirmedAt: now } : {}),
        },
      },
    );
  } catch (syncError) {
    const message = toErrorMessage(syncError);
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('not found') || lowerMessage.includes('404')) {
      await historyCollection.updateOne(
        { _id: historyId },
        {
          $set: {
            status: 'QUEUED',
            error: '',
            updatedAt: now,
          },
        },
      );
    } else {
      await historyCollection.updateOne(
        { _id: historyId },
        {
          $set: {
            error: message,
            updatedAt: now,
          },
        },
      );
    }
  }

  const updated = await historyCollection.findOne({ _id: historyId });
  return updated || history;
};

const normalizePeriodDays = (value: unknown): 1 | 7 | 30 => {
  const numeric = Number(value);
  if (numeric === 1 || numeric === 7 || numeric === 30) {
    return numeric;
  }
  return 7;
};

const resolvePeriodStartIso = (periodDays: 1 | 7 | 30) => {
  const nowMs = Date.now();

  // "오늘"은 KST(UTC+9) 00:00 기준부터 조회
  if (periodDays === 1) {
    const kstOffsetMs = 9 * 60 * 60 * 1000;
    const shifted = new Date(nowMs + kstOffsetMs);
    shifted.setUTCHours(0, 0, 0, 0);
    return new Date(shifted.getTime() - kstOffsetMs).toISOString();
  }

  return new Date(nowMs - periodDays * DAY_MS).toISOString();
};

const normalizeChain = (value: unknown): ChainKey => {
  const chain = String(value || '').trim().toLowerCase();
  if (chain === 'ethereum' || chain === 'polygon' || chain === 'arbitrum' || chain === 'bsc') {
    return chain;
  }
  return 'polygon';
};

const normalizeStatus = (value: unknown): FeeWalletHistoryStatus => {
  const normalized = String(value || '').trim().toUpperCase();

  if (
    normalized === 'REQUESTING'
    || normalized === 'QUEUED'
    || normalized === 'SUBMITTED'
    || normalized === 'CONFIRMED'
    || normalized === 'FAILED'
  ) {
    return normalized;
  }

  if (
    normalized.includes('CONFIRM')
    || normalized.includes('MINED')
    || normalized.includes('COMPLETED')
    || normalized.includes('SUCCESS')
  ) {
    return 'CONFIRMED';
  }
  if (
    normalized.includes('FAIL')
    || normalized.includes('ERROR')
    || normalized.includes('REVERT')
    || normalized.includes('CANCEL')
  ) {
    return 'FAILED';
  }
  if (
    normalized.includes('SUBMIT')
    || normalized.includes('SENT')
    || normalized.includes('BROADCAST')
  ) {
    return 'SUBMITTED';
  }
  if (normalized.includes('REQUEST')) {
    return 'REQUESTING';
  }

  return 'QUEUED';
};

const isFinalStatus = (status: FeeWalletHistoryStatus) => status === 'CONFIRMED' || status === 'FAILED';

const serializeHistory = (item: AgentFeeWalletHistoryDoc) => ({
  id: String(item._id || ''),
  agentcode: item.agentcode || '',
  agentName: item.agentName || '',
  chain: item.chain || 'polygon',
  actionType: item.actionType || 'RECOVER',
  status: item.status || 'QUEUED',
  fromWalletAddress: item.fromWalletAddress || '',
  toWalletAddress: item.toWalletAddress || '',
  requestedByWalletAddress: item.requestedByWalletAddress || '',
  amount: Number(item.amount || 0),
  transactionHash: String(item.transactionHash || ''),
  transactionId: String(item.transactionId || ''),
  onchainStatus: String(item.onchainStatus || ''),
  error: normalizeErrorText(item.error),
  source: String(item.source || ''),
  createdAt: String(item.createdAt || ''),
  updatedAt: String(item.updatedAt || ''),
  confirmedAt: String(item.confirmedAt || ''),
});

const findAgentByCode = async (agentcode: string): Promise<AgentDoc | null> => {
  const mongodbClient = await clientPromise;
  const agentsCollection = mongodbClient.db(dbName).collection<AgentDoc>('agents');
  return agentsCollection.findOne({
    agentcode: {
      $regex: `^${escapeRegex(agentcode)}$`,
      $options: 'i',
    },
  });
};

const validateAgentAdmin = async (agentcode: string, requesterWalletAddress: string) => {
  const normalizedAgentcode = String(agentcode || '').trim();
  if (!normalizedAgentcode) {
    return NextResponse.json({ error: 'agentcode is required' }, { status: 400 });
  }

  const normalizedRequester = normalizeAddress(requesterWalletAddress);
  if (!isWalletAddress(normalizedRequester)) {
    return NextResponse.json({ error: 'requesterWalletAddress is invalid' }, { status: 400 });
  }

  const agent = await findAgentByCode(normalizedAgentcode);
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const adminWalletAddress = normalizeAddress(agent.adminWalletAddress);
  if (!isWalletAddress(adminWalletAddress)) {
    return NextResponse.json({ error: 'Agent admin wallet address is not configured' }, { status: 400 });
  }

  if (adminWalletAddress !== normalizedRequester) {
    return NextResponse.json({ error: 'Only agent admin wallet can access fee wallet history' }, { status: 403 });
  }

  return {
    agent,
    requesterWalletAddress: normalizedRequester,
  };
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').trim().toLowerCase();
  const agentcode = String(body?.agentcode || '').trim();
  const requesterWalletAddress = String(body?.requesterWalletAddress || '').trim();

  const validation = await validateAgentAdmin(agentcode, requesterWalletAddress);
  if (validation instanceof NextResponse) {
    return validation;
  }

  const mongodbClient = await clientPromise;
  const historyCollection = mongodbClient.db(dbName).collection<AgentFeeWalletHistoryDoc>('agentFeeWalletHistories');

  if (action === 'list') {
    const limit = Math.min(Math.max(Number(body?.limit || 30), 1), 200);
    const page = Math.max(Number(body?.page || 1), 1);
    const skip = (page - 1) * limit;
    const periodDays = normalizePeriodDays(body?.periodDays);
    const refreshPending = body?.refreshPending === true || body?.refreshPending === 'true';
    const periodStartIso = resolvePeriodStartIso(periodDays);
    const historyQuery = {
      agentcode: {
        $regex: `^${escapeRegex(agentcode)}$`,
        $options: 'i',
      },
      createdAt: {
        $gte: periodStartIso,
      },
    };

    const [queriedHistory, totalCount] = await Promise.all([
      historyCollection
        .find(historyQuery)
        .sort({ createdAt: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      historyCollection.countDocuments(historyQuery),
    ]);

    let history = queriedHistory;
    if (refreshPending) {
      const pendingHistories = history
        .filter((item) =>
          item.actionType === 'RECOVER'
          && Boolean(String(item.transactionId || '').trim())
          && !isFinalStatus(normalizeStatus(item.status)),
        )
        .slice(0, 20);

      const secretKey = process.env.THIRDWEB_SECRET_KEY || '';
      if (pendingHistories.length > 0 && secretKey) {
        const thirdwebClient = createThirdwebClient({ secretKey });
        await Promise.all(
          pendingHistories.map((historyItem) =>
            syncRecoverHistoryStatus({
              historyCollection,
              thirdwebClient,
              history: historyItem,
            }),
          ),
        );

        history = await historyCollection
          .find(historyQuery)
          .sort({ createdAt: -1, updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();
      }
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return NextResponse.json({
      result: {
        items: history.map((item) => serializeHistory(item)),
        totalCount,
        page,
        limit,
        totalPages,
        periodDays,
        periodStartIso,
      },
    });
  }

  if (action === 'record-charge') {
    const fromWalletAddress = normalizeAddress(body?.fromWalletAddress);
    const toWalletAddress = normalizeAddress(body?.toWalletAddress);
    const amount = Number(body?.amount || 0);
    const transactionHash = String(body?.transactionHash || '').trim().toLowerCase();
    const chain = normalizeChain(body?.chain);
    const status = normalizeStatus(body?.status || 'CONFIRMED');
    const error = normalizeErrorText(body?.error);

    if (!isWalletAddress(fromWalletAddress)) {
      return NextResponse.json({ error: 'fromWalletAddress is invalid' }, { status: 400 });
    }
    if (!isWalletAddress(toWalletAddress)) {
      return NextResponse.json({ error: 'toWalletAddress is invalid' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be greater than zero' }, { status: 400 });
    }
    if (!isTransactionHash(transactionHash)) {
      return NextResponse.json({ error: 'transactionHash is invalid' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const filter = {
      actionType: 'CHARGE' as FeeWalletHistoryActionType,
      transactionHash,
    };

    await historyCollection.updateOne(
      filter,
      {
        $set: {
          agentcode: String(validation.agent.agentcode || agentcode),
          agentName: String(validation.agent.agentName || ''),
          chain,
          actionType: 'CHARGE',
          status,
          fromWalletAddress,
          toWalletAddress,
          requestedByWalletAddress: validation.requesterWalletAddress,
          amount,
          transactionHash,
          transactionId: '',
          onchainStatus: '',
          error,
          source: 'p2p-agent-fee-wallet',
          updatedAt: now,
          ...(isFinalStatus(status) ? { confirmedAt: now } : {}),
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true },
    );

    const saved = await historyCollection.findOne(filter);

    return NextResponse.json({
      result: {
        item: saved ? serializeHistory(saved) : null,
      },
    });
  }

  if (action === 'refresh-status') {
    const historyId = String(body?.historyId || '').trim();
    const transactionId = String(body?.transactionId || '').trim();
    if (!historyId && !transactionId) {
      return NextResponse.json({ error: 'historyId or transactionId is required' }, { status: 400 });
    }

    const agentFilter = {
      agentcode: {
        $regex: `^${escapeRegex(agentcode)}$`,
        $options: 'i',
      },
      actionType: 'RECOVER' as FeeWalletHistoryActionType,
    };

    let existing: AgentFeeWalletHistoryDoc | null = null;
    if (historyId && ObjectId.isValid(historyId)) {
      existing = await historyCollection.findOne({
        ...agentFilter,
        _id: new ObjectId(historyId),
      });
    }

    if (!existing && transactionId) {
      existing = await historyCollection.findOne({
        ...agentFilter,
        transactionId: {
          $regex: `^${escapeRegex(transactionId)}$`,
          $options: 'i',
        },
      });
    }

    if (!existing) {
      return NextResponse.json({
        result: {
          item: null,
          refreshSkipped: true,
          reason: 'Recover history not found',
        },
      });
    }

    const secretKey = process.env.THIRDWEB_SECRET_KEY || '';
    if (!secretKey) {
      return NextResponse.json({ error: 'THIRDWEB_SECRET_KEY is not configured' }, { status: 500 });
    }

    const targetTransactionId = String(existing.transactionId || transactionId || '').trim();
    if (!targetTransactionId) {
      return NextResponse.json({ error: 'transactionId is missing on this history record' }, { status: 400 });
    }

    const thirdwebClient = createThirdwebClient({ secretKey });
    const updated = await syncRecoverHistoryStatus({
      historyCollection,
      thirdwebClient,
      history: existing,
    });

    return NextResponse.json({
      result: {
        item: updated ? serializeHistory(updated) : null,
      },
    });
  }

  return NextResponse.json({ error: 'unsupported action' }, { status: 400 });
}
