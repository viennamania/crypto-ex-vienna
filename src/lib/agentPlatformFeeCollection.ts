import { type Db } from 'mongodb';

export const PLATFORM_FEE_RECEIVABLE_COLLECTION = 'platformFeeReceivables';
export const PLATFORM_FEE_COLLECTION_ATTEMPT_COLLECTION = 'platformFeeCollectionAttempts';
export const AGENT_PLATFORM_FEE_TYPE = 'agent_platform_fee' as const;
export const AGENT_PLATFORM_FEE_VERSION = 1 as const;

export type AgentPlatformFeeReceivableStatus =
  | 'PENDING'
  | 'REQUESTING'
  | 'QUEUED'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'BLOCKED_LOW_BALANCE';

export type AgentPlatformFeeReceivableDoc = {
  orderId: string;
  feeType: typeof AGENT_PLATFORM_FEE_TYPE;
  feeVersion: typeof AGENT_PLATFORM_FEE_VERSION;
  tradeId: string;
  chain: string;
  clientId: string;
  storecode: string;
  orderStatus: string;
  status: AgentPlatformFeeReceivableStatus;
  usdtAmount: number;
  krwAmount: number;
  feePercent: number;
  expectedFeeAmountUsdt: number;
  collectedFeeAmountUsdt: number;
  fromAddress: string;
  fromWallet: {
    signerAddress: string;
    smartAccountAddress: string;
  };
  toAddress: string;
  transactionId: string;
  transactionHash: string;
  onchainStatus: string;
  error: string;
  batchKey: string;
  collectionMode: 'single' | 'batch' | '';
  requestedByWalletAddress: string;
  requestedAt: string;
  collectedAt: string;
  createdAt: string;
  updatedAt: string;
  buyer: {
    nickname: string;
    walletAddress: string;
  };
  seller: {
    nickname: string;
    walletAddress: string;
    escrowWalletAddress: string;
  };
  agent: {
    agentcode: string;
    name: string;
    logo: string;
  };
};

export type AgentPlatformFeeCollectionAttemptDoc = {
  orderId: string;
  feeType: typeof AGENT_PLATFORM_FEE_TYPE;
  feeVersion: typeof AGENT_PLATFORM_FEE_VERSION;
  agentcode: string;
  tradeId: string;
  chain: string;
  status: AgentPlatformFeeReceivableStatus;
  previousStatus: AgentPlatformFeeReceivableStatus;
  fromAddress: string;
  fromWallet?: {
    signerAddress: string;
    smartAccountAddress: string;
  };
  toAddress: string;
  usdtAmount: number;
  feePercent: number;
  feeAmountUsdt: number;
  transactionId: string;
  transactionHash: string;
  onchainStatus: string;
  error: string;
  requestedByWalletAddress: string;
  requestIdempotencyKey: string;
  batchKey: string;
  mode: 'single' | 'batch';
  source: string;
  requestedAt: string;
  updatedAt: string;
};

export type BuildReceivableResult = {
  doc: AgentPlatformFeeReceivableDoc | null;
  reason: string;
};

const USDT_AMOUNT_PRECISION = 6;

export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
export const normalizeWalletAddress = (value: unknown) => String(value || '').trim();

export const roundDownUsdtAmount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor((value + Number.EPSILON) * 1_000_000) / 1_000_000;
};

export const normalizeFeePercent = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 10000) / 10000;
};

export const resolveExpectedAgentFeeAmount = (
  usdtAmount: unknown,
  feePercent: unknown,
) => {
  const normalizedUsdtAmount = roundDownUsdtAmount(Number(usdtAmount || 0));
  const normalizedFeePercent = normalizeFeePercent(feePercent);
  if (normalizedUsdtAmount <= 0 || normalizedFeePercent <= 0) return 0;
  return roundDownUsdtAmount((normalizedUsdtAmount * normalizedFeePercent) / 100);
};

export const toCollectStatus = (value: unknown): AgentPlatformFeeReceivableStatus => {
  const normalized = String(value || '').trim().toUpperCase();
  if (
    normalized === 'PENDING'
    || normalized === 'REQUESTING'
    || normalized === 'QUEUED'
    || normalized === 'SUBMITTED'
    || normalized === 'CONFIRMED'
    || normalized === 'FAILED'
    || normalized === 'BLOCKED_LOW_BALANCE'
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
    normalized.includes('SUBMIT')
    || normalized.includes('SENT')
    || normalized.includes('BROADCAST')
  ) {
    return 'SUBMITTED';
  }
  if (normalized.includes('REQUEST')) {
    return 'REQUESTING';
  }
  if (
    normalized.includes('LOW_BALANCE')
    || normalized.includes('INSUFFICIENT')
  ) {
    return 'BLOCKED_LOW_BALANCE';
  }
  if (
    normalized.includes('FAIL')
    || normalized.includes('ERROR')
    || normalized.includes('REVERT')
    || normalized.includes('CANCEL')
  ) {
    return 'FAILED';
  }
  return 'PENDING';
};

export const isLowBalanceError = (value: unknown) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  return (
    text.includes('insufficient')
    || text.includes('not enough')
    || text.includes('low balance')
    || text.includes('balance too low')
  );
};

const toText = (value: unknown) => String(value || '').trim();

export const toErrorMessage = (value: unknown) => {
  if (!value) return '';
  if (value instanceof Error) return String(value.message || '').trim();
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const valueRecord = value as Record<string, unknown>;
    const directMessage = typeof valueRecord.message === 'string' ? valueRecord.message.trim() : '';
    if (directMessage) return directMessage;
    const innerError = valueRecord.innerError;
    if (innerError && typeof innerError === 'object' && innerError !== null) {
      const innerMessage = typeof (innerError as Record<string, unknown>).message === 'string'
        ? String((innerError as Record<string, unknown>).message || '').trim()
        : '';
      if (innerMessage) return innerMessage;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value).trim();
};

export const ensureAgentPlatformFeeCollections = async (db: Db) => {
  const receivablesCollection = db.collection<AgentPlatformFeeReceivableDoc>(PLATFORM_FEE_RECEIVABLE_COLLECTION);
  const attemptsCollection = db.collection<AgentPlatformFeeCollectionAttemptDoc>(PLATFORM_FEE_COLLECTION_ATTEMPT_COLLECTION);

  await Promise.allSettled([
    receivablesCollection.createIndex(
      { orderId: 1, feeType: 1, feeVersion: 1 },
      { unique: true, name: 'uniq_order_fee_version' },
    ),
    receivablesCollection.createIndex({ storecode: 1, createdAt: -1 }, { name: 'storecode_createdAt' }),
    receivablesCollection.createIndex({ status: 1, updatedAt: -1 }, { name: 'status_updatedAt' }),
    receivablesCollection.createIndex({ tradeId: 1 }, { name: 'tradeId' }),
    receivablesCollection.createIndex({ fromAddress: 1, toAddress: 1, status: 1 }, { name: 'from_to_status' }),
    receivablesCollection.createIndex({ 'agent.agentcode': 1, createdAt: -1 }, { name: 'agentcode_createdAt' }),
    attemptsCollection.createIndex({ orderId: 1, requestedAt: -1 }, { name: 'orderId_requestedAt' }),
    attemptsCollection.createIndex({ agentcode: 1, requestedAt: -1 }, { name: 'agentcode_requestedAt' }),
    attemptsCollection.createIndex({ status: 1, requestedAt: -1 }, { name: 'status_requestedAt' }),
    attemptsCollection.createIndex({ batchKey: 1, requestedAt: -1 }, { name: 'batchKey_requestedAt' }),
    attemptsCollection.createIndex({ transactionId: 1 }, { name: 'transactionId' }),
    attemptsCollection.createIndex(
      { requestIdempotencyKey: 1 },
      { unique: true, name: 'uniq_request_idempotency_key' },
    ),
  ]);

  return {
    receivablesCollection,
    attemptsCollection,
  };
};

export const buildAgentPlatformFeeReceivableFromOrder = (
  {
    order,
    orderId,
    nowIso,
  }: {
    order: Record<string, unknown>;
    orderId: string;
    nowIso?: string;
  },
): BuildReceivableResult => {
  const currentIso = String(nowIso || new Date().toISOString());
  const feePercent = normalizeFeePercent((order as any)?.agentPlatformFee?.percentage);
  if (feePercent <= 0) {
    return { doc: null, reason: 'FEE_PERCENT_IS_ZERO' };
  }

  const usdtAmount = roundDownUsdtAmount(Number((order as any)?.usdtAmount || 0));
  if (usdtAmount <= 0) {
    return { doc: null, reason: 'USDT_AMOUNT_IS_ZERO' };
  }

  const expectedFeeAmountUsdt = resolveExpectedAgentFeeAmount(usdtAmount, feePercent);
  if (expectedFeeAmountUsdt <= 0) {
    return { doc: null, reason: 'EXPECTED_FEE_IS_ZERO' };
  }
  const krwAmount = Number((order as any)?.krwAmount || 0);

  const fromWalletSignerAddress = normalizeWalletAddress(
    (order as any)?.agentPlatformFee?.fromWallet?.signerAddress,
  );
  const fromWalletSmartAccountAddress = normalizeWalletAddress(
    (order as any)?.agentPlatformFee?.fromWallet?.smartAccountAddress,
  );
  const normalizedFromWalletSignerAddress = isWalletAddress(fromWalletSignerAddress)
    ? fromWalletSignerAddress
    : '';
  const normalizedFromWalletSmartAccountAddress = isWalletAddress(fromWalletSmartAccountAddress)
    ? fromWalletSmartAccountAddress
    : '';
  const fromAddress = normalizeWalletAddress(
    (order as any)?.agentPlatformFee?.fromAddress
    || normalizedFromWalletSmartAccountAddress
    || normalizedFromWalletSignerAddress,
  );
  const toAddress = normalizeWalletAddress((order as any)?.agentPlatformFee?.toAddress);
  const transactionHash = toText((order as any)?.agentPlatformFee?.transactionHash || (order as any)?.agentPlatformFee?.txHash);
  const transactionId = toText((order as any)?.agentPlatformFee?.transactionId);
  const rawError = toText((order as any)?.agentPlatformFee?.collectionError);

  const storedCollectionStatus = toCollectStatus((order as any)?.agentPlatformFee?.collectionStatus);
  const status = transactionHash
    ? 'CONFIRMED'
    : (!isWalletAddress(fromAddress) || !isWalletAddress(toAddress))
      ? 'FAILED'
      : rawError && isLowBalanceError(rawError)
        ? 'BLOCKED_LOW_BALANCE'
        : storedCollectionStatus;

  const createdAt = toText((order as any)?.createdAt) || currentIso;
  const collectedAmountUsdt = transactionHash
    ? roundDownUsdtAmount(Number(
      (order as any)?.agentPlatformFee?.amountUsdt
      || (order as any)?.agentPlatformFee?.expectedAmountUsdt
      || expectedFeeAmountUsdt,
    ))
    : 0;

  const doc: AgentPlatformFeeReceivableDoc = {
    orderId,
    feeType: AGENT_PLATFORM_FEE_TYPE,
    feeVersion: AGENT_PLATFORM_FEE_VERSION,
    tradeId: toText((order as any)?.tradeId),
    chain: toText((order as any)?.chain),
    clientId: toText((order as any)?.clientId),
    storecode: toText((order as any)?.storecode),
    orderStatus: toText((order as any)?.status),
    status,
    usdtAmount,
    krwAmount: Number.isFinite(krwAmount) ? krwAmount : 0,
    feePercent,
    expectedFeeAmountUsdt,
    collectedFeeAmountUsdt: collectedAmountUsdt,
    fromAddress,
    fromWallet: {
      signerAddress: normalizedFromWalletSignerAddress,
      smartAccountAddress: normalizedFromWalletSmartAccountAddress || fromAddress,
    },
    toAddress,
    transactionId,
    transactionHash,
    onchainStatus: toText((order as any)?.agentPlatformFee?.onchainStatus),
    error: (!isWalletAddress(fromAddress) || !isWalletAddress(toAddress)) ? 'INVALID_WALLET_ADDRESS' : rawError,
    batchKey: toText((order as any)?.agentPlatformFee?.collectionBatchKey),
    collectionMode: toText((order as any)?.agentPlatformFee?.collectionMode) === 'batch' ? 'batch' : (
      toText((order as any)?.agentPlatformFee?.collectionMode) === 'single' ? 'single' : ''
    ),
    requestedByWalletAddress: toText((order as any)?.agentPlatformFee?.collectionRequestedByWalletAddress),
    requestedAt: toText((order as any)?.agentPlatformFee?.collectionRequestedAt),
    collectedAt: toText((order as any)?.agentPlatformFee?.collectedAt),
    createdAt,
    updatedAt: currentIso,
    buyer: {
      nickname: toText((order as any)?.nickname || (order as any)?.buyer?.nickname),
      walletAddress: toText((order as any)?.walletAddress || (order as any)?.buyer?.walletAddress),
    },
    seller: {
      nickname: toText((order as any)?.seller?.nickname),
      walletAddress: toText((order as any)?.seller?.walletAddress),
      escrowWalletAddress: toText((order as any)?.seller?.escrowWalletAddress),
    },
    agent: {
      agentcode: toText((order as any)?.agent?.agentcode || (order as any)?.agentcode),
      name: toText((order as any)?.agent?.agentName || (order as any)?.agentName),
      logo: toText((order as any)?.agent?.agentLogo || (order as any)?.agentLogo),
    },
  };

  return { doc, reason: '' };
};

export const buildAgentPlatformFeeAttemptIdempotencyKey = (
  {
    orderId,
    batchKey,
    mode,
  }: {
    orderId: string;
    batchKey: string;
    mode: 'single' | 'batch';
  },
) => `${orderId}:${AGENT_PLATFORM_FEE_TYPE}:${AGENT_PLATFORM_FEE_VERSION}:${batchKey}:${mode}`;

export const toRawUsdtAmountFromRoundedValue = (value: number, decimals: number) => {
  const normalizedValue = roundDownUsdtAmount(value);
  if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) {
    return 0n;
  }

  const fixed = normalizedValue.toFixed(USDT_AMOUNT_PRECISION);
  const [wholePart, fractionPart = ''] = fixed.split('.');
  const wholeUnits = BigInt(wholePart || '0') * (10n ** BigInt(USDT_AMOUNT_PRECISION));
  const fractionUnits = BigInt((fractionPart || '').padEnd(USDT_AMOUNT_PRECISION, '0').slice(0, USDT_AMOUNT_PRECISION) || '0');
  const normalizedUnits = wholeUnits + fractionUnits;

  if (decimals === USDT_AMOUNT_PRECISION) {
    return normalizedUnits;
  }
  if (decimals > USDT_AMOUNT_PRECISION) {
    return normalizedUnits * (10n ** BigInt(decimals - USDT_AMOUNT_PRECISION));
  }
  return normalizedUnits / (10n ** BigInt(USDT_AMOUNT_PRECISION - decimals));
};

export const formatRawUsdtAmount = (rawAmount: bigint, decimals: number) => {
  if (rawAmount <= 0n) return '0';
  if (decimals <= 0) return rawAmount.toString();
  const divider = 10n ** BigInt(decimals);
  const whole = rawAmount / divider;
  const remainder = rawAmount % divider;
  const fractionText = remainder
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  return fractionText ? `${whole.toString()}.${fractionText}` : whole.toString();
};
