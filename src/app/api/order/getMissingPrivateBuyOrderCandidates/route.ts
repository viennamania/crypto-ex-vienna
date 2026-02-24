import { NextResponse, type NextRequest } from 'next/server';
import { createThirdwebClient, Engine } from 'thirdweb';
import { createHash } from 'crypto';

import clientPromise, { dbName } from '@/lib/mongodb';
import {
  chain as configuredChain,
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from '@/app/config/contractAddresses';

export const runtime = 'nodejs';
export const maxDuration = 300;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_ENGINE_PAGE_SIZE = 100;
const DEFAULT_ENGINE_MAX_PAGES = 8;
const DEFAULT_MAX_CANDIDATES = 200;
const DEFAULT_MAX_EXCLUDED_CANDIDATES = 1000;
const DEFAULT_ENGINE_RETRY_ATTEMPTS = 3;
const ENGINE_RETRY_BASE_DELAY_MS = 500;
const PRIVATE_BUY_WALLET_CACHE_COLLECTION = 'engine_private_buy_wallet_cache';
const PRIVATE_BUY_WALLET_CACHE_STALE_MS = 10 * 60 * 1000;
const PRIVATE_BUY_WALLET_CACHE_INDEX_KIND_CACHE_KEY = 'idx_kind_cacheKey';
const PRIVATE_BUY_WALLET_CACHE_INDEX_KIND_LAST_SYNCED_AT = 'idx_kind_lastSyncedAt';
const ENGINE_TX_SEARCH_CACHE_COLLECTION = 'engine_tx_search_cache';
const ENGINE_TX_SEARCH_CACHE_INDEX_KIND_CACHE_KEY = 'idx_kind_cacheKey';
const ENGINE_TX_SEARCH_CACHE_INDEX_KIND_EXPIRES_AT = 'idx_kind_expiresAt';
const ENGINE_TX_SEARCH_CACHE_INDEX_KIND_CHAIN_CHUNK_PAGE = 'idx_kind_chain_chunk_page';

let privateBuyWalletCacheIndexesEnsured = false;
let privateBuyWalletCacheIndexPromise: Promise<void> | null = null;
let engineTxSearchCacheIndexesEnsured = false;
let engineTxSearchCacheIndexPromise: Promise<void> | null = null;

const isWalletAddress = (value: unknown) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const isTransactionHash = (value: unknown) => /^0x[a-fA-F0-9]{64}$/.test(String(value || '').trim());
const normalizeAddress = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeHash = (value: unknown) => String(value || '').trim().toLowerCase();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const roundDownUsdtSix = (value: number) =>
  Math.floor((Number(value || 0) + Number.EPSILON) * 1_000_000) / 1_000_000;

const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(ms))));

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const toPositiveIntegerOrDefault = (value: unknown, fallback: number, maxValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(maxValue, Math.floor(numeric));
};

const chunkArray = <T,>(items: T[], chunkSize: number) => {
  if (chunkSize <= 0) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    result.push(items.slice(i, i + chunkSize));
  }
  return result;
};

const normalizeLookbackDays = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LOOKBACK_DAYS;
  if (numeric <= 1) return 1;
  if (numeric <= 7) return 7;
  if (numeric <= 30) return 30;
  if (numeric <= 90) return 90;
  return 180;
};

const resolveChainConfig = () => {
  const currentChain = String(configuredChain || process.env.NEXT_PUBLIC_CHAIN || 'polygon').trim().toLowerCase();
  if (currentChain === 'ethereum') {
    return {
      chain: 'ethereum',
      chainId: '1',
      usdtContractAddress: ethereumContractAddressUSDT,
      usdtDecimals: 6,
    };
  }
  if (currentChain === 'arbitrum') {
    return {
      chain: 'arbitrum',
      chainId: '42161',
      usdtContractAddress: arbitrumContractAddressUSDT,
      usdtDecimals: 6,
    };
  }
  if (currentChain === 'bsc') {
    return {
      chain: 'bsc',
      chainId: '56',
      usdtContractAddress: bscContractAddressUSDT,
      usdtDecimals: 18,
    };
  }
  return {
    chain: 'polygon',
    chainId: '137',
    usdtContractAddress: polygonContractAddressUSDT,
    usdtDecimals: 6,
  };
};

const parseJsonMaybe = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = parseJsonMaybe(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  }
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const resolveTxFromAddress = (transaction: Record<string, unknown>) => {
  const executionParams = toRecord(transaction.executionParams);
  const candidates = [
    transaction.from,
    executionParams?.from,
    executionParams?.smartAccountAddress,
    executionParams?.signerAddress,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (isWalletAddress(normalized)) {
      return normalized;
    }
  }
  return '';
};

const isEngineExecutionFailed = (executionResult: unknown) => {
  const execution = toRecord(executionResult);
  const status = String(execution?.status || '').trim().toUpperCase();
  if (!status) return false;
  if (status === 'FAILED') return true;
  if (status === 'CONFIRMED') {
    const onchainStatus = String(execution?.onchainStatus || '').trim().toUpperCase();
    if (onchainStatus === 'REVERTED' || onchainStatus === 'FAILED') return true;
  }
  return false;
};

const extractInnerTransactions = (value: unknown): Array<{ to: string; data: string }> => {
  const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new Set<unknown>();
  const collected: Array<{ to: string; data: string }> = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const { value: target, depth } = current;
    if (depth > 6 || target == null) continue;

    if (typeof target === 'string') {
      const parsed = parseJsonMaybe(target);
      if (parsed !== null) {
        queue.push({ value: parsed, depth: depth + 1 });
      }
      continue;
    }

    if (Array.isArray(target)) {
      for (const item of target) {
        queue.push({ value: item, depth: depth + 1 });
      }
      continue;
    }

    if (typeof target !== 'object') continue;
    if (seen.has(target)) continue;
    seen.add(target);

    const record = target as Record<string, unknown>;
    const to = String(record.to || '').trim();
    const data = String(record.data || '').trim();
    if (isWalletAddress(to) && /^0x[a-fA-F0-9]+$/.test(data)) {
      collected.push({ to, data });
    }

    for (const nestedValue of Object.values(record)) {
      if (
        nestedValue
        && (typeof nestedValue === 'object'
          || Array.isArray(nestedValue)
          || typeof nestedValue === 'string')
      ) {
        queue.push({ value: nestedValue, depth: depth + 1 });
      }
    }
  }

  const deduped = new Map<string, { to: string; data: string }>();
  for (const item of collected) {
    const key = `${normalizeAddress(item.to)}:${item.data.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }
  return [...deduped.values()];
};

const decodeErc20TransferCalldata = (calldata: string) => {
  const normalized = String(calldata || '').trim().replace(/^0x/i, '');
  if (normalized.length < 8 + 64 + 64) return null;
  if (!normalized.toLowerCase().startsWith('a9059cbb')) return null;

  const recipientWord = normalized.slice(8, 8 + 64);
  const amountWord = normalized.slice(8 + 64, 8 + 64 + 64);
  if (!recipientWord || !amountWord) return null;

  const recipient = `0x${recipientWord.slice(24)}`;
  if (!isWalletAddress(recipient)) return null;

  try {
    const amountRaw = BigInt(`0x${amountWord}`);
    if (amountRaw <= 0n) return null;
    return {
      recipient,
      amountRaw,
    };
  } catch {
    return null;
  }
};

const convertRawAmountToDisplay = (rawAmount: bigint, decimals: number) => {
  if (rawAmount <= 0n) return 0;
  const safeDecimals = Math.max(0, Math.floor(decimals));
  if (safeDecimals === 0) {
    return roundDownUsdtSix(Number(rawAmount.toString()));
  }

  const denominator = 10n ** BigInt(safeDecimals);
  const whole = rawAmount / denominator;
  const fraction = rawAmount % denominator;
  const fractionText = fraction.toString().padStart(safeDecimals, '0').replace(/0+$/, '');
  const composed = fractionText ? `${whole.toString()}.${fractionText}` : whole.toString();
  const numeric = Number(composed);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return roundDownUsdtSix(numeric);
};

const parsePrivateBuyWalletPrefix = (label: string) => {
  const match = String(label || '').trim().match(/^private-buy-(0x[a-fA-F0-9]{6,8})-/i);
  if (!match?.[1]) return '';
  return match[1].toLowerCase();
};

type PrivateBuyWalletInfo = {
  label: string;
  createdAt: string;
  signerAddress: string;
  smartAccountAddress: string;
  buyerWalletPrefix: string;
};

type LoadPrivateBuyWalletMapResult = {
  walletMap: Map<string, PrivateBuyWalletInfo>;
  walletInfos: PrivateBuyWalletInfo[];
  warning: string;
  queryFailed: boolean;
};

const loadPrivateBuyWalletMap = async (
  {
    client,
    createdAfterIso,
    onPageProgress,
  }: {
    client: ReturnType<typeof createThirdwebClient>;
    createdAfterIso: string;
    onPageProgress?: (payload: {
      page: number;
      totalPages: number;
      accountCount: number;
      mappedWalletCount: number;
    }) => void;
  },
): Promise<LoadPrivateBuyWalletMapResult> => {
  const walletMap = new Map<string, PrivateBuyWalletInfo>();
  const walletInfoByKey = new Map<string, PrivateBuyWalletInfo>();
  const limit = 200;
  let page = 1;
  let queryFailed = false;
  const warnings: string[] = [];

  while (page <= 100) {
    let response: Awaited<ReturnType<typeof Engine.getServerWallets>> | null = null;
    let lastErrorMessage = '';
    for (let attempt = 1; attempt <= DEFAULT_ENGINE_RETRY_ATTEMPTS; attempt += 1) {
      try {
        response = await Engine.getServerWallets({
          client,
          page,
          limit,
        });
        break;
      } catch (error) {
        lastErrorMessage = toErrorMessage(error);
        if (attempt < DEFAULT_ENGINE_RETRY_ATTEMPTS) {
          await waitMs(ENGINE_RETRY_BASE_DELAY_MS * attempt);
        }
      }
    }

    if (!response) {
      queryFailed = true;
      warnings.push(`getServerWallets failed at page=${page}: ${lastErrorMessage || 'unknown error'}`);
      break;
    }

    const accounts = Array.isArray(response?.accounts) ? response.accounts : [];
    for (const account of accounts) {
      const label = String(account?.label || '').trim();
      if (!label.toLowerCase().startsWith('private-buy-')) continue;

      const createdAt = String(account?.createdAt || '').trim();
      if (createdAt && createdAfterIso && createdAt < createdAfterIso) continue;

      const signerAddress = String(account?.address || '').trim();
      const smartAccountAddress = String(account?.smartAccountAddress || '').trim();
      const buyerWalletPrefix = parsePrivateBuyWalletPrefix(label);
      const walletInfo: PrivateBuyWalletInfo = {
        label,
        createdAt,
        signerAddress: isWalletAddress(signerAddress) ? signerAddress : '',
        smartAccountAddress: isWalletAddress(smartAccountAddress) ? smartAccountAddress : '',
        buyerWalletPrefix,
      };

      if (isWalletAddress(walletInfo.smartAccountAddress)) {
        walletMap.set(normalizeAddress(walletInfo.smartAccountAddress), walletInfo);
      }
      if (isWalletAddress(walletInfo.signerAddress)) {
        walletMap.set(normalizeAddress(walletInfo.signerAddress), walletInfo);
      }

      const infoKey = normalizeAddress(walletInfo.signerAddress || walletInfo.smartAccountAddress);
      if (infoKey && !walletInfoByKey.has(infoKey)) {
        walletInfoByKey.set(infoKey, walletInfo);
      }
    }

    const totalCount = Number(response?.pagination?.totalCount || 0);
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : page;
    onPageProgress?.({
      page,
      totalPages,
      accountCount: accounts.length,
      mappedWalletCount: walletMap.size,
    });
    if (page >= totalPages) break;
    page += 1;
  }

  return {
    walletMap,
    walletInfos: [...walletInfoByKey.values()],
    warning: warnings.join(' | '),
    queryFailed,
  };
};

const loadPrivateBuyWalletMapFromCache = async (
  {
    cacheCollection,
    createdAfterIso,
  }: {
    cacheCollection: any;
    createdAfterIso: string;
  },
) => {
  const walletMap = new Map<string, PrivateBuyWalletInfo>();

  const rows = await cacheCollection.find(
    {
      kind: 'private-buy',
      label: { $regex: '^private-buy-', $options: 'i' },
      $or: [
        { createdAt: { $gte: createdAfterIso } },
        { createdAt: { $exists: false } },
        { createdAt: '' },
      ],
    },
    {
      projection: {
        _id: 0,
        label: 1,
        createdAt: 1,
        signerAddress: 1,
        smartAccountAddress: 1,
        buyerWalletPrefix: 1,
      },
    },
  ).toArray();

  for (const row of rows) {
    const walletInfo: PrivateBuyWalletInfo = {
      label: String(row?.label || '').trim(),
      createdAt: String(row?.createdAt || '').trim(),
      signerAddress: isWalletAddress(row?.signerAddress) ? String(row.signerAddress).trim() : '',
      smartAccountAddress: isWalletAddress(row?.smartAccountAddress) ? String(row.smartAccountAddress).trim() : '',
      buyerWalletPrefix: String(row?.buyerWalletPrefix || '').trim(),
    };

    if (!walletInfo.label.toLowerCase().startsWith('private-buy-')) continue;

    if (isWalletAddress(walletInfo.smartAccountAddress)) {
      walletMap.set(normalizeAddress(walletInfo.smartAccountAddress), walletInfo);
    }
    if (isWalletAddress(walletInfo.signerAddress)) {
      walletMap.set(normalizeAddress(walletInfo.signerAddress), walletInfo);
    }
  }

  const latestSyncRow = await cacheCollection.findOne(
    {
      kind: 'private-buy',
    },
    {
      sort: { lastSyncedAt: -1 },
      projection: { _id: 0, lastSyncedAt: 1 },
    },
  );
  const latestSyncedAt = String(latestSyncRow?.lastSyncedAt || '').trim();
  const latestSyncedAtMs = latestSyncedAt ? new Date(latestSyncedAt).getTime() : Number.NaN;
  const cacheIsFresh =
    Number.isFinite(latestSyncedAtMs)
    && (Date.now() - latestSyncedAtMs) <= PRIVATE_BUY_WALLET_CACHE_STALE_MS;

  return {
    walletMap,
    cacheIsFresh,
    lastSyncedAt: latestSyncedAt,
  };
};

const upsertPrivateBuyWalletCache = async (
  {
    cacheCollection,
    walletInfos,
  }: {
    cacheCollection: any;
    walletInfos: PrivateBuyWalletInfo[];
  },
) => {
  if (!Array.isArray(walletInfos) || walletInfos.length === 0) {
    return;
  }

  const syncedAt = new Date().toISOString();
  const operations = walletInfos
    .map((walletInfo) => {
      const signerAddress = String(walletInfo?.signerAddress || '').trim();
      const smartAccountAddress = String(walletInfo?.smartAccountAddress || '').trim();
      const cacheKey = normalizeAddress(signerAddress || smartAccountAddress);
      if (!cacheKey) return null;

      return {
        updateOne: {
          filter: {
            kind: 'private-buy',
            cacheKey,
          },
          update: {
            $set: {
              kind: 'private-buy',
              cacheKey,
              label: String(walletInfo?.label || '').trim(),
              createdAt: String(walletInfo?.createdAt || '').trim(),
              signerAddress: isWalletAddress(signerAddress) ? signerAddress : '',
              smartAccountAddress: isWalletAddress(smartAccountAddress) ? smartAccountAddress : '',
              buyerWalletPrefix: String(walletInfo?.buyerWalletPrefix || '').trim(),
              lastSyncedAt: syncedAt,
              updatedAt: syncedAt,
            },
            $setOnInsert: {
              insertedAt: syncedAt,
            },
          },
          upsert: true,
        },
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

  if (operations.length === 0) {
    return;
  }

  await cacheCollection.bulkWrite(operations, { ordered: false });
};

const ensurePrivateBuyWalletCacheIndexes = async (
  {
    cacheCollection,
  }: {
    cacheCollection: any;
  },
) => {
  if (privateBuyWalletCacheIndexesEnsured) {
    return;
  }

  if (!privateBuyWalletCacheIndexPromise) {
    privateBuyWalletCacheIndexPromise = (async () => {
      await cacheCollection.createIndex(
        { kind: 1, cacheKey: 1 },
        {
          name: PRIVATE_BUY_WALLET_CACHE_INDEX_KIND_CACHE_KEY,
        },
      );

      await cacheCollection.createIndex(
        { kind: 1, lastSyncedAt: -1 },
        {
          name: PRIVATE_BUY_WALLET_CACHE_INDEX_KIND_LAST_SYNCED_AT,
        },
      );
    })();
  }

  try {
    await privateBuyWalletCacheIndexPromise;
    privateBuyWalletCacheIndexesEnsured = true;
  } catch (error) {
    privateBuyWalletCacheIndexPromise = null;
    throw error;
  }
};

type EngineSearchTransferEntry = {
  transactionId: string;
  batchIndex: number;
  transactionHash: string;
  createdAt: string;
  confirmedAt: string;
  fromAddress: string;
  recipient: string;
  rawAmount: string;
  usdtAmount: number;
};

const resolveEngineTxSearchCacheTtlMs = (
  {
    lookbackDays,
    page,
  }: {
    lookbackDays: number;
    page: number;
  },
) => {
  if (lookbackDays <= 2 && page <= 2) return 60 * 1000;
  if (lookbackDays <= 7 && page <= 3) return 2 * 60 * 1000;
  if (lookbackDays <= 30 && page <= 5) return 5 * 60 * 1000;
  return 10 * 60 * 1000;
};

const createAddressChunkHash = (addresses: string[]) => {
  const normalized = addresses
    .map((item) => normalizeAddress(item))
    .filter((item) => isWalletAddress(item))
    .sort();
  return createHash('sha256').update(normalized.join('|')).digest('hex');
};

const createEngineSearchCacheKey = (
  {
    chainId,
    fromChunkHash,
    page,
    pageSize,
  }: {
    chainId: string;
    fromChunkHash: string;
    page: number;
    pageSize: number;
  },
) => `engine-search:v1:${chainId}:${fromChunkHash}:p${page}:s${pageSize}`;

const extractTransferEntriesFromSearchTransactions = (
  {
    transactions,
    normalizedUsdtContractAddress,
    usdtDecimals,
    pageSize,
  }: {
    transactions: Array<Record<string, unknown>>;
    normalizedUsdtContractAddress: string;
    usdtDecimals: number;
    pageSize: number;
  },
) => {
  const transferEntries: EngineSearchTransferEntry[] = [];
  const dedupe = new Set<string>();
  const normalizedPageSize = Math.max(1, Math.floor(Number(pageSize || 0)) || DEFAULT_ENGINE_PAGE_SIZE);

  for (const transaction of transactions) {
    const transactionHash = String(transaction.transactionHash || '').trim();
    if (!isTransactionHash(transactionHash)) continue;
    if (isEngineExecutionFailed(transaction.executionResult)) continue;

    const fromAddress = resolveTxFromAddress(transaction);
    if (!isWalletAddress(fromAddress)) continue;

    const createdAt = String(transaction.createdAt || '').trim();
    const confirmedAt = String(transaction.confirmedAt || '').trim();
    const transactionId = String(transaction.id || '').trim();
    const batchIndex = Number(transaction.batchIndex || 0) || 0;

    const innerTransactions = extractInnerTransactions(transaction.transactionParams);
    if (innerTransactions.length === 0) continue;

    for (const innerTransaction of innerTransactions) {
      if (normalizeAddress(innerTransaction.to) !== normalizedUsdtContractAddress) continue;

      const decodedTransfer = decodeErc20TransferCalldata(innerTransaction.data);
      if (!decodedTransfer) continue;

      const recipient = String(decodedTransfer.recipient || '').trim();
      if (!isWalletAddress(recipient)) continue;

      const rawAmount = decodedTransfer.amountRaw.toString();
      const usdtAmount = convertRawAmountToDisplay(decodedTransfer.amountRaw, usdtDecimals);
      if (!Number.isFinite(usdtAmount) || usdtAmount <= 0) continue;

      const dedupeKey = `${normalizeHash(transactionHash)}:${normalizeAddress(recipient)}:${rawAmount}`;
      if (dedupe.has(dedupeKey)) continue;
      dedupe.add(dedupeKey);

      transferEntries.push({
        transactionId,
        batchIndex,
        transactionHash,
        createdAt,
        confirmedAt,
        fromAddress,
        recipient,
        rawAmount,
        usdtAmount,
      });
    }
  }

  return {
    scannedTransactions: transactions.length,
    transferEntries,
    hasMore: transactions.length >= normalizedPageSize,
  };
};

const loadEngineSearchPageCache = async (
  {
    cacheCollection,
    cacheKey,
  }: {
    cacheCollection: any;
    cacheKey: string;
  },
) => {
  const cached = await cacheCollection.findOne(
    {
      kind: 'engine-search-page',
      cacheKey,
      expiresAt: { $gt: new Date() },
    },
    {
      projection: {
        _id: 0,
        scannedTransactions: 1,
        transferEntries: 1,
        hasMore: 1,
      },
    },
  );

  if (!cached) return null;
  const transferEntries = Array.isArray(cached.transferEntries)
    ? (cached.transferEntries as any[])
        .map((item): EngineSearchTransferEntry => ({
          transactionId: String(item?.transactionId || '').trim(),
          batchIndex: Number(item?.batchIndex || 0) || 0,
          transactionHash: String(item?.transactionHash || '').trim(),
          createdAt: String(item?.createdAt || '').trim(),
          confirmedAt: String(item?.confirmedAt || '').trim(),
          fromAddress: String(item?.fromAddress || '').trim(),
          recipient: String(item?.recipient || '').trim(),
          rawAmount: String(item?.rawAmount || '').trim(),
          usdtAmount: Number(item?.usdtAmount || 0) || 0,
        }))
        .filter((item: EngineSearchTransferEntry) =>
          isWalletAddress(item.fromAddress)
          && isWalletAddress(item.recipient)
          && isTransactionHash(item.transactionHash)
          && Number.isFinite(item.usdtAmount)
          && item.usdtAmount > 0)
    : [];

  return {
    scannedTransactions: Number(cached.scannedTransactions || 0) || 0,
    transferEntries,
    hasMore: Boolean(cached.hasMore),
  };
};

const upsertEngineSearchPageCache = async (
  {
    cacheCollection,
    chainId,
    fromChunkHash,
    cacheKey,
    page,
    pageSize,
    lookbackDays,
    scannedTransactions,
    transferEntries,
    hasMore,
  }: {
    cacheCollection: any;
    chainId: string;
    fromChunkHash: string;
    cacheKey: string;
    page: number;
    pageSize: number;
    lookbackDays: number;
    scannedTransactions: number;
    transferEntries: EngineSearchTransferEntry[];
    hasMore: boolean;
  },
) => {
  const now = new Date();
  const ttlMs = resolveEngineTxSearchCacheTtlMs({
    lookbackDays,
    page,
  });
  const expiresAt = new Date(now.getTime() + ttlMs);

  await cacheCollection.updateOne(
    {
      kind: 'engine-search-page',
      cacheKey,
    },
    {
      $set: {
        kind: 'engine-search-page',
        cacheKey,
        chainId,
        fromChunkHash,
        page,
        pageSize,
        scannedTransactions: Math.max(0, Math.floor(Number(scannedTransactions || 0))),
        transferEntries,
        hasMore: Boolean(hasMore),
        fetchedAt: now,
        expiresAt,
        updatedAt: now,
      },
      $setOnInsert: {
        insertedAt: now,
      },
    },
    { upsert: true },
  );
};

const ensureEngineTxSearchCacheIndexes = async (
  {
    cacheCollection,
  }: {
    cacheCollection: any;
  },
) => {
  if (engineTxSearchCacheIndexesEnsured) {
    return;
  }

  if (!engineTxSearchCacheIndexPromise) {
    engineTxSearchCacheIndexPromise = (async () => {
      await cacheCollection.createIndex(
        { kind: 1, cacheKey: 1 },
        {
          name: ENGINE_TX_SEARCH_CACHE_INDEX_KIND_CACHE_KEY,
          unique: true,
        },
      );
      try {
        await cacheCollection.dropIndex(ENGINE_TX_SEARCH_CACHE_INDEX_KIND_EXPIRES_AT);
      } catch (dropError: any) {
        const dropCodeName = String(dropError?.codeName || '');
        const dropCode = Number(dropError?.code || 0);
        const dropMessage = String(dropError?.message || '');
        const ignorable =
          dropCode === 27
          || dropCodeName === 'IndexNotFound'
          || /index not found/i.test(dropMessage);
        if (!ignorable) {
          throw dropError;
        }
      }
      await cacheCollection.createIndex(
        { expiresAt: 1 },
        {
          name: ENGINE_TX_SEARCH_CACHE_INDEX_KIND_EXPIRES_AT,
          expireAfterSeconds: 0,
        },
      );
      await cacheCollection.createIndex(
        { kind: 1, chainId: 1, fromChunkHash: 1, page: 1 },
        {
          name: ENGINE_TX_SEARCH_CACHE_INDEX_KIND_CHAIN_CHUNK_PAGE,
        },
      );
    })();
  }

  try {
    await engineTxSearchCacheIndexPromise;
    engineTxSearchCacheIndexesEnsured = true;
  } catch (error) {
    engineTxSearchCacheIndexPromise = null;
    throw error;
  }
};

type SellerProfile = {
  sellerWalletAddress: string;
  sellerNickname: string;
  sellerEscrowWalletAddress: string;
  sellerEscrowSignerAddress: string;
};

type MissingCandidatesMeta = {
  lookbackDays: number;
  scannedTransactions: number;
  matchedTransfers: number;
  missingCount: number;
  excludedCount?: number;
  excludedByExistingTxHashCount?: number;
  excludedByExistingEscrowWalletCount?: number;
  excludedByBothCount?: number;
  sellerCount: number;
  privateBuyWalletCount: number;
  privateBuyWalletDetectionMode: string;
  privateBuyWalletWarning: string;
  engineServerWalletLookupFailed: boolean;
  txSearchCacheEnabled?: boolean;
  txSearchCacheHits?: number;
  txSearchCacheMisses?: number;
  txSearchCacheBypasses?: number;
  chain?: string;
  usdtContractAddress?: string;
};

type MissingCandidatesResult = {
  candidates: Array<Record<string, unknown>>;
  excludedCandidates: Array<Record<string, unknown>>;
  meta: MissingCandidatesMeta;
};

type ProgressReporter = (payload: {
  step: string;
  message: string;
  percent: number;
  meta?: Record<string, unknown>;
}) => void;

class MissingCandidatesApiError extends Error {
  status: number;
  code: string;
  detail: string;

  constructor({
    status,
    code,
    message,
    detail = '',
  }: {
    status: number;
    code: string;
    message: string;
    detail?: string;
  }) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.floor(Number(value || 0))));

const reportProgress = (
  reporter: ProgressReporter | undefined,
  payload: {
    step: string;
    message: string;
    percent: number;
    meta?: Record<string, unknown>;
  },
) => {
  reporter?.({
    ...payload,
    percent: clampPercent(payload.percent),
  });
};

const buildErrorPayload = (error: unknown) => {
  if (error instanceof MissingCandidatesApiError) {
    return {
      status: error.status,
      payload: {
        error: error.code,
        message: error.message,
        detail: error.detail,
      },
    };
  }
  return {
    status: 500,
    payload: {
      error: 'INTERNAL_SERVER_ERROR',
      message: '누락 구매주문 후보 조회 중 오류가 발생했습니다.',
      detail: toErrorMessage(error),
    },
  };
};

const getMissingPrivateBuyOrderCandidates = async (
  {
    body,
    onProgress,
  }: {
    body: any;
    onProgress?: ProgressReporter;
  },
): Promise<MissingCandidatesResult> => {
  reportProgress(onProgress, {
    step: 'validate',
    message: '요청 파라미터를 확인하고 있습니다.',
    percent: 4,
  });

  const lookbackDays = normalizeLookbackDays(body?.lookbackDays);
  const enginePageSize = toPositiveIntegerOrDefault(body?.enginePageSize, DEFAULT_ENGINE_PAGE_SIZE, 200);
  const engineMaxPages = toPositiveIntegerOrDefault(body?.engineMaxPages, DEFAULT_ENGINE_MAX_PAGES, 30);
  const maxCandidates = toPositiveIntegerOrDefault(body?.maxCandidates, DEFAULT_MAX_CANDIDATES, 500);
  const maxExcludedCandidates = toPositiveIntegerOrDefault(
    body?.maxExcludedCandidates,
    DEFAULT_MAX_EXCLUDED_CANDIDATES,
    5000,
  );
  const refreshTransactionCache = Boolean(body?.refreshTransactionCache);

  const thirdwebSecretKey = String(process.env.THIRDWEB_SECRET_KEY || '').trim();
  if (!thirdwebSecretKey) {
    throw new MissingCandidatesApiError({
      status: 500,
      code: 'THIRDWEB_SECRET_KEY_MISSING',
      message: '서버 지갑 검색을 위한 THIRDWEB_SECRET_KEY가 설정되지 않았습니다.',
    });
  }

  const lookbackStartIso = new Date(Date.now() - lookbackDays * DAY_MS).toISOString();
  const chainConfig = resolveChainConfig();
  const normalizedUsdtContractAddress = normalizeAddress(chainConfig.usdtContractAddress);

  const mongodbClient = await clientPromise;
  const usersCollection = mongodbClient.db(dbName).collection('users');
  const buyordersCollection = mongodbClient.db(dbName).collection('buyorders');
  const walletCacheCollection = mongodbClient.db(dbName).collection(PRIVATE_BUY_WALLET_CACHE_COLLECTION);
  const txSearchCacheCollection = mongodbClient.db(dbName).collection(ENGINE_TX_SEARCH_CACHE_COLLECTION);

  reportProgress(onProgress, {
    step: 'load-sellers',
    message: '판매자 에스크로 지갑 정보를 조회하고 있습니다.',
    percent: 10,
  });

  const sellerRows = await usersCollection
    .find(
      {
        storecode: 'admin',
        'seller.escrowWallet': { $exists: true, $ne: null },
        $or: [
          { 'seller.escrowWallet.smartAccountAddress': { $exists: true, $ne: null } },
          { 'seller.escrowWallet.signerAddress': { $exists: true, $ne: null } },
        ],
      },
      {
        projection: {
          walletAddress: 1,
          nickname: 1,
          seller: 1,
        },
      },
    )
    .toArray();

  const sellerBySourceAddress = new Map<string, SellerProfile>();
  const fromAddressFilterValues: string[] = [];
  const knownSellerAddressSet = new Set<string>();

  for (const row of sellerRows) {
    const sellerWalletAddress = String(row?.walletAddress || '').trim();
    if (!isWalletAddress(sellerWalletAddress)) continue;
    knownSellerAddressSet.add(normalizeAddress(sellerWalletAddress));

    const sellerEscrowWalletAddress = String(
      row?.seller?.escrowWallet?.smartAccountAddress || '',
    ).trim();
    const sellerEscrowSignerAddress = String(
      row?.seller?.escrowWallet?.signerAddress || '',
    ).trim();

    const sellerProfile: SellerProfile = {
      sellerWalletAddress,
      sellerNickname: String(row?.nickname || '').trim(),
      sellerEscrowWalletAddress: isWalletAddress(sellerEscrowWalletAddress) ? sellerEscrowWalletAddress : '',
      sellerEscrowSignerAddress: isWalletAddress(sellerEscrowSignerAddress) ? sellerEscrowSignerAddress : '',
    };

    const sourceCandidates = [
      sellerProfile.sellerEscrowWalletAddress,
      sellerProfile.sellerEscrowSignerAddress,
    ].filter((candidate) => isWalletAddress(candidate));

    for (const candidate of sourceCandidates) {
      const key = normalizeAddress(candidate);
      if (!sellerBySourceAddress.has(key)) {
        sellerBySourceAddress.set(key, sellerProfile);
        fromAddressFilterValues.push(candidate);
      }
      knownSellerAddressSet.add(key);
    }
  }

  reportProgress(onProgress, {
    step: 'load-sellers',
    message: `판매자 에스크로 지갑 정보 수집 완료 (${fromAddressFilterValues.length}개 발신주소)`,
    percent: 18,
    meta: {
      sellerCount: sellerRows.length,
      sourceAddressCount: fromAddressFilterValues.length,
    },
  });

  if (fromAddressFilterValues.length === 0) {
    return {
      candidates: [],
      excludedCandidates: [],
      meta: {
        lookbackDays,
        scannedTransactions: 0,
        matchedTransfers: 0,
        missingCount: 0,
        excludedCount: 0,
        excludedByExistingTxHashCount: 0,
        excludedByExistingEscrowWalletCount: 0,
        excludedByBothCount: 0,
        sellerCount: sellerRows.length,
        privateBuyWalletCount: 0,
        privateBuyWalletDetectionMode: 'no-seller-sources',
        privateBuyWalletWarning: '',
        engineServerWalletLookupFailed: false,
        txSearchCacheEnabled: true,
        txSearchCacheHits: 0,
        txSearchCacheMisses: 0,
        txSearchCacheBypasses: 0,
        chain: chainConfig.chain,
        usdtContractAddress: chainConfig.usdtContractAddress,
      },
    };
  }

  const privateBuyWalletWarningParts: string[] = [];
  let engineServerWalletLookupFailed = false;

  reportProgress(onProgress, {
    step: 'load-private-buy-wallets',
    message: 'private-buy 캐시 인덱스를 확인하고 있습니다.',
    percent: 20,
  });

  try {
    await ensurePrivateBuyWalletCacheIndexes({
      cacheCollection: walletCacheCollection,
    });
  } catch (indexError) {
    const warning = `cache index ensure failed: ${toErrorMessage(indexError)}`;
    privateBuyWalletWarningParts.push(warning);
    console.error('getMissingPrivateBuyOrderCandidates: failed to ensure private-buy cache indexes', indexError);
  }

  reportProgress(onProgress, {
    step: 'load-private-buy-wallets',
    message: 'private-buy 서버지갑 캐시를 조회하고 있습니다.',
    percent: 22,
  });

  const thirdwebClient = createThirdwebClient({ secretKey: thirdwebSecretKey });
  const cachedPrivateBuyWalletLookup = await loadPrivateBuyWalletMapFromCache({
    cacheCollection: walletCacheCollection,
    createdAfterIso: lookbackStartIso,
  });
  let privateBuyWalletMap = cachedPrivateBuyWalletLookup.walletMap;

  reportProgress(onProgress, {
    step: 'load-private-buy-wallets',
    message: cachedPrivateBuyWalletLookup.cacheIsFresh
      ? `private-buy 캐시 사용 (${privateBuyWalletMap.size}개 매핑)`
      : `private-buy 캐시가 오래되어 동기화가 필요합니다. (${privateBuyWalletMap.size}개 매핑)`,
    percent: 26,
    meta: {
      cachedWalletCount: privateBuyWalletMap.size,
      cacheIsFresh: cachedPrivateBuyWalletLookup.cacheIsFresh,
      cacheLastSyncedAt: cachedPrivateBuyWalletLookup.lastSyncedAt,
    },
  });

  const shouldSyncServerWalletCache =
    !cachedPrivateBuyWalletLookup.cacheIsFresh
    || privateBuyWalletMap.size === 0
    || Boolean(body?.refreshServerWalletCache);

  if (shouldSyncServerWalletCache) {
    reportProgress(onProgress, {
      step: 'load-private-buy-wallets',
      message: 'thirdweb server wallet을 조회해 캐시를 갱신하고 있습니다.',
      percent: 28,
    });

    const privateBuyWalletLookup = await loadPrivateBuyWalletMap({
      client: thirdwebClient,
      createdAfterIso: lookbackStartIso,
      onPageProgress: ({ page, totalPages, mappedWalletCount }) => {
        const ratio = totalPages > 0 ? page / totalPages : 1;
        reportProgress(onProgress, {
          step: 'load-private-buy-wallets',
          message: `thirdweb server wallet 조회 중 (${page}/${Math.max(1, totalPages)})`,
          percent: 28 + Math.floor(ratio * 8),
          meta: {
            mappedWalletCount,
          },
        });
      },
    });

    if (privateBuyWalletLookup.walletMap.size > 0) {
      privateBuyWalletMap = privateBuyWalletLookup.walletMap;
      try {
        await upsertPrivateBuyWalletCache({
          cacheCollection: walletCacheCollection,
          walletInfos: privateBuyWalletLookup.walletInfos,
        });
      } catch (cacheUpsertError) {
        const cacheWarning = `cache upsert failed: ${toErrorMessage(cacheUpsertError)}`;
        privateBuyWalletWarningParts.push(cacheWarning);
        console.error('getMissingPrivateBuyOrderCandidates: private-buy cache upsert failed', cacheUpsertError);
      }
    }

    const lookupWarning = String(privateBuyWalletLookup.warning || '').trim();
    if (lookupWarning) {
      privateBuyWalletWarningParts.push(lookupWarning);
      console.warn('getMissingPrivateBuyOrderCandidates: private-buy wallet lookup warning', lookupWarning);
    }
    engineServerWalletLookupFailed = privateBuyWalletLookup.queryFailed;

    if (privateBuyWalletLookup.walletMap.size === 0 && cachedPrivateBuyWalletLookup.walletMap.size > 0) {
      privateBuyWalletWarningParts.push('thirdweb 조회 실패로 캐시 데이터를 사용했습니다.');
      privateBuyWalletMap = cachedPrivateBuyWalletLookup.walletMap;
    }
  }

  const privateBuyWalletAddressSet = new Set(privateBuyWalletMap.keys());
  const strictPrivateBuyWalletFilter = privateBuyWalletAddressSet.size > 0;
  const privateBuyWalletWarning = privateBuyWalletWarningParts.filter(Boolean).join(' | ');

  reportProgress(onProgress, {
    step: 'load-private-buy-wallets',
    message: strictPrivateBuyWalletFilter
      ? `private-buy 매핑 완료 (${privateBuyWalletAddressSet.size}개)`
      : 'private-buy 매핑 실패로 fallback 수신자 필터 모드로 진행합니다.',
    percent: 36,
    meta: {
      privateBuyWalletCount: privateBuyWalletAddressSet.size,
      detectionMode: strictPrivateBuyWalletFilter ? 'strict-private-buy' : 'fallback-any-recipient',
      warning: privateBuyWalletWarning,
    },
  });

  reportProgress(onProgress, {
    step: 'prepare-transaction-cache',
    message: 'Engine 트랜잭션 캐시 인덱스를 확인하고 있습니다.',
    percent: 38,
  });

  let txSearchCacheEnabled = true;
  try {
    await ensureEngineTxSearchCacheIndexes({
      cacheCollection: txSearchCacheCollection,
    });
  } catch (txCacheIndexError) {
    txSearchCacheEnabled = false;
    console.error(
      'getMissingPrivateBuyOrderCandidates: failed to ensure engine search cache indexes',
      txCacheIndexError,
    );
  }

  reportProgress(onProgress, {
    step: 'prepare-transaction-cache',
    message: txSearchCacheEnabled
      ? (refreshTransactionCache
        ? 'Engine 트랜잭션 캐시를 강제 갱신 모드로 진행합니다.'
        : 'Engine 트랜잭션 캐시를 사용해 조회를 진행합니다.')
      : 'Engine 트랜잭션 캐시를 사용할 수 없어 direct 조회로 진행합니다.',
    percent: 39,
  });

  const filtersByFromChunk = chunkArray(fromAddressFilterValues, 40);
  const dedupedByKey = new Map<string, any>();
  let scannedTransactions = 0;
  let txSearchCacheHits = 0;
  let txSearchCacheMisses = 0;
  let txSearchCacheBypasses = 0;
  const totalScanSteps = Math.max(1, filtersByFromChunk.length * engineMaxPages);
  let scanProgressStep = 0;

  const applyTransferEntries = (transferEntries: EngineSearchTransferEntry[]) => {
    for (const transferEntry of transferEntries) {
      const createdAt = String(transferEntry.createdAt || '').trim();
      const confirmedAt = String(transferEntry.confirmedAt || '').trim();
      const referenceAt = confirmedAt || createdAt;
      if (!referenceAt || referenceAt < lookbackStartIso) continue;

      const transactionHash = String(transferEntry.transactionHash || '').trim();
      if (!isTransactionHash(transactionHash)) continue;

      const fromAddress = String(transferEntry.fromAddress || '').trim();
      if (!isWalletAddress(fromAddress)) continue;

      const matchedSeller = sellerBySourceAddress.get(normalizeAddress(fromAddress));
      if (!matchedSeller) continue;

      const recipient = String(transferEntry.recipient || '').trim();
      if (!isWalletAddress(recipient)) continue;
      const recipientNormalized = normalizeAddress(recipient);

      if (strictPrivateBuyWalletFilter && !privateBuyWalletAddressSet.has(recipientNormalized)) continue;
      if (!strictPrivateBuyWalletFilter && knownSellerAddressSet.has(recipientNormalized)) continue;

      const usdtAmount = roundDownUsdtSix(Number(transferEntry.usdtAmount || 0));
      if (!Number.isFinite(usdtAmount) || usdtAmount <= 0) continue;

      const rawAmount = String(transferEntry.rawAmount || '').trim();
      if (!rawAmount) continue;

      const walletInfo = strictPrivateBuyWalletFilter
        ? privateBuyWalletMap.get(recipientNormalized)
        : undefined;
      const dedupeKey = `${normalizeHash(transactionHash)}:${recipientNormalized}`;
      if (dedupedByKey.has(dedupeKey)) continue;

      dedupedByKey.set(dedupeKey, {
        candidateId: dedupeKey,
        transactionId: String(transferEntry.transactionId || '').trim(),
        batchIndex: Number(transferEntry.batchIndex || 0) || 0,
        transactionHash,
        createdAt,
        confirmedAt,
        fromAddress,
        sellerWalletAddress: matchedSeller.sellerWalletAddress,
        sellerNickname: matchedSeller.sellerNickname,
        sellerEscrowWalletAddress: matchedSeller.sellerEscrowWalletAddress,
        sellerEscrowSignerAddress: matchedSeller.sellerEscrowSignerAddress,
        buyerEscrowWalletAddress: recipient,
        usdtAmount,
        rawAmount,
        privateBuyWalletLabel: walletInfo?.label || '',
        privateBuyWalletCreatedAt: walletInfo?.createdAt || '',
        buyerWalletHintPrefix: walletInfo?.buyerWalletPrefix || '',
      });
    }
  };

  for (let chunkIndex = 0; chunkIndex < filtersByFromChunk.length; chunkIndex += 1) {
    const addressChunk = filtersByFromChunk[chunkIndex];
    const fromChunkHash = createAddressChunkHash(addressChunk);
    if (!fromChunkHash) continue;

    for (let page = 1; page <= engineMaxPages; page += 1) {
      scanProgressStep += 1;
      reportProgress(onProgress, {
        step: 'scan-transactions',
        message: `Engine 트랜잭션 검색 중 (chunk ${chunkIndex + 1}/${filtersByFromChunk.length}, page ${page}/${engineMaxPages})`,
        percent: 40 + Math.floor((scanProgressStep / totalScanSteps) * 30),
        meta: {
          scannedTransactions,
          matchedTransfers: dedupedByKey.size,
          txCacheEnabled: txSearchCacheEnabled,
          txCacheHits: txSearchCacheHits,
          txCacheMisses: txSearchCacheMisses,
          txCacheBypasses: txSearchCacheBypasses,
        },
      });

      const cacheKey = createEngineSearchCacheKey({
        chainId: chainConfig.chainId,
        fromChunkHash,
        page,
        pageSize: enginePageSize,
      });
      const shouldReadTxCache = txSearchCacheEnabled && !refreshTransactionCache;

      if (shouldReadTxCache) {
        try {
          const cachedPageResult = await loadEngineSearchPageCache({
            cacheCollection: txSearchCacheCollection,
            cacheKey,
          });
          if (cachedPageResult) {
            txSearchCacheHits += 1;
            scannedTransactions += cachedPageResult.scannedTransactions;
            applyTransferEntries(cachedPageResult.transferEntries);

            if (!cachedPageResult.hasMore) {
              break;
            }
            continue;
          }
          txSearchCacheMisses += 1;
        } catch (cacheReadError) {
          txSearchCacheMisses += 1;
          console.warn('getMissingPrivateBuyOrderCandidates: tx cache read failed', {
            cacheKey,
            error: toErrorMessage(cacheReadError),
          });
        }
      } else if (txSearchCacheEnabled) {
        txSearchCacheBypasses += 1;
      }

      let searchResult: Awaited<ReturnType<typeof Engine.searchTransactions>> | null = null;
      let searchErrorMessage = '';
      for (let attempt = 1; attempt <= DEFAULT_ENGINE_RETRY_ATTEMPTS; attempt += 1) {
        try {
          searchResult = await Engine.searchTransactions({
            client: thirdwebClient,
            filters: [
              {
                operation: 'AND',
                filters: [
                  {
                    field: 'chainId',
                    operation: 'OR',
                    values: [chainConfig.chainId],
                  },
                  {
                    field: 'from',
                    operation: 'OR',
                    values: addressChunk,
                  },
                ],
              },
            ],
            pageSize: enginePageSize,
            page,
          });
          break;
        } catch (error) {
          searchErrorMessage = toErrorMessage(error);
          if (attempt < DEFAULT_ENGINE_RETRY_ATTEMPTS) {
            await waitMs(ENGINE_RETRY_BASE_DELAY_MS * attempt);
          }
        }
      }

      if (!searchResult) {
        console.error('getMissingPrivateBuyOrderCandidates: searchTransactions failed', {
          page,
          addressChunkSize: addressChunk.length,
          error: searchErrorMessage || 'unknown error',
        });
        break;
      }

      const transactions = Array.isArray(searchResult?.transactions) ? searchResult.transactions : [];
      const extractedPageResult = extractTransferEntriesFromSearchTransactions({
        transactions: transactions as unknown as Array<Record<string, unknown>>,
        normalizedUsdtContractAddress,
        usdtDecimals: chainConfig.usdtDecimals,
        pageSize: enginePageSize,
      });

      scannedTransactions += extractedPageResult.scannedTransactions;
      applyTransferEntries(extractedPageResult.transferEntries);

      if (txSearchCacheEnabled) {
        try {
          await upsertEngineSearchPageCache({
            cacheCollection: txSearchCacheCollection,
            chainId: chainConfig.chainId,
            fromChunkHash,
            cacheKey,
            page,
            pageSize: enginePageSize,
            lookbackDays,
            scannedTransactions: extractedPageResult.scannedTransactions,
            transferEntries: extractedPageResult.transferEntries,
            hasMore: extractedPageResult.hasMore,
          });
        } catch (cacheUpsertError) {
          console.warn('getMissingPrivateBuyOrderCandidates: tx cache upsert failed', {
            cacheKey,
            error: toErrorMessage(cacheUpsertError),
          });
        }
      }

      if (!extractedPageResult.hasMore) {
        break;
      }
    }
  }

  reportProgress(onProgress, {
    step: 'dedupe-matches',
    message: '기존 주문과 중복 데이터를 정리하고 있습니다.',
    percent: 76,
    meta: {
      scannedTransactions,
      matchedTransfers: dedupedByKey.size,
      txCacheEnabled: txSearchCacheEnabled,
      txCacheHits: txSearchCacheHits,
      txCacheMisses: txSearchCacheMisses,
      txCacheBypasses: txSearchCacheBypasses,
    },
  });

  const matchedCandidates = [...dedupedByKey.values()];
  if (matchedCandidates.length === 0) {
    return {
      candidates: [],
      excludedCandidates: [],
      meta: {
        lookbackDays,
        scannedTransactions,
        matchedTransfers: 0,
        missingCount: 0,
        excludedCount: 0,
        excludedByExistingTxHashCount: 0,
        excludedByExistingEscrowWalletCount: 0,
        excludedByBothCount: 0,
        sellerCount: sellerRows.length,
        privateBuyWalletCount: privateBuyWalletAddressSet.size,
        privateBuyWalletDetectionMode: strictPrivateBuyWalletFilter ? 'strict-private-buy' : 'fallback-any-recipient',
        privateBuyWalletWarning,
        engineServerWalletLookupFailed,
        txSearchCacheEnabled: txSearchCacheEnabled,
        txSearchCacheHits: txSearchCacheHits,
        txSearchCacheMisses: txSearchCacheMisses,
        txSearchCacheBypasses: txSearchCacheBypasses,
        chain: chainConfig.chain,
        usdtContractAddress: chainConfig.usdtContractAddress,
      },
    };
  }

  const transactionHashes = [...new Set(matchedCandidates.map((item) => normalizeHash(item.transactionHash)).filter(Boolean))];
  const escrowWalletAddresses = [...new Set(matchedCandidates.map((item) => normalizeAddress(item.buyerEscrowWalletAddress)).filter(Boolean))];

  const orderFindFilters: Record<string, unknown>[] = [];
  for (const txHash of transactionHashes) {
    orderFindFilters.push({
      'buyer.lockTransactionHash': {
        $regex: `^${escapeRegex(txHash)}$`,
        $options: 'i',
      },
    });
    orderFindFilters.push({
      'seller.lockTransactionHash': {
        $regex: `^${escapeRegex(txHash)}$`,
        $options: 'i',
      },
    });
  }
  for (const walletAddress of escrowWalletAddresses) {
    orderFindFilters.push({
      'buyer.escrowWalletAddress': {
        $regex: `^${escapeRegex(walletAddress)}$`,
        $options: 'i',
      },
    });
    orderFindFilters.push({
      'escrowWallet.address': {
        $regex: `^${escapeRegex(walletAddress)}$`,
        $options: 'i',
      },
    });
  }

  const existingLockTransactionHashes = new Set<string>();
  const existingEscrowWalletAddresses = new Set<string>();
  const existingByLockTransactionHash = new Map<string, { orderId: string; tradeId: string }>();
  const existingByWalletAddress = new Map<string, { orderId: string; tradeId: string }>();

  if (orderFindFilters.length > 0) {
    const orderFilterChunks = chunkArray(orderFindFilters, 120);
    for (let i = 0; i < orderFilterChunks.length; i += 1) {
      const chunkRatio = orderFilterChunks.length > 0 ? (i + 1) / orderFilterChunks.length : 1;
      reportProgress(onProgress, {
        step: 'load-existing-orders',
        message: `기존 주문 중복 조회 중 (${i + 1}/${orderFilterChunks.length})`,
        percent: 82 + Math.floor(chunkRatio * 6),
        meta: {
          scannedTransactions,
          matchedTransfers: dedupedByKey.size,
          existingOrderChunksDone: i + 1,
          existingOrderChunksTotal: orderFilterChunks.length,
        },
      });

      const existingOrders = await buyordersCollection
        .find(
          { $or: orderFilterChunks[i] },
          {
            projection: {
              _id: 1,
              tradeId: 1,
              buyer: 1,
              seller: 1,
              escrowWallet: 1,
            },
          },
        )
        .toArray();

      for (const order of existingOrders) {
        const orderId = String(order?._id || '').trim();
        const tradeId = String(order?.tradeId || '').trim();
        const buyerLockHash = normalizeHash(order?.buyer?.lockTransactionHash);
        const sellerLockHash = normalizeHash(order?.seller?.lockTransactionHash);
        const buyerEscrowAddress = normalizeAddress(order?.buyer?.escrowWalletAddress);
        const orderEscrowAddress = normalizeAddress(order?.escrowWallet?.address);

        if (buyerLockHash) existingLockTransactionHashes.add(buyerLockHash);
        if (sellerLockHash) existingLockTransactionHashes.add(sellerLockHash);
        if (buyerLockHash && !existingByLockTransactionHash.has(buyerLockHash)) {
          existingByLockTransactionHash.set(buyerLockHash, { orderId, tradeId });
        }
        if (sellerLockHash && !existingByLockTransactionHash.has(sellerLockHash)) {
          existingByLockTransactionHash.set(sellerLockHash, { orderId, tradeId });
        }

        if (buyerEscrowAddress) {
          existingEscrowWalletAddresses.add(buyerEscrowAddress);
          if (!existingByWalletAddress.has(buyerEscrowAddress)) {
            existingByWalletAddress.set(buyerEscrowAddress, { orderId, tradeId });
          }
        }
        if (orderEscrowAddress) {
          existingEscrowWalletAddresses.add(orderEscrowAddress);
          if (!existingByWalletAddress.has(orderEscrowAddress)) {
            existingByWalletAddress.set(orderEscrowAddress, { orderId, tradeId });
          }
        }
      }
    }
  }

  const uniquePrefixes = [...new Set(
    matchedCandidates
      .map((item) => String(item.buyerWalletHintPrefix || '').trim().toLowerCase())
      .filter(Boolean),
  )];
  reportProgress(onProgress, {
    step: 'suggest-buyers',
    message: `구매자 지갑 추천 정보를 생성하고 있습니다. (0/${Math.max(1, uniquePrefixes.length)})`,
    percent: 89,
    meta: {
      scannedTransactions,
      matchedTransfers: dedupedByKey.size,
      suggestionPrefixesDone: 0,
      suggestionPrefixesTotal: uniquePrefixes.length,
    },
  });

  const suggestionByPrefix = new Map<string, { buyerWalletAddress: string; buyerNickname: string; matchCount: number }>();
  for (let prefixIndex = 0; prefixIndex < uniquePrefixes.length; prefixIndex += 1) {
    const prefix = uniquePrefixes[prefixIndex];
    const matchedBuyers = await usersCollection
      .find(
        {
          storecode: 'admin',
          walletAddress: {
            $regex: `^${escapeRegex(prefix)}`,
            $options: 'i',
          },
        },
        {
          projection: {
            walletAddress: 1,
            nickname: 1,
          },
        },
      )
      .limit(3)
      .toArray();

    if (matchedBuyers.length === 1) {
      suggestionByPrefix.set(prefix, {
        buyerWalletAddress: String(matchedBuyers[0]?.walletAddress || '').trim(),
        buyerNickname: String(matchedBuyers[0]?.nickname || '').trim(),
        matchCount: 1,
      });
    } else if (matchedBuyers.length > 1) {
      suggestionByPrefix.set(prefix, {
        buyerWalletAddress: '',
        buyerNickname: '',
        matchCount: matchedBuyers.length,
      });
    }

    const suggestionRatio = uniquePrefixes.length > 0 ? (prefixIndex + 1) / uniquePrefixes.length : 1;
    reportProgress(onProgress, {
      step: 'suggest-buyers',
      message: `구매자 지갑 추천 정보를 생성하고 있습니다. (${prefixIndex + 1}/${uniquePrefixes.length})`,
      percent: 90 + Math.floor(suggestionRatio * 5),
      meta: {
        scannedTransactions,
        matchedTransfers: dedupedByKey.size,
        suggestionPrefixesDone: prefixIndex + 1,
        suggestionPrefixesTotal: uniquePrefixes.length,
      },
    });
  }

  reportProgress(onProgress, {
    step: 'finalize',
    message: '최종 누락 후보 목록을 생성하고 있습니다.',
    percent: 96,
    meta: {
      scannedTransactions,
      matchedTransfers: dedupedByKey.size,
      candidateCountBeforeFilter: matchedCandidates.length,
    },
  });

  const sortedMatchedCandidates = [...matchedCandidates].sort((a, b) => {
    const aTime = new Date(String(a.confirmedAt || a.createdAt || '')).getTime();
    const bTime = new Date(String(b.confirmedAt || b.createdAt || '')).getTime();
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });

  let excludedCount = 0;
  let excludedByExistingTxHashCount = 0;
  let excludedByExistingEscrowWalletCount = 0;
  let excludedByBothCount = 0;
  const candidates: Array<Record<string, unknown>> = [];
  const excludedCandidates: Array<Record<string, unknown>> = [];

  for (const item of sortedMatchedCandidates) {
    const txHashKey = normalizeHash(item.transactionHash);
    const escrowWalletKey = normalizeAddress(item.buyerEscrowWalletAddress);
    const excludedByExistingTxHash = existingLockTransactionHashes.has(txHashKey);
    const excludedByExistingEscrowWallet = existingEscrowWalletAddresses.has(escrowWalletKey);
    const isExcluded = excludedByExistingTxHash || excludedByExistingEscrowWallet;

    if (isExcluded) {
      excludedCount += 1;
      if (excludedByExistingTxHash) excludedByExistingTxHashCount += 1;
      if (excludedByExistingEscrowWallet) excludedByExistingEscrowWalletCount += 1;
      if (excludedByExistingTxHash && excludedByExistingEscrowWallet) excludedByBothCount += 1;

      if (excludedCandidates.length < maxExcludedCandidates) {
        const prefix = String(item.buyerWalletHintPrefix || '').trim().toLowerCase();
        const suggestion = prefix ? suggestionByPrefix.get(prefix) : undefined;
        const existingByTx = existingByLockTransactionHash.get(txHashKey);
        const existingByEscrow = existingByWalletAddress.get(escrowWalletKey);
        const existingOrder = existingByTx || existingByEscrow;
        const excludedReasonCodes = [
          ...(excludedByExistingTxHash ? ['existing-tx-hash'] : []),
          ...(excludedByExistingEscrowWallet ? ['existing-escrow-wallet'] : []),
        ];

        excludedCandidates.push({
          candidateId: String(item.candidateId || ''),
          transactionId: String(item.transactionId || ''),
          batchIndex: Number(item.batchIndex || 0) || 0,
          transactionHash: String(item.transactionHash || ''),
          createdAt: String(item.createdAt || ''),
          confirmedAt: String(item.confirmedAt || ''),
          fromAddress: String(item.fromAddress || ''),
          sellerWalletAddress: String(item.sellerWalletAddress || ''),
          sellerNickname: String(item.sellerNickname || ''),
          sellerEscrowWalletAddress: String(item.sellerEscrowWalletAddress || ''),
          sellerEscrowSignerAddress: String(item.sellerEscrowSignerAddress || ''),
          buyerEscrowWalletAddress: String(item.buyerEscrowWalletAddress || ''),
          usdtAmount: roundDownUsdtSix(Number(item.usdtAmount || 0)),
          rawAmount: String(item.rawAmount || ''),
          privateBuyWalletLabel: String(item.privateBuyWalletLabel || ''),
          privateBuyWalletCreatedAt: String(item.privateBuyWalletCreatedAt || ''),
          buyerWalletHintPrefix: String(item.buyerWalletHintPrefix || ''),
          suggestedBuyerWalletAddress: String(suggestion?.buyerWalletAddress || ''),
          suggestedBuyerNickname: String(suggestion?.buyerNickname || ''),
          suggestedBuyerMatchCount: Number(suggestion?.matchCount || 0),
          excludedByExistingTxHash,
          excludedByExistingEscrowWallet,
          excludedReasonCodes,
          existingByTxOrderId: String(existingByTx?.orderId || ''),
          existingByTxTradeId: String(existingByTx?.tradeId || ''),
          existingByEscrowOrderId: String(existingByEscrow?.orderId || ''),
          existingByEscrowTradeId: String(existingByEscrow?.tradeId || ''),
          existingOrderId: String(existingOrder?.orderId || ''),
          existingTradeId: String(existingOrder?.tradeId || ''),
        });
      }
      continue;
    }

    if (candidates.length < maxCandidates) {
      const prefix = String(item.buyerWalletHintPrefix || '').trim().toLowerCase();
      const suggestion = prefix ? suggestionByPrefix.get(prefix) : undefined;

      candidates.push({
        candidateId: String(item.candidateId || ''),
        transactionId: String(item.transactionId || ''),
        batchIndex: Number(item.batchIndex || 0) || 0,
        transactionHash: String(item.transactionHash || ''),
        createdAt: String(item.createdAt || ''),
        confirmedAt: String(item.confirmedAt || ''),
        fromAddress: String(item.fromAddress || ''),
        sellerWalletAddress: String(item.sellerWalletAddress || ''),
        sellerNickname: String(item.sellerNickname || ''),
        sellerEscrowWalletAddress: String(item.sellerEscrowWalletAddress || ''),
        sellerEscrowSignerAddress: String(item.sellerEscrowSignerAddress || ''),
        buyerEscrowWalletAddress: String(item.buyerEscrowWalletAddress || ''),
        usdtAmount: roundDownUsdtSix(Number(item.usdtAmount || 0)),
        rawAmount: String(item.rawAmount || ''),
        privateBuyWalletLabel: String(item.privateBuyWalletLabel || ''),
        privateBuyWalletCreatedAt: String(item.privateBuyWalletCreatedAt || ''),
        buyerWalletHintPrefix: String(item.buyerWalletHintPrefix || ''),
        suggestedBuyerWalletAddress: String(suggestion?.buyerWalletAddress || ''),
        suggestedBuyerNickname: String(suggestion?.buyerNickname || ''),
        suggestedBuyerMatchCount: Number(suggestion?.matchCount || 0),
        existingOrderId: '',
        existingTradeId: '',
      });
    }
  }

  return {
    candidates,
    excludedCandidates,
    meta: {
      lookbackDays,
      scannedTransactions,
      matchedTransfers: matchedCandidates.length,
      missingCount: candidates.length,
      excludedCount,
      excludedByExistingTxHashCount,
      excludedByExistingEscrowWalletCount,
      excludedByBothCount,
      sellerCount: sellerRows.length,
      privateBuyWalletCount: privateBuyWalletAddressSet.size,
      privateBuyWalletDetectionMode: strictPrivateBuyWalletFilter ? 'strict-private-buy' : 'fallback-any-recipient',
      privateBuyWalletWarning,
      engineServerWalletLookupFailed,
      txSearchCacheEnabled: txSearchCacheEnabled,
      txSearchCacheHits: txSearchCacheHits,
      txSearchCacheMisses: txSearchCacheMisses,
      txSearchCacheBypasses: txSearchCacheBypasses,
      chain: chainConfig.chain,
      usdtContractAddress: chainConfig.usdtContractAddress,
    },
  };
};

const streamMissingPrivateBuyOrderCandidates = async (
  body: any,
) => {
  const encoder = new TextEncoder();
  let streamClosedByCancel = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const startedAt = Date.now();
      let streamClosed = false;
      const isStreamClosed = () => streamClosed || streamClosedByCancel;

      const isInvalidStreamStateError = (error: unknown) => {
        const errorCode = String((error as any)?.code || '').trim();
        const errorMessage = toErrorMessage(error);
        return errorCode === 'ERR_INVALID_STATE' || /invalid state/i.test(errorMessage);
      };

      const closeStreamSafely = () => {
        if (isStreamClosed()) return;
        streamClosed = true;
        try {
          controller.close();
        } catch (error) {
          if (!isInvalidStreamStateError(error)) {
            console.warn('streamMissingPrivateBuyOrderCandidates: close failed', error);
          }
        }
      };

      const pushEvent = (payload: Record<string, unknown>) => {
        if (isStreamClosed()) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch (error) {
          if (isInvalidStreamStateError(error)) {
            streamClosed = true;
            return;
          }
          throw error;
        }
      };

      const progressReporter: ProgressReporter = (payload) => {
        pushEvent({
          type: 'progress',
          step: payload.step,
          message: payload.message,
          percent: clampPercent(payload.percent),
          elapsedMs: Date.now() - startedAt,
          meta: payload.meta || {},
        });
      };

      void (async () => {
        try {
          reportProgress(progressReporter, {
            step: 'start',
            message: '누락 후보 조회를 시작합니다.',
            percent: 1,
          });

          const result = await getMissingPrivateBuyOrderCandidates({
            body,
            onProgress: progressReporter,
          });

          reportProgress(progressReporter, {
            step: 'complete',
            message: '누락 후보 조회가 완료되었습니다.',
            percent: 100,
            meta: {
              missingCount: result.meta.missingCount,
              matchedTransfers: result.meta.matchedTransfers,
              excludedCount: result.meta.excludedCount,
            },
          });

          pushEvent({
            type: 'result',
            result,
          });
        } catch (error) {
          const normalizedError = buildErrorPayload(error);
          pushEvent({
            type: 'error',
            status: normalizedError.status,
            error: normalizedError.payload.error,
            message: normalizedError.payload.message,
            detail: normalizedError.payload.detail,
          });
        } finally {
          closeStreamSafely();
        }
      })();
    },
    cancel() {
      streamClosedByCancel = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const useStream = Boolean(body?.stream);

  if (useStream) {
    return streamMissingPrivateBuyOrderCandidates(body);
  }

  try {
    const result = await getMissingPrivateBuyOrderCandidates({ body });
    return NextResponse.json({ result });
  } catch (error) {
    console.error('getMissingPrivateBuyOrderCandidates error', error);
    const normalizedError = buildErrorPayload(error);
    return NextResponse.json(
      normalizedError.payload,
      { status: normalizedError.status },
    );
  }
}
