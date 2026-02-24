import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId, type Collection } from 'mongodb';
import { createThirdwebClient, Engine, getContract } from 'thirdweb';
import type { Chain } from 'thirdweb/chains';
import { ethereum, polygon, arbitrum, bsc } from 'thirdweb/chains';
import { balanceOf, transfer } from 'thirdweb/extensions/erc20';

import clientPromise, { dbName } from '@/lib/mongodb';
import { createEngineServerWallet } from '@/lib/engineServerWallet';

type RecoveryStatus = 'REQUESTING' | 'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';

type ChainConfig = {
  chainKey: 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';
  chain: Chain;
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
  transfer_type?: string;
  chain_id?: number;
  token_type?: string;
  amount?: string;
};

type InsightTransferResponse = {
  data?: InsightTransferItem[];
  meta?: {
    page?: number;
    limit?: number;
    total_items?: number;
    total_pages?: number;
  };
  error?: string;
};

type SellerEscrowUnclassifiedOutRecoveryHistoryDoc = {
  _id?: ObjectId;
  sellerId: number;
  sellerNickname: string;
  sellerWalletAddress: string;
  sellerEscrowWalletAddress: string;
  sellerEscrowWalletAddressNormalized: string;
  chain: ChainConfig['chainKey'];
  tokenSymbol: 'USDT';
  tokenContractAddress: string;
  tokenDecimals: number;
  sourceCaseType: 'UNCLASSIFIED_OUT';
  sourceDirection: 'OUT';
  sourceTransactionHash: string;
  sourceTransactionHashNormalized: string;
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
  status: RecoveryStatus;
  recoveryTransactionId: string;
  recoveryTransactionHash: string;
  onchainStatus: string;
  error: string;
  requestedByWalletAddress: string;
  requestedByName: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
};

const COLLECTION_NAME = 'sellerEscrowUnclassifiedOutRecoveryHistories';
const ENGINE_SERVER_WALLET_CACHE_TTL_MS = 5 * 60 * 1000;

let ensureRecoveryHistoryIndexesPromise: Promise<void> | null = null;
let insightClientIdCache = '';
let engineServerWalletAddressCache:
  | {
      fetchedAt: number;
      addresses: Set<string>;
    }
  | null = null;

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const isTransactionHash = (value: string) => /^0x[a-fA-F0-9]{64}$/.test(String(value || '').trim());
const normalizeAddress = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeHash = (value: unknown) => String(value || '').trim().toLowerCase();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseRawAmountToBigInt = (value: unknown): bigint => {
  const normalized = String(value || '').trim();
  if (!/^[-]?\d+$/.test(normalized)) return 0n;
  try {
    return BigInt(normalized);
  } catch {
    return 0n;
  }
};

const toBigIntSafe = (value: unknown): bigint => {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'string' && value.trim()) return BigInt(value.trim());
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return BigInt(Math.floor(value));
    }
  } catch (_error) {
    // ignore parse errors and return zero
  }
  return 0n;
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

const extractInsightErrorMessage = (payload: InsightTransferResponse): string => {
  const errorValue = payload?.error as unknown;

  if (typeof errorValue === 'string' && errorValue.trim()) {
    return errorValue.trim();
  }

  if (errorValue && typeof errorValue === 'object') {
    const errorRecord = errorValue as Record<string, unknown>;
    const message = typeof errorRecord.message === 'string' ? errorRecord.message.trim() : '';
    const issues = Array.isArray(errorRecord.issues) ? errorRecord.issues : [];
    const firstIssue = issues[0];

    if (firstIssue && typeof firstIssue === 'object') {
      const issueRecord = firstIssue as Record<string, unknown>;
      const issueMessage = typeof issueRecord.message === 'string' ? issueRecord.message.trim() : '';
      const path = Array.isArray(issueRecord.path)
        ? issueRecord.path.map((item) => String(item || '').trim()).filter(Boolean).join('.')
        : '';

      if (issueMessage) {
        return path ? `${issueMessage} (${path})` : issueMessage;
      }
    }

    if (message) {
      return message;
    }
  }

  return normalizeErrorText(errorValue);
};

const normalizeStatus = (value: unknown): RecoveryStatus => {
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

const resolveChainConfig = (): ChainConfig => {
  const normalizedChain = String(process.env.NEXT_PUBLIC_CHAIN || 'polygon').trim().toLowerCase();
  if (normalizedChain === 'ethereum') {
    return {
      chainKey: 'ethereum',
      chain: ethereum,
      chainId: 1,
      usdtContractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      usdtDecimals: 6,
    };
  }
  if (normalizedChain === 'arbitrum') {
    return {
      chainKey: 'arbitrum',
      chain: arbitrum,
      chainId: 42161,
      usdtContractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      usdtDecimals: 6,
    };
  }
  if (normalizedChain === 'bsc') {
    return {
      chainKey: 'bsc',
      chain: bsc,
      chainId: 56,
      usdtContractAddress: '0x55d398326f99059fF775485246999027B3197955',
      usdtDecimals: 18,
    };
  }
  return {
    chainKey: 'polygon',
    chain: polygon,
    chainId: 137,
    usdtContractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    usdtDecimals: 6,
  };
};

const ensureRecoveryHistoryIndexes = async (
  historyCollection: Collection<SellerEscrowUnclassifiedOutRecoveryHistoryDoc>,
) => {
  if (!ensureRecoveryHistoryIndexesPromise) {
    ensureRecoveryHistoryIndexesPromise = Promise.all([
      historyCollection.createIndex({ sellerEscrowWalletAddressNormalized: 1, createdAt: -1 }),
      historyCollection.createIndex({ sourceTransactionHashNormalized: 1, createdAt: -1 }),
      historyCollection.createIndex({ status: 1, updatedAt: -1 }),
      historyCollection.createIndex({ recoveryTransactionId: 1 }),
    ])
      .then(() => undefined)
      .catch((error) => {
        ensureRecoveryHistoryIndexesPromise = null;
        console.error('recoverSellerEscrowUnclassifiedOut: failed to ensure indexes', error);
      });
  }

  await ensureRecoveryHistoryIndexesPromise;
};

const resolveInsightClientId = async (secretKey: string) => {
  if (insightClientIdCache) return insightClientIdCache;

  const fromEnv = String(process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || '').trim();
  if (fromEnv) {
    insightClientIdCache = fromEnv;
    return insightClientIdCache;
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
    console.error('recoverSellerEscrowUnclassifiedOut: failed to resolve insight client id', error);
  }

  return '';
};

const resolveThirdwebServerWalletAddressSet = async (secretKey: string) => {
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
    console.error('recoverSellerEscrowUnclassifiedOut: failed to fetch thirdweb server wallets', error);
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

const fetchSellerEscrowTransfers = async ({
  clientId,
  chainId,
  ownerAddress,
  contractAddress,
  page,
  limit,
}: {
  clientId: string;
  chainId: number;
  ownerAddress: string;
  contractAddress: string;
  page: number;
  limit: number;
}) => {
  const params = new URLSearchParams();
  params.append('chain_id', String(chainId));
  params.append('limit', String(limit));
  params.append('page', String(page));
  params.append('block_timestamp_from', '1');
  params.append('owner_address', ownerAddress);
  params.append('contract_address', contractAddress);
  params.append('token_types', 'erc20');
  params.append('sort_order', 'desc');

  const response = await fetch(
    `https://insight.thirdweb.com/v1/tokens/transfers?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        'x-client-id': clientId,
      },
      cache: 'no-store',
    },
  );

  const payload = (await response.json().catch(() => ({}))) as InsightTransferResponse;
  if (!response.ok) {
    const errorMessage = extractInsightErrorMessage(payload)
      || 'Failed to fetch escrow transfers from thirdweb insight';
    throw new Error(errorMessage);
  }
  return payload;
};

const fetchAllSellerEscrowTransfers = async ({
  clientId,
  chainId,
  ownerAddress,
  contractAddress,
}: {
  clientId: string;
  chainId: number;
  ownerAddress: string;
  contractAddress: string;
}) => {
  const insightFetchLimit = 100;
  const firstPage = await fetchSellerEscrowTransfers({
    clientId,
    chainId,
    ownerAddress,
    contractAddress,
    page: 0,
    limit: insightFetchLimit,
  });

  const firstPageData = Array.isArray(firstPage?.data) ? firstPage.data : [];
  const totalPagesFromMeta = Number(firstPage?.meta?.total_pages || 0);
  const totalPages = Math.max(1, Number.isFinite(totalPagesFromMeta) ? totalPagesFromMeta : 1);
  const pageDataMap = new Map<number, InsightTransferItem[]>();
  pageDataMap.set(0, firstPageData);

  const pageNumbers = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 1);
  const batchSize = 5;
  for (let index = 0; index < pageNumbers.length; index += batchSize) {
    const batch = pageNumbers.slice(index, index + batchSize);
    const responses = await Promise.all(
      batch.map(async (pageNumber) => {
        const pageResponse = await fetchSellerEscrowTransfers({
          clientId,
          chainId,
          ownerAddress,
          contractAddress,
          page: pageNumber,
          limit: insightFetchLimit,
        });
        return {
          pageNumber,
          data: Array.isArray(pageResponse?.data) ? pageResponse.data : [],
        };
      }),
    );

    for (const response of responses) {
      pageDataMap.set(response.pageNumber, response.data);
    }
  }

  const items: InsightTransferItem[] = [];
  for (let pageNumber = 0; pageNumber < totalPages; pageNumber += 1) {
    items.push(...(pageDataMap.get(pageNumber) || []));
  }

  return {
    items,
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

const findSellerByWalletAndEscrow = async ({
  sellerWalletAddress,
  sellerEscrowWalletAddress,
}: {
  sellerWalletAddress: string;
  sellerEscrowWalletAddress: string;
}) => {
  const mongodbClient = await clientPromise;
  const usersCollection = mongodbClient.db(dbName).collection('users');

  const walletRegex = {
    $regex: `^${escapeRegExp(sellerWalletAddress)}$`,
    $options: 'i',
  };

  const escrowRegex = {
    $regex: `^${escapeRegExp(sellerEscrowWalletAddress)}$`,
    $options: 'i',
  };

  return usersCollection.findOne(
    {
      storecode: 'admin',
      seller: { $exists: true },
      walletAddress: walletRegex,
      $or: [
        { 'seller.escrowWalletAddress': escrowRegex },
        { 'seller.escrowWallet.smartAccountAddress': escrowRegex },
      ],
    },
    {
      projection: {
        _id: 1,
        id: 1,
        nickname: 1,
        walletAddress: 1,
        seller: 1,
      },
    },
  );
};

const loadOrderValidationContextBySeller = async ({
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
          escrowTransactionHash: 1,
          transactionHash: 1,
          buyer: 1,
          seller: 1,
          escrowWallet: 1,
        },
      },
    )
    .toArray();

  const buyerEscrowAddressSet = new Set<string>();
  const orderHashSet = new Set<string>();

  const registerHash = (value: unknown) => {
    const normalized = normalizeHash(value);
    if (!isTransactionHash(normalized)) return;
    orderHashSet.add(normalized);
  };

  for (const order of orders) {
    const buyerEscrowCandidates = [
      order?.buyer?.escrowWalletAddress,
      order?.escrowWallet?.address,
    ];

    for (const addressCandidate of buyerEscrowCandidates) {
      const normalizedAddress = normalizeAddress(addressCandidate);
      if (!isWalletAddress(normalizedAddress)) continue;
      buyerEscrowAddressSet.add(normalizedAddress);
    }

    registerHash(order?.buyer?.lockTransactionHash);
    registerHash(order?.seller?.lockTransactionHash);
    registerHash(order?.escrowTransactionHash);
    registerHash(order?.transactionHash);
  }

  return {
    orderCount: orders.length,
    buyerEscrowAddressSet,
    orderHashSet,
  };
};

const serializeHistory = (item: SellerEscrowUnclassifiedOutRecoveryHistoryDoc) => ({
  id: String(item?._id || ''),
  sellerId: Number(item?.sellerId || 0),
  sellerNickname: String(item?.sellerNickname || ''),
  sellerWalletAddress: String(item?.sellerWalletAddress || ''),
  sellerEscrowWalletAddress: String(item?.sellerEscrowWalletAddress || ''),
  chain: String(item?.chain || 'polygon'),
  tokenSymbol: String(item?.tokenSymbol || 'USDT'),
  tokenContractAddress: String(item?.tokenContractAddress || ''),
  tokenDecimals: Number(item?.tokenDecimals || 6),
  sourceCaseType: String(item?.sourceCaseType || ''),
  sourceDirection: String(item?.sourceDirection || ''),
  sourceTransactionHash: String(item?.sourceTransactionHash || ''),
  sourceBlockTimestamp: String(item?.sourceBlockTimestamp || ''),
  sourceFromAddress: String(item?.sourceFromAddress || ''),
  sourceToAddress: String(item?.sourceToAddress || ''),
  sourceAmountRaw: String(item?.sourceAmountRaw || '0'),
  sourceAmountFormatted: String(item?.sourceAmountFormatted || '0'),
  toAddressIsThirdwebServerWallet: Boolean(item?.toAddressIsThirdwebServerWallet),
  recoveryFromWalletAddress: String(item?.recoveryFromWalletAddress || ''),
  recoveryToWalletAddress: String(item?.recoveryToWalletAddress || ''),
  recoveryAmountRaw: String(item?.recoveryAmountRaw || '0'),
  recoveryAmountFormatted: String(item?.recoveryAmountFormatted || '0'),
  status: normalizeStatus(item?.status || 'QUEUED'),
  recoveryTransactionId: String(item?.recoveryTransactionId || ''),
  recoveryTransactionHash: String(item?.recoveryTransactionHash || ''),
  onchainStatus: String(item?.onchainStatus || ''),
  error: String(item?.error || ''),
  requestedByWalletAddress: String(item?.requestedByWalletAddress || ''),
  requestedByName: String(item?.requestedByName || ''),
  source: String(item?.source || ''),
  createdAt: String(item?.createdAt || ''),
  updatedAt: String(item?.updatedAt || ''),
  confirmedAt: String(item?.confirmedAt || ''),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const sellerWalletAddress = String(body?.sellerWalletAddress || '').trim();
  const sellerEscrowWalletAddress = String(body?.sellerEscrowWalletAddress || '').trim();

  const sourceCaseType = String(body?.sourceCaseType || '').trim().toUpperCase();
  const sourceDirection = String(body?.sourceDirection || '').trim().toUpperCase();
  const sourceTransactionHash = normalizeHash(body?.sourceTransactionHash);
  const sourceBlockTimestamp = String(body?.sourceBlockTimestamp || '').trim();
  const sourceFromAddress = normalizeAddress(body?.sourceFromAddress);
  const sourceToAddress = normalizeAddress(body?.sourceToAddress);
  const sourceAmountRaw = String(body?.sourceAmountRaw || '').trim();
  const sourceAmountRawBigInt = parseRawAmountToBigInt(sourceAmountRaw);

  const requestedByWalletAddress = String(body?.requestedByWalletAddress || '').trim();
  const requestedByName = String(body?.requestedByName || '').trim();

  if (!isWalletAddress(sellerWalletAddress)) {
    return NextResponse.json({ error: 'sellerWalletAddress is invalid' }, { status: 400 });
  }
  if (!isWalletAddress(sellerEscrowWalletAddress)) {
    return NextResponse.json({ error: 'sellerEscrowWalletAddress is invalid' }, { status: 400 });
  }
  if (sourceCaseType !== 'UNCLASSIFIED_OUT') {
    return NextResponse.json({ error: 'UNCLASSIFIED_OUT case only' }, { status: 400 });
  }
  if (sourceDirection !== 'OUT') {
    return NextResponse.json({ error: 'OUT direction only' }, { status: 400 });
  }
  if (!isTransactionHash(sourceTransactionHash)) {
    return NextResponse.json({ error: 'sourceTransactionHash is invalid' }, { status: 400 });
  }
  if (!isWalletAddress(sourceFromAddress)) {
    return NextResponse.json({ error: 'sourceFromAddress is invalid' }, { status: 400 });
  }
  if (!isWalletAddress(sourceToAddress)) {
    return NextResponse.json({ error: 'sourceToAddress is invalid' }, { status: 400 });
  }
  if (sourceAmountRawBigInt <= 0n) {
    return NextResponse.json({ error: 'sourceAmountRaw must be a positive integer string' }, { status: 400 });
  }

  const sellerEscrowWalletAddressLower = normalizeAddress(sellerEscrowWalletAddress);
  const sellerWalletAddressLower = normalizeAddress(sellerWalletAddress);

  if (sourceFromAddress !== sellerEscrowWalletAddressLower) {
    return NextResponse.json(
      { error: 'sourceFromAddress must match seller escrow wallet address' },
      { status: 400 },
    );
  }

  const secretKey = String(process.env.THIRDWEB_SECRET_KEY || '').trim();
  if (!secretKey) {
    return NextResponse.json({ error: 'THIRDWEB_SECRET_KEY is not configured' }, { status: 500 });
  }

  const chainConfig = resolveChainConfig();

  const mongodbClient = await clientPromise;
  const historyCollection = mongodbClient
    .db(dbName)
    .collection<SellerEscrowUnclassifiedOutRecoveryHistoryDoc>(COLLECTION_NAME);
  await ensureRecoveryHistoryIndexes(historyCollection);

  const seller = await findSellerByWalletAndEscrow({
    sellerWalletAddress,
    sellerEscrowWalletAddress,
  });

  if (!seller) {
    return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
  }

  const sellerEscrowWalletAddressFromDb = resolveSellerEscrowWalletAddress(seller);
  if (!isWalletAddress(sellerEscrowWalletAddressFromDb)) {
    return NextResponse.json({ error: 'Seller escrow wallet is not configured' }, { status: 400 });
  }

  const sellerEscrowWalletAddressFromDbLower = normalizeAddress(sellerEscrowWalletAddressFromDb);
  if (sellerEscrowWalletAddressFromDbLower !== sellerEscrowWalletAddressLower) {
    return NextResponse.json(
      { error: 'sellerEscrowWalletAddress does not match seller data' },
      { status: 400 },
    );
  }

  const sellerWalletAddressFromDb = String(seller?.walletAddress || '').trim();
  if (!isWalletAddress(sellerWalletAddressFromDb)) {
    return NextResponse.json({ error: 'Seller wallet address is invalid in DB' }, { status: 400 });
  }

  const sellerWalletAddressFromDbLower = normalizeAddress(sellerWalletAddressFromDb);
  if (sellerWalletAddressFromDbLower !== sellerWalletAddressLower) {
    return NextResponse.json(
      { error: 'sellerWalletAddress does not match seller data' },
      { status: 400 },
    );
  }

  const thirdwebServerWalletResolution = await resolveThirdwebServerWalletAddressSet(secretKey);
  if (!thirdwebServerWalletResolution.enabled) {
    return NextResponse.json(
      {
        error: `thirdweb server wallet check unavailable (${thirdwebServerWalletResolution.error || 'unknown'})`,
      },
      { status: 500 },
    );
  }

  if (!thirdwebServerWalletResolution.addresses.has(sourceToAddress)) {
    return NextResponse.json(
      {
        error: 'sourceToAddress is not a recognized thirdweb server wallet',
      },
      { status: 400 },
    );
  }

  const insightClientId = await resolveInsightClientId(secretKey);
  if (!insightClientId) {
    return NextResponse.json({ error: 'thirdweb insight client id is not configured' }, { status: 500 });
  }

  const allTransfersResponse = await fetchAllSellerEscrowTransfers({
    clientId: insightClientId,
    chainId: chainConfig.chainId,
    ownerAddress: sellerEscrowWalletAddressFromDb,
    contractAddress: chainConfig.usdtContractAddress,
  });

  const matchedTransfer = allTransfersResponse.items.find((item) => {
    const itemHash = normalizeHash(item.transaction_hash);
    const itemFromAddress = normalizeAddress(item.from_address);
    const itemToAddress = normalizeAddress(item.to_address);
    const itemAmountRaw = String(item.amount || '').trim();
    return (
      itemHash === sourceTransactionHash
      && itemFromAddress === sellerEscrowWalletAddressLower
      && itemToAddress === sourceToAddress
      && itemAmountRaw === sourceAmountRaw
    );
  });

  if (!matchedTransfer) {
    return NextResponse.json(
      {
        error: '원본 미분류 출금 트랜잭션을 찾지 못했습니다.',
      },
      { status: 404 },
    );
  }

  const orderContext = await loadOrderValidationContextBySeller({
    sellerWalletAddress: sellerWalletAddressFromDb,
    sellerEscrowWalletAddress: sellerEscrowWalletAddressFromDb,
  });

  if (sourceToAddress === sellerWalletAddressFromDbLower) {
    return NextResponse.json(
      { error: '판매자 지갑으로 출금된 건은 미분류 출금 회수 대상이 아닙니다.' },
      { status: 400 },
    );
  }

  if (orderContext.buyerEscrowAddressSet.has(sourceToAddress)) {
    return NextResponse.json(
      { error: '구매 에스크로 지갑으로 출금된 건은 미분류 출금 회수 대상이 아닙니다.' },
      { status: 400 },
    );
  }

  if (orderContext.orderHashSet.has(sourceTransactionHash)) {
    return NextResponse.json(
      { error: '주문 해시와 매칭된 트랜잭션은 미분류 출금 회수 대상이 아닙니다.' },
      { status: 400 },
    );
  }

  const duplicateBaseFilter = {
    sourceTransactionHashNormalized: sourceTransactionHash,
    sellerEscrowWalletAddressNormalized: sellerEscrowWalletAddressLower,
  };

  const existingConfirmed = await historyCollection.findOne({
    ...duplicateBaseFilter,
    status: 'CONFIRMED',
  });
  if (existingConfirmed) {
    return NextResponse.json(
      {
        error: '이미 회수 완료된 트랜잭션입니다.',
        result: {
          history: serializeHistory(existingConfirmed),
        },
      },
      { status: 409 },
    );
  }

  const existingPending = await historyCollection.findOne({
    ...duplicateBaseFilter,
    status: { $in: ['REQUESTING', 'QUEUED', 'SUBMITTED'] },
  });
  if (existingPending) {
    return NextResponse.json(
      {
        error: '이미 회수 진행중인 트랜잭션입니다.',
        result: {
          history: serializeHistory(existingPending),
        },
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const sourceAmountFormatted = formatTokenAmountFromRaw(sourceAmountRaw, chainConfig.usdtDecimals);

  const historyDoc: SellerEscrowUnclassifiedOutRecoveryHistoryDoc = {
    sellerId: Number(seller?.id || 0),
    sellerNickname: String(seller?.nickname || ''),
    sellerWalletAddress: sellerWalletAddressFromDbLower,
    sellerEscrowWalletAddress: sellerEscrowWalletAddressFromDbLower,
    sellerEscrowWalletAddressNormalized: sellerEscrowWalletAddressFromDbLower,
    chain: chainConfig.chainKey,
    tokenSymbol: 'USDT',
    tokenContractAddress: chainConfig.usdtContractAddress,
    tokenDecimals: chainConfig.usdtDecimals,
    sourceCaseType: 'UNCLASSIFIED_OUT',
    sourceDirection: 'OUT',
    sourceTransactionHash,
    sourceTransactionHashNormalized: sourceTransactionHash,
    sourceBlockTimestamp: sourceBlockTimestamp || String(matchedTransfer?.block_timestamp || ''),
    sourceFromAddress,
    sourceToAddress,
    sourceAmountRaw,
    sourceAmountFormatted,
    toAddressIsThirdwebServerWallet: true,
    recoveryFromWalletAddress: sourceToAddress,
    recoveryToWalletAddress: sellerEscrowWalletAddressFromDbLower,
    recoveryAmountRaw: sourceAmountRaw,
    recoveryAmountFormatted: sourceAmountFormatted,
    status: 'REQUESTING',
    recoveryTransactionId: '',
    recoveryTransactionHash: '',
    onchainStatus: '',
    error: '',
    requestedByWalletAddress: normalizeAddress(requestedByWalletAddress),
    requestedByName,
    source: 'administration/seller-management/escrow-transfer-history',
    createdAt: now,
    updatedAt: now,
  };

  const insertResult = await historyCollection.insertOne(historyDoc);
  const historyId = insertResult.insertedId;

  try {
    const thirdwebClient = createThirdwebClient({ secretKey });
    const contract = getContract({
      client: thirdwebClient,
      chain: chainConfig.chain,
      address: chainConfig.usdtContractAddress,
    });

    const rawBalance = await balanceOf({
      contract,
      address: sourceToAddress,
    });
    const sourceServerWalletRawBalance = toBigIntSafe(rawBalance);

    if (sourceServerWalletRawBalance < sourceAmountRawBigInt) {
      const insufficientBalanceMessage = 'thirdweb 서버지갑 잔고가 부족하여 회수할 수 없습니다.';
      await historyCollection.updateOne(
        { _id: historyId },
        {
          $set: {
            status: 'FAILED',
            error: insufficientBalanceMessage,
            updatedAt: new Date().toISOString(),
          },
        },
      );
      return NextResponse.json(
        {
          error: insufficientBalanceMessage,
        },
        { status: 400 },
      );
    }

    const recoveryWallet = await createEngineServerWallet({
      client: thirdwebClient,
      walletAddress: sourceToAddress,
      chain: chainConfig.chain,
    });

    const recoveryTransferTx = transfer({
      contract,
      to: sellerEscrowWalletAddressFromDb,
      amount: sourceAmountFormatted,
    });

    const { transactionId } = await recoveryWallet.enqueueTransaction({
      transaction: recoveryTransferTx,
    });

    let status: RecoveryStatus = 'QUEUED';
    let onchainStatus = '';
    let recoveryTransactionHash = '';
    let executionError = '';

    try {
      const executionResult = await Engine.getTransactionStatus({
        client: thirdwebClient,
        transactionId,
      });
      status = normalizeStatus(executionResult?.status || 'QUEUED');
      onchainStatus =
        executionResult && typeof executionResult === 'object' && 'onchainStatus' in executionResult
          ? String(executionResult.onchainStatus || '')
          : '';
      recoveryTransactionHash =
        executionResult && typeof executionResult === 'object' && 'transactionHash' in executionResult
          ? String(executionResult.transactionHash || '').trim()
          : '';
      executionError =
        executionResult && typeof executionResult === 'object' && 'error' in executionResult
          ? normalizeErrorText(executionResult.error)
          : '';
    } catch {
      status = 'QUEUED';
    }

    const updatedAt = new Date().toISOString();
    await historyCollection.updateOne(
      { _id: historyId },
      {
        $set: {
          status,
          recoveryTransactionId: transactionId,
          recoveryTransactionHash: normalizeHash(recoveryTransactionHash),
          onchainStatus,
          error: executionError,
          updatedAt,
          ...(status === 'CONFIRMED' ? { confirmedAt: updatedAt } : {}),
        },
      },
    );

    const updatedHistory = await historyCollection.findOne({ _id: historyId });

    return NextResponse.json({
      result: {
        history: serializeHistory(updatedHistory || historyDoc),
        thirdwebServerWalletCheck: {
          enabled: thirdwebServerWalletResolution.enabled,
          source: thirdwebServerWalletResolution.source,
          error: thirdwebServerWalletResolution.error,
          totalServerWalletAddressCount: thirdwebServerWalletResolution.totalServerWalletAddressCount,
        },
        orderContext: {
          orderCount: orderContext.orderCount,
          buyerEscrowWalletCount: orderContext.buyerEscrowAddressSet.size,
        },
      },
    });
  } catch (error) {
    const normalizedError = normalizeErrorText(error);
    await historyCollection.updateOne(
      { _id: historyId },
      {
        $set: {
          status: 'FAILED',
          error: normalizedError || 'failed to recover unclassified out transfer',
          updatedAt: new Date().toISOString(),
        },
      },
    );

    console.error('recoverSellerEscrowUnclassifiedOut failed', {
      sellerWalletAddress,
      sellerEscrowWalletAddress,
      sourceTransactionHash,
      sourceToAddress,
      error,
    });

    return NextResponse.json(
      {
        error: '미분류 출금 회수에 실패했습니다.',
        detail: normalizedError || 'unknown error',
      },
      { status: 500 },
    );
  }
}
