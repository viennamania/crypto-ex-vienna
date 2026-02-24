import { NextResponse, type NextRequest } from 'next/server';
import { createThirdwebClient, Engine } from 'thirdweb';
import type { Chain } from 'thirdweb/chains';
import { ethereum, polygon, arbitrum, bsc } from 'thirdweb/chains';
import { getRpcClient, eth_blockNumber, eth_getBlockByNumber, eth_getLogs } from 'thirdweb/rpc';

import clientPromise, { dbName } from '@/lib/mongodb';

type TransferDirection = 'IN' | 'OUT';

type TransferCaseType =
  | 'SELLER_WALLET_TO_ESCROW'
  | 'ESCROW_TO_SELLER_WALLET'
  | 'BUYER_ESCROW_TO_ESCROW'
  | 'ESCROW_TO_BUYER_ESCROW'
  | 'ORDER_HASH_MATCHED'
  | 'UNCLASSIFIED_IN'
  | 'UNCLASSIFIED_OUT';

type RelatedTradeInfo = {
  tradeId: string;
  status: string;
  reason: string;
  orderId: string;
};

type OrderPreview = {
  orderId: string;
  tradeId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  paymentMethod: string;
  usdtAmount: string;
  krwAmount: string;
  rate: string;
  buyerWalletAddress: string;
  buyerEscrowWalletAddress: string;
  buyerDepositName: string;
  sellerWalletAddress: string;
  sellerEscrowWalletAddress: string;
  sellerBankName: string;
  sellerAccountNumber: string;
  sellerAccountHolder: string;
  transactionHash: string;
  escrowTransactionHash: string;
  buyerLockTransactionHash: string;
  sellerLockTransactionHash: string;
};

type TransferCaseDetail = {
  type: TransferCaseType;
  label: string;
  expectedFlow: boolean;
};

type ChainConfig = {
  chain: 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';
  chainId: number;
  usdtContractAddress: string;
  usdtDecimals: number;
};

type InsightTransferItem = {
  from_address?: string;
  to_address?: string;
  contract_address?: string;
  block_number?: string;
  block_timestamp?: string;
  transaction_hash?: string;
  log_index?: number;
  transfer_type?: string;
  chain_id?: number;
  token_type?: string;
  amount?: string;
};

type UnclassifiedOutRecoveryStatus =
  | 'REQUESTING'
  | 'QUEUED'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'FAILED';

type SellerEscrowUnclassifiedOutRecoveryHistoryDoc = {
  _id?: unknown;
  sellerId?: number;
  sellerNickname?: string;
  sellerWalletAddress?: string;
  sellerEscrowWalletAddress?: string;
  sellerEscrowWalletAddressNormalized?: string;
  chain?: 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';
  tokenSymbol?: string;
  tokenContractAddress?: string;
  tokenDecimals?: number;
  sourceCaseType?: string;
  sourceDirection?: string;
  sourceTransactionHash?: string;
  sourceTransactionHashNormalized?: string;
  sourceBlockTimestamp?: string;
  sourceFromAddress?: string;
  sourceToAddress?: string;
  sourceAmountRaw?: string;
  sourceAmountFormatted?: string;
  toAddressIsThirdwebServerWallet?: boolean;
  recoveryFromWalletAddress?: string;
  recoveryToWalletAddress?: string;
  recoveryAmountRaw?: string;
  recoveryAmountFormatted?: string;
  status?: UnclassifiedOutRecoveryStatus | string;
  recoveryTransactionId?: string;
  recoveryTransactionHash?: string;
  onchainStatus?: string;
  error?: string;
  requestedByWalletAddress?: string;
  requestedByName?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  confirmedAt?: string;
};

type SerializedUnclassifiedOutRecoveryHistory = {
  id: string;
  sellerId: number;
  sellerNickname: string;
  sellerWalletAddress: string;
  sellerEscrowWalletAddress: string;
  chain: 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';
  tokenSymbol: string;
  tokenContractAddress: string;
  tokenDecimals: number;
  sourceCaseType: string;
  sourceDirection: string;
  sourceTransactionHash: string;
  sourceBlockTimestamp: string;
  sourceFromAddress: string;
  sourceToAddress: string;
  sourceAmountRaw: string;
  sourceAmountFormatted: string;
  toAddressIsThirdwebServerWallet: boolean;
  recoveryFromWalletAddress: string;
  recoveryToWalletAddress: string;
  recoveryAmountRaw: string;
  recoveryAmountFormatted: string;
  status: UnclassifiedOutRecoveryStatus;
  recoveryTransactionId: string;
  recoveryTransactionHash: string;
  onchainStatus: string;
  error: string;
  requestedByWalletAddress: string;
  requestedByName: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string;
};

let insightClientIdCache = '';
const ENGINE_SERVER_WALLET_CACHE_TTL_MS = 5 * 60 * 1000;
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const RPC_LOG_BLOCK_CHUNK_SIZE = 900n;
const START_BLOCK_SAFETY_LOOKBACK = 2000n;
const START_BLOCK_FALLBACK_LOOKBACK = 400_000n;
let engineServerWalletAddressCache:
  | {
      fetchedAt: number;
      addresses: Set<string>;
    }
  | null = null;

const ESCROW_TRANSFER_CASE_LABELS: Record<TransferCaseType, string> = {
  SELLER_WALLET_TO_ESCROW: '판매자 지갑 -> 판매자 에스크로',
  ESCROW_TO_SELLER_WALLET: '판매자 에스크로 -> 판매자 지갑',
  BUYER_ESCROW_TO_ESCROW: '구매 에스크로 -> 판매자 에스크로',
  ESCROW_TO_BUYER_ESCROW: '판매자 에스크로 -> 구매 에스크로',
  ORDER_HASH_MATCHED: '주문 해시 매칭(수동 확인 필요)',
  UNCLASSIFIED_IN: '미분류 입금',
  UNCLASSIFIED_OUT: '미분류 출금',
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeAddress = (value: unknown) => String(value || '').trim().toLowerCase();

const normalizeHash = (value: unknown) => String(value || '').trim().toLowerCase();

const isWalletAddress = (value: string) => /^0x[a-f0-9]{40}$/i.test(String(value || '').trim());

const isTransactionHash = (value: string) => /^0x[a-f0-9]{64}$/i.test(String(value || '').trim());

const addressToTopic = (address: string) => {
  const normalized = normalizeAddress(address).replace(/^0x/, '');
  return `0x${normalized.padStart(64, '0')}`;
};

const extractAddressFromTopic = (topic: unknown) => {
  const normalized = String(topic || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(normalized)) return '';
  return `0x${normalized.slice(-40)}`;
};

const parseHexAmountToRawString = (value: unknown) => {
  const normalized = String(value || '').trim();
  if (!/^0x[a-f0-9]+$/i.test(normalized)) return '0';
  try {
    return BigInt(normalized).toString();
  } catch {
    return '0';
  }
};

const parseIsoTimestampToUnixSeconds = (value: unknown): number | null => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric);
    }
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1000);
};

const normalizeSupportedChain = (
  value: unknown,
  fallback: ChainConfig['chain'],
): ChainConfig['chain'] => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'ethereum') return 'ethereum';
  if (normalized === 'polygon') return 'polygon';
  if (normalized === 'arbitrum') return 'arbitrum';
  if (normalized === 'bsc') return 'bsc';
  return fallback;
};

const resolveChainConfig = (): ChainConfig => {
  const normalizedChain = String(process.env.NEXT_PUBLIC_CHAIN || 'polygon').trim().toLowerCase();
  if (normalizedChain === 'ethereum') {
    return {
      chain: 'ethereum',
      chainId: 1,
      usdtContractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      usdtDecimals: 6,
    };
  }
  if (normalizedChain === 'arbitrum') {
    return {
      chain: 'arbitrum',
      chainId: 42161,
      usdtContractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      usdtDecimals: 6,
    };
  }
  if (normalizedChain === 'bsc') {
    return {
      chain: 'bsc',
      chainId: 56,
      usdtContractAddress: '0x55d398326f99059fF775485246999027B3197955',
      usdtDecimals: 18,
    };
  }
  return {
    chain: 'polygon',
    chainId: 137,
    usdtContractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    usdtDecimals: 6,
  };
};

const resolveThirdwebChainByName = (chain: ChainConfig['chain']): Chain => {
  if (chain === 'ethereum') return ethereum;
  if (chain === 'arbitrum') return arbitrum;
  if (chain === 'bsc') return bsc;
  return polygon;
};

const formatTokenAmountFromRaw = (rawAmount: string, decimals: number) => {
  const normalized = String(rawAmount || '').trim();
  if (!/^-?\d+$/.test(normalized)) {
    return normalized || '0';
  }
  const rawValue = BigInt(normalized);
  const negative = rawValue < 0n;
  const absoluteValue = negative ? rawValue * -1n : rawValue;
  const divisor = 10n ** BigInt(Math.max(0, decimals));
  const whole = absoluteValue / divisor;
  const fraction = absoluteValue % divisor;
  if (fraction === 0n) {
    return `${negative ? '-' : ''}${whole.toString()}`;
  }
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}.${fractionText}`;
};

const parseRawAmountToBigInt = (value: string) => {
  const normalized = String(value || '').trim();
  if (!/^-?\d+$/.test(normalized)) return 0n;
  return BigInt(normalized);
};

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

const normalizeRecoveryStatus = (value: unknown): UnclassifiedOutRecoveryStatus => {
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

const pushRelatedTradeInfo = (
  map: Map<string, RelatedTradeInfo[]>,
  key: string,
  tradeInfo: RelatedTradeInfo,
) => {
  if (!key || !tradeInfo.tradeId) return;
  const current = map.get(key) || [];
  const alreadyExists = current.some(
    (item) =>
      item.tradeId === tradeInfo.tradeId
      && item.reason === tradeInfo.reason
      && item.status === tradeInfo.status
      && item.orderId === tradeInfo.orderId,
  );
  if (alreadyExists) return;
  current.push(tradeInfo);
  map.set(key, current);
};

const buildMergedRelatedTrades = (
  hashRelatedTrades: RelatedTradeInfo[],
  counterpartyRelatedTrades: RelatedTradeInfo[],
) => {
  const merged = new Map<string, {
    tradeId: string;
    status: string;
    orderId: string;
    reasons: Set<string>;
  }>();
  const push = (source: RelatedTradeInfo[]) => {
    for (const item of source) {
      if (!item.tradeId) continue;
      const key = item.tradeId;
      if (!merged.has(key)) {
        merged.set(key, {
          tradeId: item.tradeId,
          status: item.status || '',
          orderId: item.orderId || '',
          reasons: new Set<string>(),
        });
      }
      const target = merged.get(key);
      if (!target) continue;
      if (item.status && !target.status) {
        target.status = item.status;
      }
      if (item.orderId && !target.orderId) {
        target.orderId = item.orderId;
      }
      if (item.reason) {
        target.reasons.add(item.reason);
      }
    }
  };

  push(hashRelatedTrades);
  push(counterpartyRelatedTrades);

  return Array.from(merged.values()).map((item) => ({
    tradeId: item.tradeId,
    status: item.status,
    orderId: item.orderId,
    reason: Array.from(item.reasons).join(', '),
  }));
};

const classifyTransferCase = ({
  direction,
  counterpartyAddress,
  sellerWalletAddress,
  buyerEscrowAddressSet,
  relatedTrades,
}: {
  direction: TransferDirection;
  counterpartyAddress: string;
  sellerWalletAddress: string;
  buyerEscrowAddressSet: Set<string>;
  relatedTrades: Array<{ tradeId: string; status: string; orderId: string; reason: string }>;
}): TransferCaseDetail => {
  if (direction === 'IN' && counterpartyAddress === sellerWalletAddress) {
    return {
      type: 'SELLER_WALLET_TO_ESCROW',
      label: ESCROW_TRANSFER_CASE_LABELS.SELLER_WALLET_TO_ESCROW,
      expectedFlow: true,
    };
  }

  if (direction === 'OUT' && counterpartyAddress === sellerWalletAddress) {
    return {
      type: 'ESCROW_TO_SELLER_WALLET',
      label: ESCROW_TRANSFER_CASE_LABELS.ESCROW_TO_SELLER_WALLET,
      expectedFlow: true,
    };
  }

  if (direction === 'IN' && buyerEscrowAddressSet.has(counterpartyAddress)) {
    return {
      type: 'BUYER_ESCROW_TO_ESCROW',
      label: ESCROW_TRANSFER_CASE_LABELS.BUYER_ESCROW_TO_ESCROW,
      expectedFlow: true,
    };
  }

  if (direction === 'OUT' && buyerEscrowAddressSet.has(counterpartyAddress)) {
    return {
      type: 'ESCROW_TO_BUYER_ESCROW',
      label: ESCROW_TRANSFER_CASE_LABELS.ESCROW_TO_BUYER_ESCROW,
      expectedFlow: true,
    };
  }

  if (relatedTrades.length > 0) {
    return {
      type: 'ORDER_HASH_MATCHED',
      label: ESCROW_TRANSFER_CASE_LABELS.ORDER_HASH_MATCHED,
      expectedFlow: false,
    };
  }

  if (direction === 'IN') {
    return {
      type: 'UNCLASSIFIED_IN',
      label: ESCROW_TRANSFER_CASE_LABELS.UNCLASSIFIED_IN,
      expectedFlow: false,
    };
  }

  return {
    type: 'UNCLASSIFIED_OUT',
    label: ESCROW_TRANSFER_CASE_LABELS.UNCLASSIFIED_OUT,
    expectedFlow: false,
  };
};

const resolveInsightClientId = async () => {
  if (insightClientIdCache) return insightClientIdCache;

  const fromEnv = String(process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || '').trim();
  if (fromEnv) {
    insightClientIdCache = fromEnv;
    return insightClientIdCache;
  }

  const secretKey = String(process.env.THIRDWEB_SECRET_KEY || '').trim();
  if (!secretKey) {
    return '';
  }

  const client = createThirdwebClient({ secretKey });
  try {
    const result = await Engine.searchTransactions({
      client,
      pageSize: 1,
      page: 1,
    });
    const candidate = String(result.transactions?.[0]?.clientId || '').trim();
    if (candidate) {
      insightClientIdCache = candidate;
      return insightClientIdCache;
    }
  } catch (error) {
    console.error('getSellerEscrowTransferHistory: failed to resolve insight client id', error);
  }

  return '';
};

const resolveThirdwebServerWalletAddressSet = async () => {
  const now = Date.now();
  if (
    engineServerWalletAddressCache
    && (now - engineServerWalletAddressCache.fetchedAt) < ENGINE_SERVER_WALLET_CACHE_TTL_MS
  ) {
    return {
      enabled: true,
      addresses: engineServerWalletAddressCache.addresses,
      totalServerWalletAddressCount: engineServerWalletAddressCache.addresses.size,
      source: 'cache',
      error: '',
    };
  }

  const secretKey = String(process.env.THIRDWEB_SECRET_KEY || '').trim();
  if (!secretKey) {
    return {
      enabled: false,
      addresses: new Set<string>(),
      totalServerWalletAddressCount: 0,
      source: 'unavailable',
      error: 'THIRDWEB_SECRET_KEY is missing',
    };
  }

  const client = createThirdwebClient({ secretKey });
  const addresses = new Set<string>();
  const pageLimit = 200;

  try {
    let page = 1;
    while (page <= 100) {
      const response = await Engine.getServerWallets({
        client,
        page,
        limit: pageLimit,
      });
      const accounts = Array.isArray(response?.accounts) ? response.accounts : [];
      for (const account of accounts) {
        const signerAddress = normalizeAddress(account?.address);
        const smartAccountAddress = normalizeAddress(account?.smartAccountAddress);
        if (isWalletAddress(signerAddress)) {
          addresses.add(signerAddress);
        }
        if (isWalletAddress(smartAccountAddress)) {
          addresses.add(smartAccountAddress);
        }
      }

      const totalCount = Number(response?.pagination?.totalCount || 0);
      const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageLimit) : page;
      if (page >= totalPages) {
        break;
      }
      page += 1;
    }
  } catch (error) {
    console.error('getSellerEscrowTransferHistory: failed to fetch thirdweb server wallets', error);
    if (engineServerWalletAddressCache) {
      return {
        enabled: true,
        addresses: engineServerWalletAddressCache.addresses,
        totalServerWalletAddressCount: engineServerWalletAddressCache.addresses.size,
        source: 'stale-cache',
        error: 'failed to refresh server wallet cache',
      };
    }
    return {
      enabled: false,
      addresses: new Set<string>(),
      totalServerWalletAddressCount: 0,
      source: 'error',
      error: 'failed to fetch thirdweb server wallets',
    };
  }

  engineServerWalletAddressCache = {
    fetchedAt: now,
    addresses,
  };

  return {
    enabled: true,
    addresses,
    totalServerWalletAddressCount: addresses.size,
    source: 'live',
    error: '',
  };
};

const findSellerById = async (sellerId: string) => {
  const normalizedSellerId = String(sellerId || '').trim();
  if (!normalizedSellerId) return null;

  const mongodbClient = await clientPromise;
  const usersCollection = mongodbClient.db(dbName).collection('users');

  const exactOrConditions: Record<string, unknown>[] = [
    {
      nickname: {
        $regex: `^${escapeRegExp(normalizedSellerId)}$`,
        $options: 'i',
      },
    },
    {
      walletAddress: {
        $regex: `^${escapeRegExp(normalizedSellerId)}$`,
        $options: 'i',
      },
    },
  ];

  const numericId = Number(normalizedSellerId);
  if (Number.isInteger(numericId) && numericId > 0) {
    exactOrConditions.push({ id: numericId });
  }

  const projection = {
    _id: 1,
    id: 1,
    nickname: 1,
    storecode: 1,
    walletAddress: 1,
    createdAt: 1,
    seller: 1,
  };

  const exactMatched = await usersCollection.findOne(
    {
      storecode: 'admin',
      seller: { $exists: true },
      $or: exactOrConditions,
    },
    { projection },
  );

  if (exactMatched) {
    return {
      seller: exactMatched,
      matchMode: 'exact',
      ambiguous: false,
      candidates: [] as Array<{ nickname: string; walletAddress: string }>,
    };
  }

  const partialCandidates = await usersCollection
    .find(
      {
        storecode: 'admin',
        seller: { $exists: true },
        nickname: {
          $regex: escapeRegExp(normalizedSellerId),
          $options: 'i',
        },
      },
      {
        projection: {
          nickname: 1,
          walletAddress: 1,
          seller: 1,
        },
      },
    )
    .limit(5)
    .toArray();

  if (partialCandidates.length === 1) {
    return {
      seller: partialCandidates[0],
      matchMode: 'partial',
      ambiguous: false,
      candidates: [] as Array<{ nickname: string; walletAddress: string }>,
    };
  }

  return {
    seller: null,
    matchMode: '',
    ambiguous: partialCandidates.length > 1,
    candidates: partialCandidates.map((item) => ({
      nickname: String(item?.nickname || ''),
      walletAddress: String(item?.walletAddress || ''),
    })),
  };
};

const resolveSellerEscrowWalletAddress = (sellerUser: any) => {
  const candidates = [
    sellerUser?.seller?.escrowWalletAddress,
    sellerUser?.seller?.escrowWallet?.smartAccountAddress,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (isWalletAddress(normalized)) {
      return normalized;
    }
  }
  return '';
};

const loadOrderContextBySeller = async ({
  sellerWalletAddress,
  sellerEscrowWalletAddress,
}: {
  sellerWalletAddress: string;
  sellerEscrowWalletAddress: string;
}) => {
  const mongodbClient = await clientPromise;
  const buyordersCollection = mongodbClient.db(dbName).collection('buyorders');

  const sellerWalletRegex = {
    $regex: `^${escapeRegExp(sellerWalletAddress)}$`,
    $options: 'i',
  };
  const sellerEscrowWalletRegex = {
    $regex: `^${escapeRegExp(sellerEscrowWalletAddress)}$`,
    $options: 'i',
  };

  const orders = await buyordersCollection
    .find(
      {
        $or: [
          { 'seller.walletAddress': sellerWalletRegex },
          { 'seller.escrowWalletAddress': sellerEscrowWalletRegex },
        ],
      },
      {
        projection: {
          _id: 1,
          tradeId: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          usdtAmount: 1,
          krwAmount: 1,
          rate: 1,
          paymentMethod: 1,
          walletAddress: 1,
          depositName: 1,
          bankName: 1,
          accountNumber: 1,
          accountHolder: 1,
          seller: 1,
          buyer: 1,
          escrowWallet: 1,
          transactionHash: 1,
          escrowTransactionHash: 1,
        },
      },
    )
    .toArray();

  const buyerEscrowAddressSet = new Set<string>();
  const hashToRelatedTradesMap = new Map<string, RelatedTradeInfo[]>();
  const counterpartyToRelatedTradesMap = new Map<string, RelatedTradeInfo[]>();
  const tradeIdToOrderPreviewMap = new Map<string, OrderPreview>();
  let earliestOrderCreatedAtUnixSeconds: number | null = null;

  const registerHash = (
    txHash: unknown,
    tradeId: string,
    status: string,
    orderId: string,
    reason: string,
  ) => {
    const normalizedHash = normalizeHash(txHash);
    if (!isTransactionHash(normalizedHash) || !tradeId) return;
    pushRelatedTradeInfo(hashToRelatedTradesMap, normalizedHash, {
      tradeId,
      status,
      orderId,
      reason,
    });
  };

  for (const order of orders) {
    const orderId = String(order?._id || '').trim();
    const tradeId = String(order?.tradeId || '').trim();
    const status = String(order?.status || '').trim();
    const orderCreatedAtUnixSeconds = parseIsoTimestampToUnixSeconds(order?.createdAt);
    if (orderCreatedAtUnixSeconds != null) {
      if (earliestOrderCreatedAtUnixSeconds == null || orderCreatedAtUnixSeconds < earliestOrderCreatedAtUnixSeconds) {
        earliestOrderCreatedAtUnixSeconds = orderCreatedAtUnixSeconds;
      }
    }
    const usdtAmount = String(order?.usdtAmount ?? '').trim();
    const krwAmount = String(order?.krwAmount ?? '').trim();
    const explicitRate = Number(order?.rate);
    let rate = Number.isFinite(explicitRate) && explicitRate > 0 ? String(explicitRate) : '';
    if (!rate) {
      const numericKrwAmount = Number(krwAmount);
      const numericUsdtAmount = Number(usdtAmount);
      if (Number.isFinite(numericKrwAmount) && Number.isFinite(numericUsdtAmount) && numericUsdtAmount > 0) {
        rate = String(numericKrwAmount / numericUsdtAmount);
      }
    }
    const buyerDepositName = String(
      order?.buyer?.depositName
      || order?.buyer?.bankInfo?.accountHolder
      || order?.buyer?.bankInfo?.depositName
      || order?.depositName
      || '',
    ).trim();
    const sellerBankName = String(order?.seller?.bankInfo?.bankName || order?.bankName || '').trim();
    const sellerAccountNumber = String(order?.seller?.bankInfo?.accountNumber || order?.accountNumber || '').trim();
    const sellerAccountHolder = String(order?.seller?.bankInfo?.accountHolder || order?.accountHolder || '').trim();
    const buyerWalletAddress = String(order?.walletAddress || order?.buyer?.walletAddress || '').trim();
    const buyerEscrowWalletAddress = String(
      order?.buyer?.escrowWalletAddress
      || order?.escrowWallet?.address
      || '',
    ).trim();
    const sellerWalletAddressFromOrder = String(order?.seller?.walletAddress || '').trim();
    const sellerEscrowWalletAddressFromOrder = String(order?.seller?.escrowWalletAddress || '').trim();
    if (tradeId) {
      tradeIdToOrderPreviewMap.set(tradeId, {
        orderId,
        tradeId,
        status,
        createdAt: String(order?.createdAt || ''),
        updatedAt: String(order?.updatedAt || ''),
        paymentMethod: String(order?.paymentMethod || ''),
        usdtAmount,
        krwAmount,
        rate,
        buyerWalletAddress,
        buyerEscrowWalletAddress,
        buyerDepositName,
        sellerWalletAddress: sellerWalletAddressFromOrder,
        sellerEscrowWalletAddress: sellerEscrowWalletAddressFromOrder,
        sellerBankName,
        sellerAccountNumber,
        sellerAccountHolder,
        transactionHash: String(order?.transactionHash || ''),
        escrowTransactionHash: String(order?.escrowTransactionHash || ''),
        buyerLockTransactionHash: String(order?.buyer?.lockTransactionHash || ''),
        sellerLockTransactionHash: String(order?.seller?.lockTransactionHash || ''),
      });
    }
    const buyerEscrowCandidates = [
      order?.buyer?.escrowWalletAddress,
      order?.escrowWallet?.address,
    ];

    for (const addressCandidate of buyerEscrowCandidates) {
      const normalizedAddress = normalizeAddress(addressCandidate);
      if (!isWalletAddress(normalizedAddress)) continue;
      buyerEscrowAddressSet.add(normalizedAddress);
      if (!tradeId) continue;
      pushRelatedTradeInfo(counterpartyToRelatedTradesMap, normalizedAddress, {
        tradeId,
        status,
        orderId,
        reason: 'buyerEscrowAddress',
      });
    }

    registerHash(order?.buyer?.lockTransactionHash, tradeId, status, orderId, 'buyer.lockTransactionHash');
    registerHash(order?.seller?.lockTransactionHash, tradeId, status, orderId, 'seller.lockTransactionHash');
    registerHash(order?.escrowTransactionHash, tradeId, status, orderId, 'escrowTransactionHash');
    registerHash(order?.transactionHash, tradeId, status, orderId, 'transactionHash');
  }

  return {
    orderCount: orders.length,
    buyerEscrowAddressSet,
    hashToRelatedTradesMap,
    counterpartyToRelatedTradesMap,
    tradeIdToOrderPreviewMap,
    earliestOrderCreatedAtUnixSeconds,
  };
};

type InsightBlockItem = {
  block_number?: number | string;
};

type InsightBlocksResponse = {
  data?: InsightBlockItem[];
  error?: unknown;
};

const resolveStartBlockNumberFromInsight = async ({
  clientId,
  chainId,
  timestampFromUnixSeconds,
}: {
  clientId: string;
  chainId: number;
  timestampFromUnixSeconds: number;
}) => {
  const params = new URLSearchParams();
  params.append('chain_id', String(chainId));
  params.append('filter_block_timestamp_gte', String(timestampFromUnixSeconds));
  params.append('sort_by', 'block_number');
  params.append('sort_order', 'asc');
  params.append('limit', '1');
  params.append('page', '0');

  const response = await fetch(
    `https://insight.thirdweb.com/v1/blocks?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        'x-client-id': clientId,
      },
      cache: 'no-store',
    },
  );
  const payload = (await response.json().catch(() => ({}))) as InsightBlocksResponse;
  if (!response.ok) {
    throw new Error(
      normalizeErrorText(payload?.error) || 'Failed to resolve start block from thirdweb insight',
    );
  }
  const firstItem = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!firstItem) return null;

  const blockNumberValue = String(firstItem?.block_number ?? '').trim();
  if (!/^\d+$/.test(blockNumberValue)) return null;
  return BigInt(blockNumberValue);
};

const fetchAllSellerEscrowTransfers = async ({
  chainConfig,
  ownerAddress,
  contractAddress,
  startTimestampUnixSeconds,
}: {
  chainConfig: ChainConfig;
  ownerAddress: string;
  contractAddress: string;
  startTimestampUnixSeconds: number | null;
}) => {
  const secretKey = String(process.env.THIRDWEB_SECRET_KEY || '').trim();
  if (!secretKey) {
    throw new Error('THIRDWEB_SECRET_KEY is not configured');
  }

  const thirdwebClient = createThirdwebClient({ secretKey });
  const rpcRequest = getRpcClient({
    client: thirdwebClient,
    chain: resolveThirdwebChainByName(chainConfig.chain),
  });
  const latestBlock = await eth_blockNumber(rpcRequest);

  let startBlock: bigint =
    latestBlock > START_BLOCK_FALLBACK_LOOKBACK
      ? latestBlock - START_BLOCK_FALLBACK_LOOKBACK
      : 0n;

  const insightClientId = await resolveInsightClientId();
  if (insightClientId && startTimestampUnixSeconds != null) {
    try {
      const startBlockFromInsight = await resolveStartBlockNumberFromInsight({
        clientId: insightClientId,
        chainId: chainConfig.chainId,
        timestampFromUnixSeconds: startTimestampUnixSeconds,
      });
      if (startBlockFromInsight != null) {
        startBlock = startBlockFromInsight;
      }
    } catch (error) {
      console.error('getSellerEscrowTransferHistory: failed to resolve start block from insight', error);
    }
  }

  if (startBlock > START_BLOCK_SAFETY_LOOKBACK) {
    startBlock -= START_BLOCK_SAFETY_LOOKBACK;
  } else {
    startBlock = 0n;
  }
  if (startBlock > latestBlock) {
    startBlock = latestBlock;
  }

  const ownerAddressNormalized = normalizeAddress(ownerAddress);
  const ownerAddressTopic = addressToTopic(ownerAddressNormalized) as `0x${string}`;
  const transferTopic = ERC20_TRANSFER_TOPIC as `0x${string}`;
  const transfersByLogKey = new Map<string, InsightTransferItem>();

  const blockRanges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += RPC_LOG_BLOCK_CHUNK_SIZE) {
    const toBlockCandidate = fromBlock + RPC_LOG_BLOCK_CHUNK_SIZE - 1n;
    blockRanges.push({
      fromBlock,
      toBlock: toBlockCandidate > latestBlock ? latestBlock : toBlockCandidate,
    });
  }

  const logBatchSize = 30;
  for (let index = 0; index < blockRanges.length; index += logBatchSize) {
    const batch = blockRanges.slice(index, index + logBatchSize);
    const batchLogs = await Promise.all(
      batch.map(async ({ fromBlock, toBlock }) => {
        const [outboundLogs, inboundLogs] = await Promise.all([
          eth_getLogs(rpcRequest, {
            address: contractAddress as `0x${string}`,
            fromBlock,
            toBlock,
            topics: [transferTopic, ownerAddressTopic],
          }),
          eth_getLogs(rpcRequest, {
            address: contractAddress as `0x${string}`,
            fromBlock,
            toBlock,
            topics: [transferTopic, null, ownerAddressTopic],
          }),
        ]);
        return [...outboundLogs, ...inboundLogs];
      }),
    );

    for (const logs of batchLogs) {
      for (const log of logs) {
        const topics = Array.isArray(log?.topics) ? log.topics : [];
        const topic0 = String(topics[0] || '').trim().toLowerCase();
        if (topic0 !== ERC20_TRANSFER_TOPIC) continue;

        const fromAddress = normalizeAddress(extractAddressFromTopic(topics[1]));
        const toAddress = normalizeAddress(extractAddressFromTopic(topics[2]));
        if (!isWalletAddress(fromAddress) || !isWalletAddress(toAddress)) continue;
        if (fromAddress !== ownerAddressNormalized && toAddress !== ownerAddressNormalized) continue;

        const txHash = normalizeHash(log?.transactionHash);
        if (!isTransactionHash(txHash)) continue;

        const blockNumber = typeof log?.blockNumber === 'bigint' ? log.blockNumber : null;
        if (blockNumber == null || blockNumber < 0n) continue;

        const amountRaw = parseHexAmountToRawString(log?.data);
        const logIndex = Number(log?.logIndex || 0);
        const dedupeKey = `${txHash}:${blockNumber.toString()}:${String(logIndex)}:${fromAddress}:${toAddress}:${amountRaw}`;
        if (transfersByLogKey.has(dedupeKey)) continue;

        transfersByLogKey.set(dedupeKey, {
          from_address: fromAddress,
          to_address: toAddress,
          contract_address: normalizeAddress(contractAddress),
          block_number: blockNumber.toString(),
          block_timestamp: '',
          transaction_hash: txHash,
          log_index: logIndex,
          transfer_type: 'transfer',
          chain_id: chainConfig.chainId,
          token_type: 'erc20',
          amount: amountRaw,
        });
      }
    }
  }

  const items = Array.from(transfersByLogKey.values())
    .sort((a, b) => {
      const aBlock = parseRawAmountToBigInt(a.block_number || '0');
      const bBlock = parseRawAmountToBigInt(b.block_number || '0');
      if (aBlock !== bBlock) {
        return aBlock > bBlock ? -1 : 1;
      }
      const aLogIndex = Number(a.log_index || 0);
      const bLogIndex = Number(b.log_index || 0);
      if (aLogIndex !== bLogIndex) {
        return bLogIndex - aLogIndex;
      }
      return String(b.transaction_hash || '').localeCompare(String(a.transaction_hash || ''));
    });

  return {
    items,
  };
};

const populateTransferBlockTimestamps = async ({
  chainConfig,
  transfers,
}: {
  chainConfig: ChainConfig;
  transfers: Array<{ blockNumber: string; blockTimestamp: string }>;
}) => {
  if (!Array.isArray(transfers) || transfers.length === 0) return;

  const blockNumbers = Array.from(
    new Set(
      transfers
        .map((item) => String(item?.blockNumber || '').trim())
        .filter((item) => /^\d+$/.test(item)),
    ),
  );
  if (blockNumbers.length === 0) return;

  const secretKey = String(process.env.THIRDWEB_SECRET_KEY || '').trim();
  if (!secretKey) return;

  const thirdwebClient = createThirdwebClient({ secretKey });
  const rpcRequest = getRpcClient({
    client: thirdwebClient,
    chain: resolveThirdwebChainByName(chainConfig.chain),
  });
  const blockTimestampMap = new Map<string, string>();

  const timestampBatchSize = 20;
  for (let index = 0; index < blockNumbers.length; index += timestampBatchSize) {
    const batch = blockNumbers.slice(index, index + timestampBatchSize);
    const entries = await Promise.all(
      batch.map(async (blockNumberText) => {
        const block = await eth_getBlockByNumber(rpcRequest, {
          blockNumber: BigInt(blockNumberText),
          includeTransactions: false,
        });
        const timestamp = typeof block?.timestamp === 'bigint' ? Number(block.timestamp) : 0;
        const isoTimestamp = Number.isFinite(timestamp) && timestamp > 0
          ? new Date(timestamp * 1000).toISOString()
          : '';
        return {
          blockNumberText,
          isoTimestamp,
        };
      }),
    );
    for (const entry of entries) {
      blockTimestampMap.set(entry.blockNumberText, entry.isoTimestamp);
    }
  }

  for (const transfer of transfers) {
    const blockNumber = String(transfer?.blockNumber || '').trim();
    transfer.blockTimestamp = blockTimestampMap.get(blockNumber) || transfer.blockTimestamp || '';
  }
};

const serializeUnclassifiedOutRecoveryHistory = ({
  item,
  fallbackChain,
  fallbackTokenContractAddress,
  fallbackTokenDecimals,
}: {
  item: SellerEscrowUnclassifiedOutRecoveryHistoryDoc;
  fallbackChain: ChainConfig['chain'];
  fallbackTokenContractAddress: string;
  fallbackTokenDecimals: number;
}): SerializedUnclassifiedOutRecoveryHistory => ({
  id: String(item?._id || ''),
  sellerId: Number(item?.sellerId || 0),
  sellerNickname: String(item?.sellerNickname || ''),
  sellerWalletAddress: String(item?.sellerWalletAddress || ''),
  sellerEscrowWalletAddress: String(item?.sellerEscrowWalletAddress || ''),
  chain: normalizeSupportedChain(item?.chain, fallbackChain),
  tokenSymbol: String(item?.tokenSymbol || 'USDT'),
  tokenContractAddress: String(item?.tokenContractAddress || fallbackTokenContractAddress),
  tokenDecimals: Number.isFinite(Number(item?.tokenDecimals))
    ? Number(item?.tokenDecimals)
    : fallbackTokenDecimals,
  sourceCaseType: String(item?.sourceCaseType || ''),
  sourceDirection: String(item?.sourceDirection || ''),
  sourceTransactionHash: normalizeHash(item?.sourceTransactionHash),
  sourceBlockTimestamp: String(item?.sourceBlockTimestamp || ''),
  sourceFromAddress: normalizeAddress(item?.sourceFromAddress),
  sourceToAddress: normalizeAddress(item?.sourceToAddress),
  sourceAmountRaw: String(item?.sourceAmountRaw || '0'),
  sourceAmountFormatted: String(item?.sourceAmountFormatted || '0'),
  toAddressIsThirdwebServerWallet: Boolean(item?.toAddressIsThirdwebServerWallet),
  recoveryFromWalletAddress: normalizeAddress(item?.recoveryFromWalletAddress),
  recoveryToWalletAddress: normalizeAddress(item?.recoveryToWalletAddress),
  recoveryAmountRaw: String(item?.recoveryAmountRaw || '0'),
  recoveryAmountFormatted: String(item?.recoveryAmountFormatted || '0'),
  status: normalizeRecoveryStatus(item?.status || 'QUEUED'),
  recoveryTransactionId: String(item?.recoveryTransactionId || ''),
  recoveryTransactionHash: normalizeHash(item?.recoveryTransactionHash),
  onchainStatus: String(item?.onchainStatus || ''),
  error: normalizeErrorText(item?.error),
  requestedByWalletAddress: normalizeAddress(item?.requestedByWalletAddress),
  requestedByName: String(item?.requestedByName || ''),
  source: String(item?.source || ''),
  createdAt: String(item?.createdAt || ''),
  updatedAt: String(item?.updatedAt || ''),
  confirmedAt: String(item?.confirmedAt || ''),
});

const loadUnclassifiedOutRecoveryHistories = async ({
  sellerEscrowWalletAddress,
  fallbackChain,
  fallbackTokenContractAddress,
  fallbackTokenDecimals,
}: {
  sellerEscrowWalletAddress: string;
  fallbackChain: ChainConfig['chain'];
  fallbackTokenContractAddress: string;
  fallbackTokenDecimals: number;
}) => {
  const mongodbClient = await clientPromise;
  const historyCollection = mongodbClient
    .db(dbName)
    .collection<SellerEscrowUnclassifiedOutRecoveryHistoryDoc>('sellerEscrowUnclassifiedOutRecoveryHistories');

  const normalizedSellerEscrowWalletAddress = normalizeAddress(sellerEscrowWalletAddress);
  const docs = await historyCollection
    .find({
      sellerEscrowWalletAddressNormalized: normalizedSellerEscrowWalletAddress,
    })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();

  const histories = docs.map((item) =>
    serializeUnclassifiedOutRecoveryHistory({
      item,
      fallbackChain,
      fallbackTokenContractAddress,
      fallbackTokenDecimals,
    }),
  );

  const historyBySourceTransactionHash = new Map<string, SerializedUnclassifiedOutRecoveryHistory[]>();
  const summaryMap = new Map<UnclassifiedOutRecoveryStatus, number>();

  for (const historyItem of histories) {
    const sourceTransactionHash = normalizeHash(historyItem.sourceTransactionHash);
    if (isTransactionHash(sourceTransactionHash)) {
      const current = historyBySourceTransactionHash.get(sourceTransactionHash) || [];
      current.push(historyItem);
      historyBySourceTransactionHash.set(sourceTransactionHash, current);
    }

    const currentStatusCount = summaryMap.get(historyItem.status) || 0;
    summaryMap.set(historyItem.status, currentStatusCount + 1);
  }

  const summary = Array.from(summaryMap.entries())
    .map(([status, count]) => ({
      status,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    histories,
    historyBySourceTransactionHash,
    summary,
  };
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const sellerId = String(body?.sellerId || '').trim();
  const page = Math.max(1, Math.floor(Number(body?.page || 1) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(body?.limit || 20) || 20)));

  if (!sellerId) {
    return NextResponse.json(
      {
        error: 'sellerId is required',
      },
      { status: 400 },
    );
  }

  try {
    const sellerResult = await findSellerById(sellerId);
    if (!sellerResult?.seller) {
      return NextResponse.json(
        {
          error: sellerResult?.ambiguous
            ? '동일한 조건의 판매자 후보가 여러 명입니다.'
            : '판매자를 찾지 못했습니다.',
          candidates: sellerResult?.candidates || [],
        },
        { status: 404 },
      );
    }

    const sellerUser = sellerResult.seller;
    const sellerWalletAddress = String(sellerUser?.walletAddress || '').trim();
    const sellerEscrowWalletAddress = resolveSellerEscrowWalletAddress(sellerUser);

    if (!isWalletAddress(sellerWalletAddress)) {
      return NextResponse.json(
        {
          error: '판매자 지갑주소가 올바르지 않습니다.',
        },
        { status: 400 },
      );
    }

    if (!isWalletAddress(sellerEscrowWalletAddress)) {
      return NextResponse.json(
        {
          error: '판매자 에스크로 지갑주소가 설정되어 있지 않습니다.',
        },
        { status: 400 },
      );
    }

    const chainConfig = resolveChainConfig();

    const {
      orderCount,
      buyerEscrowAddressSet,
      hashToRelatedTradesMap,
      counterpartyToRelatedTradesMap,
      tradeIdToOrderPreviewMap,
      earliestOrderCreatedAtUnixSeconds,
    } = await loadOrderContextBySeller({
      sellerWalletAddress,
      sellerEscrowWalletAddress,
    });
    const thirdwebServerWalletResolution = await resolveThirdwebServerWalletAddressSet();
    const thirdwebServerWalletAddressSet = thirdwebServerWalletResolution.addresses;
    const {
      histories: unclassifiedOutRecoveryHistories,
      historyBySourceTransactionHash,
      summary: unclassifiedOutRecoverySummary,
    } = await loadUnclassifiedOutRecoveryHistories({
      sellerEscrowWalletAddress,
      fallbackChain: chainConfig.chain,
      fallbackTokenContractAddress: chainConfig.usdtContractAddress,
      fallbackTokenDecimals: chainConfig.usdtDecimals,
    });

    const startTimestampCandidates = [
      parseIsoTimestampToUnixSeconds(sellerUser?.createdAt),
      earliestOrderCreatedAtUnixSeconds,
      ...unclassifiedOutRecoveryHistories
        .map((historyItem) => parseIsoTimestampToUnixSeconds(historyItem.sourceBlockTimestamp))
        .filter((value): value is number => value != null),
    ].filter((value): value is number => value != null);
    const startTimestampUnixSeconds = startTimestampCandidates.length > 0
      ? Math.min(...startTimestampCandidates)
      : null;

    const allTransfersResponse = await fetchAllSellerEscrowTransfers({
      chainConfig,
      ownerAddress: sellerEscrowWalletAddress,
      contractAddress: chainConfig.usdtContractAddress,
      startTimestampUnixSeconds,
    });

    const sellerEscrowWalletAddressLower = normalizeAddress(sellerEscrowWalletAddress);
    const sellerWalletAddressLower = normalizeAddress(sellerWalletAddress);

    const transferItems = allTransfersResponse.items;
    const allTransfers = transferItems.map((item) => {
      const fromAddress = normalizeAddress(item.from_address);
      const toAddress = normalizeAddress(item.to_address);
      const direction: TransferDirection =
        fromAddress === sellerEscrowWalletAddressLower ? 'OUT' : 'IN';
      const counterpartyAddress = direction === 'OUT' ? toAddress : fromAddress;
      const txHash = normalizeHash(item.transaction_hash);

      const hashRelatedTrades = hashToRelatedTradesMap.get(txHash) || [];
      const counterpartyRelatedTrades = counterpartyToRelatedTradesMap.get(counterpartyAddress) || [];
      const relatedTrades = buildMergedRelatedTrades(hashRelatedTrades, counterpartyRelatedTrades);
      const relatedTradesWithOrder = relatedTrades.map((trade) => ({
        ...trade,
        order: trade.tradeId ? tradeIdToOrderPreviewMap.get(trade.tradeId) || null : null,
      }));

      const caseDetail = classifyTransferCase({
        direction,
        counterpartyAddress,
        sellerWalletAddress: sellerWalletAddressLower,
        buyerEscrowAddressSet,
        relatedTrades: relatedTradesWithOrder,
      });

      const amountRaw = String(item.amount || '0');
      const amountFormatted = formatTokenAmountFromRaw(amountRaw, chainConfig.usdtDecimals);
      const amountRawBigInt = parseRawAmountToBigInt(amountRaw);
      const signedAmountRawBigInt = direction === 'IN' ? amountRawBigInt : amountRawBigInt * -1n;
      const signedAmountRaw = signedAmountRawBigInt.toString();
      const signedAmountFormatted = formatTokenAmountFromRaw(signedAmountRaw, chainConfig.usdtDecimals);
      const toAddressIsThirdwebServerWallet
        = direction === 'OUT' && thirdwebServerWalletAddressSet.has(toAddress);
      const unclassifiedOutRecoveries = historyBySourceTransactionHash.get(txHash) || [];

      return {
        transactionHash: txHash,
        blockNumber: String(item.block_number || ''),
        blockTimestamp: String(item.block_timestamp || ''),
        direction,
        fromAddress,
        toAddress,
        counterpartyAddress,
        amountRaw,
        amountFormatted,
        signedAmountRaw,
        signedAmountFormatted,
        runningBalanceRaw: '0',
        runningBalanceFormatted: '0',
        toAddressIsThirdwebServerWallet,
        transferType: String(item.transfer_type || ''),
        tokenType: String(item.token_type || ''),
        caseType: caseDetail.type,
        caseLabel: caseDetail.label,
        isExpectedFlow: caseDetail.expectedFlow,
        unclassifiedOutRecoveries,
        relatedTrades: relatedTradesWithOrder,
      };
    });

    const transfersAsc = [...allTransfers].reverse();
    let totalInRaw = 0n;
    let totalOutRaw = 0n;
    let runningBalanceRaw = 0n;
    for (const transfer of transfersAsc) {
      const signedAmountRaw = parseRawAmountToBigInt(transfer.signedAmountRaw);
      if (signedAmountRaw > 0n) {
        totalInRaw += signedAmountRaw;
      }
      if (signedAmountRaw < 0n) {
        totalOutRaw += signedAmountRaw * -1n;
      }
      runningBalanceRaw += signedAmountRaw;
      transfer.runningBalanceRaw = runningBalanceRaw.toString();
      transfer.runningBalanceFormatted = formatTokenAmountFromRaw(
        transfer.runningBalanceRaw,
        chainConfig.usdtDecimals,
      );
    }
    const transfersWithRunningBalance = [...transfersAsc].reverse();

    const totalItems = transfersWithRunningBalance.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit;
    const transfers = transfersWithRunningBalance.slice(startIndex, endIndex);
    await populateTransferBlockTimestamps({
      chainConfig,
      transfers,
    });

    const caseSummaryMap = new Map<TransferCaseType, number>();
    for (const transfer of transfersWithRunningBalance) {
      const current = caseSummaryMap.get(transfer.caseType as TransferCaseType) || 0;
      caseSummaryMap.set(transfer.caseType as TransferCaseType, current + 1);
    }
    const caseSummary = Array.from(caseSummaryMap.entries())
      .map(([caseType, count]) => ({
        caseType,
        caseLabel: ESCROW_TRANSFER_CASE_LABELS[caseType],
        count,
      }))
      .sort((a, b) => b.count - a.count);

    const netChangeRaw = totalInRaw - totalOutRaw;
    const outToThirdwebServerWalletCount = transfersWithRunningBalance.filter(
      (item) => item.direction === 'OUT' && item.toAddressIsThirdwebServerWallet,
    ).length;

    return NextResponse.json({
      result: {
        seller: {
          id: Number(sellerUser?.id || 0),
          nickname: String(sellerUser?.nickname || ''),
          storecode: String(sellerUser?.storecode || ''),
          walletAddress: sellerWalletAddress,
          escrowWalletAddress: sellerEscrowWalletAddress,
          matchMode: sellerResult.matchMode,
        },
        chain: chainConfig.chain,
        token: {
          symbol: 'USDT',
          contractAddress: chainConfig.usdtContractAddress,
          decimals: chainConfig.usdtDecimals,
        },
        pagination: {
          page: currentPage,
          limit,
          totalItems,
          totalPages,
        },
        orderContext: {
          orderCount,
          expectedCounterpartyCount: buyerEscrowAddressSet.size + 1, // seller wallet + buyer escrow wallets
        },
        thirdwebServerWalletCheck: {
          enabled: thirdwebServerWalletResolution.enabled,
          source: thirdwebServerWalletResolution.source,
          error: thirdwebServerWalletResolution.error,
          totalServerWalletAddressCount: thirdwebServerWalletResolution.totalServerWalletAddressCount,
          outToServerWalletCount: outToThirdwebServerWalletCount,
        },
        overall: {
          totalInRaw: totalInRaw.toString(),
          totalInFormatted: formatTokenAmountFromRaw(totalInRaw.toString(), chainConfig.usdtDecimals),
          totalOutRaw: totalOutRaw.toString(),
          totalOutFormatted: formatTokenAmountFromRaw(totalOutRaw.toString(), chainConfig.usdtDecimals),
          netChangeRaw: netChangeRaw.toString(),
          netChangeFormatted: formatTokenAmountFromRaw(netChangeRaw.toString(), chainConfig.usdtDecimals),
          runningBalanceRaw: runningBalanceRaw.toString(),
          runningBalanceFormatted: formatTokenAmountFromRaw(runningBalanceRaw.toString(), chainConfig.usdtDecimals),
        },
        caseSummary,
        unclassifiedOutRecoverySummary,
        unclassifiedOutRecoveryHistories,
        transfers,
      },
    });
  } catch (error) {
    console.error('getSellerEscrowTransferHistory failed', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get seller escrow transfer history',
      },
      { status: 500 },
    );
  }
}
