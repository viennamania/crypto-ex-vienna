import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { createThirdwebClient, Engine, getContract } from 'thirdweb';
import { transfer } from 'thirdweb/extensions/erc20';
import { arbitrum, bsc, ethereum, polygon } from 'thirdweb/chains';

import {
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
} from '@/app/config/contractAddresses';
import clientPromise, { dbName } from '@/lib/mongodb';
import { createEngineServerWallet } from '@/lib/engineServerWallet';
import {
  AGENT_PLATFORM_FEE_TYPE,
  AGENT_PLATFORM_FEE_VERSION,
  buildAgentPlatformFeeAttemptIdempotencyKey,
  buildAgentPlatformFeeReceivableFromOrder,
  ensureAgentPlatformFeeCollections,
  escapeRegex,
  formatRawUsdtAmount,
  isLowBalanceError,
  isWalletAddress,
  normalizeWalletAddress,
  roundDownUsdtAmount,
  toCollectStatus,
  toErrorMessage,
  toRawUsdtAmountFromRoundedValue,
  type AgentPlatformFeeCollectionAttemptDoc,
  type AgentPlatformFeeReceivableStatus,
} from '@/lib/agentPlatformFeeCollection';

type CollectableOrder = {
  _id: ObjectId;
  tradeId?: string;
  status?: string;
  usdtAmount?: number | string;
  chain?: string;
  clientId?: string;
  storecode?: string;
  createdAt?: string;
  nickname?: string;
  walletAddress?: string;
  buyer?: {
    nickname?: string;
    walletAddress?: string;
  };
  seller?: {
    nickname?: string;
    walletAddress?: string;
    escrowWalletAddress?: string;
  };
  agent?: {
    agentcode?: string;
    agentName?: string;
    agentLogo?: string;
  };
  agentcode?: string;
  agentName?: string;
  agentLogo?: string;
  agentPlatformFee?: {
    percentage?: number | string;
    fromAddress?: string;
    fromWallet?: {
      signerAddress?: string;
      smartAccountAddress?: string;
    };
    toAddress?: string;
    transactionHash?: string;
    txHash?: string;
    collectionStatus?: string;
    collectionError?: string;
  };
};

type GroupResultStatus =
  | 'REQUESTING'
  | 'QUEUED'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'BLOCKED_LOW_BALANCE';

type GroupResult = {
  batchKey: string;
  fromAddress: string;
  toAddress: string;
  itemCount: number;
  totalFeeAmountUsdt: number;
  transactionId?: string;
  transactionHash?: string;
  status: GroupResultStatus;
  onchainStatus?: string;
  error?: string;
  mode: 'single' | 'batch';
};

type UpdatedOrderResult = {
  orderId: string;
  tradeId: string;
  feeAmountUsdt: number;
  transactionId?: string;
  transactionHash?: string;
  status: GroupResultStatus;
  error?: string;
  batchKey: string;
};

type CollectableEntry = {
  orderId: string;
  tradeId: string;
  orderStatus: string;
  usdtAmount: number;
  feePercent: number;
  feeAmountUsdt: number;
  fromAddress: string;
  fromWallet: {
    signerAddress: string;
    smartAccountAddress: string;
  };
  toAddress: string;
  rawAmount: bigint;
  amountText: string;
  previousStatus: AgentPlatformFeeReceivableStatus;
};

type AgentCreditWallet = {
  signerAddress: string;
  smartAccountAddress: string;
};

const REQUEST_SOURCE = 'administration-platform-fee-collection' as const;
const SUPPORTED_COLLECT_STATUSES = new Set(['paymentconfirmed', 'completed']);

const normalizeAddress = (value: string) => normalizeWalletAddress(value).toLowerCase();

const resolveAgentCreditWallet = (agentLike: any): AgentCreditWallet => {
  const creditWallet = agentLike?.creditWallet && typeof agentLike.creditWallet === 'object'
    ? agentLike.creditWallet
    : {};

  const signerAddress = String(
    creditWallet?.signerAddress || agentLike?.signerAddress || '',
  ).trim();
  const smartAccountAddress = String(
    creditWallet?.smartAccountAddress || agentLike?.smartAccountAddress || signerAddress || '',
  ).trim();

  return {
    signerAddress: isWalletAddress(signerAddress) ? signerAddress : '',
    smartAccountAddress: isWalletAddress(smartAccountAddress) ? smartAccountAddress : '',
  };
};

const normalizeQueueStatus = (value: unknown): GroupResultStatus => {
  const normalized = toCollectStatus(value);
  if (normalized === 'PENDING') return 'QUEUED';
  if (normalized === 'BLOCKED_LOW_BALANCE') return 'BLOCKED_LOW_BALANCE';
  return normalized as GroupResultStatus;
};

const resolveChainConfig = () => {
  const chainName = String(process.env.NEXT_PUBLIC_CHAIN || 'polygon').trim().toLowerCase();

  if (chainName === 'ethereum' || chainName === 'eth') {
    return {
      chainKey: 'ethereum',
      chain: ethereum,
      usdtContractAddress: ethereumContractAddressUSDT,
      decimals: 6,
    };
  }

  if (chainName === 'arbitrum' || chainName === 'arb') {
    return {
      chainKey: 'arbitrum',
      chain: arbitrum,
      usdtContractAddress: arbitrumContractAddressUSDT,
      decimals: 6,
    };
  }

  if (chainName === 'bsc' || chainName === 'bnb') {
    return {
      chainKey: 'bsc',
      chain: bsc,
      usdtContractAddress: bscContractAddressUSDT,
      decimals: 18,
    };
  }

  return {
    chainKey: 'polygon',
    chain: polygon,
    usdtContractAddress: polygonContractAddressUSDT,
    decimals: 6,
  };
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const requesterWalletAddress = String(body?.requesterWalletAddress || '').trim();
  const orderIds: string[] = Array.isArray(body?.orderIds)
    ? body.orderIds.map((item: unknown) => String(item || '').trim())
    : [];
  const uniqueOrderIds: string[] = Array.from(new Set(orderIds.filter((id) => Boolean(id))));

  if (!isWalletAddress(requesterWalletAddress)) {
    return NextResponse.json({ error: 'requesterWalletAddress is invalid.' }, { status: 400 });
  }
  if (uniqueOrderIds.length === 0) {
    return NextResponse.json({ error: 'orderIds is required.' }, { status: 400 });
  }

  const objectIds = uniqueOrderIds
    .map((id) => (ObjectId.isValid(id) ? new ObjectId(id) : null))
    .filter((id): id is ObjectId => id !== null);
  if (objectIds.length === 0) {
    return NextResponse.json({ error: 'No valid orderIds were provided.' }, { status: 400 });
  }

  const thirdwebSecretKey = process.env.THIRDWEB_SECRET_KEY || '';
  if (!thirdwebSecretKey) {
    return NextResponse.json({ error: 'THIRDWEB_SECRET_KEY is not configured.' }, { status: 500 });
  }

  const mongodbClient = await clientPromise;
  const db = mongodbClient.db(dbName);
  const usersCollection = db.collection('users');
  const buyordersCollection = db.collection<CollectableOrder>('buyorders');
  const {
    receivablesCollection,
    attemptsCollection,
  } = await ensureAgentPlatformFeeCollections(db);

  const adminUser = await usersCollection.findOne(
    {
      storecode: { $regex: '^admin$', $options: 'i' },
      walletAddress: { $regex: `^${escapeRegex(requesterWalletAddress)}$`, $options: 'i' },
    },
    {
      projection: {
        _id: 1,
        role: 1,
      },
    },
  );

  if (!adminUser || String((adminUser as any)?.role || '').trim().toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Only admin can request platform fee collection.' }, { status: 403 });
  }

  const orders = await buyordersCollection
    .find(
      {
        _id: { $in: objectIds },
        storecode: { $regex: '^admin$', $options: 'i' },
      },
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
    .toArray();

  const agentcodes = Array.from(new Set(
    orders
      .map((order) => String(order?.agentcode || order?.agent?.agentcode || '').trim())
      .filter(Boolean),
  ));
  const agentcodeCandidates = Array.from(new Set(
    agentcodes.flatMap((agentcode) => [agentcode, agentcode.toLowerCase(), agentcode.toUpperCase()]),
  ));
  const agentWalletByCode = new Map<string, AgentCreditWallet>();
  if (agentcodeCandidates.length > 0) {
    const agents = await db.collection('agents')
      .find(
        { agentcode: { $in: agentcodeCandidates } },
        {
          projection: {
            _id: 0,
            agentcode: 1,
            creditWallet: 1,
            signerAddress: 1,
            smartAccountAddress: 1,
          },
        },
      )
      .toArray();
    agents.forEach((agent) => {
      const normalizedAgentcode = String((agent as any)?.agentcode || '').trim().toLowerCase();
      if (!normalizedAgentcode) return;
      const wallet = resolveAgentCreditWallet(agent);
      agentWalletByCode.set(normalizedAgentcode, wallet);
    });
  }

  const byOrderId = new Map(orders.map((order) => [String(order._id), order]));
  const now = new Date().toISOString();
  const skipped: Array<{ orderId: string; tradeId: string; reason: string }> = [];
  const collectableEntries: CollectableEntry[] = [];
  const {
    chainKey,
    chain,
    usdtContractAddress,
    decimals,
  } = resolveChainConfig();

  for (const objectId of objectIds) {
    const order = byOrderId.get(String(objectId));
    if (!order) {
      skipped.push({
        orderId: String(objectId),
        tradeId: '',
        reason: 'ORDER_NOT_FOUND',
      });
      continue;
    }

    const orderId = String(order._id);
    const tradeId = String(order.tradeId || '').trim();
    const orderStatus = String(order.status || '').trim();
    const normalizedOrderStatus = orderStatus.toLowerCase();

    if (!SUPPORTED_COLLECT_STATUSES.has(normalizedOrderStatus)) {
      skipped.push({
        orderId,
        tradeId,
        reason: 'UNSUPPORTED_ORDER_STATUS',
      });
      continue;
    }

    const { doc, reason } = buildAgentPlatformFeeReceivableFromOrder({
      order: order as unknown as Record<string, unknown>,
      orderId,
      nowIso: now,
    });
    if (!doc) {
      skipped.push({
        orderId,
        tradeId,
        reason: reason || 'INVALID_AGENT_PLATFORM_FEE_CONFIG',
      });
      continue;
    }

    const { createdAt, ...receivableSetDoc } = doc;
    await receivablesCollection.updateOne(
      {
        orderId,
        feeType: AGENT_PLATFORM_FEE_TYPE,
        feeVersion: AGENT_PLATFORM_FEE_VERSION,
      },
      {
        $set: {
          ...receivableSetDoc,
          orderStatus,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: createdAt || now,
        },
      },
      { upsert: true },
    );

    if (doc.transactionHash || doc.status === 'CONFIRMED') {
      skipped.push({
        orderId,
        tradeId,
        reason: 'ALREADY_COLLECTED',
      });
      continue;
    }

    const normalizedOrderAgentcode = String(order?.agentcode || order?.agent?.agentcode || '').trim().toLowerCase();
    const fallbackAgentWallet = normalizedOrderAgentcode
      ? (agentWalletByCode.get(normalizedOrderAgentcode) || { signerAddress: '', smartAccountAddress: '' })
      : { signerAddress: '', smartAccountAddress: '' };
    const docFromWalletSignerAddress = String(doc?.fromWallet?.signerAddress || '').trim();
    const docFromWalletSmartAccountAddress = String(doc?.fromWallet?.smartAccountAddress || '').trim();
    const resolvedFromWalletSignerAddress = isWalletAddress(docFromWalletSignerAddress)
      ? docFromWalletSignerAddress
      : fallbackAgentWallet.signerAddress;
    const resolvedFromWalletSmartAccountAddress = isWalletAddress(docFromWalletSmartAccountAddress)
      ? docFromWalletSmartAccountAddress
      : (isWalletAddress(doc.fromAddress) ? doc.fromAddress : fallbackAgentWallet.smartAccountAddress);
    const resolvedFromAddress = isWalletAddress(resolvedFromWalletSmartAccountAddress)
      ? resolvedFromWalletSmartAccountAddress
      : doc.fromAddress;

    if (!isWalletAddress(resolvedFromAddress) || !isWalletAddress(doc.toAddress)) {
      skipped.push({
        orderId,
        tradeId,
        reason: 'INVALID_WALLET_ADDRESS',
      });
      continue;
    }

    if (doc.expectedFeeAmountUsdt <= 0) {
      skipped.push({
        orderId,
        tradeId,
        reason: 'FEE_AMOUNT_IS_ZERO',
      });
      continue;
    }

    const rawAmount = toRawUsdtAmountFromRoundedValue(doc.expectedFeeAmountUsdt, decimals);
    if (rawAmount <= 0n) {
      skipped.push({
        orderId,
        tradeId,
        reason: 'FEE_AMOUNT_IS_ZERO',
      });
      continue;
    }

    collectableEntries.push({
      orderId,
      tradeId,
      orderStatus,
      usdtAmount: roundDownUsdtAmount(doc.usdtAmount),
      feePercent: doc.feePercent,
      feeAmountUsdt: roundDownUsdtAmount(doc.expectedFeeAmountUsdt),
      fromAddress: resolvedFromAddress,
      fromWallet: {
        signerAddress: isWalletAddress(resolvedFromWalletSignerAddress) ? resolvedFromWalletSignerAddress : '',
        smartAccountAddress: resolvedFromAddress,
      },
      toAddress: doc.toAddress,
      rawAmount,
      amountText: formatRawUsdtAmount(rawAmount, decimals),
      previousStatus: doc.status,
    });
  }

  if (collectableEntries.length === 0) {
    return NextResponse.json({
      error: '수납 가능한 항목이 없습니다.',
      result: {
        requestedOrderCount: objectIds.length,
        queuedOrderCount: 0,
        queuedGroupCount: 0,
        skipped,
      },
    }, { status: 400 });
  }

  const groups = new Map<string, CollectableEntry[]>();
  for (const entry of collectableEntries) {
    const key = [
      normalizeAddress(entry.fromWallet.signerAddress || entry.fromAddress),
      normalizeAddress(entry.fromWallet.smartAccountAddress || entry.fromAddress),
      normalizeAddress(entry.toAddress),
    ].join('|');
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const thirdwebClient = createThirdwebClient({ secretKey: thirdwebSecretKey });
  const usdtContract = getContract({
    client: thirdwebClient,
    chain,
    address: usdtContractAddress,
  });

  const queuedGroups: GroupResult[] = [];
  const updatedOrderResults: UpdatedOrderResult[] = [];

  const persistGroupResult = async (
    {
      entries,
      batchKey,
      mode,
      status,
      transactionId,
      transactionHash,
      onchainStatus,
      executionError,
    }: {
      entries: CollectableEntry[];
      batchKey: string;
      mode: 'single' | 'batch';
      status: GroupResultStatus;
      transactionId: string;
      transactionHash: string;
      onchainStatus: string;
      executionError: string;
    },
  ) => {
    const receivableUpdates = entries.map((entry) => ({
      updateOne: {
        filter: {
          orderId: entry.orderId,
          feeType: AGENT_PLATFORM_FEE_TYPE,
          feeVersion: AGENT_PLATFORM_FEE_VERSION,
        },
        update: {
          $set: {
            orderStatus: entry.orderStatus,
            status,
            usdtAmount: entry.usdtAmount,
            feePercent: entry.feePercent,
            expectedFeeAmountUsdt: entry.feeAmountUsdt,
            collectedFeeAmountUsdt: status === 'CONFIRMED' ? entry.feeAmountUsdt : 0,
            fromAddress: entry.fromAddress,
            fromWallet: {
              signerAddress: entry.fromWallet.signerAddress,
              smartAccountAddress: entry.fromWallet.smartAccountAddress,
            },
            toAddress: entry.toAddress,
            transactionId,
            transactionHash,
            onchainStatus,
            error: executionError,
            batchKey,
            collectionMode: mode,
            requestedByWalletAddress: requesterWalletAddress,
            requestedAt: now,
            updatedAt: now,
            ...(status === 'CONFIRMED' ? { collectedAt: now } : {}),
          },
        },
      },
    }));
    if (receivableUpdates.length > 0) {
      await receivablesCollection.bulkWrite(receivableUpdates);
    }

    const orderUpdates = entries.map((entry) => ({
      updateOne: {
        filter: { _id: new ObjectId(entry.orderId) },
        update: {
          $set: {
            'agentPlatformFee.amountUsdt': entry.feeAmountUsdt,
            'agentPlatformFee.expectedAmountUsdt': entry.feeAmountUsdt,
            'agentPlatformFee.fromAddress': entry.fromAddress,
            'agentPlatformFee.fromWallet': {
              signerAddress: entry.fromWallet.signerAddress,
              smartAccountAddress: entry.fromWallet.smartAccountAddress,
            },
            'agentPlatformFee.transactionId': transactionId,
            'agentPlatformFee.transactionHash': transactionHash,
            'agentPlatformFee.collectionStatus': status,
            'agentPlatformFee.collectionMode': mode,
            'agentPlatformFee.collectionBatchKey': batchKey,
            'agentPlatformFee.collectionRequestedByWalletAddress': requesterWalletAddress,
            'agentPlatformFee.collectionRequestedAt': now,
            'agentPlatformFee.collectionUpdatedAt': now,
            ...(status === 'CONFIRMED' ? { 'agentPlatformFee.collectedAt': now } : {}),
            ...(executionError ? { 'agentPlatformFee.collectionError': executionError } : {}),
          },
        },
      },
    }));
    if (orderUpdates.length > 0) {
      await buyordersCollection.bulkWrite(orderUpdates);
    }

    const attemptDocuments: AgentPlatformFeeCollectionAttemptDoc[] = entries.map((entry) => ({
      orderId: entry.orderId,
      feeType: AGENT_PLATFORM_FEE_TYPE,
      feeVersion: AGENT_PLATFORM_FEE_VERSION,
      tradeId: entry.tradeId,
      chain: chainKey,
      status,
      previousStatus: entry.previousStatus,
      fromAddress: entry.fromAddress,
      fromWallet: {
        signerAddress: entry.fromWallet.signerAddress,
        smartAccountAddress: entry.fromWallet.smartAccountAddress,
      },
      toAddress: entry.toAddress,
      usdtAmount: entry.usdtAmount,
      feePercent: entry.feePercent,
      feeAmountUsdt: entry.feeAmountUsdt,
      transactionId,
      transactionHash,
      onchainStatus,
      error: executionError,
      requestedByWalletAddress: requesterWalletAddress,
      requestIdempotencyKey: buildAgentPlatformFeeAttemptIdempotencyKey({
        orderId: entry.orderId,
        batchKey,
        mode,
      }),
      batchKey,
      mode,
      source: REQUEST_SOURCE,
      requestedAt: now,
      updatedAt: now,
    }));
    if (attemptDocuments.length > 0) {
      try {
        await attemptsCollection.insertMany(attemptDocuments, { ordered: false });
      } catch (attemptError: any) {
        if (Number(attemptError?.code) !== 11000) {
          console.error('collectAgentPlatformFeeBatch: failed to write attempts', attemptError);
        }
      }
    }

    entries.forEach((entry) => {
      updatedOrderResults.push({
        orderId: entry.orderId,
        tradeId: entry.tradeId,
        feeAmountUsdt: entry.feeAmountUsdt,
        transactionId,
        transactionHash,
        status,
        error: executionError,
        batchKey,
      });
    });
  };

  for (const [groupKey, entries] of groups) {
    const first = entries[0];
    const batchKey = `${groupKey}:${now}`;
    const mode: 'single' | 'batch' = entries.length > 1 ? 'batch' : 'single';
    const totalFeeAmountUsdt = roundDownUsdtAmount(
      entries.reduce((sum, item) => sum + item.feeAmountUsdt, 0),
    );

    await receivablesCollection.bulkWrite(
      entries.map((entry) => ({
        updateOne: {
          filter: {
            orderId: entry.orderId,
            feeType: AGENT_PLATFORM_FEE_TYPE,
            feeVersion: AGENT_PLATFORM_FEE_VERSION,
          },
          update: {
            $set: {
              status: 'REQUESTING',
              batchKey,
              collectionMode: mode,
              requestedByWalletAddress: requesterWalletAddress,
              requestedAt: now,
              updatedAt: now,
              error: '',
            },
          },
        },
      })),
    );

    let transactionId = '';
    let transactionHash = '';
    let status: GroupResultStatus = 'REQUESTING';
    let onchainStatus = '';
    let executionError = '';

    try {
      const feeWallet = isWalletAddress(first.fromWallet.signerAddress)
        ? Engine.serverWallet({
            client: thirdwebClient,
            address: first.fromWallet.signerAddress,
            chain,
            executionOptions: {
              type: 'ERC4337',
              signerAddress: first.fromWallet.signerAddress,
              smartAccountAddress: first.fromWallet.smartAccountAddress || first.fromAddress,
            },
          })
        : await createEngineServerWallet({
            client: thirdwebClient,
            walletAddress: first.fromAddress,
            chain,
          });

      const transferTransactions = entries.map((entry) =>
        transfer({
          contract: usdtContract,
          to: entry.toAddress,
          amount: entry.amountText,
        }),
      );

      transactionId = transferTransactions.length > 1
        ? (
            await feeWallet.enqueueBatchTransaction({
              transactions: transferTransactions,
            })
          ).transactionId
        : (
            await feeWallet.enqueueTransaction({
              transaction: transferTransactions[0],
            })
          ).transactionId;

      status = 'QUEUED';

      try {
        const hashResult = await Engine.waitForTransactionHash({
          client: thirdwebClient,
          transactionId,
          timeoutInSeconds: 45,
        });
        transactionHash = String(hashResult?.transactionHash || '').trim();
      } catch {
        // queue submission succeeded but hash may not be available yet.
      }

      try {
        const executionResult = await Engine.getTransactionStatus({
          client: thirdwebClient,
          transactionId,
        });
        status = normalizeQueueStatus(executionResult?.status || status);
        if (!transactionHash) {
          transactionHash = String((executionResult as any)?.transactionHash || '').trim();
        }
        onchainStatus = String((executionResult as any)?.onchainStatus || '').trim();
        executionError = toErrorMessage((executionResult as any)?.error);
      } catch (executionStatusError) {
        executionError = toErrorMessage(executionStatusError);
      }

      if (status === 'FAILED' && isLowBalanceError(executionError)) {
        status = 'BLOCKED_LOW_BALANCE';
      }

      await persistGroupResult({
        entries,
        batchKey,
        mode,
        status,
        transactionId,
        transactionHash,
        onchainStatus,
        executionError,
      });

      queuedGroups.push({
        batchKey,
        fromAddress: first.fromAddress,
        toAddress: first.toAddress,
        itemCount: entries.length,
        totalFeeAmountUsdt,
        transactionId,
        transactionHash,
        status,
        onchainStatus,
        error: executionError,
        mode,
      });
    } catch (groupError) {
      executionError = toErrorMessage(groupError) || 'BATCH_QUEUE_FAILED';
      status = isLowBalanceError(executionError) ? 'BLOCKED_LOW_BALANCE' : 'FAILED';

      await persistGroupResult({
        entries,
        batchKey,
        mode,
        status,
        transactionId,
        transactionHash,
        onchainStatus,
        executionError,
      });

      queuedGroups.push({
        batchKey,
        fromAddress: first.fromAddress,
        toAddress: first.toAddress,
        itemCount: entries.length,
        totalFeeAmountUsdt,
        transactionId,
        transactionHash,
        status,
        onchainStatus,
        error: executionError,
        mode,
      });
    }
  }

  const uniqueSenderCount = new Set(collectableEntries.map((entry) => normalizeAddress(entry.fromAddress))).size;
  const queuedOrderCount = updatedOrderResults.length;
  const failedOrderCount = updatedOrderResults.filter(
    (entry) => entry.status === 'FAILED' || entry.status === 'BLOCKED_LOW_BALANCE',
  ).length;

  return NextResponse.json({
    result: {
      chain: chainKey,
      usdtContractAddress,
      requestedOrderCount: objectIds.length,
      collectableOrderCount: collectableEntries.length,
      queuedOrderCount,
      queuedGroupCount: queuedGroups.length,
      failedOrderCount,
      skipped,
      groups: queuedGroups,
      orders: updatedOrderResults,
      multiSenderBatchedSeparately: uniqueSenderCount > 1,
      senderWalletCount: uniqueSenderCount,
      batchHandlingNote:
        uniqueSenderCount > 1
          ? '송신 서버지갑이 여러 개인 경우 단일 온체인 배치로 묶을 수 없어, 송신 지갑별 배치 큐로 분리 처리됩니다.'
          : '송신 서버지갑이 1개여서 선택 항목을 동일 지갑 배치 큐로 처리했습니다.',
      requestedByWalletAddress: requesterWalletAddress,
      requestedAt: now,
    },
  });
}
