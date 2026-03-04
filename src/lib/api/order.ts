import { use } from 'react';
import clientPromise from '../mongodb';

import { dbName } from '../mongodb';
import { createThirdwebClient, Engine, getContract } from 'thirdweb';
import { transfer, balanceOf } from 'thirdweb/extensions/erc20';
import { ethereum, polygon, arbitrum, bsc } from 'thirdweb/chains';
import {
  chain as configuredChain,
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from '@/app/config/contractAddresses';
import { normalizeIpAddress } from '@/lib/ip-address';
import {
  AGENT_PLATFORM_FEE_TYPE,
  AGENT_PLATFORM_FEE_VERSION,
  buildAgentPlatformFeeReceivableFromOrder,
} from '@/lib/agentPlatformFeeCollection';


// object id
import { ObjectId } from 'mongodb';
import { create } from 'domain';



export interface UserProps {
  /*
  name: string;
  username: string;
  email: string;
  image: string;
  bio: string;
  bioMdx: MDXRemoteSerializeResult<Record<string, unknown>>;
  followers: number;
  verified: boolean;
  */

  id: string,
  name: string,
  nickname: string,
  storecode: string,
  email: string,
  avatar: string,
  regType: string,
  mobile: string,
  gender: string,
  weight: number,
  height: number,
  birthDate: string,
  purpose: string,
  marketingAgree: string,
  createdAt: string,
  updatedAt: string,
  deletedAt: string,
  loginedAt: string,
  followers : number,
  emailVerified: boolean,
  bio: string,

  password: string,

  seller: any,

  status: string,

  walletAddress: string,
  walletPrivateKey: string,
  isWeb3Wallet: boolean,

  tradeId: string,

  usdtAmount: number,
  krwAmount: number,
  
  acceptedAt: string,
  paymentRequestedAt: string,
  paymentConfirmedAt: string,
  cancelledAt: string,

  buyer: any,

  transactionHash: string,

  agentcode: string,

  totalPaymentConfirmedCount: number,
  totalPaymentConfirmedKrwAmount: number,
  totalPaymentConfirmedUsdtAmount: number,

  escrowWallet: any,

  latestBuyOrder: any,
}

export interface ResultProps {
  totalCount: number;
  orders: UserProps[];
}

const resolveEngineWalletAddress = (createdWallet: any): string => {
  const candidates = [
    createdWallet?.smartAccountAddress,
    createdWallet?.address,
    createdWallet?.walletAddress,
    createdWallet?.serverWalletAddress,
    createdWallet?.account?.address,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

type EngineWalletResolution = {
  signerAddress: string;
  smartAccountAddress: string;
};

const engineWalletResolutionCache = new Map<string, EngineWalletResolution>();

const cacheEngineWalletResolution = (
  {
    signerAddress,
    smartAccountAddress,
  }: {
    signerAddress: string;
    smartAccountAddress?: string;
  },
) => {
  const normalizedSignerAddress = String(signerAddress || '').trim();
  if (!isWalletAddress(normalizedSignerAddress)) {
    return;
  }

  const signerKey = normalizedSignerAddress.toLowerCase();
  engineWalletResolutionCache.set(signerKey, {
    signerAddress: normalizedSignerAddress,
    smartAccountAddress: '',
  });

  const normalizedSmartAccountAddress = String(smartAccountAddress || '').trim();
  if (!isWalletAddress(normalizedSmartAccountAddress)) {
    return;
  }

  const smartKey = normalizedSmartAccountAddress.toLowerCase();
  engineWalletResolutionCache.set(smartKey, {
    signerAddress: normalizedSignerAddress,
    smartAccountAddress: normalizedSmartAccountAddress,
  });
};

const resolveEngineWalletResolution = async (
  {
    client,
    walletAddress,
  }: {
    client: any;
    walletAddress: string;
  },
): Promise<EngineWalletResolution> => {
  const normalizedWalletAddress = String(walletAddress || '').trim();
  if (!isWalletAddress(normalizedWalletAddress)) {
    return {
      signerAddress: normalizedWalletAddress,
      smartAccountAddress: '',
    };
  }

  const cacheKey = normalizedWalletAddress.toLowerCase();
  const cached = engineWalletResolutionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

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
        cacheEngineWalletResolution({
          signerAddress: String(account?.address || '').trim(),
          smartAccountAddress: String(account?.smartAccountAddress || '').trim(),
        });
      }

      const matched = engineWalletResolutionCache.get(cacheKey);
      if (matched) {
        return matched;
      }

      const totalCount = Number(response?.pagination?.totalCount || 0);
      const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageLimit) : page;
      if (page >= totalPages) {
        break;
      }
      page += 1;
    }
  } catch (error) {
    console.error('resolveEngineWalletResolution: failed to fetch engine server wallets', error);
  }

  const fallback = {
    signerAddress: normalizedWalletAddress,
    smartAccountAddress: '',
  };
  engineWalletResolutionCache.set(cacheKey, fallback);
  return fallback;
};

const createEngineServerWallet = async (
  {
    client,
    walletAddress,
    chain,
  }: {
    client: any;
    walletAddress: string;
    chain: any;
  },
) => {
  const walletResolution = await resolveEngineWalletResolution({
    client,
    walletAddress,
  });

  const executionOptions = walletResolution.smartAccountAddress
    ? {
        type: 'ERC4337' as const,
        signerAddress: walletResolution.signerAddress,
        smartAccountAddress: walletResolution.smartAccountAddress,
      }
    : undefined;

  return Engine.serverWallet({
    client,
    address: walletResolution.signerAddress,
    chain,
    ...(executionOptions ? { executionOptions } : {}),
  });
};

const resolveSellerEscrowWalletAddress = (orderLike: any): string => {
  const candidates = [
    orderLike?.seller?.escrowWalletAddress,
    orderLike?.seller?.walletAddress,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const resolveBuyerEscrowWalletAddress = (orderLike: any): string => {
  const candidates = [
    orderLike?.buyer?.escrowWalletAddress,
    orderLike?.escrowWallet?.address,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const resolvePrivateOrderEscrowWalletSignerAndSmartAddress = (orderLike: any): {
  signerAddress: string;
  smartAccountAddress: string;
} => {
  const signerAddressCandidates = [
    orderLike?.escrowWallet?.signerAddress,
    orderLike?.escrowWallet?.buyer?.signerAddress,
  ];
  const smartAccountAddressCandidates = [
    orderLike?.escrowWallet?.smartAccountAddress,
    orderLike?.escrowWallet?.buyer?.smartAccountAddress,
    orderLike?.buyer?.escrowWalletAddress,
    orderLike?.escrowWallet?.address,
  ];

  let signerAddress = '';
  for (const candidate of signerAddressCandidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim();
    if (isWalletAddress(normalized)) {
      signerAddress = normalized;
      break;
    }
  }

  let smartAccountAddress = '';
  for (const candidate of smartAccountAddressCandidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim();
    if (isWalletAddress(normalized)) {
      smartAccountAddress = normalized;
      break;
    }
  }

  return {
    signerAddress,
    smartAccountAddress,
  };
};

const waitMs = async (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const USDT_AMOUNT_PRECISION = 6;
const USDT_AMOUNT_SCALE = 10 ** USDT_AMOUNT_PRECISION;

const roundDownUsdtAmount = (value: number) => Math.floor(value * USDT_AMOUNT_SCALE) / USDT_AMOUNT_SCALE;

const formatRawUsdtAmount = (rawAmount: bigint, decimals: number): string => {
  if (rawAmount <= 0n) {
    return '0';
  }

  if (decimals <= 0) {
    return rawAmount.toString();
  }

  const base = 10n ** BigInt(decimals);
  const whole = rawAmount / base;
  const fraction = rawAmount % base;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fractionText}`;
};

const toRawUsdtAmountFromRoundedValue = (value: number, decimals: number): bigint => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0n;
  }

  const normalized = roundDownUsdtAmount(value).toFixed(USDT_AMOUNT_PRECISION);
  const [integerPart, fractionPart = ''] = normalized.split('.');
  const paddedFractionPart =
    `${fractionPart}${'0'.repeat(USDT_AMOUNT_PRECISION)}`.slice(0, USDT_AMOUNT_PRECISION);
  const normalizedUnits =
    (BigInt(integerPart || '0') * (10n ** BigInt(USDT_AMOUNT_PRECISION)))
    + BigInt(paddedFractionPart || '0');

  if (decimals === USDT_AMOUNT_PRECISION) {
    return normalizedUnits;
  }

  if (decimals > USDT_AMOUNT_PRECISION) {
    return normalizedUnits * (10n ** BigInt(decimals - USDT_AMOUNT_PRECISION));
  }

  return normalizedUnits / (10n ** BigInt(USDT_AMOUNT_PRECISION - decimals));
};

const toUsdtAmountOrZero = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return roundDownUsdtAmount(numeric);
};

const toNonNegativeUsdtAmountOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return roundDownUsdtAmount(numeric);
};

const toKrwAmountOrZero = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric);
};

const toRateOrZero = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric;
};

const calculateKrwAmountFromUsdtAndRate = ({
  usdtAmount,
  rate,
}: {
  usdtAmount: unknown;
  rate: unknown;
}) => {
  const normalizedUsdtAmount = toUsdtAmountOrZero(usdtAmount);
  const normalizedRate = toRateOrZero(rate);
  if (normalizedUsdtAmount <= 0 || normalizedRate <= 0) {
    return 0;
  }
  const calculated = normalizedUsdtAmount * normalizedRate;
  if (!Number.isFinite(calculated) || calculated <= 0) {
    return 0;
  }
  return Math.round(calculated);
};

const calculateUsdtAmountFromKrwAndRate = ({
  krwAmount,
  rate,
}: {
  krwAmount: unknown;
  rate: unknown;
}) => {
  const normalizedKrwAmount = toKrwAmountOrZero(krwAmount);
  const normalizedRate = toRateOrZero(rate);
  if (normalizedKrwAmount <= 0 || normalizedRate <= 0) {
    return {
      krwAmount: 0,
      rate: 0,
      usdtAmount: 0,
    };
  }
  return {
    krwAmount: normalizedKrwAmount,
    rate: normalizedRate,
    usdtAmount: roundDownUsdtAmount(normalizedKrwAmount / normalizedRate),
  };
};

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

const toFeeRateOrNull = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.round(numeric * 10000) / 10000;
};

const resolveCreditWalletSmartAccountAddress = (source: any): string => {
  const resolved = resolveCreditWalletSignerAndSmartAccountAddress(source);
  if (resolved.smartAccountAddress) {
    return resolved.smartAccountAddress;
  }

  return '';
};

const resolveCreditWalletSignerAndSmartAccountAddress = (source: any): {
  signerAddress: string;
  smartAccountAddress: string;
} => {
  if (!source || typeof source !== 'object') {
    return {
      signerAddress: '',
      smartAccountAddress: '',
    };
  }

  const creditWallet =
    source?.creditWallet && typeof source.creditWallet === 'object'
      ? source.creditWallet
      : {};

  const signerAddress = String(
    creditWallet?.signerAddress || source?.signerAddress || '',
  ).trim();
  const smartAccountAddress = String(
    creditWallet?.smartAccountAddress || source?.smartAccountAddress || signerAddress || '',
  ).trim();

  const normalizedSignerAddress = isWalletAddress(signerAddress) ? signerAddress : '';
  const normalizedSmartAccountAddress = isWalletAddress(smartAccountAddress) ? smartAccountAddress : '';

  return {
    signerAddress: normalizedSignerAddress,
    smartAccountAddress: normalizedSmartAccountAddress,
  };
};

const resolveAgentPlatformFeePercentage = (agentLike: any): number =>
  toFeeRateOrNull(agentLike?.agentFeePercent ?? agentLike?.platformFeePercent) ?? 0;

const resolveAgentPlatformFeeConfig = (
  {
    agent,
    clientInfo,
  }: {
    agent: any;
    clientInfo: any;
  },
) => {
  const percentage = resolveAgentPlatformFeePercentage(agent);
  const fromWallet = resolveCreditWalletSignerAndSmartAccountAddress(agent);
  const fromAddress = fromWallet.smartAccountAddress || fromWallet.signerAddress || '';
  const toAddress = resolveCreditWalletSmartAccountAddress(clientInfo);

  return {
    percentage,
    fromAddress,
    toAddress,
    fromWallet: {
      signerAddress: fromWallet.signerAddress,
      smartAccountAddress: fromWallet.smartAccountAddress || fromWallet.signerAddress || '',
    },
  };
};

const upsertAgentPlatformFeeReceivableForOrder = async (
  {
    mongoClient,
    orderId,
    orderLike,
  }: {
    mongoClient: any;
    orderId: string;
    orderLike: Record<string, unknown>;
  },
) => {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId || !orderLike) return;

  const nowIso = new Date().toISOString();
  const { doc } = buildAgentPlatformFeeReceivableFromOrder({
    order: orderLike,
    orderId: normalizedOrderId,
    nowIso,
  });
  if (!doc) return;

  const collection = mongoClient.db(dbName).collection('platformFeeReceivables');
  await collection.updateOne(
    {
      orderId: normalizedOrderId,
      feeType: AGENT_PLATFORM_FEE_TYPE,
      feeVersion: AGENT_PLATFORM_FEE_VERSION,
    },
    {
      $set: {
        ...doc,
        updatedAt: nowIso,
      },
      $setOnInsert: {
        createdAt: doc.createdAt || nowIso,
      },
    },
    { upsert: true },
  );
};

const getClientInfoByClientId = async (
  {
    mongoClient,
    clientId,
  }: {
    mongoClient: any;
    clientId: string;
  },
) => {
  const normalizedClientId = String(clientId || '').trim();
  if (!normalizedClientId) {
    return null;
  }

  const clientsCollection = mongoClient.db(dbName).collection('clients');
  return clientsCollection.findOne(
    { clientId: normalizedClientId },
    {
      projection: {
        _id: 0,
        clientId: 1,
        creditWallet: 1,
        smartAccountAddress: 1,
      },
    },
  );
};

const resolvePrivateOrderPlatformFee = (
  {
    order,
    sellerUser,
  }: {
    order: any;
    sellerUser: any;
  },
) => {
  const rateCandidates: Array<{ source: string; value: unknown }> = [
    { source: 'seller.platformFee.rate', value: sellerUser?.seller?.platformFee?.rate },
    { source: 'seller.platformFee.percentage', value: sellerUser?.seller?.platformFee?.percentage },
    { source: 'order.platformFee.rate', value: order?.platformFee?.rate },
    { source: 'order.platformFee.percentage', value: order?.platformFee?.percentage },
    { source: 'order.seller.platformFee.rate', value: order?.seller?.platformFee?.rate },
    { source: 'order.seller.platformFee.percentage', value: order?.seller?.platformFee?.percentage },
    { source: 'order.tradeFeeRate', value: order?.tradeFeeRate },
    { source: 'order.centerFeeRate', value: order?.centerFeeRate },
    { source: 'env.NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE', value: process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE },
  ];

  const walletCandidates: Array<{ source: string; value: unknown }> = [
    { source: 'seller.platformFee.walletAddress', value: sellerUser?.seller?.platformFee?.walletAddress },
    { source: 'seller.platformFee.address', value: sellerUser?.seller?.platformFee?.address },
    { source: 'order.platformFee.walletAddress', value: order?.platformFee?.walletAddress },
    { source: 'order.platformFee.address', value: order?.platformFee?.address },
    { source: 'order.seller.platformFee.walletAddress', value: order?.seller?.platformFee?.walletAddress },
    { source: 'order.seller.platformFee.address', value: order?.seller?.platformFee?.address },
    { source: 'env.NEXT_PUBLIC_PLATFORM_FEE_ADDRESS', value: process.env.NEXT_PUBLIC_PLATFORM_FEE_ADDRESS },
  ];

  const matchedRateCandidate = rateCandidates.find((candidate) => toFeeRateOrNull(candidate.value) !== null);
  const matchedWalletCandidate = walletCandidates.find((candidate) =>
    isWalletAddress(String(candidate.value || '').trim()),
  );

  const resolvedFeeRate = matchedRateCandidate ? (toFeeRateOrNull(matchedRateCandidate.value) || 0) : 0;
  const resolvedFeeWalletAddress = matchedWalletCandidate
    ? String(matchedWalletCandidate.value || '').trim()
    : '';

  return {
    feeRatePercent: resolvedFeeRate,
    feeWalletAddress: resolvedFeeWalletAddress,
    source: [
      matchedRateCandidate?.source || '',
      matchedWalletCandidate?.source || '',
    ].filter(Boolean).join(' | '),
  };
};

const resolveStoredPrivateOrderTransferPlan = (orderLike: any) => {
  const buyerTransferUsdtAmount = toUsdtAmountOrZero(orderLike?.usdtAmount);

  const feeRateCandidates: Array<{ source: string; value: unknown }> = [
    { source: 'order.platformFeeRate', value: orderLike?.platformFeeRate },
    { source: 'order.platformFee.rate', value: orderLike?.platformFee?.rate },
    { source: 'order.platformFee.percentage', value: orderLike?.platformFee?.percentage },
    { source: 'order.settlement.platformFeePercent', value: orderLike?.settlement?.platformFeePercent },
  ];
  const feeWalletCandidates: Array<{ source: string; value: unknown }> = [
    { source: 'order.platformFeeWalletAddress', value: orderLike?.platformFeeWalletAddress },
    { source: 'order.platformFee.walletAddress', value: orderLike?.platformFee?.walletAddress },
    { source: 'order.platformFee.address', value: orderLike?.platformFee?.address },
    { source: 'order.settlement.platformFeeWalletAddress', value: orderLike?.settlement?.platformFeeWalletAddress },
  ];
  const feeAmountCandidates: Array<{ source: string; value: unknown }> = [
    { source: 'order.platformFeeAmount', value: orderLike?.platformFeeAmount },
    { source: 'order.platformFee.amount', value: orderLike?.platformFee?.amount },
    { source: 'order.platformFee.amountUsdt', value: orderLike?.platformFee?.amountUsdt },
    { source: 'order.settlement.platformFeeAmount', value: orderLike?.settlement?.platformFeeAmount },
  ];
  const escrowLockCandidates: Array<{ source: string; value: unknown }> = [
    { source: 'order.escrowLockUsdtAmount', value: orderLike?.escrowLockUsdtAmount },
    { source: 'order.escrow.lockUsdtAmount', value: orderLike?.escrow?.lockUsdtAmount },
    { source: 'order.buyer.escrowLockedUsdtAmount', value: orderLike?.buyer?.escrowLockedUsdtAmount },
    { source: 'order.seller.escrowLockedUsdtAmount', value: orderLike?.seller?.escrowLockedUsdtAmount },
    { source: 'order.platformFee.escrowLockAmount', value: orderLike?.platformFee?.escrowLockAmount },
    { source: 'order.platformFee.totalEscrowAmount', value: orderLike?.platformFee?.totalEscrowAmount },
    { source: 'order.platformFee.totalTransferAmount', value: orderLike?.platformFee?.totalTransferAmount },
    { source: 'order.settlement.totalTransferAmount', value: orderLike?.settlement?.totalTransferAmount },
    { source: 'order.settlement.transferTotalAmount', value: orderLike?.settlement?.transferTotalAmount },
  ];

  const matchedFeeRate = feeRateCandidates.find((candidate) => toFeeRateOrNull(candidate.value) !== null);
  const matchedFeeWallet = feeWalletCandidates.find((candidate) =>
    isWalletAddress(String(candidate.value || '').trim()),
  );
  const matchedFeeAmount = feeAmountCandidates.find((candidate) => toNonNegativeUsdtAmountOrNull(candidate.value) !== null);
  const matchedEscrowLock = escrowLockCandidates.find((candidate) => toUsdtAmountOrZero(candidate.value) > 0);

  const feeRatePercent = matchedFeeRate ? (toFeeRateOrNull(matchedFeeRate.value) || 0) : 0;
  const feeWalletAddress = matchedFeeWallet ? String(matchedFeeWallet.value || '').trim() : '';

  let platformFeeUsdtAmount = matchedFeeAmount
    ? (toNonNegativeUsdtAmountOrNull(matchedFeeAmount.value) || 0)
    : 0;

  let totalTransferUsdtAmount = matchedEscrowLock
    ? toUsdtAmountOrZero(matchedEscrowLock.value)
    : 0;

  if (totalTransferUsdtAmount <= 0) {
    totalTransferUsdtAmount = roundDownUsdtAmount(buyerTransferUsdtAmount + platformFeeUsdtAmount);
  }

  if (platformFeeUsdtAmount <= 0 && totalTransferUsdtAmount > buyerTransferUsdtAmount) {
    platformFeeUsdtAmount = roundDownUsdtAmount(totalTransferUsdtAmount - buyerTransferUsdtAmount);
  }

  if (totalTransferUsdtAmount <= 0) {
    totalTransferUsdtAmount = buyerTransferUsdtAmount;
  }

  const minExpectedTotal = roundDownUsdtAmount(buyerTransferUsdtAmount + platformFeeUsdtAmount);
  if (totalTransferUsdtAmount < minExpectedTotal) {
    totalTransferUsdtAmount = minExpectedTotal;
  }

  const shouldTransferPlatformFee =
    platformFeeUsdtAmount > 0 && totalTransferUsdtAmount > buyerTransferUsdtAmount;

  return {
    buyerTransferUsdtAmount,
    platformFeeUsdtAmount: shouldTransferPlatformFee ? platformFeeUsdtAmount : 0,
    totalTransferUsdtAmount,
    feeRatePercent,
    feeWalletAddress,
    shouldTransferPlatformFee,
    transferCount: shouldTransferPlatformFee ? 2 : 1,
    source: [
      matchedFeeRate?.source || '',
      matchedFeeAmount?.source || '',
      matchedEscrowLock?.source || '',
      matchedFeeWallet?.source || '',
    ].filter(Boolean).join(' | '),
  };
};

const resolveUsdtTransferConfig = () => {
  const currentChain = String(configuredChain || process.env.NEXT_PUBLIC_CHAIN || 'polygon').toLowerCase();
  if (currentChain === 'ethereum') {
    return {
      chain: ethereum,
      contractAddress: ethereumContractAddressUSDT,
    };
  }
  if (currentChain === 'arbitrum') {
    return {
      chain: arbitrum,
      contractAddress: arbitrumContractAddressUSDT,
    };
  }
  if (currentChain === 'bsc') {
    return {
      chain: bsc,
      contractAddress: bscContractAddressUSDT,
    };
  }
  return {
    chain: polygon,
    contractAddress: polygonContractAddressUSDT,
  };
};

const resolveUsdtDecimals = () => {
  const currentChain = String(configuredChain || process.env.NEXT_PUBLIC_CHAIN || 'polygon').toLowerCase();
  return currentChain === 'bsc' ? 18 : 6;
};

type EscrowTransferReconciliationResult = {
  success: boolean;
  transactionHash: string;
  reason: 'ENGINE_CONFIRMED' | 'BALANCE_VERIFIED' | 'UNVERIFIED';
  detail: string;
};

const reconcileEscrowTransferOutcome = async (
  {
    client,
    transactionId,
    usdtContract,
    recipientWalletAddress,
    expectedUsdtAmount,
    usdtDecimals,
    knownTransactionHash = '',
  }: {
    client: any;
    transactionId?: string;
    usdtContract: any;
    recipientWalletAddress: string;
    expectedUsdtAmount: number;
    usdtDecimals: number;
    knownTransactionHash?: string;
  },
): Promise<EscrowTransferReconciliationResult> => {
  let observedTransactionHash = String(knownTransactionHash || '').trim();
  const reconciliationDetails: string[] = [];
  const normalizedTransactionId = String(transactionId || '').trim();

  if (normalizedTransactionId) {
    for (let i = 0; i < 60; i += 1) {
      try {
        const txStatus = await Engine.getTransactionStatus({
          client,
          transactionId: normalizedTransactionId,
        });

        const statusTxHash =
          typeof (txStatus as any)?.transactionHash === 'string'
            ? String((txStatus as any).transactionHash).trim()
            : '';
        if (statusTxHash) {
          observedTransactionHash = statusTxHash;
        }

        if (txStatus.status === 'CONFIRMED' && txStatus.onchainStatus === 'SUCCESS') {
          return {
            success: true,
            transactionHash: observedTransactionHash,
            reason: 'ENGINE_CONFIRMED',
            detail: 'engine status confirmed after fallback polling',
          };
        }

        if (txStatus.status === 'FAILED') {
          const failedOnchainStatus = String((txStatus as any)?.onchainStatus || 'UNKNOWN');
          reconciliationDetails.push(
            txStatus.error
              ? `engine status failed: ${txStatus.error}`
              : `engine status failed: ${failedOnchainStatus}`,
          );
          break;
        }
      } catch (error) {
        reconciliationDetails.push(
          error instanceof Error ? `engine status poll error: ${error.message}` : `engine status poll error: ${String(error)}`,
        );
      }

      await waitMs(1500);
    }
  } else {
    reconciliationDetails.push('engine transaction id is empty');
  }

  try {
    const expectedRawAmount = toRawUsdtAmountFromRoundedValue(expectedUsdtAmount, usdtDecimals);
    if (expectedRawAmount <= 0n) {
      return {
        success: false,
        transactionHash: observedTransactionHash,
        reason: 'UNVERIFIED',
        detail: 'expected transfer amount is invalid',
      };
    }

    const recipientRawBalance = await balanceOf({
      contract: usdtContract,
      address: recipientWalletAddress,
    });

    if (recipientRawBalance >= expectedRawAmount) {
      return {
        success: true,
        transactionHash: observedTransactionHash,
        reason: 'BALANCE_VERIFIED',
        detail: `recipient balance verified (${recipientRawBalance.toString()} >= ${expectedRawAmount.toString()})`,
      };
    }

    reconciliationDetails.push(
      `recipient balance is lower than expected (${recipientRawBalance.toString()} < ${expectedRawAmount.toString()})`,
    );
  } catch (error) {
    reconciliationDetails.push(
      error instanceof Error ? `recipient balance check failed: ${error.message}` : `recipient balance check failed: ${String(error)}`,
    );
  }

  return {
    success: false,
    transactionHash: observedTransactionHash,
    reason: 'UNVERIFIED',
    detail: reconciliationDetails.join(' | ') || 'transfer could not be verified',
  };
};

const convertRawUsdtToDisplayAmount = (rawAmount: bigint, decimals: number) => {
  if (rawAmount <= 0n) {
    return 0;
  }

  const numeric = Number(formatRawUsdtAmount(rawAmount, decimals));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return roundDownUsdtAmount(numeric);
};




// get usdtPrice by walletAddress
export async function getUsdtPrice(data: any) {

  if (!data.walletAddress) {
    return null;
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection('setup');

  const result = await collection.findOne<UserProps>(
    { $and: [ { walletAddress: data.walletAddress }, { usdtPrice: { $exists: true } } ] }
  );

  ///console.log('getUsdtPrice result: ' + JSON.stringify(result));

  //{"_id":"66b9b4431645dcffd9fbe2c2","walletAddress":"0x68B4F181d97AF97d8b111Ad50A79AfeB33CF6be6","usdtPrice":"1404"}

  if (result) {
    return result;
  } else {
    return null;
  }

}






// updatePrice

export async function updatePrice(data: any) {
  
  ///console.log('updatePrice data: ' + JSON.stringify(data));

  if (!data.walletAddress || !data.price) {
    return null;
  }

  ///console.log('updatePrice data.price: ' + data.price);



  const client = await clientPromise;
  const collection = client.db(dbName).collection('setup');

  // update and return update, or if not exists, insert and return insert

  // check usdtPrice is field of setup collection
  // if exists, update, else insert

  try {

    const result = await collection.findOneAndUpdate(
      { walletAddress: data.walletAddress },
      { $set: { usdtPrice: data.price } },
      { upsert: true, returnDocument: 'after' }
    );

    if (result) {

      ///console.log('updatePrice result: ' + result);

      return result.value;
    } else {
      return null;
    }


  } catch (error) {

    // updatePrice error: MongoInvalidArgumentError: Update document requires atomic operators
    ///console.log('updatePrice error: ' + error);

    return null;
  }




}








export async function insertSellOrder(data: any) {

  //console.log('insertSellOrder data: ' + JSON.stringify(data));

  if (!data.walletAddress || !data.usdtAmount || !data.krwAmount || !data.rate) {
    return null;
  }



  const client = await clientPromise;



  // get user mobile number by wallet address

  const userCollection = client.db(dbName).collection('users');


  const user = await userCollection.findOne<UserProps>(
    { walletAddress: data.walletAddress },
    { projection: { _id: 0, emailVerified: 0 } }
  );

  if (!user) {
    return null;
  }



  ////console.log('user: ' + user);

  const nickname = user.nickname;

  const mobile = user.mobile;

  const avatar = user.avatar;

  const seller = user.seller;



  const collection = client.db(dbName).collection('orders');

 
  const result = await collection.insertOne(

    {
      lang: data.lang,
      chain: data.chain,
      walletAddress: data.walletAddress,
      nickname: nickname,
      mobile: mobile,
      avatar: avatar,
      seller: seller,
      usdtAmount: data.usdtAmount,
      krwAmount: data.krwAmount,
      rate: data.rate,
      createdAt: new Date().toISOString(),
      status: 'ordered',
      privateSale: data.privateSale,
    }
  );


  if (result) {
    return {
      orderId: result.insertedId,
    };
  } else {
    return null;
  }
  

}


// getOrderById
/*
error=====>BSONError: input must be a 24 character hex string, 12 byte Uint8Array, or an integer
*/
export async function getOrderById(orderId: string): Promise<UserProps | null> {

  //console.log('getOrderById orderId: ' + orderId);
  ///  orderId 67470264536de8c4c57ab7488


  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  
  // check orderId is valid ObjectId
  if (!ObjectId.isValid(orderId)) {
    console.log('getOrderById invalid orderId: ' + orderId);
    return null;
  }


  const result = await collection.findOne<UserProps>(
    {
      _id: new ObjectId(orderId),
    }
  );


  if (result) {
    return result;
  } else {
    return null;
  }

}



// get count of open orders not expired 24 hours after created
export async function getOpenOrdersCount(): Promise<number> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  const result = await collection.countDocuments(
    { status: 'ordered', createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() } }
  );

  return result;

}






// get sell orders order by createdAt desc
export async function getSellOrders(
  {
    limit,
    page,
    walletAddress,
    searchMyOrders,
  }: {

    limit: number;
    page: number;
    walletAddress: string;
    searchMyOrders: boolean;
  }
): Promise<ResultProps> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');


  // if limit is more than 1000, set to 1000
  if (limit > 1000) {
    limit = 1000;
  }


  // status is not 'paymentConfirmed'

  // if searchMyOrders is true, get orders by wallet address is walletAddress
  // else get all orders except paymentConfirmed
  // sort status is accepted first, then createdAt desc

  if (searchMyOrders) {

    const results = await collection.find<UserProps>(

      //{ walletAddress: walletAddress, status: { $ne: 'paymentConfirmed' } },
      { walletAddress: walletAddress },
      
      //{ projection: { _id: 0, emailVerified: 0 } }

    )

    .sort({ createdAt: -1 })
    .limit(limit).skip((page - 1) * limit).toArray();



    return {
      totalCount: results.length,
      orders: results,
    };

  } else {

    const results = await collection.find<UserProps>(
      {
        //status: 'ordered',
  
        status: { $ne: 'paymentConfirmed' },
  
        // exclude private sale
        //privateSale: { $ne: true },
      },
      
      //{ projection: { _id: 0, emailVerified: 0 } }
  
    ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();
  
    return {
      totalCount: results.length,
      orders: results,
    };

  }


}



// get sell orders order by createdAt desc
export async function getAllSellOrders(

  {
    status,
    limit,
    page,
    walletAddress,
    searchMyOrders,
  }: {
    status: string;
    limit: number;
    page: number;
    walletAddress: string;
    searchMyOrders: boolean;
  
  }

): Promise<ResultProps> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  // if limit is more than 1000, set to 1000
  if (limit > 1000) {
    limit = 1000;
  }


  // status is not 'paymentConfirmed'

  // if searchMyOrders is true, get orders by wallet address is walletAddress
  // else get all orders except paymentConfirmed
  // sort status is accepted first, then createdAt desc

  ///console.log('getAllSellOrders searchMyOrders: ' + searchMyOrders);

  if (searchMyOrders) {

    // if status is 'all', get all orders by wallet address
    // if status is not 'all', get orders by wallet address and status

    const results = await collection.find<UserProps>(

      //{ walletAddress: walletAddress, status: status },

      {
        walletAddress: walletAddress,

        status: status === 'all' ? { $ne: 'nothing' } : status,

      },


    )
    .sort({ createdAt: -1 })
    .limit(limit).skip((page - 1) * limit).toArray();

    // get total count of orders
    const totalCount = await collection.countDocuments(
      { walletAddress: walletAddress,
        status: status === 'all' ? { $ne: 'nothing' } : status
      }
    );

    return {
      totalCount: totalCount,
      orders: results,
    };

  } else {

    const results = await collection.find<UserProps>(
      
      //{ status: status, },

      {
        status: status === 'all' ? { $ne: 'nothing' } : status,
      },

    ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();

    // get total count of orders
    const totalCount = await collection.countDocuments(
      { status: status }
    );
  
    return {
      totalCount: totalCount,
      orders: results,
    };

  }


}




export async function getOneSellOrder(

  {
    orderId,
  }: {
    orderId: string;  
  }

): Promise<ResultProps> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');


  // status is not 'paymentConfirmed'

  // check orderId is valid ObjectId


  if (!ObjectId.isValid(orderId)) {
    return {
      totalCount: 0,
      orders: [],
    };
  }




  const results = await collection.find<UserProps>(
    {

      _id: new ObjectId(orderId),

      //status: 'ordered',

      ///status: { $ne: 'paymentConfirmed' },

      // exclude private sale
      //privateSale: { $ne: true },
    },
    
    //{ projection: { _id: 0, emailVerified: 0 } }

  ).sort({ createdAt: -1 }).toArray();



  return {
    totalCount: results.length,
    orders: results,
  };

}



// deleete sell order by orderId
export async function deleteSellOrder(

  {
    orderId,
    walletAddress,
  }: {
    orderId: string;
    walletAddress: string;
  
  }


): Promise<boolean> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  // check orderId is valid ObjectId
  if (!ObjectId.isValid(orderId)) {
    return false;
  }

  // check walletAddress is valid

  if (!walletAddress) {
    return false;
  }

  // status is 'ordered'
  const result = await collection.deleteOne(
    { _id: new ObjectId(orderId), walletAddress: walletAddress, status: 'ordered' }
  );



  if (result.deletedCount === 1) {
    return true;
  } else {
    return false;
  }


}





// cancel buy order by orderId from buyer
export async function cancelTradeByBuyer(

  {
    orderId,
    walletAddress,
    cancelTradeReason,
    cancelledByIpAddress = '',
    cancelledByUserAgent = '',
  }: {
    orderId: string;
    walletAddress: string;
    cancelTradeReason: string;
    cancelledByIpAddress?: string;
    cancelledByUserAgent?: string;
  
  }

) {

  console.log('cancelTradeByBuyer orderId: ' + orderId);

  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  // check orderId is valid ObjectId
  if (!ObjectId.isValid(orderId)) {

    console.log('cancelTradeByBuyer invalid orderId: ' + orderId);

    return false;
  }

  // check walletAddress is valid

  if (!walletAddress) {

    console.log('cancelTradeByBuyer invalid walletAddress: ' + walletAddress);
    return false;
  }

  // check status is 'accepted'

  // update status to 'cancelled'
  const now = new Date().toISOString();
  const normalizedCancelledByIpAddress = String(cancelledByIpAddress || '').trim();
  const normalizedCancelledByUserAgent = String(cancelledByUserAgent || '').trim();
  const normalizedCancelledByWalletAddress = String(walletAddress || '').trim();

  
  const result = await collection.updateOne(
    {
      _id: new ObjectId(orderId + ''),
      status: 'paymentRequested'
    },
    { $set: {
      status: 'cancelled',
      cancelTradeReason: cancelTradeReason,
      cancelledAt: now,
      canceller: 'buyer',
      cancelledByRole: 'buyer',
      cancelledByWalletAddress: normalizedCancelledByWalletAddress,
      cancelledByIpAddress: normalizedCancelledByIpAddress,
      cancelledByUserAgent: normalizedCancelledByUserAgent,
    } }
  );


  ///console.log('cancelTradeByBuyer result: ' + JSON.stringify(result));
  /*
  cancelTradeByBuyer result: {"acknowledged":true,"modifiedCount":0,"upsertedId":null,"upsertedCount":0,"matchedCount":0}
  */

  const updated = await collection.findOne<UserProps>(
    { _id: new ObjectId(orderId) }
  );

  if (result) {
    return {
      updated,
    }
  } else {
    return null;
  }


}


// cancelBuyOrderByAdmin
export async function cancelBuyOrderByAdmin(
  {
    orderId,
  }: {
    orderId: string;
  }
) {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  // check orderId is valid ObjectId
  if (!ObjectId.isValid(orderId)) {
    return false;
  }


  // also update user collection
  // find storecode and walletAddress by orderId
  const order = await collection.findOne<any>(
    { _id: new ObjectId(orderId) },
    { projection: {
      storecode: 1,
      walletAddress: 1,
      seller: 1,
    } }
  );

  if (!order) {
    return false;
  }


  // update status to 'cancelled' where status is 'ordered'
  const result = await collection.updateOne(
    { _id: new ObjectId(orderId), status: 'ordered' },
    { $set: {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelTradeReason: '관리자에 의한 취소',
      canceller: 'admin',
    } }
  );



  // user.buyOrderStatus = 'cancelled'
  const userCollection = client.db(dbName).collection('users');
  await userCollection.updateOne(
    { storecode: order.storecode, walletAddress: order.walletAddress },
    { $set: { 'buyer.buyOrderStatus': 'cancelled' } }
  );


  // seller user update
  const sellerEscrowWalletAddress = resolveSellerEscrowWalletAddress(order);
  if (sellerEscrowWalletAddress) {
    await userCollection.updateOne(
      { 'seller.escrowWalletAddress': sellerEscrowWalletAddress },
      { $set: {
        'seller.buyOrder.status': 'cancelled',
        'seller.buyOrder.cancelledAt': new Date().toISOString(),
      } }
    );
  }



  return result;
}



// cancelTradeByAdmin
// update order status to cancelled
// where status is 'accepted'
// and acceptedAt is more than 3 minutes ago

export async function cancelTradeByAdmin() {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // status is 'accepted'
  // acceptedAt is more than 3 minutes ago
  // acceptedAt is mongodb now

  // acceptedAt: 2025-09-11T02:01:51.453Z
 

  const resultArray = await collection.find<UserProps>(
    {
      status: 'accepted',
      privateSale: { $ne: true },
      acceptedAt: { $lt: new Date(Date.now() - 3 * 60 * 1000).toISOString() },
    },
  ).toArray();

  //console.log('cancelTradeByAdmin resultArray: ' + JSON.stringify(resultArray));


  const result = await collection.updateMany(
    
    /*
    { status: 'accepted',
      acceptedAt: { $lt: new Date(Date.now() - 3 * 60 * 1000).toISOString() }
    },
    */
    // legacy auto-cancel should not touch privateSale/paymentRequested orders
    {
      status: 'accepted',
      privateSale: { $ne: true },
      acceptedAt: { $lt: new Date(new Date().getTime() - 30 * 60 * 1000).toISOString() },
    },

    { $set: {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelTradeReason: '자동취소',
      canceller: 'admin',
    } }
  );

  console.log('cancelTradeByAdmin result: ' + JSON.stringify(result));




  return result;

}







// get sell orders order by createdAt desc
export async function getSellOrdersForBuyer(

  {
    limit,
    page,
    walletAddress,
    searchMyOrders,
  }: {

    limit: number;
    page: number;
    walletAddress: string;
    searchMyOrders: boolean;
  }

): Promise<ResultProps> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  // if limit is more than 1000, set to 1000
  if (limit > 1000) {
    limit = 1000;
  }

  // status is not 'paymentConfirmed'



  // if searchMyOrders is true, get orders by buyer wallet address is walletAddress
  // else get all orders except paymentConfirmed

  if (searchMyOrders) {

    const results = await collection.find<UserProps>(
      {
        'buyer.walletAddress': walletAddress,
        status: { $ne: 'paymentConfirmed' },
      },
      
      //{ projection: { _id: 0, emailVerified: 0 } }

    ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();

    return {
      totalCount: results.length,
      orders: results,
    };

  } else {

    const results = await collection.find<UserProps>(
      {
        //status: 'ordered',
  
        status: { $ne: 'paymentConfirmed' },
  
        // exclude private sale
        privateSale: { $ne: true },
      },
      
      //{ projection: { _id: 0, emailVerified: 0 } }
  
    ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();
  
    return {
      totalCount: results.length,
      orders: results,
    };

  }


}





// get sell orders by wallet address order by createdAt desc
export async function getSellOrdersByWalletAddress(

  {
    walletAddress,
    limit,
    page,
  }: {
    walletAddress: string;
    limit: number;
    page: number;
  
  }

): Promise<ResultProps> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  // if limit is more than 1000, set to 1000
  if (limit > 1000) {
    limit = 1000;
  }

  const results = await collection.find<UserProps>(
    { walletAddress: walletAddress },
  ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();

  return {
    totalCount: results.length,
    orders: results,
  };

}



// accept sell order
// update order status to accepted

export async function acceptSellOrder(data: any) {
  
  ///console.log('acceptSellOrder data: ' + JSON.stringify(data));




  if (!data.orderId || !data.buyerWalletAddress ) {
    return null;
  }

  const buyerMemo = data.buyerMemo || '';


  const depositName = data.depositName || '';

  const depositBankName = data.depositBankName || '';




  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  // random number for tradeId
  // 100000 ~ 999999 string

  const tradeId = Math.floor(Math.random() * 900000) + 100000 + '';



  /*
    const result = await collection.findOne<UserProps>(
    { _id: new ObjectId(orderId) }
  );
  */


  ///console.log('acceptSellOrder data.orderId: ' + data.orderId);

 
  // *********************************************
  // update status to accepted if status is ordered

  // if status is not ordered, return null
  // check condition and update status to accepted
  // *********************************************

  const result = await collection.findOneAndUpdate(
    
    { _id: new ObjectId(data.orderId + ''), status: 'ordered' },

    { $set: {
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      tradeId: tradeId,
      buyer: {
        walletAddress: data.buyerWalletAddress,
        nickname: data.buyerNickname,
        avatar: data.buyerAvatar,
        mobile: data.buyerMobile,
        memo: buyerMemo,
        depositName: depositName,
        depositBankName: depositBankName,
      },
    } }
  );









  /*
  const result = await collection.updateOne(
    
    //{ _id: new ObjectId(data.orderId) },

    { _id: new ObjectId( data.orderId + '' ) },




    { $set: {
      status: 'accepted',
      acceptedAt: new Date().toISOString(),


      tradeId: tradeId,

      buyer: {
        walletAddress: data.buyerWalletAddress,
        nickname: data.buyerNickname,
        avatar: data.buyerAvatar,
        mobile: data.buyerMobile,

      },
    } }
  );
  */


  ////console.log('acceptSellOrder result: ' + result);




  if (result) {

    const updated = await collection.findOne<UserProps>(
      { _id: new ObjectId(data.orderId + '') }
    );

    ///console.log('acceptSellOrder updated: ' + JSON.stringify(updated));



    return updated;

  } else {
    return null;
  }
  
}






export async function requestPayment(data: any) {
  
  ///console.log('acceptSellOrder data: ' + JSON.stringify(data));

  if (!data.orderId) {
    return null;
  }

  if (!data.transactionHash) {
    return null;
  }


  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');


  const result = await collection.updateOne(
    
    { _id: new ObjectId(data.orderId + '') },


    { $set: {
      status: 'paymentRequested',
      escrowTransactionHash: data.transactionHash,
      paymentRequestedAt: new Date().toISOString(),
    } }
  );

  if (result) {
    const updated = await collection.findOne<UserProps>(
      { _id: new ObjectId(data.orderId + '') }
    );

    return updated;
  } else {
    return null;
  }
  
}





export async function confirmPayment(data: any) {
  
  if (!data.orderId) {
    return null;
  }

  if (!data.transactionHash) {
    return null;
  }

  const paymentAmount = data.paymentAmount || 0;



  ///console.log('confirmPayment orderId: ' + data.orderId);
  


  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');


  const result = await collection.updateOne(
    
    { _id: new ObjectId(data.orderId+'') },


    { $set: {
      status: 'paymentConfirmed',
      paymentAmount: paymentAmount,
      queueId: data.queueId,
      transactionHash: data.transactionHash,
      paymentConfirmedAt: new Date().toISOString(),
    } }
  );

  if (result) {






    // update store collection
    // get count of paymentConfirmed orders by storecode
    // get sum of krwAmount and usdtAmount by storecode

    // get storecode from order
    const order = await collection.findOne<UserProps>(
      { _id: new ObjectId(data.orderId+'') },
      { projection: {
        storecode: 1,
        agentcode: 1,
      } }
    );


    if (order) {
      const storecode = order.storecode;

      console.log('confirmPayment storecode: ' + storecode);

      const totalPaymentConfirmedCount = await collection.countDocuments(
        { storecode: storecode, status: 'paymentConfirmed' }
      );

      console.log('confirmPayment totalPaymentConfirmedCount: ' + totalPaymentConfirmedCount);


      const totalKrwAmount = await collection.aggregate([
        { $match: { storecode: storecode, status: 'paymentConfirmed' } },
        { $group: { _id: null, totalKrwAmount: { $sum: '$krwAmount' } } }
      ]).toArray();

      console.log('confirmPayment totalKrwAmount: ' + totalKrwAmount[0]?.totalKrwAmount || 0);


      const totalUsdtAmount = await collection.aggregate([
        { $match: { storecode: storecode, status: 'paymentConfirmed' } },
        { $group: { _id: null, totalUsdtAmount: { $sum: '$usdtAmount' } } }
      ]).toArray();

      console.log('confirmPayment totalUsdtAmount: ' + totalUsdtAmount[0]?.totalUsdtAmount || 0);



      // update store collection
      const storeCollection = client.db(dbName).collection('stores');
      const store = await storeCollection.updateOne(
        { storecode: storecode },
        { $set: {
            totalPaymentConfirmedCount: totalPaymentConfirmedCount,
            totalKrwAmount: totalKrwAmount[0]?.totalKrwAmount || 0,
            totalUsdtAmount: totalUsdtAmount[0]?.totalUsdtAmount || 0,
        } }
      );






    // update agnet collection
      const agentcode = order?.agentcode || '';


      // get totalPaymentConfirmedCount and totalKrwAmount and totalUsdtAmount by agentcode
      if (!agentcode) {
        console.log('confirmPayment agentcode is null');
        return null;
      }

      const totalPaymentConfirmedCountByAgent = await collection.countDocuments(
        { agentcode: agentcode, status: 'paymentConfirmed' }
      );

      console.log('confirmPayment totalPaymentConfirmedCountByAgent: ' + totalPaymentConfirmedCountByAgent);
      const totalKrwAmountByAgent = await collection.aggregate([
        { $match: { agentcode: agentcode, status: 'paymentConfirmed' } },
        { $group: { _id: null, totalKrwAmount: { $sum: '$krwAmount' } } }
      ]).toArray();
      console.log('confirmPayment totalKrwAmountByAgent: ' + totalKrwAmountByAgent[0]?.totalKrwAmount || 0);

      const totalUsdtAmountByAgent = await collection.aggregate([
        { $match: { agentcode: agentcode, status: 'paymentConfirmed' } },
        { $group: { _id: null, totalUsdtAmount: { $sum: '$usdtAmount' } } }
      ]).toArray();
      console.log('confirmPayment totalUsdtAmountByAgent: ' + totalUsdtAmountByAgent[0]?.totalUsdtAmount || 0);


      // update agent collection
      const agentCollection = client.db(dbName).collection('agents');
      const agent = await agentCollection.updateOne(
        { agentcode: agentcode },
        { $set: {
          totalPaymentConfirmedCount: totalPaymentConfirmedCountByAgent,
          totalKrwAmount: totalKrwAmountByAgent[0]?.totalKrwAmount || 0,
          totalUsdtAmount: totalUsdtAmountByAgent[0]?.totalUsdtAmount || 0,
        } }
      );









    }





   





    const updated = await collection.findOne<UserProps>(
      { _id: new ObjectId(data.orderId+'') }
    );

    return updated;
  } else {
    return null;
  }
  
}





// get sell orders by wallet address order by createdAt desc
export async function getTradesByWalletAddress(

  {
    walletAddress,
    limit,
    page,
  }: {
    walletAddress: string;
    limit: number;
    page: number;
  
  }

): Promise<ResultProps> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  // if limit is more than 1000, set to 1000
  if (limit > 1000) {
    limit = 1000;
  }

  // get orders by buyer.walletAddress = walletAddress 
  // tradeId is not null

  const results = await collection.find<UserProps>(

    { 'buyer.walletAddress': walletAddress, tradeId: { $ne: null } },

  ).sort({ acceptedAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();



  //console.log('getTradesByWalletAddress results: ' + JSON.stringify(results)); 



  return {
    totalCount: results.length,
    orders: results,
  };

}




// get sell orders by wallet address order by createdAt desc
export async function getTradesByWalletAddressProcessing(

  {
    walletAddress,
    limit,
    page,
  }: {
    walletAddress: string;
    limit: number;
    page: number;
  
  }

): Promise<ResultProps> {



  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  // if limit is more than 1000, set to 1000
  if (limit > 1000) {
    limit = 1000;
  }


  // get orders by buyer.walletAddress = walletAddress 
  // tradeId is not null
  // status is not 'paymentConfirmed'

  const results = await collection.find<UserProps>(

    {
      'buyer.walletAddress': walletAddress,
      tradeId: { $ne: null },
      status: { $ne: 'paymentConfirmed' },
    },

  ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();


  return {
    totalCount: results.length,
    orders: results,
  };

}






// get sell trades by wallet address order by createdAt desc
export async function getSellTradesByWalletAddress(

  {
    walletAddress,
    limit,
    page,
  }: {
    walletAddress: string;
    limit: number;
    page: number;
  
  }

): Promise<ResultProps> {



  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  // if limit is more than 1000, set to 1000
  if (limit > 1000) {
    limit = 1000;
  }


  // get orders by buyer.walletAddress = walletAddress 
  // tradeId is not null

  const results = await collection.find<UserProps>(

    { 'walletAddress': walletAddress, tradeId: { $ne: null } },

  ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();


  return {
    totalCount: results.length,
    orders: results,
  };

}




// get sell trades by wallet address order by createdAt desc
// status is not 'paymentConfirmed'
export async function getSellTradesByWalletAddressProcessing(

  {
    walletAddress,
    limit,
    page,
  }: {
    walletAddress: string;
    limit: number;
    page: number;
  
  }

): Promise<ResultProps> {



  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  // if limit is more than 1000, set to 1000
  if (limit > 1000) {
    limit = 1000;
  }


  // get orders by buyer.walletAddress = walletAddress 
  // tradeId is not null

  const results = await collection.find<UserProps>(

    {
      'walletAddress': walletAddress,
      tradeId: { $ne: null },
      status: { $ne: 'paymentConfirmed' },
    },

  ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();


  return {
    totalCount: results.length,
    orders: results,
  };

}



// get paymentRequested trades by wallet address
// and sum of usdtAmount
export async function getPaymentRequestedUsdtAmountByWalletAddress(

  {
    walletAddress,
  }: {
    walletAddress: string;
  
  }

): Promise<any> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');

  const results = await collection.aggregate([
    {
      $match: {
        'walletAddress': walletAddress,
        status: 'paymentRequested',
      }
    },
    {
      $group: {
        _id: null,
        totalUsdtAmount: { $sum: '$usdtAmount' },
      }
    }
  ]).toArray();

  if (results.length > 0) {
    return results[0];
  } else {
    return null;
  }


}








export async function updateOne(data: any) {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('users');


  // update and return updated user

  if (!data.walletAddress || !data.nickname) {
    return null;
  }


  const result = await collection.updateOne(
    { walletAddress: data.walletAddress },
    { $set: { nickname: data.nickname } }
  );

  if (result) {
    const updated = await collection.findOne<UserProps>(
      { walletAddress: data.walletAddress },
      { projection: { _id: 0, emailVerified: 0 } }
    );

    return updated;
  }


}





export async function sellOrderRollbackPayment(data: any) {
  

  if (!data.orderId) {
    return null;
  }

  if (!data.transactionHash) {
    return null;
  }

  const paymentAmount = data.paymentAmount || 0;


  const client = await clientPromise;
  const collection = client.db(dbName).collection('orders');


  const result = await collection.updateOne(
    
    { _id: new ObjectId(data.orderId+'') },


    { $set: {
      status: 'cancelled',
      paymentAmount: paymentAmount,
      queueId: data.queueId,
      transactionHash: data.transactionHash,
      cancelledAt: new Date().toISOString(),
      rollbackAmount: paymentAmount,
    } }
  );

  if (result) {
    const updated = await collection.findOne<UserProps>(
      { _id: new ObjectId(data.orderId+'') }
    );

    return updated;
  } else {
    return null;
  }
  
}










// "ordered" : "주문완료"

export async function insertBuyOrder(data: any) {


  if (!data.clientId || !data.storecode || !data.walletAddress || !data.krwAmount || !data.rate) {
    
    console.log('insertBuyOrder data is null: ' + JSON.stringify(data));
    
    return null;
  }

  const amountFromKrwRate = calculateUsdtAmountFromKrwAndRate({
    krwAmount: data.krwAmount,
    rate: data.rate,
  });
  const normalizedKrwAmount = amountFromKrwRate.krwAmount;
  const normalizedRate = amountFromKrwRate.rate;
  const normalizedUsdtAmount = amountFromKrwRate.usdtAmount;
  if (normalizedUsdtAmount <= 0) {
    console.log('insertBuyOrder normalized usdt amount is invalid from krw/rate', {
      krwAmount: data.krwAmount,
      rate: data.rate,
      usdtAmount: data.usdtAmount,
    });
    return null;
  }

  const requestedUsdtAmount = toUsdtAmountOrZero(data.usdtAmount);
  if (requestedUsdtAmount > 0 && requestedUsdtAmount !== normalizedUsdtAmount) {
    console.warn('insertBuyOrder usdt amount mismatch corrected by server', {
      walletAddress: data.walletAddress,
      requestedUsdtAmount,
      normalizedUsdtAmount,
      normalizedKrwAmount,
      normalizedRate,
    });
  }

  const nickname = data.nickname || '';


  const client = await clientPromise;


  const storeCollection = client.db(dbName).collection('stores');
  const store = await storeCollection.findOne<any>(
    { storecode: data.storecode },
    { projection:
      { _id: 1,
        agentcode: 1,
        storecode: 1,
        storeName: 1,
        storeType: 1,
        storeUrl: 1,
        storeDescription: 1,
        storeLogo: 1,
        totalBuyerCount: 1,
        sellerWalletAddress: 1,
        adminWalletAddress: 1,
        settlementWalletAddress: 1,
        settlementFeeWalletAddress: 1,
        settlementFeePercent: 1,
        bankInfo: 1,
        agentFeePercent: 1,

        totalSettlementAmount: 1,
        totalUsdtAmountClearance: 1,
      }
    }
  );

  if (!store) {

    console.log('insertBuyOrder storecode is not valid: ' + data.storecode);
    return null;
  }


  const userCollection = client.db(dbName).collection('users');



  
  let user = await userCollection.findOne<UserProps>(
    {
      storecode: data.storecode,
      walletAddress: data.walletAddress
    },
  );

  if (!user) {
    console.log('insertBuyOrder user is null: ' + JSON.stringify(user));
    // inser user if not exists
    await userCollection.insertOne({
      chain: data.chain,
      clientId: data.clientId,
      storecode: data.storecode,
      walletAddress: data.walletAddress,
      nickname: nickname,
      buyOrderStatus: 'ordered',
      latestBuyOrder: {
        storecode: data.storecode,
        storeName: store.storeName,
        storeLogo: store.storeLogo,
        usdtAmount: normalizedUsdtAmount,
        krwAmount: normalizedKrwAmount,
        rate: normalizedRate,
        createdAt: new Date().toISOString(),
      }
    });

    // re-fetch user
    const newUser = await userCollection.findOne<UserProps>(
      {
        storecode: data.storecode,
        walletAddress: data.walletAddress
      },
    );
    if (!newUser) {
      console.log('insertBuyOrder newUser is null: ' + JSON.stringify(newUser));
      return null;
    }


    user = newUser;
  }


  // get agent by storecode

  const agentcode = String(data?.agentcode || store?.agentcode || '').trim();


  if (!agentcode) {
    console.log('insertBuyOrder agentcode is null: ' + agentcode);
    return null;
  }


  const agentCollection = client.db(dbName).collection('agents');
  const agent = await agentCollection.findOne<any>(
    { agentcode: agentcode },
  );

  if (!agent) {
    console.log('insertBuyOrder agent is null: ' + JSON.stringify(agent));
    return null;
  }

  const clientInfo = await getClientInfoByClientId({
    mongoClient: client,
    clientId: String(data.clientId || '').trim(),
  });
  const agentPlatformFee = resolveAgentPlatformFeeConfig({
    agent,
    clientInfo,
  });



  const mobile = user?.mobile;

  const avatar = user?.avatar;

  
  //const seller = user.seller;



  const tradeId = Math.floor(Math.random() * 900000000) + 100000000 + '';

  ///console.log('insertBuyOrder tradeId: ' + tradeId);



  // if user.walletPrivateKey is not exits, isWeb3Wallet = true
  // if user.walletPrivateKey exists, isWeb3Wallet = false
  const isWeb3Wallet = !user?.walletPrivateKey;



  const collection = client.db(dbName).collection('buyorders');







  const result = await collection.insertOne(

    {
      chain: data.chain,
      lang: data.lang,

      clientId: data.clientId,

      agentcode: agentcode,
      agent: agent,
      storecode: data.storecode,
      store: store,

      walletAddress: data.walletAddress,
      isWeb3Wallet: isWeb3Wallet,
      nickname: nickname,
      mobile: mobile,
      avatar: avatar,
      
      userStats: {
        totalPaymentConfirmedCount: user.totalPaymentConfirmedCount || 0,
        totalPaymentConfirmedKrwAmount: user.totalPaymentConfirmedKrwAmount || 0,
        totalPaymentConfirmedUsdtAmount: user.totalPaymentConfirmedUsdtAmount || 0,
      },
      
      //seller: seller,

      usdtAmount: normalizedUsdtAmount,
      krwAmount: normalizedKrwAmount,
      rate: normalizedRate,
      createdAt: new Date().toISOString(),
      status: 'ordered',
      privateSale: data.privateSale,
      
      buyer: data.buyer,

      paymentMethod: data.paymentMethod || 'bank', // default to bank if not provided

      tradeId: tradeId,

      escrowWallet: data.escrowWallet || '', // optional, can be empty

      audioOn: true, // default true


      platformFee: data.platformFee,

      agentPlatformFee,


    }
  );

  
  
  ///console.log('insertBuyOrder result: ' + JSON.stringify(result));


  if (result) {


    // update user collection buyOrderStatus to "ordered"

    await userCollection.updateOne(
      {
        walletAddress: data.walletAddress,
        storecode: data.storecode,
      },
      { $set: {
        buyOrderStatus: 'ordered',
        latestBuyOrder: {
          _id: result.insertedId,
          tradeId: tradeId,
          storecode: data.storecode,
          storeName: store.storeName,
          storeLogo: store.storeLogo,
          usdtAmount: normalizedUsdtAmount,
          krwAmount: normalizedKrwAmount,
          rate: normalizedRate,
          createdAt: new Date().toISOString(),
        }
      } }
    );

    try {
      const insertedOrder = await collection.findOne<Record<string, unknown>>(
        { _id: result.insertedId },
      );
      if (insertedOrder) {
        await upsertAgentPlatformFeeReceivableForOrder({
          mongoClient: client,
          orderId: String(result.insertedId),
          orderLike: insertedOrder,
        });
      }
    } catch (error) {
      console.error('insertBuyOrder: failed to upsert agent platform fee receivable', error);
    }

    return {

      _id: result.insertedId,

      walletAddress: data.walletAddress,
      escrowWalletAddress: data.escrowWallet.address || '', // optional, can be empty

      
    };


    
  } else {
    return null;
  }
  

}









export async function insertBuyOrderForClearance(data: any) {


  if (!data.storecode || !data.walletAddress || !data.krwAmount || !data.rate) {
    
    console.log('insertBuyOrderForClearance data is null: ' + JSON.stringify(data));
    
    return null;
  }

  const amountFromKrwRate = calculateUsdtAmountFromKrwAndRate({
    krwAmount: data.krwAmount,
    rate: data.rate,
  });
  const normalizedKrwAmount = amountFromKrwRate.krwAmount;
  const normalizedRate = amountFromKrwRate.rate;
  const normalizedUsdtAmount = amountFromKrwRate.usdtAmount;
  if (normalizedUsdtAmount <= 0) {
    console.log('insertBuyOrderForClearance normalized usdt amount is invalid from krw/rate', {
      krwAmount: data.krwAmount,
      rate: data.rate,
      usdtAmount: data.usdtAmount,
    });
    return null;
  }

  const requestedUsdtAmount = toUsdtAmountOrZero(data.usdtAmount);
  if (requestedUsdtAmount > 0 && requestedUsdtAmount !== normalizedUsdtAmount) {
    console.warn('insertBuyOrderForClearance usdt amount mismatch corrected by server', {
      walletAddress: data.walletAddress,
      requestedUsdtAmount,
      normalizedUsdtAmount,
      normalizedKrwAmount,
      normalizedRate,
    });
  }


  const nickname = data.nickname || '';


  const client = await clientPromise;


  const storeCollection = client.db(dbName).collection('stores');
  const store = await storeCollection.findOne<any>(
    { storecode: data.storecode },
    { projection:
      { _id: 1,
        agentcode: 1,
        storecode: 1,
        storeName: 1,
        storeType: 1,
        storeUrl: 1,
        storeDescription: 1,
        storeLogo: 1,
        totalBuyerCount: 1,
        sellerWalletAddress: 1,
        adminWalletAddress: 1,
        settlementWalletAddress: 1,
        settlementFeeWalletAddress: 1,
        settlementFeePercent: 1,
        bankInfo: 1,
        agentFeePercent: 1,

        totalSettlementAmount: 1,
        totalUsdtAmountClearance: 1,
      }
    }
  );

  if (!store) {

    console.log('insertBuyOrderForClearance storecode is not valid: ' + data.storecode);
    return null;
  }



  // check clearance user exists
  // clearance user's storecode is 'admin'
  const clearanceStorecode = 'admin';

  const userCollection = client.db(dbName).collection('users');


  const user = await userCollection.findOne<UserProps>(
    {
      storecode: clearanceStorecode,
      walletAddress: data.walletAddress
    },
  );

  if (!user) {
    console.log('insertBuyOrderForClearance user is null: ' + JSON.stringify(user));
    return null;
  }


  // get agent by storecode

  const agentcode = String(data?.agentcode || store?.agentcode || '').trim();


  if (!agentcode) {
    console.log('insertBuyOrderForClearance agentcode is null: ' + agentcode);
    return null;
  }


  const agentCollection = client.db(dbName).collection('agents');
  const agent = await agentCollection.findOne<any>(
    { agentcode: agentcode },
  );

  if (!agent) {
    console.log('insertBuyOrderForClearance agent is null: ' + JSON.stringify(agent));
    return null;
  }

  const clientInfo = await getClientInfoByClientId({
    mongoClient: client,
    clientId: String(data?.clientId || process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || '').trim(),
  });
  const agentPlatformFee = resolveAgentPlatformFeeConfig({
    agent,
    clientInfo,
  });



  const mobile = user?.mobile;

  const avatar = user?.avatar;

  
  //const seller = user.seller;



  const tradeId = Math.floor(Math.random() * 90000000) + 10000000 + '';

  ///console.log('insertBuyOrder tradeId: ' + tradeId);



  const collection = client.db(dbName).collection('buyorders');

 
  const result = await collection.insertOne(

    {
      chain: data.chain,
      lang: data.lang,

      agentcode: agentcode,
      agent: agent,
      storecode: data.storecode,
      store: store,
      walletAddress: data.walletAddress,
      nickname: nickname,
      mobile: mobile,
      avatar: avatar,
      
      //seller: seller,

      usdtAmount: normalizedUsdtAmount,
      krwAmount: normalizedKrwAmount,
      rate: normalizedRate,
      createdAt: new Date().toISOString(),
      status: 'ordered',
      privateSale: data.privateSale,

      buyer: data.buyer,

      agentPlatformFee,

      tradeId: tradeId,
    }
  );

  
  
  ///console.log('insertBuyOrder result: ' + JSON.stringify(result));


  if (result) {


    // update user collection buyOrderStatus to "ordered"

    await userCollection.updateOne(
      {
        walletAddress: data.walletAddress,
        storecode: data.storecode,
      },
      { $set: { buyOrderStatus: 'ordered' } }
    );

    try {
      const insertedOrder = await collection.findOne<Record<string, unknown>>(
        { _id: result.insertedId },
      );
      if (insertedOrder) {
        await upsertAgentPlatformFeeReceivableForOrder({
          mongoClient: client,
          orderId: String(result.insertedId),
          orderLike: insertedOrder,
        });
      }
    } catch (error) {
      console.error('insertBuyOrderForClearance: failed to upsert agent platform fee receivable', error);
    }

    return {

      _id: result.insertedId,

      walletAddress: data.walletAddress,
      
    };


    
  } else {
    return null;
  }
  

}

















export async function insertBuyOrderForUser(data: any) {


  if (!data.storecode || !data.walletAddress || !data.krwAmount || !data.rate) {
    
    console.log('insertBuyOrderForUser data is null: ' + JSON.stringify(data));

    /*
    {
    "walletAddress":"0x1eba71B17AA4beE24b54dC10cA32AAF0789b8D9A",
    "nickname":"",
    "usdtAmount":7.25,
    "krwAmount":10000,"rate":1400,
    "privateSale":true,
    "buyer":{"depositBankName":"","depositName":""}
    }
    */
    
    return null;
  }

  const amountFromKrwRate = calculateUsdtAmountFromKrwAndRate({
    krwAmount: data.krwAmount,
    rate: data.rate,
  });
  const normalizedKrwAmount = amountFromKrwRate.krwAmount;
  const normalizedRate = amountFromKrwRate.rate;
  const normalizedUsdtAmount = amountFromKrwRate.usdtAmount;
  if (normalizedUsdtAmount <= 0) {
    console.log('insertBuyOrderForUser normalized usdt amount is invalid from krw/rate', {
      krwAmount: data.krwAmount,
      rate: data.rate,
      usdtAmount: data.usdtAmount,
    });
    return null;
  }

  const requestedUsdtAmount = toUsdtAmountOrZero(data.usdtAmount);
  if (requestedUsdtAmount > 0 && requestedUsdtAmount !== normalizedUsdtAmount) {
    console.warn('insertBuyOrderForUser usdt amount mismatch corrected by server', {
      walletAddress: data.walletAddress,
      requestedUsdtAmount,
      normalizedUsdtAmount,
      normalizedKrwAmount,
      normalizedRate,
    });
  }


  const nickname = data.nickname || '';


  const client = await clientPromise;


  const storeCollection = client.db(dbName).collection('stores');
  const store = await storeCollection.findOne<any>(
    { storecode: data.storecode },
    { projection:
      { _id: 1,
        agentcode: 1,
        storecode: 1,
        storeName: 1,
        storeType: 1,
        storeUrl: 1,
        storeDescription: 1,
        storeLogo: 1,
        totalBuyerCount: 1,
        sellerWalletAddress: 1,
        adminWalletAddress: 1,
        settlementWalletAddress: 1,
        settlementFeeWalletAddress: 1,
        settlementFeePercent: 1,
        bankInfo: 1,
        agentFeePercent: 1,

        totalSettlementAmount: 1,
        totalUsdtAmountClearance: 1,
      }
    }
  );

  if (!store) {

    console.log('insertBuyOrderForUser storecode is not valid: ' + data.storecode);
    return null;
  }



  // get agent by storecode

  const agentcode = String(data?.agentcode || store?.agentcode || '').trim();


  if (!agentcode) {
    console.log('insertBuyOrderForUser agentcode is null: ' + agentcode);
    return null;
  }


  const agentCollection = client.db(dbName).collection('agents');
  const agent = await agentCollection.findOne<any>(
    { agentcode: agentcode },
  );

  if (!agent) {
    console.log('insertBuyOrderForUser agent is null: ' + JSON.stringify(agent));
    return null;
  }

  const clientInfo = await getClientInfoByClientId({
    mongoClient: client,
    clientId: String(data?.clientId || process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || '').trim(),
  });
  const agentPlatformFee = resolveAgentPlatformFeeConfig({
    agent,
    clientInfo,
  });



  const tradeId = Math.floor(Math.random() * 90000000) + 10000000 + '';

  ///console.log('insertBuyOrder tradeId: ' + tradeId);



  const collection = client.db(dbName).collection('buyorders');

  const mobile = '';
  const avatar = '';
 
  const result = await collection.insertOne(

    {
      lang: data.lang,
      agentcode: agentcode,
      agent: agent,
      storecode: data.storecode,
      store: store,
      walletAddress: data.walletAddress,
      nickname: nickname,
      mobile: mobile,
      avatar: avatar,
      
      //seller: seller,

      usdtAmount: normalizedUsdtAmount,
      krwAmount: normalizedKrwAmount,
      rate: normalizedRate,
      createdAt: new Date().toISOString(),
      
      //status: 'ordered',
      status: 'paymentRequested',
      paymentRequestedAt: new Date().toISOString(),

      privateSale: data.privateSale,
      
      buyer: data.buyer,

      seller: data.seller,

      agentPlatformFee,

      tradeId: tradeId,
    }
  );

  
  
  ///console.log('insertBuyOrder result: ' + JSON.stringify(result));


  if (result) {

    try {
      const insertedOrder = await collection.findOne<Record<string, unknown>>(
        { _id: result.insertedId },
      );
      if (insertedOrder) {
        await upsertAgentPlatformFeeReceivableForOrder({
          mongoClient: client,
          orderId: String(result.insertedId),
          orderLike: insertedOrder,
        });
      }
    } catch (error) {
      console.error('insertBuyOrderForUser: failed to upsert agent platform fee receivable', error);
    }


    return {

      _id: result.insertedId,

      walletAddress: data.walletAddress,
      
    };


    
  } else {
    return null;
  }
  

}










// get buy orders order by createdAt desc
export async function getBuyOrders(
  {
    limit,
    page,
    agentcode,
    storecode,
    walletAddress,
    searchMyOrders,
    searchOrderStatusCancelled,
    searchOrderStatusCompleted,

    searchStoreName,

    privateSale,
    privateSaleMode,

    searchBuyer,
    searchDepositName,

    searchStoreBankAccountNumber,

    fromDate,
    toDate,

  }: {

    limit: number;
    page: number;
    agentcode: string;
    storecode: string;
    walletAddress: string;
    searchMyOrders: boolean;
    searchOrderStatusCancelled: boolean;
    searchOrderStatusCompleted: boolean;

    searchStoreName: string;

    privateSale: boolean;
    privateSaleMode?: 'all' | 'private' | 'normal';

    searchBuyer: string;
    searchDepositName: string;

    searchStoreBankAccountNumber: string;

    fromDate: string;
    toDate: string;
  }

): Promise<any> {


  //console.log('getBuyOrders fromDate: ' + fromDate);
  //console.log('getBuyOrders toDate: ' + toDate);

  //console.log('getBuyOrders agentcode: ==========>' + agentcode);

  /*
  getBuyOrders fromDate: 2025-04-04
  getBuyOrders toDate: 2025-05-30
  */

  


  //console.log('getBuyOrders limit: ' + limit);
  //console.log('getBuyOrders page: ' + page);





  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set to 1000
  if (limit > 1000) {
    limit = 1000;
  }

  const privateSaleFilter =
    privateSaleMode === 'all'
      ? {}
      : privateSaleMode === 'private'
        ? { privateSale: true }
        : privateSaleMode === 'normal'
          ? { privateSale: { $ne: true } }
          : privateSale
            ? { privateSale: true }
            : { privateSale: { $ne: true } };


  // status is not 'paymentConfirmed'

  // if searchMyOrders is true, get orders by wallet address is walletAddress
  // else get all orders except paymentConfirmed
  // sort status is accepted first, then createdAt desc

  if (searchMyOrders) {

    const results = await collection.find<UserProps>(

      //{ walletAddress: walletAddress, status: { $ne: 'paymentConfirmed' } },
      {
        ...(agentcode ? { agentcode: { $regex: String(agentcode), $options: 'i' } } : {}),


        storecode: storecode || { $ne: null },
        walletAddress: walletAddress,
        
        status: (searchOrderStatusCancelled && searchOrderStatusCompleted ? { $in: ['cancelled', 'paymentConfirmed'] }
          : (searchOrderStatusCancelled ? 'cancelled'
          : (searchOrderStatusCompleted ? 'paymentConfirmed'
          : { $ne: 'nothing' }))),

        ...privateSaleFilter,
        ...(searchStoreName ? { "store.storeName": { $regex: String(searchStoreName), $options: 'i' } } : {}),
        ...(searchBuyer ? { nickname: { $regex: String(searchBuyer), $options: 'i' } } : {}),
        ...(searchDepositName ? { "buyer.depositName": { $regex: String(searchDepositName), $options: 'i' } } : {}),

        ...(searchStoreBankAccountNumber ? { 'store.bankInfo.accountNumber': { $regex: String(searchStoreBankAccountNumber), $options: 'i' } } : {}),

        // filter by fromDate and toDate
        // fromDate format: YYYY-MM-DD
        // toDate format: YYYY-MM-DD
        //createdAt: {
        //  $gte: new Date(fromDate ? fromDate + 'T00:00:00Z' : '1970-01-01T00:00:00Z'),
        //  $lte: new Date(toDate ? toDate + 'T23:59:59Z' : new Date().toISOString()),
        //}

        
      },
      
      //{ projection: { _id: 0, emailVerified: 0 } }

    )

    .sort({ createdAt: -1 })
    .limit(limit).skip((page - 1) * limit).toArray();


    const totalCount = await collection.countDocuments(
      {

        ...(agentcode ? { agentcode: { $regex: String(agentcode), $options: 'i' } } : {}),

        storecode: storecode || { $ne: null },
        
        walletAddress: walletAddress,

        status: (searchOrderStatusCancelled && searchOrderStatusCompleted ? { $in: ['cancelled', 'paymentConfirmed'] }
          : (searchOrderStatusCancelled ? 'cancelled'
          : (searchOrderStatusCompleted ? 'paymentConfirmed'
          : { $ne: 'nothing' }))),

        ...privateSaleFilter,

        ...(searchStoreName ? { "store.storeName": { $regex: String(searchStoreName), $options: 'i' } } : {}),

        ...(searchBuyer ? { nickname: { $regex: String(searchBuyer), $options: 'i' } } : {}),
        ...(searchDepositName ? { "buyer.depositName": { $regex: String(searchDepositName), $options: 'i' } } : {}),

        ...(searchStoreBankAccountNumber ? { 'store.bankInfo.accountNumber': { $regex: String(searchStoreBankAccountNumber), $options: 'i' } } : {}),

        // filter by fromDate and toDate
        ///createdAt: {
        //  $gte: new Date(fromDate ? fromDate + 'T00:00:00Z' : '1970-01-01T00:00:00Z'),
        //  $lte: new Date(toDate ? toDate + 'T23:59:59Z' : new Date().toISOString()),
        //}

      }
    );



    return {
      totalCount: totalCount,
      orders: results,
    };

  } else {

    //const fromDateValue = fromDate ? fromDate + 'T00:00:00Z' : '1970-01-01T00:00:00Z';
    //const toDateValue = toDate ? toDate + 'T23:59:59Z' : new Date().toISOString();
    // korean timezone is UTC+9, so we need to convert to UTC time

    //const fromDateValue = fromDate ? fromDate + 'T00:00:00Z' : '1970-01-01T00:00:00Z';

    const fromDateValue = fromDate ? new Date(fromDate + 'T00:00:00+09:00').toISOString() : '1970-01-01T00:00:00Z';

    //const toDateValue = toDate ? toDate + 'T23:59:59Z' : new Date().toISOString();

    const toDateValue = toDate ? new Date(toDate + 'T23:59:59+09:00').toISOString() : new Date().toISOString();

    
    
    //console.log('getBuyOrders fromDateValue: ' + fromDateValue);
    //console.log('getBuyOrders toDateValue: ' + toDateValue);


    const results = await collection.find<UserProps>(
      {
        ...(agentcode ? { agentcode: { $regex: String(agentcode), $options: 'i' } } : {}),


        storecode: storecode || { $ne: null },

        // search status is searchOrderStatusCancelled
        // search status is searchOrderStatusCompleted
        // search status is searchOrderStatusCancelled or searchOrderStatusCompleted
        // search status is searchOrderStatusCancelled and searchOrderStatusCompleted

        // status is "cancelled" or "paymentConfirmed"

        // if searchOrderStatusCancelled is true and searchOrderStatusCompleted is true,
        // then status is "cancelled" or "paymentConfirmed"

        // if searchOrderStatusCancelled is true and searchOrderStatusCompleted is false,
        // then status is "cancelled"
        // if searchOrderStatusCancelled is false and searchOrderStatusCompleted is true,
        // then status is "paymentConfirmed"
        // if searchOrderStatusCancelled is false and searchOrderStatusCompleted is false,
        // then status is ne "nothing"

        status: (searchOrderStatusCancelled && searchOrderStatusCompleted ? { $in: ['cancelled', 'paymentConfirmed'] }
          : (searchOrderStatusCancelled ? 'cancelled'
          : (searchOrderStatusCompleted ? 'paymentConfirmed'
          : { $ne: 'nothing' }))),

        // exclude private sale
        //privateSale: { $ne: true },
        ...privateSaleFilter,


        // search store name
        ...(searchStoreName ? { "store.storeName": { $regex: String(searchStoreName), $options: 'i' } } : {}),

        // search buyer name
        ...(searchBuyer ? { nickname: { $regex: String(searchBuyer), $options: 'i' } } : {}),
        // search deposit name
        ...(searchDepositName ? { "buyer.depositName": { $regex: String(searchDepositName), $options: 'i' } } : {}),

        // search store bank account number
        ...(searchStoreBankAccountNumber ? { 'store.bankInfo.accountNumber': { $regex: String(searchStoreBankAccountNumber), $options: 'i' } } : {}),

        // filter by fromDate and toDate
        /*
        createdAt
        "2025-06-03T07:24:10.135Z"
        */
        /* createdAt is string format */
        /* fromDate is string format YYYY-MM-DD */
        /* convert createdAt to Date object */

        createdAt: {
          $gte: fromDateValue,
          $lte: toDateValue,
        }



      
          



      },
      
      //{ projection: { _id: 0, emailVerified: 0 } }
  
    )
    .sort({ createdAt: -1 })
    .limit(limit).skip((page - 1) * limit)
    .toArray();
    //).sort({ paymentConfirmedAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();




    const totalCount = await collection.countDocuments(
      {
        ...(agentcode ? { agentcode: { $regex: String(agentcode), $options: 'i' } } : {}),


        storecode: storecode || { $ne: null },
        status: (searchOrderStatusCancelled && searchOrderStatusCompleted ? { $in: ['cancelled', 'paymentConfirmed'] }
          : (searchOrderStatusCancelled ? 'cancelled'
          : (searchOrderStatusCompleted ? 'paymentConfirmed'
          : { $ne: 'nothing' }))),

        //privateSale: { $ne: true },
        ...privateSaleFilter,

        ...(searchStoreName ? { "store.storeName": { $regex: String(searchStoreName), $options: 'i' } } : {}),

        ...(searchBuyer ? { nickname: { $regex: String(searchBuyer), $options: 'i' } } : {}),
        ...(searchDepositName ? { "buyer.depositName": { $regex: String(searchDepositName), $options: 'i' } } : {}),

        ...(searchStoreBankAccountNumber ? { 'store.bankInfo.accountNumber': { $regex: String(searchStoreBankAccountNumber), $options: 'i' } } : {}),

        // filter by fromDate and toDate
        
        createdAt: {
          $gte: fromDateValue,
          $lte: toDateValue,
        }


      }
    );


    /*
      const totalResult = await collection.aggregate([
      {
        $match: {
          
          //'seller.walletAddress': walletAddress,

          //nickname: { $regex: searchNickname, $options: 'i' },


          status: 'paymentConfirmed',

          ///privateSale: { $ne: true },
          ...privateSaleFilter,


          agentcode: { $regex: agentcode, $options: 'i' },
          //storecode: storecode,
          storecode: { $regex: storecode, $options: 'i' },

          nickname: { $regex: searchBuyer, $options: 'i' },

          'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

          'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

          //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

          createdAt: { $gte: fromDateValue, $lt: toDateValue },
        }
      },
      {
        $group: {
          _id: null,
          

          totalCount: { $sum: 1 },
          totalKrwAmount: { $sum: '$krwAmount' },
          totalUsdtAmount: { $sum: '$usdtAmount' },

          totalSettlementCount: { $sum: 1 },
          totalSettlementAmount: { $sum: { $toDouble: '$settlement.settlementAmount' } },
          totalSettlementAmountKRW: { $sum: { $toDouble: '$settlement.settlementAmountKRW' } },

          totalFeeAmount: { $sum: { $toDouble: '$settlement.feeAmount' } },
          totalFeeAmountKRW: { $sum: { $toDouble: '$settlement.feeAmountKRW' } },

          totalAgentFeeAmount: { $sum: '$settlement.agentFeeAmount' },
          totalAgentFeeAmountKRW: { $sum: { $toDouble: '$settlement.agentFeeAmountKRW' } },

        }
      }
    ]).toArray();
    */


    const totalResult = await collection.aggregate([
      {
        $match: {

          //'seller.walletAddress': walletAddress,

          //nickname: { $regex: searchNickname, $options: 'i' },


          status: 'paymentConfirmed',

          ///privateSale: { $ne: true },
          ...privateSaleFilter,


          agentcode: { $regex: agentcode, $options: 'i' },
          //storecode: storecode,
          storecode: { $regex: storecode, $options: 'i' },

          nickname: { $regex: searchBuyer, $options: 'i' },

          'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

          'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

          //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

          createdAt: { $gte: fromDateValue, $lt: toDateValue },
        }
      },
      {
        $group: {
          _id: null,


          totalCount: { $sum: 1 },
          totalKrwAmount: { $sum: '$krwAmount' },
          totalUsdtAmount: { $sum: '$usdtAmount' },

          totalSettlementCount: { $sum: 1 },
          totalSettlementAmount: { $sum: { $toDouble: '$settlement.settlementAmount' } },
          totalSettlementAmountKRW: { $sum: { $toDouble: '$settlement.settlementAmountKRW' } },
          
          totalFeeAmount: { $sum: { $toDouble: '$settlement.feeAmount' } },
          totalFeeAmountKRW: { $sum: { $toDouble: '$settlement.feeAmountKRW' } },

          totalAgentFeeAmount: { $sum: '$settlement.agentFeeAmount' },
          totalAgentFeeAmountKRW: { $sum: { $toDouble: '$settlement.agentFeeAmountKRW' } },

        }

      }

    ]).toArray();



    const totalResultSettlement = await collection.aggregate([
      {
        $match: {

          //'seller.walletAddress': walletAddress,

          //nickname: { $regex: searchNickname, $options: 'i' },


          status: 'paymentConfirmed',
          settlement: { $exists: true, $ne: null },

          ///privateSale: { $ne: true },
          ...privateSaleFilter,


          agentcode: { $regex: agentcode, $options: 'i' },
          //storecode: storecode,
          storecode: { $regex: storecode, $options: 'i' },

          nickname: { $regex: searchBuyer, $options: 'i' },

          
          ///'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
          ...(searchDepositName ? { $or: [{ "buyer.depositName": { $regex: String(searchDepositName), $options: 'i' } }, { 'seller.bankInfo.accountHolder': { $regex: String(searchDepositName), $options: 'i' } }] } : {}),



          'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

          //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

          createdAt: { $gte: fromDateValue, $lt: toDateValue },
        }
      },
      {
        $group: {
          _id: null,

          /*
          totalCount: { $sum: 1 },
          totalKrwAmount: { $sum: '$krwAmount' },
          totalUsdtAmount: { $sum: '$usdtAmount' },
          */

          totalSettlementCount: { $sum: 1 },
          totalSettlementAmount: { $sum: { $toDouble: '$settlement.settlementAmount' } },
          totalSettlementAmountKRW: { $sum: { $toDouble: '$settlement.settlementAmountKRW' } },
          
          totalFeeAmount: { $sum: { $toDouble: '$settlement.feeAmount' } },
          totalFeeAmountKRW: { $sum: { $toDouble: '$settlement.feeAmountKRW' } },

          totalAgentFeeAmount: { $sum: '$settlement.agentFeeAmount' },
          totalAgentFeeAmountKRW: { $sum: { $toDouble: '$settlement.agentFeeAmountKRW' } },


        }

      }

    ]).toArray();







    const totalReaultGroupByBuyerDepositName = await collection.aggregate([
      {
        $match: {
          
          status: 'paymentConfirmed',

          //settlement: { $exists: true, $ne: null },
          ...privateSaleFilter,
          ...(agentcode ? { agentcode: { $regex: String(agentcode), $options: 'i' } } : {}),
          storecode: { $regex: storecode, $options: 'i' },
          nickname: { $regex: searchBuyer, $options: 'i' },
          
          //...(searchTradeId ? { tradeId: { $regex: String(searchTradeId), $options: 'i' } } : {}),

          ...(searchDepositName ? { $or: [{ "buyer.depositName": { $regex: String(searchDepositName), $options: 'i' } }, { 'seller.bankInfo.accountHolder': { $regex: String(searchDepositName), $options: 'i' } }] } : {}),
          //...(searchStoreBankAccountNumber ? { 'seller.bankInfo.accountNumber': { $regex: String(searchStoreBankAccountNumber), $options: 'i' } } : {}),
          //...(searchBuyerBankAccountNumber ? { 'buyer.bankInfo.accountNumber': { $regex: String(searchBuyerBankAccountNumber), $options: 'i' } } : {}),
          //...(manualConfirmPayment ? { autoConfirmPayment: { $ne: true } } : {}),

          // userType filter
          //...(userType !== 'all' ? { userType: userType } : {}),

          createdAt: { $gte: fromDateValue, $lt: toDateValue },
        }
      },
      {
        $group: {
          _id: '$buyer.depositName',
          totalCount: { $sum: 1 },
          totalKrwAmount: { $sum: '$krwAmount' },
          totalUsdtAmount: { $sum: '$usdtAmount' },
        }
      },
      // sort by totalUsdtAmount desc
      { $sort: { totalUsdtAmount: -1, _id: 1 } },
      // limit 20
      { $limit: 20 }
    ]).toArray();

    const totalReaultGroupByBuyerDepositNameCount = await collection.aggregate([
      {
        $match: {
          status: 'paymentConfirmed',
          //settlement: { $exists: true, $ne: null },
          ...privateSaleFilter,
          ...(agentcode ? { agentcode: { $regex: String(agentcode), $options: 'i' } } : {}),
          storecode: { $regex: storecode, $options: 'i' },
          nickname: { $regex: searchBuyer, $options: 'i' },
          
          //...(searchTradeId ? { tradeId: { $regex: String(searchTradeId), $options: 'i' } } : {}),

          ...(searchDepositName ? { $or: [{ "buyer.depositName": { $regex: String(searchDepositName), $options: 'i' } }, { 'seller.bankInfo.accountHolder': { $regex: String(searchDepositName), $options: 'i' } }] } : {}),
          //...(searchStoreBankAccountNumber ? { 'seller.bankInfo.accountNumber': { $regex: String(searchStoreBankAccountNumber), $options: 'i' } } : {}),
          //...(searchBuyerBankAccountNumber ? { 'buyer.bankInfo.accountNumber': { $regex: String(searchBuyerBankAccountNumber), $options: 'i' } } : {}),
          
          //...(manualConfirmPayment ? { autoConfirmPayment: { $ne: true } } : {}),

          // userType filter
          //...(userType !== 'all' ? { userType: userType } : {}),

          createdAt: { $gte: fromDateValue, $lt: toDateValue },
        }
      },
      {
        $group: {
          _id: '$buyer.depositName',
        }
      },
      {
        $count: "totalCount"
      }
    ]).toArray();




    

    return {
      totalCount: totalResult.length > 0 ? totalResult[0].totalCount : 0,
      totalKrwAmount: totalResult.length > 0 ? totalResult[0].totalKrwAmount : 0,
      totalUsdtAmount: totalResult.length > 0 ? totalResult[0].totalUsdtAmount : 0,

      totalSettlementCount: totalResultSettlement.length > 0 ? totalResultSettlement[0].totalSettlementCount : 0,
      totalSettlementAmount: totalResultSettlement.length > 0 ? totalResultSettlement[0].totalSettlementAmount : 0,
      totalSettlementAmountKRW: totalResultSettlement.length > 0 ? totalResultSettlement[0].totalSettlementAmountKRW : 0,
      totalFeeAmount: totalResultSettlement.length > 0 ? totalResultSettlement[0].totalFeeAmount : 0,
      totalFeeAmountKRW: totalResultSettlement.length > 0 ? totalResultSettlement[0].totalFeeAmountKRW : 0,
      totalAgentFeeAmount: totalResultSettlement.length > 0 ? totalResultSettlement[0].totalAgentFeeAmount : 0,
      totalAgentFeeAmountKRW: totalResultSettlement.length > 0 ? totalResultSettlement[0].totalAgentFeeAmountKRW : 0,

      totalByBuyerDepositName: totalReaultGroupByBuyerDepositName,
      totalReaultGroupByBuyerDepositNameCount: totalReaultGroupByBuyerDepositNameCount.length > 0 ? totalReaultGroupByBuyerDepositNameCount[0].totalCount : 0,


      orders: results,
    };

  }


}










export async function getBuyOrdersGroupByStorecodeDaily(
  {
    storecode,
    fromDate,
    toDate,
  }: {

    storecode: string;
    fromDate: string;
    toDate: string;

  }
): Promise<any> {

  console.log('getBuyOrdersGroupByStorecodeDaily storecode: ' + storecode);
  console.log('getBuyOrdersGroupByStorecodeDaily fromDate: ' + fromDate);
  console.log('getBuyOrdersGroupByStorecodeDaily toDate: ' + toDate);

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // fromDate format: YYYY-MM-DD
  // toDate format: YYYY-MM-DD

  // group by korean timezone, so we need to convert fromDate, toDate to UTC time
  // plus 9 hours to UTC time
  // so if hours larger than 24, then add 1 day to date


  const fromDateValue = fromDate ? new Date(fromDate + 'T00:00:00+09:00').toISOString() : '1970-01-01T00:00:00Z';
  const toDateValue = toDate ? new Date(toDate + 'T23:59:59+09:00').toISOString() : new Date().toISOString();


  console.log('getBuyOrdersGroupByStorecodeDaily fromDateValue: ' + fromDateValue);
  console.log('getBuyOrdersGroupByStorecodeDaily toDateValue: ' + toDateValue);


  // order by date descending
  
  const pipeline = [
    {
      $match: {
        
       // if storecode is not empty, then match storecode
        storecode: storecode ? { $regex: String(storecode), $options: 'i' } : { $ne: null },


        status: 'paymentConfirmed',
        privateSale: { $ne: true },
        createdAt: {
          $gte: fromDateValue,
          $lte: toDateValue,
        }
      }
    },
    {
      $group: {
        _id: {
          date: { 
            $dateToString: { 
              format: "%Y-%m-%d", 
              date: { $dateFromString: { dateString: "$createdAt" } },
              timezone: "Asia/Seoul"
            } 
          },

        },
        totalUsdtAmount: { $sum: "$usdtAmount" },
        totalKrwAmount: { $sum: "$krwAmount" },
        totalCount: { $sum: 1 }, // Count the number of orders


        // if settlement fields is exist in buyorders, then count settlement
        totalSettlementCount: { $sum: { $cond: [{ $ifNull: ["$settlement", false] }, 1, 0] } },

        // sum of settlement.settlementAmount
        /////totalSettlementAmount: { $sum: "$settlement.settlementAmount" },
        totalSettlementAmount: { $sum: { $toDouble: "$settlement.settlementAmount" } },


        // sum of settlement.settlementAmountKRW
        // convert settlement.settlementAmountKRW to double
        totalSettlementAmountKRW: { $sum: { $toDouble: "$settlement.settlementAmountKRW" } },

        // agentFeeAmount, agentFeeAmountKRW
        totalAgentFeeAmount: { $sum: "$settlement.agentFeeAmount" },
        totalAgentFeeAmountKRW: { $sum: { $toDouble: "$settlement.agentFeeAmountKRW" } },

        // feeAmount, feeAmountKRW
        totalFeeAmount: { $sum: "$settlement.feeAmount" },
        totalFeeAmountKRW: { $sum: { $toDouble: "$settlement.feeAmountKRW" } },

        // platformFeeAmount, platformFeeAmountKRW
        totalPlatformFeeAmount: { $sum: "$settlement.platformFeeAmount" },
        totalPlatformFeeAmountKRW: { $sum: { $toDouble: "$settlement.platformFeeAmountKRW" } },

      }
    },
    {
      $sort: { "_id.date": -1 } // Sort by date descending
    }
  ];
  


  const results = await collection.aggregate(pipeline).toArray();
  //console.log('getBuyOrdersGroupByStorecodeDaily results: ' + JSON.stringify(results));


  // aggregate with escrows collection when escrows date is same as buyorders date
  // escrows date is '2024-01-01'

  const escrowCollection = client.db(dbName).collection('escrows');
  const escrowPipeline = [
    {
      $match: {
        storecode: storecode ? { $regex: storecode, $options: 'i' } : { $ne: null },

        // withdrawAmount > 0,
        // depositAmount > 0,
        withdrawAmount: { $gt: 0 },

        date: {
          $gte: fromDateValue,
          $lte: toDateValue,
        }
      }
    },
    {
      $group: {
        _id: {
          date: { 
            $dateToString: { 
              format: "%Y-%m-%d", 
              date: { $dateFromString: { dateString: "$date" } },
              timezone: "Asia/Seoul"
            } 
          },
        },
        totalEscrowDepositAmount: { $sum: "$depositAmount" },
        totalEscrowWithdrawAmount: { $sum: "$withdrawAmount" },
        totalEscrowCount: { $sum: 1 }, // Count the number of escrows
      }
    },
    {
      $sort: { "_id.date": -1 } // Sort by date descending
    }
  ];

  const escrowResults = await escrowCollection.aggregate(escrowPipeline).toArray();







  return {
    storecode: storecode,
    fromDate: fromDate,
    toDate: toDate,
    orders: results.map(result => ({
      date: result._id.date,
      totalCount: result.totalCount,
      totalUsdtAmount: result.totalUsdtAmount,
      totalKrwAmount: result.totalKrwAmount,
      totalSettlementCount: result.totalSettlementCount,
      totalSettlementAmount: result.totalSettlementAmount,
      totalSettlementAmountKRW: result.totalSettlementAmountKRW,

      totalAgentFeeAmount: result.totalAgentFeeAmount,
      totalAgentFeeAmountKRW: result.totalAgentFeeAmountKRW,
      totalFeeAmount: result.totalFeeAmount,
      totalFeeAmountKRW: result.totalFeeAmountKRW,
      totalPlatformFeeAmount: result.totalPlatformFeeAmount,
      totalPlatformFeeAmountKRW: result.totalPlatformFeeAmountKRW,


      totalEscrowDepositAmount: escrowResults.find(escrow => escrow._id.date === result._id.date)?.totalEscrowDepositAmount || 0,
      totalEscrowWithdrawAmount: escrowResults.find(escrow => escrow._id.date === result._id.date)?.totalEscrowWithdrawAmount || 0,
      totalEscrowCount: escrowResults.find(escrow => escrow._id.date === result._id.date)?.totalEscrowCount || 0,


    }))
  }

}









// getBuyOrdersGroupByAgentcodeDaily
export async function getBuyOrdersGroupByAgentcodeDaily(
  {
    agentcode,
    fromDate,
    toDate,
  }: {

    agentcode: string;
    fromDate: string;
    toDate: string;

  }
): Promise<any> {

  console.log('getBuyOrdersGroupByAgentcodeDaily agentcode: ' + agentcode);
  console.log('getBuyOrdersGroupByAgentcodeDaily fromDate: ' + fromDate);
  console.log('getBuyOrdersGroupByAgentcodeDaily toDate: ' + toDate);

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // fromDate format: YYYY-MM-DD
  // toDate format: YYYY-MM-DD

  // group by korean timezone, so we need to convert fromDate, toDate to UTC time
  // plus 9 hours to UTC time
  // so if hours larger than 24, then add 1 day to date
  const fromDateValue = fromDate ? new Date(fromDate + 'T00:00:00+09:00').toISOString() : '1970-01-01T00:00:00Z';
  const toDateValue = toDate ? new Date(toDate + 'T23:59:59+09:00').toISOString() : new Date().toISOString();

  console.log('getBuyOrdersGroupByAgentcodeDaily fromDateValue: ' + fromDateValue);
  console.log('getBuyOrdersGroupByAgentcodeDaily toDateValue: ' + toDateValue);
  // order by date descending
  const pipeline = [
    {
      $match: {
        agentcode: agentcode ? { $regex: agentcode, $options: 'i' } : { $ne: null },

        status: 'paymentConfirmed',
        privateSale: { $ne: true },
        createdAt: {
          $gte: fromDateValue,
          $lte: toDateValue,
        }
      }
    },
    {
      $group: {
        _id: {
          date: { 
            $dateToString: { 
              format: "%Y-%m-%d", 
              date: { $dateFromString: { dateString: "$createdAt" } },
              timezone: "Asia/Seoul"
            } 
          },
          agentcode: "$agentcode"
        },
        totalUsdtAmount: { $sum: "$usdtAmount" },
        totalKrwAmount: { $sum: "$krwAmount" },
        totalCount: { $sum: 1 }, // Count the number of orders

        // if settlement fields is exist in buyorders, then count settlement
        totalSettlementCount: { $sum: { $cond: [{ $ifNull: ["$settlement", false] }, 1, 0] } },

        // sum of settlement.settlementAmount
        totalSettlementAmount: { $sum: "$settlement.settlementAmount" },

        // sum of settlement.settlementAmountKRW
        // convert settlement.settlementAmountKRW to double
        totalSettlementAmountKRW: { $sum: { $toDouble: "$settlement.settlementAmountKRW" } },

        // agentFeeAmount, agentFeeAmountKRW
        totalAgentFeeAmount: { $sum: "$settlement.agentFeeAmount" },
        totalAgentFeeAmountKRW: { $sum: { $toDouble: "$settlement.agentFeeAmountKRW" } },

        // feeAmount, feeAmountKRW
        totalFeeAmount: { $sum: "$settlement.feeAmount" },
        totalFeeAmountKRW: { $sum: { $toDouble: "$settlement.feeAmountKRW" } },

      }
    },
    {
      $sort: { "_id.date": -1 } // Sort by date descending
    }
  ];

  const results = await collection.aggregate(pipeline).toArray();
  //console.log('getBuyOrdersGroupByAgentcodeDaily results: ' + JSON.stringify(results));
  // aggregate with escrows collection when escrows date is same as buyorders date
  // escrows date is '2024-01-01'
  const escrowCollection = client.db(dbName).collection('escrows');
  const escrowPipeline = [
    {
      $match: {
        agentcode: agentcode ? { $regex: agentcode, $options: 'i' } : { $ne: null },

        // withdrawAmount > 0,
        // depositAmount > 0,
        withdrawAmount: { $gt: 0 },

        date: {
          $gte: fromDateValue,
          $lte: toDateValue,
        }
      }
    },
    {
      $group: {
        _id: {
          date: { 
            $dateToString: { 
              format: "%Y-%m-%d", 
              date: { $dateFromString: { dateString: "$date" } },
              timezone: "Asia/Seoul"
            } 
          },
          agentcode: "$agentcode"
        },
        totalEscrowDepositAmount: { $sum: "$depositAmount" },
        totalEscrowWithdrawAmount: { $sum: "$withdrawAmount" },
        totalEscrowCount: { $sum: 1 }, // Count the number of escrows
      }
    },
    {
      $sort: { "_id.date": -1 } // Sort by date descending
    }
  ];
  const escrowResults = await escrowCollection.aggregate(escrowPipeline).toArray();
  //console.log('getBuyOrdersGroupByAgentcodeDaily escrowResults: ' + JSON.stringify(escrowResults));
  return {
    agentcode: agentcode,
    fromDate: fromDate,
    toDate: toDate,
    orders: results.map(result => ({
      date: result._id.date,
      agentcode: result._id.agentcode,
      totalCount: result.totalCount,
      totalUsdtAmount: result.totalUsdtAmount,
      totalKrwAmount: result.totalKrwAmount,
      totalSettlementCount: result.totalSettlementCount,
      totalSettlementAmount: result.totalSettlementAmount,
      totalSettlementAmountKRW: result.totalSettlementAmountKRW,

      totalAgentFeeAmount: result.totalAgentFeeAmount,
      totalAgentFeeAmountKRW: result.totalAgentFeeAmountKRW,
      totalFeeAmount: result.totalFeeAmount,
      totalFeeAmountKRW: result.totalFeeAmountKRW,

      totalEscrowDepositAmount: escrowResults.find(escrow => escrow._id.date === result._id.date && escrow._id.agentcode === result._id.agentcode)?.totalEscrowDepositAmount || 0,
      totalEscrowWithdrawAmount: escrowResults.find(escrow => escrow._id.date === result._id.date && escrow._id.agentcode === result._id.agentcode)?.totalEscrowWithdrawAmount || 0,
      totalEscrowCount: escrowResults.find(escrow => escrow._id.date === result._id.date && escrow._id.agentcode === result._id.agentcode)?.totalEscrowCount || 0,

    }))
  }
}




// deleete sell order by orderId
export async function deleteBuyOrder(

  {
    orderId,
    walletAddress,
  }: {
    orderId: string;
    walletAddress: string;
  
  }


): Promise<boolean> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // check orderId is valid ObjectId
  if (!ObjectId.isValid(orderId)) {
    return false;
  }

  // check walletAddress is valid

  if (!walletAddress) {
    return false;
  }

  // status is 'ordered'
  const result = await collection.deleteOne(
    { _id: new ObjectId(orderId), walletAddress: walletAddress, status: 'ordered' }
  );



  if (result.deletedCount === 1) {
    return true;
  } else {
    return false;
  }


}
export type CancelPrivateBuyOrderByBuyerProgressStatus =
  | 'processing'
  | 'completed'
  | 'error';

export type CancelPrivateBuyOrderByBuyerProgressEvent = {
  step: string;
  title: string;
  description: string;
  status: CancelPrivateBuyOrderByBuyerProgressStatus;
  occurredAt: string;
  detail?: string;
  data?: Record<string, unknown>;
};

// cancel private sale buy order by buyer
export async function cancelPrivateBuyOrderByBuyer(
  {
    orderId,
    buyerWalletAddress,
    sellerWalletAddress,
    cancelledByIpAddress = '',
    cancelledByUserAgent = '',
    onProgress,
  }: {
    orderId: string;
    buyerWalletAddress: string;
    sellerWalletAddress?: string;
    cancelledByIpAddress?: string;
    cancelledByUserAgent?: string;
    onProgress?: (
      event: CancelPrivateBuyOrderByBuyerProgressEvent,
    ) => void | Promise<void>;
  }
): Promise<boolean> {
  const emitProgress = async ({
    step,
    title,
    description,
    status,
    detail,
    data,
  }: {
    step: string;
    title: string;
    description: string;
    status: CancelPrivateBuyOrderByBuyerProgressStatus;
    detail?: string;
    data?: Record<string, unknown>;
  }) => {
    if (!onProgress) {
      return;
    }
    try {
      await onProgress({
        step,
        title,
        description,
        status,
        occurredAt: new Date().toISOString(),
        ...(detail ? { detail } : {}),
        ...(data ? { data } : {}),
      });
    } catch (progressError) {
      console.warn('cancelPrivateBuyOrderByBuyer progress callback failed', progressError);
    }
  };

  if (!ObjectId.isValid(orderId)) {
    await emitProgress({
      step: 'REQUEST_VALIDATED',
      title: '요청 검증',
      description: '주문 번호 형식이 올바르지 않습니다.',
      status: 'error',
    });
    return false;
  }

  if (!buyerWalletAddress) {
    await emitProgress({
      step: 'REQUEST_VALIDATED',
      title: '요청 검증',
      description: '구매자 지갑 정보가 누락되었습니다.',
      status: 'error',
    });
    return false;
  }

  await emitProgress({
    step: 'REQUEST_VALIDATED',
    title: '요청 검증',
    description: '거래 취소 요청 정보를 확인했습니다.',
    status: 'completed',
    data: {
      orderId,
    },
  });

  const client = await clientPromise;
  const buyordersCollection = client.db(dbName).collection('buyorders');
  const usersCollection = client.db(dbName).collection('users');
  const buyerReputationLogsCollection = client.db(dbName).collection('buyer_reputation_logs');
  const objectId = new ObjectId(orderId);
  const escapeRegex = (value: string) =>
    value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const toWalletRegex = (value: string) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    return {
      $regex: `^${escapeRegex(trimmed)}$`,
      $options: 'i',
    };
  };

  const order = await buyordersCollection.findOne<any>(
    { _id: objectId },
    {
      projection: {
        walletAddress: 1,
        buyer: 1,
        seller: 1,
        escrowWallet: 1,
        usdtAmount: 1,
        escrowLockUsdtAmount: 1,
        platformFee: 1,
        platformFeeAmount: 1,
        settlement: 1,
        privateSale: 1,
        status: 1,
        tradeId: 1,
      },
    },
  );

  if (!order || order.privateSale !== true) {
    await emitProgress({
      step: 'ORDER_VALIDATED',
      title: '주문 확인',
      description: '취소할 비공개 거래 주문을 찾지 못했습니다.',
      status: 'error',
    });
    return false;
  }

  const orderBuyerWalletAddress = order?.buyer?.walletAddress || order?.walletAddress || '';
  if (
    !orderBuyerWalletAddress
    || String(orderBuyerWalletAddress).toLowerCase() !== String(buyerWalletAddress).toLowerCase()
  ) {
    await emitProgress({
      step: 'ORDER_VALIDATED',
      title: '주문 확인',
      description: '주문의 구매자 지갑 정보가 요청값과 일치하지 않습니다.',
      status: 'error',
    });
    return false;
  }

  if (order.status !== 'paymentRequested') {
    await emitProgress({
      step: 'ORDER_VALIDATED',
      title: '주문 확인',
      description: '입금요청 상태 주문만 취소할 수 있습니다.',
      status: 'error',
      data: {
        status: String(order.status || ''),
      },
    });
    return false;
  }

  await emitProgress({
    step: 'ORDER_VALIDATED',
    title: '주문 확인',
    description: '취소 가능한 주문 상태를 확인했습니다.',
    status: 'completed',
    data: {
      tradeId: String(order?.tradeId || ''),
      status: String(order?.status || ''),
    },
  });

  const buyerEscrowWalletExecution = resolvePrivateOrderEscrowWalletSignerAndSmartAddress(order);
  const buyerEscrowSignerAddress = buyerEscrowWalletExecution.signerAddress;
  const buyerEscrowWalletAddress = buyerEscrowWalletExecution.smartAccountAddress;
  const sellerEscrowWalletAddress = resolveSellerEscrowWalletAddress(order);

  if (
    !isWalletAddress(buyerEscrowSignerAddress)
    || !isWalletAddress(buyerEscrowWalletAddress)
    || !isWalletAddress(sellerEscrowWalletAddress)
  ) {
    console.error('cancelPrivateBuyOrderByBuyer: escrow wallet address missing', {
      buyerEscrowSignerAddress,
      buyerEscrowWalletAddress,
      sellerEscrowWalletAddress,
    });
    await emitProgress({
      step: 'ESCROW_WALLET_VALIDATED',
      title: '에스크로 지갑 확인',
      description: '에스크로 지갑 정보를 확인하지 못했습니다.',
      status: 'error',
    });
    return false;
  }

  await emitProgress({
    step: 'ESCROW_WALLET_VALIDATED',
    title: '에스크로 지갑 확인',
    description: '에스크로 지갑 주소를 확인했습니다.',
    status: 'completed',
    data: {
      buyerEscrowWalletAddress,
      sellerEscrowWalletAddress,
    },
  });

  const transferPlan = resolveStoredPrivateOrderTransferPlan(order);
  const plannedRollbackUsdtAmount = transferPlan.totalTransferUsdtAmount;
  if (!Number.isFinite(plannedRollbackUsdtAmount) || plannedRollbackUsdtAmount <= 0) {
    console.error('cancelPrivateBuyOrderByBuyer: invalid rollback usdt amount', {
      rollbackUsdtAmount: plannedRollbackUsdtAmount,
      usdtAmount: order?.usdtAmount,
      escrowLockUsdtAmount: order?.escrowLockUsdtAmount,
    });
    await emitProgress({
      step: 'ROLLBACK_AMOUNT_VALIDATED',
      title: '회수 수량 확인',
      description: '회수할 에스크로 수량이 올바르지 않습니다.',
      status: 'error',
    });
    return false;
  }

  await emitProgress({
    step: 'ROLLBACK_AMOUNT_VALIDATED',
    title: '회수 수량 확인',
    description: '에스크로 회수 수량을 확인했습니다.',
    status: 'completed',
    data: {
      rollbackUsdtAmount: plannedRollbackUsdtAmount,
    },
  });

  const thirdwebSecretKey = process.env.THIRDWEB_SECRET_KEY || '';
  if (!thirdwebSecretKey) {
    console.error('cancelPrivateBuyOrderByBuyer: THIRDWEB_SECRET_KEY is missing');
    await emitProgress({
      step: 'ENGINE_READY',
      title: '서버 지갑 준비',
      description: '서버 지갑 설정이 누락되었습니다.',
      status: 'error',
    });
    return false;
  }

  await emitProgress({
    step: 'ENGINE_READY',
    title: '서버 지갑 준비',
    description: '서버 지갑 연결을 확인했습니다.',
    status: 'completed',
  });

  const thirdwebClient = createThirdwebClient({ secretKey: thirdwebSecretKey });
  let rollbackTransactionHash = '';
  let rollbackUsdtAmount = plannedRollbackUsdtAmount;
  let rollbackRawAmount = '';
  try {
    const transferConfig = resolveUsdtTransferConfig();
    const usdtDecimals = resolveUsdtDecimals();
    const usdtContract = getContract({
      client: thirdwebClient,
      chain: transferConfig.chain,
      address: transferConfig.contractAddress,
    });

    const buyerEscrowWallet = Engine.serverWallet({
      client: thirdwebClient,
      address: buyerEscrowSignerAddress,
      chain: transferConfig.chain,
      executionOptions: {
        type: 'ERC4337',
        signerAddress: buyerEscrowSignerAddress,
        smartAccountAddress: buyerEscrowWalletAddress,
      },
    });

    const rawBuyerEscrowUsdtBalance = await balanceOf({
      contract: usdtContract,
      address: buyerEscrowWalletAddress,
    });
    if (rawBuyerEscrowUsdtBalance <= 0n) {
      throw new Error('buyer escrow wallet balance is empty');
    }

    rollbackRawAmount = rawBuyerEscrowUsdtBalance.toString();
    rollbackUsdtAmount = convertRawUsdtToDisplayAmount(rawBuyerEscrowUsdtBalance, usdtDecimals);
    const rollbackTransferAmount = formatRawUsdtAmount(rawBuyerEscrowUsdtBalance, usdtDecimals);

    const rollbackTransaction = transfer({
      contract: usdtContract,
      to: sellerEscrowWalletAddress,
      amount: rollbackTransferAmount,
    });

    const { transactionId } = await buyerEscrowWallet.enqueueTransaction({
      transaction: rollbackTransaction,
    });

    await emitProgress({
      step: 'ROLLBACK_TRANSFER_SUBMITTED',
      title: '에스크로 회수 요청',
      description: '구매 에스크로에서 판매자 에스크로로 전송을 요청했습니다.',
      status: 'processing',
      data: {
        transactionId: String(transactionId || ''),
      },
    });

    const hashResult = await Engine.waitForTransactionHash({
      client: thirdwebClient,
      transactionId,
      timeoutInSeconds: 90,
    });
    const txHash = typeof hashResult?.transactionHash === 'string' ? hashResult.transactionHash : '';
    if (!txHash) {
      throw new Error('empty rollback transaction hash');
    }

    let transferConfirmed = false;
    for (let i = 0; i < 25; i += 1) {
      const txStatus = await Engine.getTransactionStatus({
        client: thirdwebClient,
        transactionId,
      });

      if (txStatus.status === 'FAILED') {
        throw new Error(txStatus.error || 'rollback transfer failed');
      }

      if (txStatus.status === 'CONFIRMED') {
        if (txStatus.onchainStatus !== 'SUCCESS') {
          throw new Error(`rollback transfer reverted: ${txStatus.onchainStatus}`);
        }
        rollbackTransactionHash =
          typeof txStatus.transactionHash === 'string' && txStatus.transactionHash
            ? txStatus.transactionHash
            : txHash;
        transferConfirmed = true;
        break;
      }

      await waitMs(1500);
    }

    if (!transferConfirmed) {
      throw new Error('rollback transfer confirmation timeout');
    }

    await emitProgress({
      step: 'ROLLBACK_TRANSFER_CONFIRMED',
      title: '에스크로 회수 확인',
      description: '온체인 회수 전송이 완료되었습니다.',
      status: 'completed',
      data: {
        transactionHash: rollbackTransactionHash,
      },
    });
  } catch (error) {
    console.error('cancelPrivateBuyOrderByBuyer: rollback transfer failed', error);
    await emitProgress({
      step: 'ROLLBACK_TRANSFER_CONFIRMED',
      title: '에스크로 회수 확인',
      description: '에스크로 회수 전송에 실패했습니다.',
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
    });
    return false;
  }

  const now = new Date().toISOString();
  const cancelledByRole = 'buyer';
  const cancelledByWalletAddress = String(orderBuyerWalletAddress || buyerWalletAddress || '').trim();
  const cancelledByNickname = String(order?.buyer?.nickname || '').trim();
  const normalizedCancelledByIpAddress = String(cancelledByIpAddress || '').trim();
  const normalizedCancelledByUserAgent = String(cancelledByUserAgent || '').trim();
  const cancelResult = await buyordersCollection.updateOne(
    {
      _id: objectId,
      privateSale: true,
      status: 'paymentRequested',
    },
    {
      $set: {
        status: 'cancelled',
        cancelledAt: now,
        cancelTradeReason: '구매자 요청 취소',
        canceller: cancelledByRole,
        cancelledByRole,
        cancelledByWalletAddress,
        cancelledByNickname,
        cancelledByIpAddress: normalizedCancelledByIpAddress,
        cancelledByUserAgent: normalizedCancelledByUserAgent,
        rollbackUsdtAmount,
        rollbackRawAmount,
        'buyer.rollbackTransactionHash': rollbackTransactionHash,
        'seller.rollbackTransactionHash': rollbackTransactionHash,
      },
    },
  );

  if (cancelResult.modifiedCount !== 1) {
    const latestOrder = await buyordersCollection.findOne<{ status?: string }>(
      { _id: objectId },
      { projection: { status: 1 } },
    );
    if (latestOrder?.status === 'cancelled') {
      await emitProgress({
        step: 'ORDER_CANCELLED',
        title: '주문 상태 반영',
        description: '주문 취소 상태가 이미 반영되어 있습니다.',
        status: 'completed',
      });
      return true;
    }
    console.error('cancelPrivateBuyOrderByBuyer: failed to update order status after rollback transfer', {
      orderId,
      tradeId: String(order?.tradeId || ''),
      matchedCount: cancelResult.matchedCount,
      modifiedCount: cancelResult.modifiedCount,
      buyerWalletAddress: String(orderBuyerWalletAddress || buyerWalletAddress || ''),
    });
    await emitProgress({
      step: 'ORDER_CANCELLED',
      title: '주문 상태 반영',
      description: '주문 취소 상태 저장에 실패했습니다.',
      status: 'error',
    });
    return false;
  }

  await emitProgress({
    step: 'ORDER_CANCELLED',
    title: '주문 상태 반영',
    description: '주문 상태를 취소로 변경했습니다.',
    status: 'completed',
    data: {
      rollbackTransactionHash: rollbackTransactionHash || '',
      rollbackUsdtAmount,
    },
  });

  await usersCollection.updateOne(
    {
      storecode: 'admin',
      'seller.buyOrder._id': objectId,
    },
    {
      $set: {
        'seller.buyOrder.status': 'cancelled',
        'seller.buyOrder.cancelledAt': now,
        'seller.buyOrder.cancelTradeReason': '구매자 요청 취소',
        'seller.buyOrder.canceller': cancelledByRole,
        'seller.buyOrder.cancelledByRole': cancelledByRole,
        'seller.buyOrder.cancelledByWalletAddress': cancelledByWalletAddress,
        'seller.buyOrder.cancelledByNickname': cancelledByNickname,
        'seller.buyOrder.cancelledByIpAddress': normalizedCancelledByIpAddress,
        'seller.buyOrder.cancelledByUserAgent': normalizedCancelledByUserAgent,
        'seller.buyOrder.rollbackUsdtAmount': rollbackUsdtAmount,
        'seller.buyOrder.rollbackRawAmount': rollbackRawAmount,
        'seller.buyOrder.buyer.rollbackTransactionHash': rollbackTransactionHash,
        'seller.buyOrder.seller.rollbackTransactionHash': rollbackTransactionHash,
      },
    },
  );

  await emitProgress({
    step: 'SELLER_SNAPSHOT_UPDATED',
    title: '판매자 주문 동기화',
    description: '판매자 주문 스냅샷 상태를 취소로 동기화했습니다.',
    status: 'completed',
  });

  const buyerWalletRegex = toWalletRegex(orderBuyerWalletAddress);
  if (buyerWalletRegex) {
    await usersCollection.updateOne(
      {
        walletAddress: buyerWalletRegex,
        storecode: 'admin',
      },
      { $set: { 'buyer.buyOrderStatus': 'cancelled', buyOrderStatus: 'cancelled' } },
    );
  }

  await emitProgress({
    step: 'BUYER_STATUS_UPDATED',
    title: '구매자 상태 동기화',
    description: '구매자 주문 상태를 취소로 동기화했습니다.',
    status: 'completed',
  });

  // Buyer reputation update + dedicated history log collection.
  // Keep cancellation success independent from reputation logging failures.
  try {
    const buyerWalletRegex = {
      $regex: `^${String(orderBuyerWalletAddress).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`,
      $options: 'i',
    };
    const buyerUser = await usersCollection.findOne<any>(
      {
        walletAddress: buyerWalletRegex,
        storecode: 'admin',
      },
      {
        projection: {
          walletAddress: 1,
          nickname: 1,
          buyer: 1,
        },
      },
    );

    const penaltyPoints = 1;
    const prevCancelCountRaw = Number(buyerUser?.buyer?.cancelCount);
    const prevCancelCount = Number.isFinite(prevCancelCountRaw) ? Math.max(0, Math.floor(prevCancelCountRaw)) : 0;
    const nextCancelCount = prevCancelCount + 1;

    const prevReputationScoreRaw = Number(buyerUser?.buyer?.reputationScore);
    const prevReputationScore = Number.isFinite(prevReputationScoreRaw)
      ? Math.max(0, prevReputationScoreRaw)
      : 100;
    const nextReputationScore = Math.max(0, prevReputationScore - penaltyPoints);

    await usersCollection.updateOne(
      {
        walletAddress: buyerWalletRegex,
        storecode: 'admin',
      },
      {
        $set: {
          'buyer.buyOrderStatus': 'cancelled',
          'buyer.cancelCount': nextCancelCount,
          'buyer.reputationScore': nextReputationScore,
          'buyer.reputationUpdatedAt': now,
          'buyer.reputationLastPenalty': {
            type: 'BUYER_CANCEL_PRIVATE_TRADE',
            reason: '구매자 요청 취소',
            penaltyPoints,
            orderId: orderId,
            tradeId: String(order?.tradeId || ''),
            appliedAt: now,
          },
        },
      },
    );

    await buyerReputationLogsCollection.insertOne({
      type: 'BUYER_CANCEL_PRIVATE_TRADE',
      reason: '구매자 요청 취소',
      storecode: 'admin',
      orderId: orderId,
      tradeId: String(order?.tradeId || ''),
      buyerWalletAddress: String(buyerUser?.walletAddress || orderBuyerWalletAddress || '').trim(),
      buyerNickname: String(buyerUser?.nickname || '').trim(),
      sellerWalletAddress:
        String(order?.seller?.walletAddress || sellerWalletAddress || '').trim(),
      canceller: cancelledByRole,
      cancelledByWalletAddress,
      cancelledByNickname,
      cancelledByIpAddress: normalizedCancelledByIpAddress,
      cancelledByUserAgent: normalizedCancelledByUserAgent,
      statusBeforeCancel: 'paymentRequested',
      statusAfterCancel: 'cancelled',
      penaltyPoints,
      reputationScoreBefore: prevReputationScore,
      reputationScoreAfter: nextReputationScore,
      cancelCountBefore: prevCancelCount,
      cancelCountAfter: nextCancelCount,
      rollbackUsdtAmount,
      rollbackTransactionHash: rollbackTransactionHash || '',
      createdAt: now,
    });
    await emitProgress({
      step: 'BUYER_REPUTATION_UPDATED',
      title: '구매자 이력 반영',
      description: '구매자 취소 이력과 신뢰도 정보를 반영했습니다.',
      status: 'completed',
    });
  } catch (reputationError) {
    console.error('cancelPrivateBuyOrderByBuyer: failed to update buyer reputation history', reputationError);
    await emitProgress({
      step: 'BUYER_REPUTATION_UPDATED',
      title: '구매자 이력 반영',
      description: '구매자 이력 반영 중 일부가 실패했지만 거래 취소는 완료되었습니다.',
      status: 'completed',
      detail: reputationError instanceof Error ? reputationError.message : String(reputationError),
    });
  }

  await emitProgress({
    step: 'CANCEL_COMPLETED',
    title: '취소 처리 완료',
    description: '거래 취소가 최종 완료되었습니다.',
    status: 'completed',
    data: {
      orderId,
      tradeId: String(order?.tradeId || ''),
    },
  });

  return true;
}

export type CancelPrivateBuyOrderByAdminToBuyerProgressStatus =
  | 'processing'
  | 'completed'
  | 'error';

export type CancelPrivateBuyOrderByAdminToBuyerProgressEvent = {
  step: string;
  title: string;
  description: string;
  status: CancelPrivateBuyOrderByAdminToBuyerProgressStatus;
  occurredAt: string;
  detail?: string;
  data?: Record<string, unknown>;
};

export async function cancelPrivateBuyOrderByAdminToBuyer({
  orderId,
  adminWalletAddress = '',
  cancelledByRole = 'admin',
  cancelledByNickname = '',
  cancelledByIpAddress = '',
  cancelledByUserAgent = '',
  onProgress,
}: {
  orderId: string;
  adminWalletAddress?: string;
  cancelledByRole?: string;
  cancelledByNickname?: string;
  cancelledByIpAddress?: string;
  cancelledByUserAgent?: string;
  onProgress?: (
    event: CancelPrivateBuyOrderByAdminToBuyerProgressEvent,
  ) => void | Promise<void>;
}): Promise<{
  success: boolean;
  transactionHash?: string;
  cancelledAt?: string;
  transferSkipped?: boolean;
  transferSkipReason?: string;
  error?: string;
}> {
  const emitProgress = async ({
    step,
    title,
    description,
    status,
    detail,
    data,
  }: {
    step: string;
    title: string;
    description: string;
    status: CancelPrivateBuyOrderByAdminToBuyerProgressStatus;
    detail?: string;
    data?: Record<string, unknown>;
  }) => {
    if (!onProgress) {
      return;
    }
    try {
      await onProgress({
        step,
        title,
        description,
        status,
        occurredAt: new Date().toISOString(),
        ...(detail ? { detail } : {}),
        ...(data ? { data } : {}),
      });
    } catch (progressError) {
      console.warn('cancelPrivateBuyOrderByAdminToBuyer progress callback failed', progressError);
    }
  };

  if (!ObjectId.isValid(orderId)) {
    await emitProgress({
      step: 'REQUEST_VALIDATED',
      title: '요청 검증',
      description: '주문 번호 형식이 올바르지 않습니다.',
      status: 'error',
    });
    return { success: false, error: 'INVALID_ORDER_ID' };
  }

  await emitProgress({
    step: 'REQUEST_VALIDATED',
    title: '요청 검증',
    description: '관리자 취소 요청 정보를 확인했습니다.',
    status: 'completed',
    data: {
      orderId,
      cancelledByRole: String(cancelledByRole || '').trim() || 'admin',
    },
  });

  const toWalletCandidates = (value: string) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return [] as string[];
    return Array.from(new Set([trimmed, trimmed.toLowerCase(), trimmed.toUpperCase()]));
  };

  const client = await clientPromise;
  const buyordersCollection = client.db(dbName).collection('buyorders');
  const usersCollection = client.db(dbName).collection('users');
  const objectId = new ObjectId(orderId);

  const order = await buyordersCollection.findOne<any>(
    { _id: objectId },
    {
      projection: {
        privateSale: 1,
        status: 1,
        tradeId: 1,
        escrowWallet: 1,
        usdtAmount: 1,
        escrowLockUsdtAmount: 1,
        platformFee: 1,
        platformFeeAmount: 1,
        settlement: 1,
        walletAddress: 1,
        buyer: 1,
        seller: 1,
      },
    },
  );

  if (!order || order.privateSale !== true) {
    await emitProgress({
      step: 'ORDER_VALIDATED',
      title: '주문 확인',
      description: '취소할 비공개 거래 주문을 찾지 못했습니다.',
      status: 'error',
    });
    return { success: false, error: 'ORDER_NOT_FOUND' };
  }

  if (order.status !== 'paymentRequested') {
    await emitProgress({
      step: 'ORDER_VALIDATED',
      title: '주문 확인',
      description: '입금요청 상태 주문만 취소할 수 있습니다.',
      status: 'error',
      data: {
        status: String(order.status || ''),
      },
    });
    return { success: false, error: 'INVALID_ORDER_STATUS' };
  }

  await emitProgress({
    step: 'ORDER_VALIDATED',
    title: '주문 확인',
    description: '취소 가능한 주문 상태를 확인했습니다.',
    status: 'completed',
    data: {
      tradeId: String(order?.tradeId || ''),
      status: String(order?.status || ''),
    },
  });

  const buyerEscrowWalletExecution = resolvePrivateOrderEscrowWalletSignerAndSmartAddress(order);
  const buyerEscrowSignerAddress = buyerEscrowWalletExecution.signerAddress;
  const buyerEscrowWalletAddress = buyerEscrowWalletExecution.smartAccountAddress;
  const sellerEscrowWalletAddress = resolveSellerEscrowWalletAddress(order);
  const orderBuyerWalletAddress =
    (typeof order?.buyer?.walletAddress === 'string' && order.buyer.walletAddress.trim())
    || (typeof order?.walletAddress === 'string' ? order.walletAddress.trim() : '');

  if (
    !isWalletAddress(buyerEscrowSignerAddress)
    || !isWalletAddress(buyerEscrowWalletAddress)
    || !isWalletAddress(sellerEscrowWalletAddress)
    || !orderBuyerWalletAddress
  ) {
    console.error('cancelPrivateBuyOrderByAdminToBuyer: wallet address missing', {
      buyerEscrowSignerAddress,
      buyerEscrowWalletAddress,
      sellerEscrowWalletAddress,
      orderBuyerWalletAddress,
    });
    await emitProgress({
      step: 'ESCROW_WALLET_VALIDATED',
      title: '에스크로 지갑 확인',
      description: '에스크로 지갑 정보를 확인하지 못했습니다.',
      status: 'error',
    });
    return { success: false, error: 'WALLET_ADDRESS_MISSING' };
  }

  await emitProgress({
    step: 'ESCROW_WALLET_VALIDATED',
    title: '에스크로 지갑 확인',
    description: '에스크로 지갑 주소를 확인했습니다.',
    status: 'completed',
    data: {
      buyerEscrowWalletAddress,
      sellerEscrowWalletAddress,
    },
  });

  const transferPlan = resolveStoredPrivateOrderTransferPlan(order);
  const plannedRollbackUsdtAmount = transferPlan.totalTransferUsdtAmount;
  if (!Number.isFinite(plannedRollbackUsdtAmount) || plannedRollbackUsdtAmount <= 0) {
    console.error('cancelPrivateBuyOrderByAdminToBuyer: invalid rollback usdt amount', {
      rollbackUsdtAmount: plannedRollbackUsdtAmount,
      usdtAmount: order?.usdtAmount,
      escrowLockUsdtAmount: order?.escrowLockUsdtAmount,
    });
    await emitProgress({
      step: 'ROLLBACK_AMOUNT_VALIDATED',
      title: '회수 수량 확인',
      description: '회수할 에스크로 수량이 올바르지 않습니다.',
      status: 'error',
    });
    return { success: false, error: 'INVALID_USDT_AMOUNT' };
  }

  await emitProgress({
    step: 'ROLLBACK_AMOUNT_VALIDATED',
    title: '회수 수량 확인',
    description: '에스크로 회수 수량을 확인했습니다.',
    status: 'completed',
    data: {
      rollbackUsdtAmount: plannedRollbackUsdtAmount,
    },
  });

  const thirdwebSecretKey = process.env.THIRDWEB_SECRET_KEY || '';
  if (!thirdwebSecretKey) {
    console.error('cancelPrivateBuyOrderByAdminToBuyer: THIRDWEB_SECRET_KEY is missing');
    await emitProgress({
      step: 'ENGINE_READY',
      title: '서버 지갑 준비',
      description: '서버 지갑 설정이 누락되었습니다.',
      status: 'error',
    });
    return { success: false, error: 'THIRDWEB_SECRET_KEY_MISSING' };
  }

  await emitProgress({
    step: 'ENGINE_READY',
    title: '서버 지갑 준비',
    description: '서버 지갑 연결을 확인했습니다.',
    status: 'completed',
  });

  const thirdwebClient = createThirdwebClient({ secretKey: thirdwebSecretKey });
  let releaseTransactionHash = '';
  let rollbackUsdtAmount = plannedRollbackUsdtAmount;
  let rollbackRawAmount = '';
  let transferSkipped = false;
  let transferSkipReason = '';
  try {
    const transferConfig = resolveUsdtTransferConfig();
    const usdtDecimals = resolveUsdtDecimals();
    const usdtContract = getContract({
      client: thirdwebClient,
      chain: transferConfig.chain,
      address: transferConfig.contractAddress,
    });

    const buyerEscrowWallet = Engine.serverWallet({
      client: thirdwebClient,
      address: buyerEscrowSignerAddress,
      chain: transferConfig.chain,
      executionOptions: {
        type: 'ERC4337',
        signerAddress: buyerEscrowSignerAddress,
        smartAccountAddress: buyerEscrowWalletAddress,
      },
    });

    const rawBuyerEscrowUsdtBalance = await balanceOf({
      contract: usdtContract,
      address: buyerEscrowWalletAddress,
    });
    if (rawBuyerEscrowUsdtBalance <= 0n) {
      transferSkipped = true;
      transferSkipReason = 'ALREADY_RECOVERED';
      rollbackUsdtAmount = plannedRollbackUsdtAmount;
      rollbackRawAmount = '';
      console.warn('cancelPrivateBuyOrderByAdminToBuyer: buyer escrow already empty, skip release transfer', {
        orderId,
        buyerEscrowWalletAddress,
        sellerEscrowWalletAddress,
      });

      await emitProgress({
        step: 'ROLLBACK_TRANSFER_SUBMITTED',
        title: '에스크로 회수 요청',
        description: '이미 회수된 주문으로 온체인 전송을 생략했습니다.',
        status: 'completed',
        data: {
          transferSkipped: true,
          transferSkipReason,
        },
      });

      await emitProgress({
        step: 'ROLLBACK_TRANSFER_CONFIRMED',
        title: '에스크로 회수 확인',
        description: '온체인 전송 생략 후 취소 반영을 계속 진행합니다.',
        status: 'completed',
        data: {
          transferSkipped: true,
          transferSkipReason,
        },
      });
    } else {
      rollbackRawAmount = rawBuyerEscrowUsdtBalance.toString();
      rollbackUsdtAmount = convertRawUsdtToDisplayAmount(rawBuyerEscrowUsdtBalance, usdtDecimals);
      const rollbackTransferAmount = formatRawUsdtAmount(rawBuyerEscrowUsdtBalance, usdtDecimals);

      const releaseTransaction = transfer({
        contract: usdtContract,
        to: sellerEscrowWalletAddress,
        amount: rollbackTransferAmount,
      });

      const { transactionId } = await buyerEscrowWallet.enqueueTransaction({
        transaction: releaseTransaction,
      });

      await emitProgress({
        step: 'ROLLBACK_TRANSFER_SUBMITTED',
        title: '에스크로 회수 요청',
        description: '구매 에스크로에서 판매자 에스크로로 전송을 요청했습니다.',
        status: 'processing',
        data: {
          transactionId: String(transactionId || ''),
        },
      });

      const hashResult = await Engine.waitForTransactionHash({
        client: thirdwebClient,
        transactionId,
        timeoutInSeconds: 90,
      });
      const txHash = typeof hashResult?.transactionHash === 'string' ? hashResult.transactionHash : '';
      if (!txHash) {
        throw new Error('empty release transaction hash');
      }

      let transferConfirmed = false;
      for (let i = 0; i < 25; i += 1) {
        const txStatus = await Engine.getTransactionStatus({
          client: thirdwebClient,
          transactionId,
        });

        if (txStatus.status === 'FAILED') {
          throw new Error(txStatus.error || 'release transfer failed');
        }

        if (txStatus.status === 'CONFIRMED') {
          if (txStatus.onchainStatus !== 'SUCCESS') {
            throw new Error(`release transfer reverted: ${txStatus.onchainStatus}`);
          }
          releaseTransactionHash =
            typeof txStatus.transactionHash === 'string' && txStatus.transactionHash
              ? txStatus.transactionHash
              : txHash;
          transferConfirmed = true;
          break;
        }

        await waitMs(1500);
      }

      if (!transferConfirmed) {
        throw new Error('release transfer confirmation timeout');
      }

      await emitProgress({
        step: 'ROLLBACK_TRANSFER_CONFIRMED',
        title: '에스크로 회수 확인',
        description: '온체인 회수 전송이 완료되었습니다.',
        status: 'completed',
        data: {
          transactionHash: releaseTransactionHash,
        },
      });
    }
  } catch (error) {
    console.error('cancelPrivateBuyOrderByAdminToBuyer: release transfer failed', error);
    await emitProgress({
      step: 'ROLLBACK_TRANSFER_CONFIRMED',
      title: '에스크로 회수 확인',
      description: '에스크로 회수 전송에 실패했습니다.',
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'TRANSFER_FAILED' };
  }

  const now = new Date().toISOString();
  const normalizedCancelledByRole = String(cancelledByRole || 'admin').trim().toLowerCase() || 'admin';
  const cancelledByWalletAddress = String(adminWalletAddress || 'admin').trim();
  const normalizedCancelledByNickname = String(cancelledByNickname || '').trim()
    || (normalizedCancelledByRole === 'agent' ? '에이전트' : '관리자');
  const normalizedCancelledByIpAddress = String(cancelledByIpAddress || '').trim();
  const normalizedCancelledByUserAgent = String(cancelledByUserAgent || '').trim();
  const cancelTradeReason =
    normalizedCancelledByRole === 'agent'
      ? '에이전트 취소(판매자 지갑 반환)'
      : '관리자 취소(판매자 지갑 반환)';
  const sellerWalletCandidates = toWalletCandidates(
    typeof order?.seller?.walletAddress === 'string' ? order.seller.walletAddress : '',
  );
  const orderUpdateSet: Record<string, unknown> = {
    status: 'cancelled',
    cancelledAt: now,
    cancelTradeReason,
    canceller: normalizedCancelledByRole,
    cancelledByRole: normalizedCancelledByRole,
    cancelledByWalletAddress,
    cancelledByNickname: normalizedCancelledByNickname,
    cancelledByIpAddress: normalizedCancelledByIpAddress,
    cancelledByUserAgent: normalizedCancelledByUserAgent,
    rollbackUsdtAmount,
    rollbackRawAmount,
    rollbackTransferSkipped: transferSkipped,
    rollbackTransferSkipReason: transferSkipReason,
  };
  if (releaseTransactionHash) {
    orderUpdateSet.cancelReleaseTransactionHash = releaseTransactionHash;
    orderUpdateSet['buyer.releaseTransactionHash'] = releaseTransactionHash;
    orderUpdateSet['seller.releaseTransactionHash'] = releaseTransactionHash;
  }

  const cancelResult = await buyordersCollection.updateOne(
    {
      _id: objectId,
      privateSale: true,
      status: 'paymentRequested',
    },
    {
      $set: orderUpdateSet,
    },
  );

  if (cancelResult.modifiedCount !== 1) {
    await emitProgress({
      step: 'ORDER_CANCELLED',
      title: '주문 취소 반영',
      description: '주문 취소 상태 저장에 실패했습니다.',
      status: 'error',
    });
    return { success: false, error: 'FAILED_TO_UPDATE_ORDER' };
  }

  await emitProgress({
    step: 'ORDER_CANCELLED',
    title: '주문 취소 반영',
    description: '주문 상태를 취소로 변경했습니다.',
    status: 'completed',
    data: {
      orderId,
      tradeId: String(order?.tradeId || ''),
      rollbackUsdtAmount,
      rollbackTransactionHash: releaseTransactionHash || '',
      transferSkipped,
      transferSkipReason,
    },
  });

  if (sellerWalletCandidates.length > 0) {
    const sellerBuyOrderUpdateSet: Record<string, unknown> = {
      'seller.buyOrder.status': 'cancelled',
      'seller.buyOrder.cancelledAt': now,
      'seller.buyOrder.cancelTradeReason': cancelTradeReason,
      'seller.buyOrder.canceller': normalizedCancelledByRole,
      'seller.buyOrder.cancelledByRole': normalizedCancelledByRole,
      'seller.buyOrder.cancelledByWalletAddress': cancelledByWalletAddress,
      'seller.buyOrder.cancelledByNickname': normalizedCancelledByNickname,
      'seller.buyOrder.cancelledByIpAddress': normalizedCancelledByIpAddress,
      'seller.buyOrder.cancelledByUserAgent': normalizedCancelledByUserAgent,
      'seller.buyOrder.rollbackUsdtAmount': rollbackUsdtAmount,
      'seller.buyOrder.rollbackRawAmount': rollbackRawAmount,
      'seller.buyOrder.rollbackTransferSkipped': transferSkipped,
      'seller.buyOrder.rollbackTransferSkipReason': transferSkipReason,
    };
    if (releaseTransactionHash) {
      sellerBuyOrderUpdateSet['seller.buyOrder.cancelReleaseTransactionHash'] = releaseTransactionHash;
      sellerBuyOrderUpdateSet['seller.buyOrder.buyer.releaseTransactionHash'] = releaseTransactionHash;
      sellerBuyOrderUpdateSet['seller.buyOrder.seller.releaseTransactionHash'] = releaseTransactionHash;
    }

    await usersCollection.updateOne(
      {
        walletAddress: { $in: sellerWalletCandidates },
        storecode: 'admin',
        'seller.buyOrder._id': objectId,
      },
      {
        $set: sellerBuyOrderUpdateSet,
      },
    );
  }

  await emitProgress({
    step: 'SELLER_SNAPSHOT_UPDATED',
    title: '판매자 상태 동기화',
    description: '판매자 측 주문 스냅샷을 갱신했습니다.',
    status: 'completed',
  });

  const buyerWalletCandidates = toWalletCandidates(orderBuyerWalletAddress);
  if (buyerWalletCandidates.length > 0) {
    await usersCollection.updateOne(
      {
        walletAddress: { $in: buyerWalletCandidates },
        storecode: 'admin',
      },
      {
        $set: {
          'buyer.buyOrderStatus': 'cancelled',
          buyOrderStatus: 'cancelled',
        },
      },
    );
  }

  await emitProgress({
    step: 'BUYER_STATUS_UPDATED',
    title: '구매자 상태 동기화',
    description: '구매자 주문 상태를 취소로 동기화했습니다.',
    status: 'completed',
  });

  await emitProgress({
    step: 'CANCEL_COMPLETED',
    title: '취소 처리 완료',
    description: '거래 취소가 최종 완료되었습니다.',
    status: 'completed',
    data: {
      orderId,
      tradeId: String(order?.tradeId || ''),
    },
  });

  return {
    success: true,
    transactionHash: releaseTransactionHash,
    cancelledAt: now,
    transferSkipped,
    transferSkipReason,
  };
}

export async function recoverCancelledPrivateBuyOrderRollbackByAdmin({
  orderId,
  requesterWalletAddress = '',
  recoveredByRole = 'admin',
  recoveredByNickname = '',
  recoveredByIpAddress = '',
  recoveredByUserAgent = '',
}: {
  orderId: string;
  requesterWalletAddress?: string;
  recoveredByRole?: string;
  recoveredByNickname?: string;
  recoveredByIpAddress?: string;
  recoveredByUserAgent?: string;
}): Promise<{
  success: boolean;
  alreadyRecovered?: boolean;
  transactionHash?: string;
  recoveredAt?: string;
  recoveredUsdtAmount?: number;
  recoveredRawAmount?: string;
  error?: string;
  detail?: string;
}> {
  if (!ObjectId.isValid(orderId)) {
    return { success: false, error: 'INVALID_ORDER_ID' };
  }

  const toWalletCandidates = (value: string) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return [] as string[];
    return Array.from(new Set([trimmed, trimmed.toLowerCase(), trimmed.toUpperCase()]));
  };

  const resolveExistingRollbackTxHash = (orderLike: any) => {
    const candidates = [
      orderLike?.cancelReleaseTransactionHash,
      orderLike?.buyer?.releaseTransactionHash,
      orderLike?.buyer?.rollbackTransactionHash,
      orderLike?.seller?.releaseTransactionHash,
      orderLike?.seller?.rollbackTransactionHash,
    ];
    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim();
      if (normalized) return normalized;
    }
    return '';
  };

  const client = await clientPromise;
  const buyordersCollection = client.db(dbName).collection('buyorders');
  const usersCollection = client.db(dbName).collection('users');
  const rollbackRecoveryLogsCollection = client.db(dbName).collection('buyorder_rollback_recovery_logs');
  const objectId = new ObjectId(orderId);

  const order = await buyordersCollection.findOne<any>(
    { _id: objectId },
    {
      projection: {
        privateSale: 1,
        status: 1,
        tradeId: 1,
        escrowWallet: 1,
        usdtAmount: 1,
        escrowLockUsdtAmount: 1,
        platformFee: 1,
        platformFeeAmount: 1,
        settlement: 1,
        walletAddress: 1,
        buyer: 1,
        seller: 1,
        rollbackUsdtAmount: 1,
        rollbackRawAmount: 1,
        rollbackRecoveredAt: 1,
        cancelReleaseTransactionHash: 1,
      },
    },
  );

  if (!order || order.privateSale !== true) {
    return { success: false, error: 'ORDER_NOT_FOUND' };
  }

  if (order.status !== 'cancelled') {
    return { success: false, error: 'INVALID_ORDER_STATUS' };
  }

  const existingRollbackTxHash = resolveExistingRollbackTxHash(order);
  if (existingRollbackTxHash) {
    return {
      success: true,
      alreadyRecovered: true,
      transactionHash: existingRollbackTxHash,
      recoveredAt: String(order?.rollbackRecoveredAt || order?.cancelledAt || ''),
      recoveredUsdtAmount: toUsdtAmountOrZero(order?.rollbackUsdtAmount),
      recoveredRawAmount: String(order?.rollbackRawAmount || ''),
    };
  }

  const buyerEscrowWalletExecution = resolvePrivateOrderEscrowWalletSignerAndSmartAddress(order);
  const buyerEscrowSignerAddress = buyerEscrowWalletExecution.signerAddress;
  const buyerEscrowWalletAddress = buyerEscrowWalletExecution.smartAccountAddress;
  const sellerEscrowWalletAddress = resolveSellerEscrowWalletAddress(order);
  const orderBuyerWalletAddress =
    (typeof order?.buyer?.walletAddress === 'string' && order.buyer.walletAddress.trim())
    || (typeof order?.walletAddress === 'string' ? order.walletAddress.trim() : '');

  if (
    !isWalletAddress(buyerEscrowSignerAddress)
    || !isWalletAddress(buyerEscrowWalletAddress)
    || !isWalletAddress(sellerEscrowWalletAddress)
  ) {
    console.error('recoverCancelledPrivateBuyOrderRollbackByAdmin: wallet address missing', {
      buyerEscrowSignerAddress,
      buyerEscrowWalletAddress,
      sellerEscrowWalletAddress,
    });
    return { success: false, error: 'WALLET_ADDRESS_MISSING' };
  }

  const transferPlan = resolveStoredPrivateOrderTransferPlan(order);
  const plannedRollbackUsdtAmount = transferPlan.totalTransferUsdtAmount;
  if (!Number.isFinite(plannedRollbackUsdtAmount) || plannedRollbackUsdtAmount <= 0) {
    console.error('recoverCancelledPrivateBuyOrderRollbackByAdmin: invalid rollback usdt amount', {
      rollbackUsdtAmount: plannedRollbackUsdtAmount,
      usdtAmount: order?.usdtAmount,
      escrowLockUsdtAmount: order?.escrowLockUsdtAmount,
    });
    return { success: false, error: 'INVALID_USDT_AMOUNT' };
  }

  const thirdwebSecretKey = process.env.THIRDWEB_SECRET_KEY || '';
  if (!thirdwebSecretKey) {
    console.error('recoverCancelledPrivateBuyOrderRollbackByAdmin: THIRDWEB_SECRET_KEY is missing');
    return { success: false, error: 'THIRDWEB_SECRET_KEY_MISSING' };
  }

  const thirdwebClient = createThirdwebClient({ secretKey: thirdwebSecretKey });
  let recoveryTransactionHash = '';
  let recoveredUsdtAmount = plannedRollbackUsdtAmount;
  let recoveredRawAmount = '';
  try {
    const transferConfig = resolveUsdtTransferConfig();
    const usdtDecimals = resolveUsdtDecimals();
    const usdtContract = getContract({
      client: thirdwebClient,
      chain: transferConfig.chain,
      address: transferConfig.contractAddress,
    });

    const buyerEscrowWallet = Engine.serverWallet({
      client: thirdwebClient,
      address: buyerEscrowSignerAddress,
      chain: transferConfig.chain,
      executionOptions: {
        type: 'ERC4337',
        signerAddress: buyerEscrowSignerAddress,
        smartAccountAddress: buyerEscrowWalletAddress,
      },
    });

    const rawBuyerEscrowUsdtBalance = await balanceOf({
      contract: usdtContract,
      address: buyerEscrowWalletAddress,
    });
    if (rawBuyerEscrowUsdtBalance <= 0n) {
      return { success: false, error: 'BUYER_ESCROW_BALANCE_EMPTY' };
    }

    recoveredRawAmount = rawBuyerEscrowUsdtBalance.toString();
    recoveredUsdtAmount = convertRawUsdtToDisplayAmount(rawBuyerEscrowUsdtBalance, usdtDecimals);
    const recoveryTransferAmount = formatRawUsdtAmount(rawBuyerEscrowUsdtBalance, usdtDecimals);

    const recoveryTransaction = transfer({
      contract: usdtContract,
      to: sellerEscrowWalletAddress,
      amount: recoveryTransferAmount,
    });

    const { transactionId } = await buyerEscrowWallet.enqueueTransaction({
      transaction: recoveryTransaction,
    });

    const hashResult = await Engine.waitForTransactionHash({
      client: thirdwebClient,
      transactionId,
      timeoutInSeconds: 90,
    });
    const txHash = typeof hashResult?.transactionHash === 'string' ? hashResult.transactionHash : '';
    if (!txHash) {
      throw new Error('empty recovery transaction hash');
    }

    let transferConfirmed = false;
    for (let i = 0; i < 25; i += 1) {
      const txStatus = await Engine.getTransactionStatus({
        client: thirdwebClient,
        transactionId,
      });

      if (txStatus.status === 'FAILED') {
        throw new Error(txStatus.error || 'recovery transfer failed');
      }

      if (txStatus.status === 'CONFIRMED') {
        if (txStatus.onchainStatus !== 'SUCCESS') {
          throw new Error(`recovery transfer reverted: ${txStatus.onchainStatus}`);
        }
        recoveryTransactionHash =
          typeof txStatus.transactionHash === 'string' && txStatus.transactionHash
            ? txStatus.transactionHash
            : txHash;
        transferConfirmed = true;
        break;
      }

      await waitMs(1500);
    }

    if (!transferConfirmed) {
      throw new Error('recovery transfer confirmation timeout');
    }
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    console.error('recoverCancelledPrivateBuyOrderRollbackByAdmin: recovery transfer failed', error);
    return { success: false, error: 'TRANSFER_FAILED', detail };
  }

  const now = new Date().toISOString();
  const normalizedRecoveredByRole = String(recoveredByRole || 'admin').trim().toLowerCase() || 'admin';
  const normalizedRecoveredByWalletAddress = String(requesterWalletAddress || '').trim();
  const normalizedRecoveredByNickname = String(recoveredByNickname || '').trim()
    || (normalizedRecoveredByRole === 'agent' ? '에이전트' : '관리자');
  const normalizedRecoveredByIpAddress = normalizeIpAddress(recoveredByIpAddress);
  const normalizedRecoveredByUserAgent = String(recoveredByUserAgent || '').trim();
  const sellerWalletCandidates = toWalletCandidates(
    typeof order?.seller?.walletAddress === 'string' ? order.seller.walletAddress : '',
  );

  const rollbackRecoveryPayload = {
    source: 'MANUAL_UNRECOVERED_CANCELLED_ROLLBACK',
    recoveredAt: now,
    recoveredByRole: normalizedRecoveredByRole,
    recoveredByWalletAddress: normalizedRecoveredByWalletAddress,
    recoveredByNickname: normalizedRecoveredByNickname,
    recoveredByIpAddress: normalizedRecoveredByIpAddress,
    recoveredByUserAgent: normalizedRecoveredByUserAgent,
    transactionHash: recoveryTransactionHash,
    recoveredUsdtAmount,
    recoveredRawAmount,
  };

  const orderUpdateSet: Record<string, unknown> = {
    rollbackUsdtAmount: recoveredUsdtAmount,
    rollbackRawAmount: recoveredRawAmount,
    cancelReleaseTransactionHash: recoveryTransactionHash,
    'buyer.releaseTransactionHash': recoveryTransactionHash,
    'seller.releaseTransactionHash': recoveryTransactionHash,
    rollbackTransferSkipped: false,
    rollbackTransferSkipReason: '',
    rollbackRecoveredAt: now,
    rollbackRecoveredByRole: normalizedRecoveredByRole,
    rollbackRecoveredByWalletAddress: normalizedRecoveredByWalletAddress,
    rollbackRecoveredByNickname: normalizedRecoveredByNickname,
    rollbackRecoveredByIpAddress: normalizedRecoveredByIpAddress,
    rollbackRecoveredByUserAgent: normalizedRecoveredByUserAgent,
    rollbackRecovery: rollbackRecoveryPayload,
  };

  const recoverResult = await buyordersCollection.updateOne(
    {
      _id: objectId,
      privateSale: true,
      status: 'cancelled',
    },
    {
      $set: orderUpdateSet,
    },
  );

  if (recoverResult.modifiedCount !== 1) {
    const latestOrder = await buyordersCollection.findOne<any>(
      { _id: objectId },
      {
        projection: {
          cancelReleaseTransactionHash: 1,
          buyer: 1,
          seller: 1,
          rollbackRecoveredAt: 1,
          rollbackUsdtAmount: 1,
          rollbackRawAmount: 1,
        },
      },
    );
    const latestRollbackTxHash = resolveExistingRollbackTxHash(latestOrder);
    if (latestRollbackTxHash) {
      return {
        success: true,
        alreadyRecovered: true,
        transactionHash: latestRollbackTxHash,
        recoveredAt: String(latestOrder?.rollbackRecoveredAt || ''),
        recoveredUsdtAmount: toUsdtAmountOrZero(latestOrder?.rollbackUsdtAmount),
        recoveredRawAmount: String(latestOrder?.rollbackRawAmount || ''),
      };
    }
    return { success: false, error: 'FAILED_TO_UPDATE_ORDER' };
  }

  if (sellerWalletCandidates.length > 0) {
    const sellerBuyOrderUpdateSet: Record<string, unknown> = {
      'seller.buyOrder.rollbackUsdtAmount': recoveredUsdtAmount,
      'seller.buyOrder.rollbackRawAmount': recoveredRawAmount,
      'seller.buyOrder.cancelReleaseTransactionHash': recoveryTransactionHash,
      'seller.buyOrder.buyer.releaseTransactionHash': recoveryTransactionHash,
      'seller.buyOrder.seller.releaseTransactionHash': recoveryTransactionHash,
      'seller.buyOrder.rollbackTransferSkipped': false,
      'seller.buyOrder.rollbackTransferSkipReason': '',
      'seller.buyOrder.rollbackRecoveredAt': now,
      'seller.buyOrder.rollbackRecoveredByRole': normalizedRecoveredByRole,
      'seller.buyOrder.rollbackRecoveredByWalletAddress': normalizedRecoveredByWalletAddress,
      'seller.buyOrder.rollbackRecoveredByNickname': normalizedRecoveredByNickname,
      'seller.buyOrder.rollbackRecoveredByIpAddress': normalizedRecoveredByIpAddress,
      'seller.buyOrder.rollbackRecoveredByUserAgent': normalizedRecoveredByUserAgent,
      'seller.buyOrder.rollbackRecovery': rollbackRecoveryPayload,
    };

    await usersCollection.updateOne(
      {
        walletAddress: { $in: sellerWalletCandidates },
        storecode: 'admin',
        'seller.buyOrder._id': objectId,
      },
      {
        $set: sellerBuyOrderUpdateSet,
      },
    );
  }

  try {
    await rollbackRecoveryLogsCollection.insertOne({
      type: 'CANCELLED_PRIVATE_BUYORDER_ROLLBACK_RECOVERY',
      orderId,
      tradeId: String(order?.tradeId || ''),
      privateSale: true,
      orderStatus: 'cancelled',
      buyerWalletAddress: orderBuyerWalletAddress,
      buyerEscrowWalletAddress,
      sellerWalletAddress: String(order?.seller?.walletAddress || '').trim(),
      sellerEscrowWalletAddress,
      recoveredUsdtAmount,
      recoveredRawAmount,
      transactionHash: recoveryTransactionHash,
      recoveredByRole: normalizedRecoveredByRole,
      recoveredByWalletAddress: normalizedRecoveredByWalletAddress,
      recoveredByNickname: normalizedRecoveredByNickname,
      recoveredByIpAddress: normalizedRecoveredByIpAddress,
      recoveredByUserAgent: normalizedRecoveredByUserAgent,
      createdAt: now,
    });
  } catch (logError) {
    console.error('recoverCancelledPrivateBuyOrderRollbackByAdmin: failed to write recovery log', logError);
  }

  return {
    success: true,
    transactionHash: recoveryTransactionHash,
    recoveredAt: now,
    recoveredUsdtAmount,
    recoveredRawAmount,
  };
}

export async function completePrivateBuyOrderBySeller(
  {
    orderId,
    sellerWalletAddress,
    requesterIpAddress = '',
    requesterUserAgent = '',
  }: {
    orderId: string;
    sellerWalletAddress: string;
    requesterIpAddress?: string;
    requesterUserAgent?: string;
  },
): Promise<{
  success: boolean;
  transactionHash?: string;
  paymentConfirmedAt?: string;
  platformFeeRatePercent?: number;
  platformFeeUsdtAmount?: number;
  platformFeeWalletAddress?: string;
  agentFeeRatePercent?: number;
  agentFeeUsdtAmount?: number;
  buyerTransferUsdtAmount?: number;
  totalTransferUsdtAmount?: number;
  transferCount?: number;
  error?: string;
}> {
  if (!ObjectId.isValid(orderId)) {
    return { success: false, error: 'INVALID_ORDER_ID' };
  }

  if (!sellerWalletAddress || !sellerWalletAddress.trim()) {
    return { success: false, error: 'INVALID_SELLER_WALLET_ADDRESS' };
  }

  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const toWalletCandidates = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return [] as string[];
    return Array.from(new Set([trimmed, trimmed.toLowerCase(), trimmed.toUpperCase()]));
  };

  const toWalletAddressRegexQuery = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return {
      $regex: `^${escapeRegex(trimmed)}$`,
      $options: 'i',
    };
  };

  const client = await clientPromise;
  const buyordersCollection = client.db(dbName).collection('buyorders');
  const usersCollection = client.db(dbName).collection('users');
  const objectId = new ObjectId(orderId);

  const order = await buyordersCollection.findOne<any>(
    { _id: objectId },
    {
      projection: {
        privateSale: 1,
        status: 1,
        escrowWallet: 1,
        usdtAmount: 1,
        escrowLockUsdtAmount: 1,
        walletAddress: 1,
        buyer: 1,
        seller: 1,
        platformFee: 1,
        platformFeeRate: 1,
        platformFeeAmount: 1,
        platformFeeWalletAddress: 1,
        settlement: 1,
      },
    },
  );

  if (!order || order.privateSale !== true) {
    return { success: false, error: 'ORDER_NOT_FOUND' };
  }

  if (order.status !== 'paymentRequested') {
    return { success: false, error: 'INVALID_ORDER_STATUS' };
  }

  const sellerWalletCandidates = toWalletCandidates(sellerWalletAddress);
  const sellerWalletRegexQuery = toWalletAddressRegexQuery(sellerWalletAddress);
  const orderSellerWalletCandidates = toWalletCandidates(
    typeof order?.seller?.walletAddress === 'string' ? order.seller.walletAddress : '',
  );

  const sellerMatched = orderSellerWalletCandidates.some((candidate) =>
    sellerWalletCandidates.includes(candidate),
  );
  if (!sellerMatched) {
    return { success: false, error: 'SELLER_MISMATCH' };
  }

  const sellerUser = await usersCollection.findOne<any>(
    {
      walletAddress: sellerWalletRegexQuery || { $in: sellerWalletCandidates },
      storecode: 'admin',
      seller: { $exists: true },
    },
    {
      projection: {
        walletAddress: 1,
        nickname: 1,
        seller: 1,
      },
    },
  );

  if (!sellerUser) {
    return { success: false, error: 'SELLER_WALLET_NOT_ALLOWED' };
  }

  const sellerWalletForAudit =
    (typeof sellerUser?.walletAddress === 'string' && sellerUser.walletAddress.trim())
    || sellerWalletAddress.trim();
  const sellerNicknameForAudit =
    (typeof sellerUser?.seller?.nickname === 'string' && sellerUser.seller.nickname.trim())
    || (typeof sellerUser?.nickname === 'string' && sellerUser.nickname.trim())
    || '판매자';
  const normalizedRequesterIpAddress = String(requesterIpAddress || '').trim();
  const normalizedRequesterUserAgent = String(requesterUserAgent || '').trim();

  const buyerEscrowWalletExecution = resolvePrivateOrderEscrowWalletSignerAndSmartAddress(order);
  const buyerEscrowSignerAddress = buyerEscrowWalletExecution.signerAddress;
  const buyerEscrowWalletAddress = buyerEscrowWalletExecution.smartAccountAddress;
  const sellerEscrowWalletAddress = resolveSellerEscrowWalletAddress(order);
  const orderBuyerWalletAddress =
    (typeof order?.buyer?.walletAddress === 'string' && order.buyer.walletAddress.trim())
    || (typeof order?.walletAddress === 'string' ? order.walletAddress.trim() : '');

  if (
    !isWalletAddress(buyerEscrowSignerAddress)
    || !isWalletAddress(buyerEscrowWalletAddress)
    || !orderBuyerWalletAddress
  ) {
    console.error('completePrivateBuyOrderBySeller: wallet address missing', {
      buyerEscrowSignerAddress,
      buyerEscrowWalletAddress,
      orderBuyerWalletAddress,
    });
    return { success: false, error: 'WALLET_ADDRESS_MISSING' };
  }

  const normalizedUsdtAmount = roundDownUsdtAmount(Number(order?.usdtAmount || 0));
  if (!Number.isFinite(normalizedUsdtAmount) || normalizedUsdtAmount <= 0) {
    console.error('completePrivateBuyOrderBySeller: invalid usdt amount', order?.usdtAmount);
    return { success: false, error: 'INVALID_USDT_AMOUNT' };
  }

  const transferPlan = resolveStoredPrivateOrderTransferPlan(order);
  const buyerTransferUsdtAmount = transferPlan.buyerTransferUsdtAmount;
  const platformFeeUsdtAmount = transferPlan.platformFeeUsdtAmount;
  const plannedTotalTransferUsdtAmount = transferPlan.totalTransferUsdtAmount;
  const shouldTransferPlatformFee = transferPlan.shouldTransferPlatformFee;
  const plannedTransferCount = transferPlan.transferCount;
  const resolvedPlatformFee = {
    feeRatePercent: transferPlan.feeRatePercent,
    feeWalletAddress: transferPlan.feeWalletAddress,
    source: transferPlan.source,
  };
  const resolveAgentFeeRatePercent = () => {
    const candidates = [
      order?.agentFeeRate,
      order?.agentFeePercent,
      order?.settlement?.agentFeePercent,
      order?.store?.agentFeePercent,
      order?.agent?.agentFeePercent,
    ];

    for (const value of candidates) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
    }
    return 0;
  };
  const resolveAgentFeeUsdtAmount = (
    {
      agentFeeRatePercent,
      buyerTransferUsdtAmount,
    }: {
      agentFeeRatePercent: number;
      buyerTransferUsdtAmount: number;
    },
  ) => {
    const candidates = [
      order?.agentFeeAmount,
      order?.agentFeeUsdtAmount,
      order?.settlement?.agentFeeAmount,
      order?.settlement?.agentFeeAmountUSDT,
    ];

    for (const value of candidates) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        return roundDownUsdtAmount(numeric);
      }
    }

    if (agentFeeRatePercent > 0 && buyerTransferUsdtAmount > 0) {
      return roundDownUsdtAmount((buyerTransferUsdtAmount * agentFeeRatePercent) / 100);
    }

    return 0;
  };
  const resolvedAgentFeeRatePercent = resolveAgentFeeRatePercent();
  const resolvedAgentFeeUsdtAmount = resolveAgentFeeUsdtAmount({
    agentFeeRatePercent: resolvedAgentFeeRatePercent,
    buyerTransferUsdtAmount,
  });

  if (!Number.isFinite(buyerTransferUsdtAmount) || buyerTransferUsdtAmount <= 0) {
    return { success: false, error: 'INVALID_USDT_AMOUNT' };
  }

  if (!Number.isFinite(plannedTotalTransferUsdtAmount) || plannedTotalTransferUsdtAmount <= 0) {
    return { success: false, error: 'INVALID_USDT_AMOUNT' };
  }

  if (shouldTransferPlatformFee && !isWalletAddress(resolvedPlatformFee.feeWalletAddress)) {
    console.error('completePrivateBuyOrderBySeller: platform fee wallet is missing', {
      feeRatePercent: resolvedPlatformFee.feeRatePercent,
      feeWalletAddress: resolvedPlatformFee.feeWalletAddress,
      source: resolvedPlatformFee.source,
    });
    return { success: false, error: 'PLATFORM_FEE_WALLET_NOT_CONFIGURED' };
  }

  const thirdwebSecretKey = process.env.THIRDWEB_SECRET_KEY || '';
  if (!thirdwebSecretKey) {
    console.error('completePrivateBuyOrderBySeller: THIRDWEB_SECRET_KEY is missing');
    return { success: false, error: 'THIRDWEB_SECRET_KEY_MISSING' };
  }

  const thirdwebClient = createThirdwebClient({ secretKey: thirdwebSecretKey });
  let releaseTransactionHash = '';
  let actualTotalTransferUsdtAmount = plannedTotalTransferUsdtAmount;
  let transferCount = plannedTransferCount;
  let transferMode: 'single' | 'batch' = shouldTransferPlatformFee ? 'batch' : 'single';
  let dustSweepUsdtAmount = 0;
  let dustSweepRawAmount = '';
  let dustSweepWalletAddress = '';
  try {
    const transferConfig = resolveUsdtTransferConfig();
    const usdtDecimals = resolveUsdtDecimals();
    const usdtContract = getContract({
      client: thirdwebClient,
      chain: transferConfig.chain,
      address: transferConfig.contractAddress,
    });

    const buyerEscrowWallet = Engine.serverWallet({
      client: thirdwebClient,
      address: buyerEscrowSignerAddress,
      chain: transferConfig.chain,
      executionOptions: {
        type: 'ERC4337',
        signerAddress: buyerEscrowSignerAddress,
        smartAccountAddress: buyerEscrowWalletAddress,
      },
    });

    const waitForConfirmedTransactionHash = async (
      transactionId: string,
      contextLabel: string,
    ) => {
      const hashResult = await Engine.waitForTransactionHash({
        client: thirdwebClient,
        transactionId,
        timeoutInSeconds: 90,
      });
      const txHash = typeof hashResult?.transactionHash === 'string' ? hashResult.transactionHash : '';
      if (!txHash) {
        throw new Error(`${contextLabel}: empty transaction hash`);
      }

      let transferConfirmed = false;
      let confirmedHash = txHash;

      for (let i = 0; i < 25; i += 1) {
        const txStatus = await Engine.getTransactionStatus({
          client: thirdwebClient,
          transactionId,
        });

        if (txStatus.status === 'FAILED') {
          throw new Error(`${contextLabel}: ${txStatus.error || 'engine transaction failed'}`);
        }

        if (txStatus.status === 'CONFIRMED') {
          if (txStatus.onchainStatus !== 'SUCCESS') {
            throw new Error(`${contextLabel}: transaction reverted (${txStatus.onchainStatus})`);
          }
          confirmedHash =
            typeof txStatus.transactionHash === 'string' && txStatus.transactionHash
              ? txStatus.transactionHash
              : txHash;
          transferConfirmed = true;
          break;
        }

        await waitMs(1500);
      }

      if (!transferConfirmed) {
        throw new Error(`${contextLabel}: confirmation timeout`);
      }

      return confirmedHash;
    };

    const rawBuyerEscrowUsdtBalance = await balanceOf({
      contract: usdtContract,
      address: buyerEscrowWalletAddress,
    });

    if (rawBuyerEscrowUsdtBalance <= 0n) {
      console.error('completePrivateBuyOrderBySeller: buyer escrow balance is empty', {
        buyerEscrowWalletAddress,
      });
      return { success: false, error: 'ESCROW_BALANCE_INSUFFICIENT' };
    }

    const rawBuyerTransferUsdtAmount = toRawUsdtAmountFromRoundedValue(buyerTransferUsdtAmount, usdtDecimals);
    const rawPlatformFeeUsdtAmount = shouldTransferPlatformFee
      ? toRawUsdtAmountFromRoundedValue(platformFeeUsdtAmount, usdtDecimals)
      : 0n;
    const rawPlannedTotalTransferUsdtAmount = rawBuyerTransferUsdtAmount + rawPlatformFeeUsdtAmount;

    if (rawPlannedTotalTransferUsdtAmount <= 0n) {
      console.error('completePrivateBuyOrderBySeller: planned raw transfer amount is invalid', {
        buyerTransferUsdtAmount,
        platformFeeUsdtAmount,
        rawBuyerTransferUsdtAmount: rawBuyerTransferUsdtAmount.toString(),
        rawPlatformFeeUsdtAmount: rawPlatformFeeUsdtAmount.toString(),
      });
      return { success: false, error: 'INVALID_USDT_AMOUNT' };
    }

    if (rawBuyerEscrowUsdtBalance < rawPlannedTotalTransferUsdtAmount) {
      console.error('completePrivateBuyOrderBySeller: buyer escrow balance is insufficient for total transfer', {
        buyerEscrowWalletAddress,
        buyerEscrowUsdtBalance: convertRawUsdtToDisplayAmount(rawBuyerEscrowUsdtBalance, usdtDecimals),
        buyerTransferUsdtAmount,
        platformFeeUsdtAmount,
        plannedTotalTransferUsdtAmount,
        rawBuyerEscrowUsdtBalance: rawBuyerEscrowUsdtBalance.toString(),
        rawPlannedTotalTransferUsdtAmount: rawPlannedTotalTransferUsdtAmount.toString(),
      });
      return { success: false, error: 'ESCROW_BALANCE_INSUFFICIENT' };
    }

    const rawDustSweepUsdtAmount = rawBuyerEscrowUsdtBalance - rawPlannedTotalTransferUsdtAmount;

    const transferTransactions = [
      transfer({
        contract: usdtContract,
        to: orderBuyerWalletAddress,
        amount: formatRawUsdtAmount(rawBuyerTransferUsdtAmount, usdtDecimals),
      }),
    ];

    if (shouldTransferPlatformFee && rawPlatformFeeUsdtAmount > 0n) {
      transferTransactions.push(
        transfer({
          contract: usdtContract,
          to: resolvedPlatformFee.feeWalletAddress,
          amount: formatRawUsdtAmount(rawPlatformFeeUsdtAmount, usdtDecimals),
        }),
      );
    }

    if (rawDustSweepUsdtAmount > 0n) {
      const fallbackDustSweepWalletAddress =
        isWalletAddress(sellerEscrowWalletAddress) ? sellerEscrowWalletAddress : orderBuyerWalletAddress;
      if (!isWalletAddress(fallbackDustSweepWalletAddress)) {
        throw new Error('dust sweep wallet address is missing');
      }
      dustSweepWalletAddress = fallbackDustSweepWalletAddress;
      dustSweepRawAmount = rawDustSweepUsdtAmount.toString();
      dustSweepUsdtAmount = convertRawUsdtToDisplayAmount(rawDustSweepUsdtAmount, usdtDecimals);

      transferTransactions.push(
        transfer({
          contract: usdtContract,
          to: fallbackDustSweepWalletAddress,
          amount: formatRawUsdtAmount(rawDustSweepUsdtAmount, usdtDecimals),
        }),
      );
    }

    const transactionId = transferTransactions.length > 1
      ? (
          await buyerEscrowWallet.enqueueBatchTransaction({
            transactions: transferTransactions,
          })
        ).transactionId
      : (
          await buyerEscrowWallet.enqueueTransaction({
            transaction: transferTransactions[0],
          })
        ).transactionId;
    releaseTransactionHash = await waitForConfirmedTransactionHash(
      transactionId,
      'private buyorder release transfer',
    );

    transferCount = transferTransactions.length;
    transferMode = transferTransactions.length > 1 ? 'batch' : 'single';
    actualTotalTransferUsdtAmount = convertRawUsdtToDisplayAmount(rawBuyerEscrowUsdtBalance, usdtDecimals);
  } catch (error) {
    console.error('completePrivateBuyOrderBySeller: release transfer failed', error);
    return { success: false, error: 'TRANSFER_FAILED' };
  }

  const now = new Date().toISOString();
  const paymentConfirmedAudit = {
    role: 'seller',
    walletAddress: sellerWalletForAudit,
    nickname: sellerNicknameForAudit,
    ipAddress: normalizedRequesterIpAddress,
    userAgent: normalizedRequesterUserAgent,
    confirmedAt: now,
  };
  const transferResultRecord = {
    transactionHash: releaseTransactionHash,
    buyerTransferUsdtAmount,
    platformFeeUsdtAmount,
    agentFeeRatePercent: resolvedAgentFeeRatePercent,
    agentFeeUsdtAmount: resolvedAgentFeeUsdtAmount,
    totalTransferUsdtAmount: actualTotalTransferUsdtAmount,
    plannedTotalTransferUsdtAmount,
    dustSweepUsdtAmount,
    dustSweepRawAmount,
    dustSweepWalletAddress,
    transferCount,
    transferMode,
    completedAt: now,
    source: resolvedPlatformFee.source,
  };
  const completeResult = await buyordersCollection.updateOne(
    {
      _id: objectId,
      privateSale: true,
      status: 'paymentRequested',
      $or: [
        { 'seller.walletAddress': sellerWalletRegexQuery || { $in: sellerWalletCandidates } },
        { sellerWalletAddress: sellerWalletRegexQuery || { $in: sellerWalletCandidates } },
      ],
    },
    {
      $set: {
        status: 'paymentConfirmed',
        paymentConfirmedAt: now,
        transactionHash: releaseTransactionHash,
        'buyer.releaseTransactionHash': releaseTransactionHash,
        'seller.releaseTransactionHash': releaseTransactionHash,
        paymentConfirmedByRole: 'seller',
        paymentConfirmedByWalletAddress: sellerWalletForAudit,
        paymentConfirmedByNickname: sellerNicknameForAudit,
        paymentConfirmedByIpAddress: normalizedRequesterIpAddress,
        paymentConfirmedByUserAgent: normalizedRequesterUserAgent,
        paymentConfirmedBy: paymentConfirmedAudit,
        'settlement.transferResult': transferResultRecord,
      },
    },
  );

  if (completeResult.modifiedCount !== 1) {
    return { success: false, error: 'FAILED_TO_UPDATE_ORDER' };
  }

  await usersCollection.updateOne(
    {
      walletAddress: sellerWalletRegexQuery || { $in: sellerWalletCandidates },
      storecode: 'admin',
      'seller.buyOrder._id': objectId,
    },
    {
      $set: {
        'seller.buyOrder.status': 'paymentConfirmed',
        'seller.buyOrder.paymentConfirmedAt': now,
        'seller.buyOrder.transactionHash': releaseTransactionHash,
        'seller.buyOrder.buyer.releaseTransactionHash': releaseTransactionHash,
        'seller.buyOrder.seller.releaseTransactionHash': releaseTransactionHash,
        'seller.buyOrder.paymentConfirmedBy': paymentConfirmedAudit,
        'seller.buyOrder.settlement.transferResult': transferResultRecord,
      },
    },
  );

  const buyerWalletCandidates = toWalletCandidates(orderBuyerWalletAddress);
  const buyerWalletRegexQuery = toWalletAddressRegexQuery(orderBuyerWalletAddress);
  if (buyerWalletCandidates.length > 0) {
    await usersCollection.updateOne(
      {
        walletAddress: buyerWalletRegexQuery || { $in: buyerWalletCandidates },
        storecode: 'admin',
      },
      {
        $set: {
          'buyer.buyOrderStatus': 'paymentConfirmed',
          buyOrderStatus: 'paymentConfirmed',
        },
      },
    );
  }

  return {
    success: true,
    transactionHash: releaseTransactionHash,
    paymentConfirmedAt: now,
    platformFeeRatePercent: resolvedPlatformFee.feeRatePercent,
    platformFeeUsdtAmount,
    platformFeeWalletAddress: resolvedPlatformFee.feeWalletAddress,
    agentFeeRatePercent: resolvedAgentFeeRatePercent,
    agentFeeUsdtAmount: resolvedAgentFeeUsdtAmount,
    buyerTransferUsdtAmount,
    totalTransferUsdtAmount: actualTotalTransferUsdtAmount,
    transferCount,
  };
}

// get current private trade status between buyer and seller
export async function getPrivateTradeStatusByBuyerAndSeller(
  {
    buyerWalletAddress,
    sellerWalletAddress,
  }: {
    buyerWalletAddress: string;
    sellerWalletAddress: string;
  }
): Promise<{
  isTrading: boolean;
  status: string | null;
  order: {
    orderId: string;
    tradeId: string;
    status: string;
    createdAt: string;
    acceptedAt: string;
    paymentRequestedAt: string;
    paymentConfirmedAt: string;
    cancelledAt: string;
    krwAmount: number;
    usdtAmount: number;
    paymentMethod: string;
    paymentBankName: string;
    paymentAccountNumber: string;
    paymentAccountHolder: string;
    paymentContactMemo: string;
    isContactTransfer: boolean;
    consentChannelUrl: string;
    consentStatus: string;
    consentAccepted: boolean;
    consentAcceptedAt: string;
    consentRequestedAt: string;
    buyerWalletAddress: string;
    sellerWalletAddress: string;
  } | null;
}> {
  const emptyResult = {
    isTrading: false,
    status: null,
    order: null,
  };

  if (!buyerWalletAddress || !sellerWalletAddress) {
    return emptyResult;
  }

  const toWalletCandidates = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return Array.from(new Set([trimmed, trimmed.toLowerCase(), trimmed.toUpperCase()]));
  };

  try {
    const client = await clientPromise;
    const usersCollection = client.db(dbName).collection('users');
    const buyordersCollection = client.db(dbName).collection('buyorders');

    const buyerWalletCandidates = toWalletCandidates(buyerWalletAddress);
    const inputSellerWalletCandidates = toWalletCandidates(sellerWalletAddress);

    const sellerUser = await usersCollection.findOne<any>(
      {
        storecode: 'admin',
        walletAddress: { $in: inputSellerWalletCandidates },
      },
      {
        projection: {
          'seller.escrowWalletAddress': 1,
          'seller.bankInfo': 1,
          'seller.paymentMethods': 1,
        },
        maxTimeMS: 2500,
      },
    );

    const sellerWalletCandidates = new Set<string>(inputSellerWalletCandidates);
    if (typeof sellerUser?.seller?.escrowWalletAddress === 'string' && sellerUser.seller.escrowWalletAddress.trim()) {
      for (const candidate of toWalletCandidates(sellerUser.seller.escrowWalletAddress)) {
        sellerWalletCandidates.add(candidate);
      }
    }

    const sellerWalletInOrder = Array.from(sellerWalletCandidates);
    const tradableStatuses = ['ordered', 'accepted', 'paymentRequested'];
    const projection = {
      _id: 1,
      tradeId: 1,
      status: 1,
      createdAt: 1,
      acceptedAt: 1,
      paymentRequestedAt: 1,
      paymentConfirmedAt: 1,
      cancelledAt: 1,
      krwAmount: 1,
      usdtAmount: 1,
      paymentMethod: 1,
      walletAddress: 1,
      buyer: 1,
      seller: 1,
      buyerConsent: 1,
    };

    const baseMatch = {
      privateSale: true,
      $and: [
        {
          $or: [
            { walletAddress: { $in: buyerWalletCandidates } },
            { 'buyer.walletAddress': { $in: buyerWalletCandidates } },
          ],
        },
        {
          $or: [
            { 'seller.walletAddress': { $in: sellerWalletInOrder } },
            { sellerWalletAddress: { $in: sellerWalletInOrder } },
          ],
        },
      ],
    };

    const order = await buyordersCollection.findOne<any>(
      {
        ...baseMatch,
        status: { $in: tradableStatuses },
      },
      {
        sort: { createdAt: -1 },
        projection,
        maxTimeMS: 3500,
      },
    );

    if (!order) {
      return emptyResult;
    }

    const status = typeof order?.status === 'string' ? order.status : '';
    const orderSellerBankInfo =
      order?.seller?.bankInfo && typeof order.seller.bankInfo === 'object'
        ? order.seller.bankInfo
        : {};
    const sellerUserBankInfo =
      sellerUser?.seller?.bankInfo && typeof sellerUser.seller.bankInfo === 'object'
        ? sellerUser.seller.bankInfo
        : {};

    const paymentBankName =
      (typeof orderSellerBankInfo?.bankName === 'string' && orderSellerBankInfo.bankName.trim())
      || (typeof sellerUserBankInfo?.bankName === 'string' && sellerUserBankInfo.bankName.trim())
      || '';
    const paymentAccountNumber =
      (typeof orderSellerBankInfo?.accountNumber === 'string' && orderSellerBankInfo.accountNumber.trim())
      || (typeof sellerUserBankInfo?.accountNumber === 'string' && sellerUserBankInfo.accountNumber.trim())
      || '';
    const paymentAccountHolder =
      (typeof orderSellerBankInfo?.accountHolder === 'string' && orderSellerBankInfo.accountHolder.trim())
      || (typeof sellerUserBankInfo?.accountHolder === 'string' && sellerUserBankInfo.accountHolder.trim())
      || '';
    const paymentContactMemo =
      (typeof orderSellerBankInfo?.contactMemo === 'string' && orderSellerBankInfo.contactMemo.trim())
      || (typeof sellerUserBankInfo?.contactMemo === 'string' && sellerUserBankInfo.contactMemo.trim())
      || '';

    const orderPaymentMethods = Array.isArray(order?.seller?.paymentMethods)
      ? order.seller.paymentMethods
          .map((item: any) => String(item || '').trim())
          .filter(Boolean)
      : [];
    const sellerUserPaymentMethods = Array.isArray(sellerUser?.seller?.paymentMethods)
      ? sellerUser.seller.paymentMethods
          .map((item: any) => String(item || '').trim())
          .filter(Boolean)
      : [];
    const paymentMethod =
      (typeof order?.paymentMethod === 'string' && order.paymentMethod.trim())
      || orderPaymentMethods[0]
      || sellerUserPaymentMethods[0]
      || '';
    const isContactTransfer =
      paymentBankName === '연락처송금'
      || String(paymentMethod).trim().toLowerCase() === 'contact';

    const normalizedOrder = {
      orderId: order?._id?.toString?.() || '',
      tradeId: typeof order?.tradeId === 'string' ? order.tradeId : '',
      status,
      createdAt: typeof order?.createdAt === 'string' ? order.createdAt : '',
      acceptedAt: typeof order?.acceptedAt === 'string' ? order.acceptedAt : '',
      paymentRequestedAt: typeof order?.paymentRequestedAt === 'string' ? order.paymentRequestedAt : '',
      paymentConfirmedAt: typeof order?.paymentConfirmedAt === 'string' ? order.paymentConfirmedAt : '',
      cancelledAt: typeof order?.cancelledAt === 'string' ? order.cancelledAt : '',
      krwAmount: typeof order?.krwAmount === 'number' ? order.krwAmount : 0,
      usdtAmount: typeof order?.usdtAmount === 'number' ? order.usdtAmount : 0,
      paymentMethod,
      paymentBankName,
      paymentAccountNumber,
      paymentAccountHolder,
      paymentContactMemo,
      isContactTransfer,
      consentChannelUrl:
        (typeof order?.buyerConsent?.channelUrl === 'string' && order.buyerConsent.channelUrl)
        || '',
      consentStatus:
        (typeof order?.buyerConsent?.status === 'string' && order.buyerConsent.status)
        || '',
      consentAccepted:
        order?.buyerConsent?.accepted === true
        || String(order?.buyerConsent?.status || '').trim().toLowerCase() === 'accepted',
      consentAcceptedAt:
        (typeof order?.buyerConsent?.acceptedAt === 'string' && order.buyerConsent.acceptedAt)
        || '',
      consentRequestedAt:
        (typeof order?.buyerConsent?.requestedAt === 'string' && order.buyerConsent.requestedAt)
        || (
          typeof order?.buyerConsent?.requestMessageSentAt === 'string'
            ? order.buyerConsent.requestMessageSentAt
            : ''
        ),
      buyerWalletAddress:
        (typeof order?.buyer?.walletAddress === 'string' && order.buyer.walletAddress)
        || (typeof order?.walletAddress === 'string' ? order.walletAddress : ''),
      sellerWalletAddress:
        (typeof order?.seller?.walletAddress === 'string' && order.seller.walletAddress)
        || '',
    };

    return {
      isTrading: true,
      status: status || null,
      order: normalizedOrder,
    };
  } catch (error) {
    console.error('getPrivateTradeStatusByBuyerAndSeller error', error);
    return emptyResult;
  }
}

export async function getActivePrivateTradeByBuyerWallet(
  {
    buyerWalletAddress,
  }: {
    buyerWalletAddress: string;
  }
): Promise<{
  isTrading: boolean;
  status: string | null;
  order: {
    orderId: string;
    tradeId: string;
    status: string;
    createdAt: string;
    acceptedAt: string;
    paymentRequestedAt: string;
    paymentConfirmedAt: string;
    cancelledAt: string;
    krwAmount: number;
    usdtAmount: number;
    buyerWalletAddress: string;
    sellerWalletAddress: string;
    sellerNickname: string;
    storeName: string;
    storecode: string;
  } | null;
}> {
  const emptyResult = {
    isTrading: false,
    status: null,
    order: null,
  };

  const normalizedBuyerWalletAddress = String(buyerWalletAddress || '').trim();
  if (!normalizedBuyerWalletAddress) {
    return emptyResult;
  }

  const toWalletCandidates = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return Array.from(new Set([trimmed, trimmed.toLowerCase(), trimmed.toUpperCase()]));
  };

  try {
    const client = await clientPromise;
    const buyordersCollection = client.db(dbName).collection('buyorders');
    const buyerWalletCandidates = toWalletCandidates(normalizedBuyerWalletAddress);
    const tradableStatuses = ['ordered', 'accepted', 'paymentRequested'];
    const normalizedBuyerWalletLower = normalizedBuyerWalletAddress.toLowerCase();
    const isSameWallet = (value: unknown) =>
      typeof value === 'string' && value.trim().toLowerCase() === normalizedBuyerWalletLower;

    const primaryOrder = await buyordersCollection.findOne<any>(
      {
        privateSale: true,
        status: { $in: tradableStatuses },
        'buyer.walletAddress': { $in: buyerWalletCandidates },
      },
      {
        sort: { createdAt: -1 },
        projection: {
          _id: 1,
          tradeId: 1,
          status: 1,
          createdAt: 1,
          acceptedAt: 1,
          paymentRequestedAt: 1,
          paymentConfirmedAt: 1,
          cancelledAt: 1,
          krwAmount: 1,
          usdtAmount: 1,
          walletAddress: 1,
          buyer: 1,
          seller: 1,
          store: 1,
          storecode: 1,
        },
        maxTimeMS: 3500,
      },
    );

    let order = primaryOrder;
    if (!order) {
      order = await buyordersCollection.findOne<any>(
        {
          privateSale: true,
          status: { $in: tradableStatuses },
          walletAddress: { $in: buyerWalletCandidates },
          $or: [
            { 'buyer.walletAddress': { $exists: false } },
            { 'buyer.walletAddress': null },
            { 'buyer.walletAddress': '' },
          ],
        },
        {
          sort: { createdAt: -1 },
          projection: {
            _id: 1,
            tradeId: 1,
            status: 1,
            createdAt: 1,
            acceptedAt: 1,
            paymentRequestedAt: 1,
            paymentConfirmedAt: 1,
            cancelledAt: 1,
            krwAmount: 1,
            usdtAmount: 1,
            walletAddress: 1,
            buyer: 1,
            seller: 1,
            store: 1,
            storecode: 1,
          },
          maxTimeMS: 3500,
        },
      );
    }

    if (!order) {
      return emptyResult;
    }

    const orderBuyerWalletAddress =
      (typeof order?.buyer?.walletAddress === 'string' && order.buyer.walletAddress.trim())
      || '';
    const orderRootWalletAddress = typeof order?.walletAddress === 'string' ? order.walletAddress.trim() : '';
    if (orderBuyerWalletAddress && !isSameWallet(orderBuyerWalletAddress)) {
      return emptyResult;
    }
    if (!orderBuyerWalletAddress && orderRootWalletAddress && !isSameWallet(orderRootWalletAddress)) {
      return emptyResult;
    }

    const status = typeof order?.status === 'string' ? order.status : '';
    const sellerWalletAddress =
      (typeof order?.seller?.walletAddress === 'string' && order.seller.walletAddress)
      || (typeof order?.sellerWalletAddress === 'string' ? order.sellerWalletAddress : '');
    const sellerNickname =
      (typeof order?.seller?.nickname === 'string' && order.seller.nickname)
      || '';
    const storeName =
      (typeof order?.store?.storeName === 'string' && order.store.storeName)
      || '';
    const storecode = typeof order?.storecode === 'string' ? order.storecode : '';

    return {
      isTrading: true,
      status: status || null,
      order: {
        orderId: order?._id?.toString?.() || '',
        tradeId: typeof order?.tradeId === 'string' ? order.tradeId : '',
        status,
        createdAt: typeof order?.createdAt === 'string' ? order.createdAt : '',
        acceptedAt: typeof order?.acceptedAt === 'string' ? order.acceptedAt : '',
        paymentRequestedAt: typeof order?.paymentRequestedAt === 'string' ? order.paymentRequestedAt : '',
        paymentConfirmedAt: typeof order?.paymentConfirmedAt === 'string' ? order.paymentConfirmedAt : '',
        cancelledAt: typeof order?.cancelledAt === 'string' ? order.cancelledAt : '',
        krwAmount: typeof order?.krwAmount === 'number' ? order.krwAmount : 0,
        usdtAmount: typeof order?.usdtAmount === 'number' ? order.usdtAmount : 0,
        buyerWalletAddress:
          (typeof order?.buyer?.walletAddress === 'string' && order.buyer.walletAddress)
          || (typeof order?.walletAddress === 'string' ? order.walletAddress : ''),
        sellerWalletAddress,
        sellerNickname,
        storeName,
        storecode,
      },
    };
  } catch (error) {
    console.error('getActivePrivateTradeByBuyerWallet error', error);
    return emptyResult;
  }
}

// get sell orders order by createdAt desc
export async function getBuyOrdersForSeller(

  {
    storecode,
    limit,
    page,
    walletAddress,
    searchMyOrders,
    searchOrderStatusCancelled,
    searchOrderStatusCompleted,
    fromDate,
    toDate,
  }: {
    storecode: string;
    limit: number;
    page: number;
    walletAddress: string;
    searchMyOrders: boolean;
    searchOrderStatusCancelled: boolean;
    searchOrderStatusCompleted: boolean;
    fromDate: string;
    toDate: string;
  }

): Promise<ResultProps> {

  const client = await clientPromise;

  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }


  // status is not 'paymentConfirmed'

  //console.log('getBuyOrdersForSeller storecode: ' + storecode);
  //console.log('getBuyOrdersForSeller limit: ' + limit);
  //console.log('getBuyOrdersForSeller page: ' + page);





  // if searchMyOrders is true, get orders by buyer wallet address is walletAddress
  // else get all orders except paymentConfirmed

  // if storecode is empty, get all orders by wallet address

  // if storecode is not empty, get orders by storecode and wallet address


  if (searchMyOrders) {

    const results = await collection.find<UserProps>(

      /*
      {
        'storecode': storecode,
        'walletAddress': walletAddress,

        
        //status: { $ne: 'paymentConfirmed' },

      },
      */
      // createdAt is fromDate to toDate

      {

        storecode:  storecode,
        walletAddress: walletAddress,
        privateSale: { $ne: true },

        createdAt: {
          $gte: new Date(fromDate),
          $lte: new Date(toDate)
        },

        status: (searchOrderStatusCancelled && searchOrderStatusCompleted ? { $in: ['cancelled', 'paymentConfirmed'] }
          : (searchOrderStatusCancelled ? 'cancelled'
          : (searchOrderStatusCompleted ? 'paymentConfirmed'
          : { $ne: 'nothing' }))),

      }
      // createdAt is fromDate to toDate

      //{ projection: { _id: 0, emailVerified: 0 } }

    ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();


    const totalCount = await collection.countDocuments(
      {
        storecode: storecode,
        walletAddress: walletAddress,

        privateSale: { $ne: true },

        createdAt: {
          $gte: new Date(fromDate),
          $lte: new Date(toDate)
        },

        status: (searchOrderStatusCancelled && searchOrderStatusCompleted ? { $in: ['cancelled', 'paymentConfirmed'] }
          : (searchOrderStatusCancelled ? 'cancelled'
          : (searchOrderStatusCompleted ? 'paymentConfirmed'
          : { $ne: 'nothing' }))),

      }
    );


    return {
      totalCount: totalCount,
      orders: results,
    };

  } else {



    const results = await collection.find<UserProps>(
      {
        //status: 'ordered',
  
        //status: { $ne: 'paymentConfirmed' },
  
        storecode: storecode,
        // exclude private sale
        privateSale: { $ne: true },

        createdAt: {
          $gte: new Date(fromDate),
          $lte: new Date(toDate)
        },

        status: (searchOrderStatusCancelled && searchOrderStatusCompleted ? { $in: ['cancelled', 'paymentConfirmed'] }
          : (searchOrderStatusCancelled ? 'cancelled'
          : (searchOrderStatusCompleted ? 'paymentConfirmed'
          : { $ne: 'nothing' }))),

      },
      
      //{ projection: { _id: 0, emailVerified: 0 } }
  
    ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();
  

    const totalCount = await collection.countDocuments(
      {
        storecode: storecode,
        privateSale: { $ne: true },

        createdAt: {
          $gte: new Date(fromDate),
          $lte: new Date(toDate)
        },

        status: (searchOrderStatusCancelled && searchOrderStatusCompleted ? { $in: ['cancelled', 'paymentConfirmed'] }
          : (searchOrderStatusCancelled ? 'cancelled'
          : (searchOrderStatusCompleted ? 'paymentConfirmed'
          : { $ne: 'nothing' }))),

      }
    );

    return {
      totalCount: totalCount,
      orders: results,
    };

  }


}



/*
  {
    lang: 'ko',
    storecode: 'suroggyc',
    orderId: new ObjectId('6827479e460e1b9e73417ebc'),
    sellerWalletAddress: '0x98773aF65AE660Be4751ddd09C4350906e9D88F3',
    sellerStorecode: 'admin'
  }
*/



// accept buy order
// update order status to accepted

export async function acceptBuyOrder(data: any) {
  
  //console.log('acceptBuyOrder data: ' + JSON.stringify(data));


  

  /*
  acceptBuyOrder data: {"lang":"kr","chain":"polygon",
  "orderId":"66cbe428254954dcc8929528",
  "sellerWalletAddress":"0x919eB871C4F99b860Da992f51260790BF6dc25a7",
  "sellerNickname":"",
  "sellerAvatar":""}
  */




  if (!data.orderId || !data.storecode || !data.sellerWalletAddress
    || !data.sellerStorecode

  ) {
    return null;
  }

  const sellerMemo = data.sellerMemo || '';


  //const bankInfo = data?.seller?.bankInfo || {};


  ///console.log('acceptBuyOrder bankInfo: ' + JSON.stringify(bankInfo));



  /*
    if (!data.walletAddress || !data.sellerStatus || !data.bankName || !data.accountNumber || !data.accountHolder) {
    return null;
  }

  const seller = {
    status: data.sellerStatus,
    bankInfo: {
      bankName: data.bankName,
      accountNumber: data.accountNumber,
      accountHolder: data.accountHolder,
    }
  };
  */


  const client = await clientPromise;



  // check validation of storecode

  const storeCollection = client.db(dbName).collection('stores');
  const stores = await storeCollection.findOne<any>(
    {
      storecode: data.storecode,
    },
  );
  if (!stores) {

    console.log('acceptBuyOrder storecode is not valid: ' + data.storecode);
    return null;
  }



  // get user by wallet address
  let user: UserProps | null = null;







  // if privateSale is false, then get user by storecode and walletAddress
  const order = await client.db(dbName)
    .collection('buyorders')
    .findOne<any>(
      { _id: new ObjectId(data.orderId + '')},
      { projection: { privateSale: 1 } }
    );


  if (order && order?.privateSale === false) {
    
    
    const userCollection = client.db(dbName).collection('users');

    user = await userCollection.findOne<UserProps>(
      {
        // data.sellerWalletAddress is walletAddress or vaultWallet.address or seller.escrowWalletAddress

      
        $or: [
          { walletAddress: data.sellerWalletAddress },
          //{ 'vaultWallet.address': data.sellerWalletAddress },
          { 'seller.escrowWalletAddress': data.sellerWalletAddress },
        ],
        

        //walletAddress: data.sellerWalletAddress,


        storecode: data.sellerStorecode,
      },
    );

    if (!user) {

      console.log('acceptBuyOrder user is null');

      return null;
    }

  }








  const sellerNickname = user?.nickname || '';
  const sellerAvatar = user?.avatar || '';

  const bankInfo = user?.seller?.bankInfo || {
    bankName: '',
    accountNumber: '',
    accountHolder: '',
  };

  const sellerMobile = user?.mobile || '';

  const autoProcessDeposit = user?.seller?.autoProcessDeposit || false;







  const collection = client.db(dbName).collection('buyorders');



  // random number for tradeId
  // 100000 ~ 999999 string

  ////const tradeId = Math.floor(Math.random() * 900000) + 100000 + '';



  /*
    const result = await collection.findOne<UserProps>(
    { _id: new ObjectId(orderId) }
  );
  */


  ///console.log('acceptSellOrder data.orderId: ' + data.orderId);

 
  // *********************************************
  // update status to accepted if status is ordered

  // if status is not ordered, return null
  // check condition and update status to accepted
  // *********************************************

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(data.orderId + ''), status: 'ordered' },
    { $set: {
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      ///tradeId: tradeId,
      
      seller: {
        autoSend: data.sellerAutoSend || false,
        storecode: data.sellerStorecode,
        walletAddress: data.sellerWalletAddress,

        /*
        nickname: data.sellerNickname,
        avatar: data.sellerAvatar,
        mobile: data.sellerMobile,
        */

        nickname: sellerNickname,
        avatar: sellerAvatar,
        mobile: sellerMobile,

        memo: sellerMemo,
        bankInfo: bankInfo,

        autoProcessDeposit: autoProcessDeposit,
      },

    } }
  );


  if (result) {



    const updated = await collection.findOne<UserProps>(
      { _id: new ObjectId(data.orderId + '') }
    );

    ///console.log('acceptSellOrder updated: ' + JSON.stringify(updated));



    return updated;

  } else {
    
    return null;
  }
  
}







export async function buyOrderRequestPayment(data: any) {
  
  ///console.log('acceptSellOrder data: ' + JSON.stringify(data));

  if (!data.orderId) {

    console.log('buyOrderRequestPayment orderId is null: ' + JSON.stringify(data));
    return null;
  }

  if (!data.transactionHash) {

    console.log('buyOrderRequestPayment transactionHash is null: ' + JSON.stringify(data));
    return null;
  }


  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');


  let result = null;


  if (data?.bankInfo) {

    result = await collection.updateOne(
    
      { _id: new ObjectId(data.orderId + '') },

      { $set: {
        status: 'paymentRequested',
        escrowTransactionHash: data.transactionHash,
        paymentRequestedAt: new Date().toISOString(),
        "seller.bankInfo": data.bankInfo,
        "seller.memo": data.sellerMemo,
      } }

    );




  } else {


    // get storecode from order
    const order = await collection.findOne<any>(
      { _id: new ObjectId(data.orderId + '') },
      { projection: { store: 1 } }
    );

    // get bankInfo from order.store
    if (order && order.store) {
      data.bankInfo = order.store.bankInfo || {};
    }

  
    result = await collection.updateOne(
    
      { _id: new ObjectId(data.orderId + '') },


      { $set: {
        status: 'paymentRequested',
        escrowTransactionHash: data.transactionHash,
        paymentRequestedAt: new Date().toISOString(),
        "seller.bankInfo": data.bankInfo,
        "seller.memo": data.sellerMemo,
      } }
      
    );

  }
  

  console.log('buyOrderRequestPayment result: ' + JSON.stringify(result));




  if (result) {


    const buyOrder = await collection.findOne<UserProps>(
      { _id: new ObjectId(data.orderId + '') },
      { projection: {
        tradeId: 1,
        createdAt: 1,
        paymentRequestedAt: 1,
        storecode: 1,
        walletAddress: 1,
        nickname: 1,
        avatar: 1,
        mobile: 1,
        usdtAmount: 1,
        krwAmount: 1,
        rate: 1,
        buyer: 1,
        seller: 1,
        status: 1,
      } }
    );
    if (buyOrder) {

      // update user collection buyOrderStatus to "paymentRequested"
      const userCollection = client.db(dbName).collection('users');

      await userCollection.updateOne(
        {
          walletAddress: buyOrder.walletAddress,
          storecode: buyOrder.storecode,
        },
        { $set: { buyOrderStatus: 'paymentRequested' } }
      ).finally(() => {
        console.log('buyOrderRequestPayment user buyOrderStatus updated to paymentRequested');
      });



      // update seller buyOrderStatus to "paymentRequested"
      const sellerEscrowWalletAddress = resolveSellerEscrowWalletAddress(buyOrder);
      if (sellerEscrowWalletAddress) {
        await userCollection.updateOne(
          {
            'seller.escrowWalletAddress': sellerEscrowWalletAddress,
          },
          { $set: {
            //'seller.buyOrderStatus': 'paymentRequested',
            'seller.buyOrder' : buyOrder,
          } }
        ).finally(() => {
          console.log('buyOrderRequestPayment seller buyOrderStatus updated to paymentRequested');
        });
      }


    }




    const updated = await collection.findOne<UserProps>(
      { _id: new ObjectId(data.orderId + '') }
    );

    return updated;
  } else {
    return null;
  }
  
}





export async function buyOrderConfirmPayment(data: any) {
  

  if (!data.orderId) {
    return null;
  }

  if (!data.transactionHash) {
    return null;
  }

  console.log('buyOrderConfirmPayment data: ' + JSON.stringify(data));

  const paymentAmount = data.paymentAmount || 0;




  const autoConfirmPayment = data.autoConfirmPayment;


  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  let result = null;


  try {

    if (autoConfirmPayment) {

      result = await collection.updateOne(
        
        { _id: new ObjectId(data.orderId+'') },


        { $set: {
          status: 'paymentConfirmed',
          paymentAmount: paymentAmount,
          queueId: data.queueId,
          transactionHash: data.transactionHash,
          paymentConfirmedAt: new Date().toISOString(),

          autoConfirmPayment: autoConfirmPayment,

          escrowTransactionHash: data.escrowTransactionHash,
          escrowTransactionConfirmedAt: new Date().toISOString(),

        } }
      );

    } else {

      result = await collection.updateOne(
        
        { _id: new ObjectId(data.orderId+'') },

        { $set: {
          status: 'paymentConfirmed',
          paymentAmount: paymentAmount,
          queueId: data.queueId,
          transactionHash: data.transactionHash,
          paymentConfirmedAt: new Date().toISOString(),

          escrowTransactionHash: data.escrowTransactionHash,
          escrowTransactionConfirmedAt: new Date().toISOString(),

        } }
      );

    }

  } catch (error) {
    console.error('Error confirming payment:', error);
    return null;
  }

  ////console.log('buyOrderConfirmPayment result: ' + JSON.stringify(result));


  if (result) {


    // update user.seller.buyOrder.transactionHash
    const userCollection = client.db(dbName).collection('users');


    
    await userCollection.updateOne(
      { 'seller.buyOrder._id': new ObjectId(data.orderId+'') },
      { $set: {
          'seller.buyOrder.status': 'paymentConfirmed',
          'seller.buyOrder.paymentConfirmedAt': new Date().toISOString(),
          'seller.buyOrder.transactionHash': data.transactionHash,
        }
      }
    );

    // user seller update
    // get seller wallet address from buyorder
    const orderForSeller = await collection.findOne<UserProps>(
      { _id: new ObjectId(data.orderId+'') },
      { projection: {
        seller: 1,
      } }
    );

    const sellerEscrowWalletAddress = resolveSellerEscrowWalletAddress(orderForSeller);
    if (sellerEscrowWalletAddress) {
      await userCollection.updateOne(
        { 'seller.escrowWalletAddress': sellerEscrowWalletAddress },
        { $set: {
            'seller.buyOrder.status': 'paymentConfirmed',
            'seller.buyOrder.paymentConfirmedAt': new Date().toISOString(),
            'seller.buyOrder.transactionHash': data.transactionHash,
          }
        }
      );
    }
    
    


    



    // update store collection

    // get count of paymentConfirmed orders by storecode
    // get sum of krwAmount and usdtAmount by storecode
    // get storecode from order
    const order = await collection.findOne<UserProps>(
      { _id: new ObjectId(data.orderId+'') },
      { projection: {
        storecode: 1,
        agentcode: 1,
        walletAddress: 1,
        seller: 1,
      } }
    );

    if (order && order.storecode) {


      const storecode = order.storecode;
      const walletAddress = order.walletAddress;

      // update user collection buyOrderStatus to "paymentConfirmed"
      const userCollection = client.db(dbName).collection('users');

      if (userCollection) {

        //const toalPaymentConfirmedCount = await collection.countDocuments(
        //  { walletAddress: order.walletAddress, storecode: order.storecode, status: 'paymentConfirmed' }
        //);
        const totalPaymentConfirmed = await collection.aggregate([
          { $match: {
            walletAddress: walletAddress,
            storecode: storecode,
            status: 'paymentConfirmed'
          } },
          { $group: {
            _id: null,
            totalPaymentConfirmedCount: { $sum: 1 },
            totalKrwAmount: { $sum: '$krwAmount' },
            totalUsdtAmount: { $sum: '$usdtAmount' }
          }}
        ]).toArray();

        //console.log('confirmPayment totalPaymentConfirmed: ' + JSON.stringify(totalPaymentConfirmed));


        await userCollection.updateOne(
          { walletAddress: walletAddress,
            storecode: storecode,
          },
          { $set: {
              buyOrderStatus: 'paymentConfirmed',
              totalPaymentConfirmedCount: totalPaymentConfirmed[0]?.totalPaymentConfirmedCount || 0,
              totalPaymentConfirmedKrwAmount: totalPaymentConfirmed[0]?.totalKrwAmount || 0,
              totalPaymentConfirmedUsdtAmount: totalPaymentConfirmed[0]?.totalUsdtAmount || 0,
            }
          }
        );





        // update user.seller

        // totalPaymentConfirmedForSeller
        const totalPaymentConfirmedForSeller = await collection.aggregate([
          { $match: {
            'seller.walletAddress': order.seller?.walletAddress,
            status: 'paymentConfirmed'
          } },
          { $group: {
            _id: null,
            totalPaymentConfirmedCount: { $sum: 1 },
            totalKrwAmount: { $sum: '$krwAmount' },
            totalUsdtAmount: { $sum: '$usdtAmount' }
          }}
        ]).toArray();


        const sellerEscrowWalletAddress = resolveSellerEscrowWalletAddress(order);
        if (sellerEscrowWalletAddress) {
          await userCollection.updateOne(
            { 'seller.escrowWalletAddress': sellerEscrowWalletAddress },
            { $set: {
                //'seller.buyOrderStatus': 'paymentConfirmed',
                'seller.buyOrder.status': 'paymentConfirmed',
                'seller.buyOrder.paymentConfirmedAt': new Date().toISOString(),
                'seller.totalPaymentConfirmedCount': totalPaymentConfirmedForSeller[0]?.totalPaymentConfirmedCount || 0,
                'seller.totalPaymentConfirmedKrwAmount': totalPaymentConfirmedForSeller[0]?.totalKrwAmount || 0,
                'seller.totalPaymentConfirmedUsdtAmount': totalPaymentConfirmedForSeller[0]?.totalUsdtAmount || 0,
              }
            }
          );
        }





      }


      const totalPaymentConfirmed = await collection.aggregate([
        { $match: {
          storecode: storecode,
          status: 'paymentConfirmed',
          privateSale: false, // exclude private sale
        }},
        { $group: {
          _id: null,
          totalPaymentConfirmedCount: { $sum: 1 },
          totalKrwAmount: { $sum: '$krwAmount' },
          totalUsdtAmount: { $sum: '$usdtAmount' }
        } }
      ]).toArray();


      //console.log('confirmPayment totalPaymentConfirmed: ' + JSON.stringify(totalPaymentConfirmed));
      const totalPaymentConfirmedClearance = await collection.aggregate([
        { $match: {
          storecode: storecode,
          status: 'paymentConfirmed',
          privateSale: true, // include private sale
        }},
        { $group: {
          _id: null,
          totalPaymentConfirmedClearanceCount: { $sum: 1 },
          totalKrwAmountClearance: { $sum: '$krwAmount' },
          totalUsdtAmountClearance: { $sum: '$usdtAmount' }
        } }
      ]).toArray();


      //console.log('confirmPayment totalPaymentConfirmedClearance: ' + JSON.stringify(totalPaymentConfirmedClearance));
      // update store collection
      const storeCollection = client.db(dbName).collection('stores');
      const store = await storeCollection.updateOne(
        { storecode: storecode },
        { $set: {
          
          totalPaymentConfirmedCount: totalPaymentConfirmed[0]?.totalPaymentConfirmedCount || 0,
          totalKrwAmount: totalPaymentConfirmed[0]?.totalKrwAmount || 0,
          totalUsdtAmount: totalPaymentConfirmed[0]?.totalUsdtAmount || 0,

          totalPaymentConfirmedClearanceCount: totalPaymentConfirmedClearance[0]?.totalPaymentConfirmedClearanceCount || 0,
          totalKrwAmountClearance: totalPaymentConfirmedClearance[0]?.totalKrwAmountClearance || 0,
          totalUsdtAmountClearance: totalPaymentConfirmedClearance[0]?.totalUsdtAmountClearance || 0,
        } }
      );



    }



    if (order && order.agentcode) {
      

      const agentcode = order.agentcode;


      const totalPaymentConfirmed = await collection.aggregate([
        { $match: {
          agentcode: agentcode,
          status: 'paymentConfirmed',
          privateSale: false, // exclude private sale
        }},
        { $group: {
          _id: null,
          totalPaymentConfirmedCount: { $sum: 1 },
          totalKrwAmount: { $sum: '$krwAmount' },
          totalUsdtAmount: { $sum: '$usdtAmount' }
        } }
      ]).toArray();

      //console.log('confirmPayment totalPaymentConfirmed: ' + JSON.stringify(totalPaymentConfirmed));
      const totalPaymentConfirmedClearance = await collection.aggregate([
        { $match: {
          agentcode: agentcode,
          status: 'paymentConfirmed',
          privateSale: true, // include private sale
        }},
        { $group: {
          _id: null,
          totalPaymentConfirmedClearanceCount: { $sum: 1 },
          totalKrwAmountClearance: { $sum: '$krwAmount' },
          totalUsdtAmountClearance: { $sum: '$usdtAmount' }
        } }
      ]).toArray();
      
      //console.log('confirmPayment totalPaymentConfirmedClearance: ' + JSON.stringify(totalPaymentConfirmedClearance));
      // update agent collection
      const agentCollection = client.db(dbName).collection('agents');
      const agent = await agentCollection.updateOne(
        { agentcode: agentcode },
        { $set: {
          totalPaymentConfirmedCount: totalPaymentConfirmed[0]?.totalPaymentConfirmedCount || 0,
          totalKrwAmount: totalPaymentConfirmed[0]?.totalKrwAmount || 0,
          totalUsdtAmount: totalPaymentConfirmed[0]?.totalUsdtAmount || 0,
          totalPaymentConfirmedClearanceCount: totalPaymentConfirmedClearance[0]?.totalPaymentConfirmedClearanceCount || 0,
          totalKrwAmountClearance: totalPaymentConfirmedClearance[0]?.totalKrwAmountClearance || 0,
          totalUsdtAmountClearance: totalPaymentConfirmedClearance[0]?.totalUsdtAmountClearance || 0,
        } }
      );


    }



    return {
      status: 'paymentConfirmed',
      paymentAmount: paymentAmount,
      queueId: data.queueId,
      transactionHash: data.transactionHash,
      paymentConfirmedAt: new Date().toISOString(),
      autoConfirmPayment: autoConfirmPayment,
    };

    
  } else {
    return null;
  }
  
}















export async function buyOrderRollbackPayment(data: any) {
  

  if (!data.orderId) {
    return null;
  }

  if (!data.transactionHash) {
    return null;
  }

  const paymentAmount = data.paymentAmount || 0;


  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');


  const result = await collection.updateOne(
    
    { _id: new ObjectId(data.orderId+'') },


    { $set: {
      status: 'cancelled',
      paymentAmount: paymentAmount,
      queueId: data.queueId,
      transactionHash: data.transactionHash,
      cancelledAt: new Date().toISOString(),
      rollbackAmount: paymentAmount,
    } }
  );

  if (result) {


    // update user collection buyOrderStatus to "cancelled"
    const order = await collection.findOne<any>(
      { _id: new ObjectId(data.orderId+'') },
      { projection: { storecode: 1, walletAddress: 1 } }
    );

    if (order) {
      
      // update user collection buyOrderStatus to "cancelled"
      const userCollection = client.db(dbName).collection('users');
      await userCollection.updateOne(
        {
          walletAddress: order.walletAddress,
          storecode: order.storecode,
        },
        { $set: { buyOrderStatus: 'cancelled' } }
      );

    }


    


    const updated = await collection.findOne<any>(
      { _id: new ObjectId(data.orderId+'') }
    );

    return updated;
  } else {
    return null;
  }
  
}





// getOrderById
export async function buyOrderGetOrderById(orderId: string): Promise<UserProps | null> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  const result = await collection.findOne<UserProps>(
    { _id: new ObjectId(orderId) }
  );

  if (result) {
    return result;
  } else {
    return null;
  }

}






// cancel buy order by orderId from seller
export async function cancelTradeBySeller(

  {
    storecode,
    orderId,
    walletAddress,
    cancelTradeReason,

    escrowTransactionHash,

  }: {
    storecode: string;
    orderId: string;
    walletAddress: string;
    cancelTradeReason: string;

    escrowTransactionHash?: string; // optional, if exists, then update escrowTransactionHash
  
  }

) {




  const client = await clientPromise;


  // check validation of storecode
  const storeCollection = client.db(dbName).collection('stores');
  const stores = await storeCollection.findOne<any>(
    {
      storecode: storecode,
    },
  );
  if (!stores) {

    console.log('cancelTradeBySeller storecode is not valid: ' + storecode);

    return null;
  }



  const collection = client.db(dbName).collection('buyorders');

  // check orderId is valid ObjectId
  if (!ObjectId.isValid(orderId)) {
    console.log('cancelTradeBySeller orderId is not valid: ' + orderId);
    return false;
  }

  // check walletAddress is valid

  if (!walletAddress) {
    console.log('cancelTradeBySeller walletAddress is not valid: ' + walletAddress);
    return false;
  }

  // check status is 'accepted' or 'paymentRequested'

  // update status to 'cancelled'

  const result = await collection.updateOne(
    { _id: new ObjectId(orderId),
      ////////'seller.walletAddress': walletAddress,

      //status: 'accepted'
      status: { $in: ['accepted', 'paymentRequested'] },

    },
    { $set: {
      
      status: 'cancelled',

      cancelledAt: new Date().toISOString(),
      cancelTradeReason: cancelTradeReason,

      escrowTransactionHash: escrowTransactionHash || '', // optional, if exists, then update escrowTransactionHash
      escrowTransactionCancelledAt: new Date().toISOString(),
    } }
  );

  if (result) {

    const order = await collection.findOne<any>(
      { _id: new ObjectId(orderId) },
      { projection: {
        storecode: 1,
        walletAddress: 1,
        seller: 1,
      } }
    );


    // update user status to 'cancelled'
    const userCollection = client.db(dbName).collection('users');

    await userCollection.updateOne(
      {
        walletAddress: order.walletAddress,
        storecode: order.storecode,
      },
      { $set: { buyOrderStatus: 'cancelled' } }
    );


    // update user.seller.buyOrder.status to 'cancelled'
    const sellerEscrowWalletAddress = resolveSellerEscrowWalletAddress(order);
    if (sellerEscrowWalletAddress) {
      await userCollection.updateOne(
        {
          'seller.escrowWalletAddress': sellerEscrowWalletAddress
        },
        { $set: {
            //'seller.buyOrderStatus': 'cancelled',
            'seller.buyOrder.status': 'cancelled',
            'seller.buyOrder.cancelledAt': new Date().toISOString(),
          } }
      );
    }




    //console.log('cancelTradeBySeller result: ' + JSON.stringify(result));

    const updated = await collection.findOne<UserProps>(
      { _id: new ObjectId(orderId) }
    );

    return updated;

  } else {
    console.log('cancelTradeBySeller result is null');

    return null;
  }




}




export async function getOneBuyOrderByOrderId(orderId: string): Promise<UserProps | null> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  if (!ObjectId.isValid(orderId)) {
    return null;
  }

  const result = await collection.findOne<UserProps>(
    { _id: new ObjectId(orderId) }
  );
  if (result) {
    return result;
  } else {
    return null;
  }
}




export async function getOneBuyOrder(

  {
    orderId,
    limit,
    page,
  }: {
    orderId: string;
    limit: number;
    page: number;
  
  }

): Promise<ResultProps> {

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }


  // status is not 'paymentConfirmed'

  // check orderId is valid ObjectId


  if (!ObjectId.isValid(orderId)) {
    return {
      totalCount: 0,
      orders: [],
    };
  }




  const results = await collection.find<UserProps>(
    {

      _id: new ObjectId(orderId),

      //status: 'ordered',

      ///status: { $ne: 'paymentConfirmed' },

      // exclude private sale
      //privateSale: { $ne: true },
    },
    
    //{ projection: { _id: 0, emailVerified: 0 } }

  ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();



  return {
    totalCount: results.length,
    orders: results,
  };

}



// getOneBuyOrderByTradeId
export async function getOneBuyOrderByTradeId(
  {
    tradeId,
  }: {
    tradeId: string;
  }
): Promise<any | null> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  const result = await collection.findOne<UserProps>(
    {
      tradeId: tradeId,
    }
  );
  if (result) {
    return result;
  } else {
    return null;
  }
}







// getOneBuyOrderByNicknameAndStorecode
// status is "ordered" or "accepted" or "paymentRequested"
export async function getOneBuyOrderByNicknameAndStorecode(
  {
    nickname,
    storecode,
  }: {
    nickname: string;
    storecode: string;
  }
): Promise<UserProps | null> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  const result = await collection.findOne<UserProps>(
    {
      nickname: nickname,
      storecode: storecode,
      status: { $in: ['ordered', 'accepted', 'paymentRequested'] },
    }
  );
  if (result) {
    return result;
  } else {
    return null;
  }
}




// updateBuyOrderByQueueId
export async function updateBuyOrderByQueueId(data: any) {

  console.log('updateBuyOrderByQueueId data: ' + JSON.stringify(data));

  if (!data.queueId || !data.transactionHash || !data.minedAt) {
    return null;
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  const result = await collection.updateOne(
    { queueId: data.queueId },
    { $set: {
      transactionHash: data.transactionHash,
      minedAt: data.minedAt,
    } }
  );

  if (result) {
    return true;
  } else {
    return false;
  }

}





// getAllBuyOrdersBySeller
// sum of krwAmount
export async function getAllBuyOrdersBySeller(

  {
    limit,
    page,
    startDate, // 2025-04-01
    endDate,   // 2025-04-30
    walletAddress,
  }: {
    limit: number;
    page: number;
    startDate: string;
    endDate: string;
    walletAddress: string;
  }

): Promise<any> {

  //console.log('getAllBuyOrdersBySeller limit: ' + limit);
  //console.log('getAllBuyOrdersBySeller page: ' + page);
  //console.log('getAllBuyOrdersBySeller startDate: ' + startDate);
  //console.log('getAllBuyOrdersBySeller endDate: ' + endDate);
  //console.log('getAllBuyOrdersBySeller walletAddress: ' + walletAddress);


  // convert 2025-04-01 to 2025-04-30T07:55:42.346Z

  const startDateTime = new Date(startDate).toISOString();
  const endDateTime = new Date(endDate).toISOString();



  //console.log('getAllBuyOrdersBySeller startDateTime: ' + startDateTime);
  //console.log('getAllBuyOrdersBySeller endDateTime: ' + endDateTime);

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set to 1000
  if (limit > 1000) {
    limit = 1000;
  }


  const results = await collection.find<UserProps>(

    //{ walletAddress: walletAddress, status: status },

    {

      privateSale: { $ne: true },

      'seller.walletAddress': walletAddress,

      status: 'paymentConfirmed',

      ////paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      
      //paymentConfirmedAt: { $gte: startDateTime, $lt: endDateTime },

      



    },


  )
  .sort({ paymentConfirmedAt: -1 })
  .limit(limit).skip((page - 1) * limit).toArray();

  // get total count of orders
  const totalCount = await collection.countDocuments(
    {

      privateSale: { $ne: true },

      'seller.walletAddress': walletAddress,
      status: 'paymentConfirmed',

      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

    }
  );

  console.log('getAllBuyOrdersBySeller totalCount: ' + totalCount);

  // sum of krwAmount
  // TypeError: Cannot read properties of undefined (reading 'totalKrwAmount')

  const totalKrwAmount = await collection.aggregate([
    {
      $match: {

        privateSale: { $ne: true },

        'seller.walletAddress': walletAddress,
        status: 'paymentConfirmed',

        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

      }
    },
    {
      $group: {
        _id: null,
        totalKrwAmount: { $sum: '$krwAmount' },
      }
    }
  ]).toArray();

  const totalUsdtAmount = await collection.aggregate([
    {
      $match: {

        privateSale: { $ne: true },

        'seller.walletAddress': walletAddress,
        status: 'paymentConfirmed',
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      }
    },
    {
      $group: {
        _id: null,
        totalUsdtAmount: { $sum: '$usdtAmount' },
      }
    }
  ]).toArray();


  return {
    totalCount: totalCount,
    totalKrwAmount: totalKrwAmount ? totalKrwAmount[0]?.totalKrwAmount : 0,
    totalUsdtAmount: totalUsdtAmount ? totalUsdtAmount[0]?.totalUsdtAmount : 0,
    orders: results,
  };

}


// getAllBuyOrdersBySellerEscrowWallet
// returns all orders matched by seller.escrow wallet address (any status)
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const maskPersonName = (value?: string) => {
  const source = (value || '').trim();
  if (!source) {
    return '구매자';
  }
  if (source.length < 2) {
    return source;
  }
  return `${source[0]}${'*'.repeat(source.length - 1)}`;
};

const maskPhoneNumber = (value?: string) => {
  const source = (value || '').trim();
  if (!source) {
    return source;
  }
  const digits = source.replace(/\D/g, '');
  if (digits.length < 7) {
    return `${source[0]}***`;
  }
  const head = digits.slice(0, 3);
  const tail = digits.slice(-4);
  return `${head}****${tail}`;
};

const maskWalletAddress = (value?: string) => {
  const source = (value || '').trim();
  if (!source) {
    return source;
  }
  if (source.length <= 12) {
    return source;
  }
  return `${source.substring(0, 6)}...${source.substring(source.length - 4)}`;
};

const maskBankAccountNumber = (value?: string) => {
  const source = (value || '').trim();
  if (!source) {
    return source;
  }
  const digits = source.replace(/\D/g, '');
  if (digits.length < 6) {
    return `${source.substring(0, 1)}***`;
  }
  return `${digits.substring(0, 3)}****${digits.substring(digits.length - 2)}`;
};

const maskBuyerInfoForOrder = (order: any) => {
  const nextOrder = { ...order };
  const nextBuyer = nextOrder?.buyer && typeof nextOrder.buyer === 'object'
    ? { ...nextOrder.buyer }
    : {};

  const baseName = nextOrder?.nickname
    || nextBuyer?.nickname
    || nextBuyer?.bankInfo?.depositName
    || nextBuyer?.depositName
    || nextBuyer?.bankInfo?.accountHolder
    || '구매자';
  const maskedName = maskPersonName(baseName);

  nextOrder.nickname = maskedName;

  nextBuyer.nickname = maskPersonName(nextBuyer?.nickname || baseName);
  if (nextBuyer?.depositName) {
    nextBuyer.depositName = maskPersonName(nextBuyer.depositName);
  }
  if (nextBuyer?.mobile) {
    nextBuyer.mobile = maskPhoneNumber(nextBuyer.mobile);
  }
  if (nextBuyer?.walletAddress) {
    nextBuyer.walletAddress = maskWalletAddress(nextBuyer.walletAddress);
  }
  if (nextBuyer?.depositBankAccountNumber) {
    nextBuyer.depositBankAccountNumber = maskBankAccountNumber(nextBuyer.depositBankAccountNumber);
  }
  if (nextBuyer?.depositBanktAccountNumber) {
    nextBuyer.depositBanktAccountNumber = maskBankAccountNumber(nextBuyer.depositBanktAccountNumber);
  }
  if (nextBuyer?.bankInfo && typeof nextBuyer.bankInfo === 'object') {
    const nextBankInfo = { ...nextBuyer.bankInfo };
    if (nextBankInfo?.depositName) {
      nextBankInfo.depositName = maskPersonName(nextBankInfo.depositName);
    }
    if (nextBankInfo?.accountHolder) {
      nextBankInfo.accountHolder = maskPersonName(nextBankInfo.accountHolder);
    }
    if (nextBankInfo?.accountNumber) {
      nextBankInfo.accountNumber = maskBankAccountNumber(nextBankInfo.accountNumber);
    }
    nextBuyer.bankInfo = nextBankInfo;
  }

  nextOrder.buyer = nextBuyer;
  nextOrder.buyerInfoMasked = true;

  return nextOrder;
};

export async function getAllBuyOrdersBySellerEscrowWallet(
  {
    limit,
    page,
    startDate,
    endDate,
    walletAddress,
    requesterWalletAddress,
    status,
  }: {
    limit: number;
    page: number;
    startDate?: string;
    endDate?: string;
    walletAddress: string;
    requesterWalletAddress?: string;
    status?: string | string[];
  }
): Promise<any> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  const usersCollection = client.db(dbName).collection('users');

  if (limit > 1000) {
    limit = 1000;
  }

  const createdAtFilter: Record<string, string> = {};
  if (startDate) {
    const startDateTime = new Date(startDate);
    if (!Number.isNaN(startDateTime.getTime())) {
      createdAtFilter.$gte = startDateTime.toISOString();
    }
  }
  if (endDate) {
    const endDateTime = new Date(endDate);
    if (!Number.isNaN(endDateTime.getTime())) {
      endDateTime.setDate(endDateTime.getDate() + 1);
      createdAtFilter.$lt = endDateTime.toISOString();
    }
  }

  const walletAddressRegex = {
    $regex: `^${escapeRegex(walletAddress)}$`,
    $options: 'i',
  };
  const matchQuery: Record<string, any> = {
    $or: [
      { 'seller.walletAddress': walletAddressRegex },
      { 'seller.escrowWalletAddress': walletAddressRegex },
    ],
  };
  if (Array.isArray(status) && status.length > 0) {
    const validStatuses = status.filter((item) => typeof item === 'string' && item.trim());
    if (validStatuses.length > 0) {
      matchQuery.status = { $in: validStatuses };
    }
  } else if (typeof status === 'string' && status.trim()) {
    matchQuery.status = status.trim();
  }
  if (Object.keys(createdAtFilter).length > 0) {
    matchQuery.createdAt = createdAtFilter;
  }

  const rawOrders = await collection
    .find<UserProps>(matchQuery)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .toArray();

  const ownerCandidate = await usersCollection.findOne<{
    walletAddress?: string;
    smartAccountAddress?: string;
    seller?: {
      escrowWalletAddress?: string;
      escrowWalletSignerAddress?: string;
      escrowWallet?: {
        signerAddress?: string;
        smartAccountAddress?: string;
      };
    };
    thirdweb?: {
      walletAddress?: string;
      smartAccountAddress?: string;
    };
  }>(
    {
      $or: [
        { walletAddress: walletAddressRegex },
        { 'seller.walletAddress': walletAddressRegex },
        { 'seller.escrowWalletAddress': walletAddressRegex },
        { 'seller.escrowWalletSignerAddress': walletAddressRegex },
        { 'seller.escrowWallet.signerAddress': walletAddressRegex },
        { 'seller.escrowWallet.smartAccountAddress': walletAddressRegex },
      ],
    },
    {
      projection: {
        walletAddress: 1,
        smartAccountAddress: 1,
        'seller.escrowWalletAddress': 1,
        'seller.escrowWalletSignerAddress': 1,
        'seller.escrowWallet.signerAddress': 1,
        'seller.escrowWallet.smartAccountAddress': 1,
        'thirdweb.walletAddress': 1,
        'thirdweb.smartAccountAddress': 1,
      },
    },
  );

  const ownerWalletAddress =
    ownerCandidate?.walletAddress
    || ownerCandidate?.thirdweb?.walletAddress
    || walletAddress;
  const ownerWalletAddressCandidates = Array.from(new Set(
    [
      ownerWalletAddress,
      ownerCandidate?.smartAccountAddress,
      ownerCandidate?.seller?.escrowWalletAddress,
      ownerCandidate?.seller?.escrowWalletSignerAddress,
      ownerCandidate?.seller?.escrowWallet?.signerAddress,
      ownerCandidate?.seller?.escrowWallet?.smartAccountAddress,
      ownerCandidate?.thirdweb?.walletAddress,
      ownerCandidate?.thirdweb?.smartAccountAddress,
      walletAddress,
    ]
      .map((value) => String(value || '').trim())
      .filter((value) => isWalletAddress(value))
      .map((value) => value.toLowerCase()),
  ));
  const normalizedRequesterWalletAddress = String(requesterWalletAddress || '').trim().toLowerCase();
  let requesterLinkedWalletAddress = '';
  if (normalizedRequesterWalletAddress && isWalletAddress(normalizedRequesterWalletAddress)) {
    const requesterWalletAddressRegex = {
      $regex: `^${escapeRegex(normalizedRequesterWalletAddress)}$`,
      $options: 'i',
    };
    const requesterCandidate = await usersCollection.findOne<{
      walletAddress?: string;
      smartAccountAddress?: string;
      seller?: {
        escrowWalletAddress?: string;
        escrowWalletSignerAddress?: string;
        escrowWallet?: {
          signerAddress?: string;
          smartAccountAddress?: string;
        };
      };
      thirdweb?: {
        walletAddress?: string;
        smartAccountAddress?: string;
      };
    }>(
      {
        $or: [
          { walletAddress: requesterWalletAddressRegex },
          { smartAccountAddress: requesterWalletAddressRegex },
          { 'seller.escrowWalletAddress': requesterWalletAddressRegex },
          { 'seller.escrowWalletSignerAddress': requesterWalletAddressRegex },
          { 'seller.escrowWallet.signerAddress': requesterWalletAddressRegex },
          { 'seller.escrowWallet.smartAccountAddress': requesterWalletAddressRegex },
          { 'thirdweb.walletAddress': requesterWalletAddressRegex },
          { 'thirdweb.smartAccountAddress': requesterWalletAddressRegex },
        ],
      },
      {
        projection: {
          walletAddress: 1,
          smartAccountAddress: 1,
          'seller.escrowWalletAddress': 1,
          'seller.escrowWalletSignerAddress': 1,
          'seller.escrowWallet.signerAddress': 1,
          'seller.escrowWallet.smartAccountAddress': 1,
          'thirdweb.walletAddress': 1,
          'thirdweb.smartAccountAddress': 1,
        },
      },
    );
    requesterLinkedWalletAddress = String(
      requesterCandidate?.thirdweb?.walletAddress
      || requesterCandidate?.walletAddress
      || requesterCandidate?.seller?.escrowWalletSignerAddress
      || requesterCandidate?.seller?.escrowWallet?.signerAddress
      || '',
    ).trim().toLowerCase();
  }
  const isOwnerView = Boolean(
    normalizedRequesterWalletAddress &&
    (
      ownerWalletAddressCandidates.includes(normalizedRequesterWalletAddress)
      || (
        requesterLinkedWalletAddress &&
        ownerWalletAddressCandidates.includes(requesterLinkedWalletAddress)
      )
    ),
  );

  const orders = isOwnerView
    ? rawOrders.map((order: any) => ({ ...order, buyerInfoMasked: false }))
    : rawOrders.map((order: any) => maskBuyerInfoForOrder(order));

  const totalCount = await collection.countDocuments(matchQuery);

  const totalKrwAmountAgg = await collection
    .aggregate([
      { $match: matchQuery },
      { $group: { _id: null, totalKrwAmount: { $sum: '$krwAmount' } } },
    ])
    .toArray();

  const totalUsdtAmountAgg = await collection
    .aggregate([
      { $match: matchQuery },
      { $group: { _id: null, totalUsdtAmount: { $sum: '$usdtAmount' } } },
    ])
    .toArray();

  return {
    totalCount,
    totalKrwAmount: totalKrwAmountAgg?.[0]?.totalKrwAmount || 0,
    totalUsdtAmount: totalUsdtAmountAgg?.[0]?.totalUsdtAmount || 0,
    orders,
    buyerInfoMasked: !isOwnerView,
    ownerWalletAddress,
    ownerWalletAddressCandidates,
    isOwnerView,
  };
}








// getDailyBuyOrder
export async function getDailyBuyOrder(
  
  {
    startDate,
    endDate,
  }: {
    startDate: string;
    endDate: string;
  }

): Promise<any> {

  //console.log('getDailyBuyOrder startDate: ' + startDate);
  //console.log('getDailyBuyOrder endDate: ' + endDate);
  /*
  getDailyBuyOrder startDate: 2025-03-01
  getDailyBuyOrder endDate: 2025-03-13

  
  */

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');




  // distinct count of walletAddress by day
  // sum of krwAmount by day
  // sum of usdtAmount by day
  // count of trades by day


  const results = await collection.aggregate([

    {
      $match: {
        status: 'paymentConfirmed',

        ///paymentConfirmedAt: { $gte: startDate, $lt: endDate },


      }
    },
    {
      $group: {
        
        //_id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$paymentConfirmedAt' } } },

        // convert date to korea time
        // +9 hours

        _id: { $dateToString: { format: '%Y-%m-%d', date: { $add: [ { $toDate: '$paymentConfirmedAt' }, 9 * 60 * 60 * 1000 ] } } },
     
        
        totalKrwAmount: { $sum: '$krwAmount' },
        totalUsdtAmount: { $sum: '$usdtAmount' },
        trades: { $sum: 1 },

      }
    },



    // order by date desc
    { $sort: { _id: -1 } },
  ]).toArray();



  return results;

}



// getDailyKrwAmountBySeller
export async function getDailyBuyOrderBySeller(
  
  {
    startDate,
    endDate,
    walletAddress,
  }: {
    startDate: string;
    endDate: string;
    walletAddress: string;
  }

): Promise<any> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  const normalizedWalletAddress = String(walletAddress || '').trim();
  if (!normalizedWalletAddress) {
    return [];
  }
  const walletAddressRegex = {
    $regex: `^${escapeRegex(normalizedWalletAddress)}$`,
    $options: 'i',
  };

  const results = await collection.aggregate([
    {
      $match: {
        $or: [
          { 'seller.walletAddress': walletAddressRegex },
          { 'seller.escrowWalletAddress': walletAddressRegex },
        ],
        status: 'paymentConfirmed',
        paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      }
    },
    {
      $group: {
        // Group by Korean date (UTC+9) to align with dashboard labels.
        _id: { $dateToString: { format: '%Y-%m-%d', date: { $add: [ { $toDate: '$paymentConfirmedAt' }, 9 * 60 * 60 * 1000 ] } } },
        totalKrwAmount: { $sum: '$krwAmount' },
        totalUsdtAmount: { $sum: '$usdtAmount' },
        trades: { $sum: 1 },
      }
    },
    // order by date desc
    { $sort: { _id: -1 } },
  ]).toArray();



  return results;

}



// getAllBuyOrdersByStorecode
export async function getAllBuyOrdersByStorecode(
  {
    limit,
    page,
    startDate,
    endDate,
    storecode,
  }: {
    limit: number;
    page: number;
    startDate: string;
    endDate: string;
    storecode: string;
  }
): Promise<any> {

  if (!startDate) {
    startDate = new Date(0).toISOString();
  }
  if (!endDate) {
    endDate = new Date().toISOString();
  }


  //console.log('getAllBuyOrdersByStorecode startDate: ' + startDate);
  //console.log('getAllBuyOrdersByStorecode endDate: ' + endDate);



  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');


  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }

  const results = await collection.find<UserProps>(
    {
      storecode: storecode,
      //status: 'paymentConfirmed',
      status: { $in: ['ordered', 'accepted', 'paymentRequested', ] },
      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

      privateSale: { $ne: true }, // exclude private sale
    },
  )
    .sort({ paymentConfirmedAt: -1 })
    .limit(limit).skip((page - 1) * limit).toArray();


  //console.log('getAllBuyOrdersByStorecode results: ' + JSON.stringify(results));

  // get total count of orders
  const totalCount = await collection.countDocuments(
    {
      storecode: storecode,
      status: { $in: ['ordered', 'accepted', 'paymentRequested', ] },
      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

      privateSale: { $ne: true }, // exclude private sale
    }
  );
  //console.log('getAllBuyOrdersByStorecode totalCount: ' + totalCount);

  // sum of krwAmount
  const totalKrwAmount = await collection.aggregate([
    {
      $match: {
        storecode: storecode,
        status: { $in: ['ordered', 'accepted', 'paymentRequested', ] },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

        privateSale: { $ne: true }, // exclude private sale
      }
    },
    {
      $group: {
        _id: null,
        totalKrwAmount: { $sum: '$krwAmount' },
      }
    }
  ]).toArray();

  // sum of usdtAmount
  const totalUsdtAmount = await collection.aggregate([
    {
      $match: {
        storecode: storecode,
        status: { $in: ['ordered', 'accepted', 'paymentRequested', ] },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

        privateSale: { $ne: true }, // exclude private sale
      }
    },
    {
      $group: {
        _id: null,
        totalUsdtAmount: { $sum: '$usdtAmount' },
      }
    }
  ]).toArray();


  return {
    totalCount: totalCount,
    totalKrwAmount: totalKrwAmount ? totalKrwAmount[0]?.totalKrwAmount : 0,
    totalUsdtAmount: totalUsdtAmount ? totalUsdtAmount[0]?.totalUsdtAmount : 0,
    orders: results,
  };
}







// getAllTradesByAdmin
// sum of krwAmount
export async function getAllTradesByAdmin(

  {
    limit,
    page,
    
    //startDate,
    //endDate,
    
    agentcode,
    searchNickname,
    walletAddress,
    storecode,
    searchOrderStatusCompleted,
    searchBuyer,
    searchDepositName,
    searchStoreBankAccountNumber,
    privateSale,

    fromDate, // 2025-04-01
    toDate,   // 2025-04-30
  }: {
    limit: number;
    page: number;

    //startDate: string;
    //endDate: string;

    agentcode: string,
    searchNickname: string,
    walletAddress: string;
    storecode: string;
    searchOrderStatusCompleted: boolean;
    searchBuyer: string;
    searchDepositName: string;
    searchStoreBankAccountNumber: string;
    privateSale: boolean;

    fromDate?: string; // 2025-04-01
    toDate?: string;   // 2025-04-30

  }

): Promise<any> {

  //const fromDateValue = fromDate ? fromDate + 'T00:00:00.000Z' : new Date(0).toISOString();

  const fromDateValue = fromDate ? new Date(fromDate + 'T00:00:00+09:00').toISOString() : '1970-01-01T00:00:00Z';

  //const toDateValue = toDate ? toDate + 'T23:59:59.999Z' : new Date().toISOString();
  const toDateValue = toDate ? new Date(toDate + 'T23:59:59+09:00').toISOString() : new Date().toISOString();


  //console.log('getAllTradesByAdmin fromDateValue: ' + fromDateValue);
  //console.log('getAllTradesByAdmin toDateValue: ' + toDateValue);
  

  //console.log('privateSale: ' + privateSale);



  //console.log('getAllTradesByAdmin startDate: ' + startDate);
  //console.log('getAllTradesByAdmin endDate: ' + endDate);

  /*
  if (!startDate) {
    startDate = new Date(0).toISOString();
  }
  if (!endDate) {
    endDate = new Date().toISOString();
  }
  */


  /*
  console.log('getAllTradesByAdmin startDate: ' + startDate);
  console.log('getAllTradesByAdmin endDate: ' + endDate);
  console.log('getAllTradesByAdmin searchNickname: ' + searchNickname);
  console.log('getAllTradesByAdmin walletAddress: ' + walletAddress);

  console.log('getAllTradesByAdmin storecode: ' + storecode);
  console.log('getAllTradesByAdmin searchOrderStatusCompleted: ' + searchOrderStatusCompleted);
  console.log('getAllTradesByAdmin searchBuyer: ' + searchBuyer);
  console.log('getAllTradesByAdmin searchDepositName: ' + searchDepositName);
  */

  ///console.log('getAllTradesByAdmin agentcode: ' + agentcode);


  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }




  const results = await collection.find<UserProps>(

    //{ walletAddress: walletAddress, status: status },

    {
      ///'seller.walletAddress': walletAddress,

      //nickname: { $regex: searchNickname, $options: 'i' },


      status: 'paymentConfirmed',

      //privateSale: { $ne: true },
      privateSale: privateSale,


      agentcode: { $regex: agentcode, $options: 'i' },
      //storecode: storecode,
      storecode: { $regex: storecode, $options: 'i' },

      nickname: { $regex: searchBuyer, $options: 'i' },

      'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },


      createdAt: { $gte: fromDateValue, $lt: toDateValue },


    },

  )
  .sort({ paymentConfirmedAt: -1 })
  .limit(limit).skip((page - 1) * limit).toArray();


  
  /*
  // get total count of orders
  const totalCount = await collection.countDocuments(
    {
      
      ////'seller.walletAddress': walletAddress,

      // search include searchNickname
      //nickname: { $regex: searchNickname, $options: 'i' },

      status: 'paymentConfirmed',

      //privateSale: { $ne: true },
      privateSale: privateSale,

      agentcode: { $regex: agentcode, $options: 'i' },
      //storecode: storecode,
      storecode: { $regex: storecode, $options: 'i' },

      nickname: { $regex: searchBuyer, $options: 'i' },
      'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },


      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

      createdAt: { $gte: fromDateValue, $lt: toDateValue },

 
    }
  );
  */



  //console.log('getAllTradesByAdmin totalCount: ' + totalCount);

  // sum of krwAmount
  // TypeError: Cannot read properties of undefined (reading 'totalKrwAmount')

  const totalResult = await collection.aggregate([
    {
      $match: {
        
        //'seller.walletAddress': walletAddress,

        //nickname: { $regex: searchNickname, $options: 'i' },


        status: 'paymentConfirmed',

        ///privateSale: { $ne: true },
        privateSale: privateSale,


        agentcode: { $regex: agentcode, $options: 'i' },
        //storecode: storecode,
        storecode: { $regex: storecode, $options: 'i' },

        nickname: { $regex: searchBuyer, $options: 'i' },

        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        

        totalCount: { $sum: 1 },
        totalKrwAmount: { $sum: '$krwAmount' },
        totalUsdtAmount: { $sum: '$usdtAmount' },

        totalSettlementCount: { $sum: 1 },
        totalSettlementAmount: { $sum: { $toDouble: '$settlement.settlementAmount' } },
        totalSettlementAmountKRW: { $sum: { $toDouble: '$settlement.settlementAmountKRW' } },

        totalFeeAmount: { $sum: { $toDouble: '$settlement.feeAmount' } },
        totalFeeAmountKRW: { $sum: { $toDouble: '$settlement.feeAmountKRW' } },

        totalAgentFeeAmount: { $sum: { $toDouble: '$settlement.agentFeeAmount' } },
        totalAgentFeeAmountKRW: { $sum: { $toDouble: '$settlement.agentFeeAmountKRW' } },

      }
    }
  ]).toArray();

  /////console.log('getAllTradesByAdmin totalKrwAmount: ' + JSON.stringify(totalKrwAmount));


  /*
  // totalUsdtAmount
  const totalUsdtAmount = await collection.aggregate([
    {
      $match: {
        //'seller.walletAddress': walletAddress,

        //nickname: { $regex: searchNickname, $options: 'i' },
        status: 'paymentConfirmed',

        //privateSale: { $ne: true },
        privateSale: privateSale,

        agentcode: { $regex: agentcode, $options: 'i' },
        //storecode: storecode,
        storecode: { $regex: storecode, $options: 'i' },

        nickname: { $regex: searchBuyer, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        totalUsdtAmount: { $sum: '$usdtAmount' },
      }
    }
  ]).toArray();
  */





  /*
  // totalSettlementCount
  const totalSettlementCount = await collection.aggregate([
    {
      $match: {
        //nickname: { $regex: searchNickname, $options: 'i' },
        status: 'paymentConfirmed',
        // settlement is not null
        settlement: { $exists: true, $ne: null },



        //privateSale: { $ne: true },
        privateSale: privateSale,


        agentcode: { $regex: agentcode, $options: 'i' },
        //storecode: storecode,
        storecode: { $regex: storecode, $options: 'i' },

        nickname: { $regex: searchBuyer, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        totalSettlementCount: { $sum: 1 },
      }
    }
  ]).toArray();
  */


  /*
  // totalSettlementAmount
  // settlement.settlementAmount
  const totalSettlementAmount = await collection.aggregate([
    {
      $match: {
        //nickname: { $regex: searchNickname, $options: 'i' },
        status: 'paymentConfirmed',
        settlement: { $exists: true, $ne: null },

        ///privateSale: { $ne: true },
        privateSale: privateSale,


        agentcode: { $regex: agentcode, $options: 'i' },
        //storecode: storecode,
        storecode: { $regex: storecode, $options: 'i' },

        nickname: { $regex: searchBuyer, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },



        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        totalSettlementAmount: { $sum: '$settlement.settlementAmount' },
      }
    }
  ]).toArray();
  */

  /*
  // totalSettlementAmountKRW
  const totalSettlementAmountKRW = await collection.aggregate([
    {
      $match: {
        //nickname: { $regex: searchNickname, $options: 'i' },
        status: 'paymentConfirmed',
        settlement: { $exists: true, $ne: null },

        //privateSale: { $ne: true },
        privateSale: privateSale,


        agentcode: { $regex: agentcode, $options: 'i' },
        //storecode: storecode,
        storecode: { $regex: storecode, $options: 'i' },

        nickname: { $regex: searchBuyer, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    // $settlement.settlementAmountKRW is string

    {
      $group: {
        _id: null,
        ///totalSettlementAmountKRW: { $sum: '$settlement.settlementAmountKRW' },
        totalSettlementAmountKRW: { $sum: { $toDouble: '$settlement.settlementAmountKRW' } },
      }
    }
  ]).toArray();
  */
  

  /*
  // total feeAmount
  const totalFeeAmount = await collection.aggregate([
    {
      $match: {
        //nickname: { $regex: searchNickname, $options: 'i' },
        status: 'paymentConfirmed',
        settlement: { $exists: true, $ne: null },

        
        //privateSale: { $ne: true },
        privateSale: privateSale,


        agentcode: { $regex: agentcode, $options: 'i' },
        //storecode: storecode,
        storecode: { $regex: storecode, $options: 'i' },

        nickname: { $regex: searchBuyer, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },


        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        totalFeeAmount: { $sum: '$settlement.feeAmount' },
      }
    }
  ]).toArray();
  */

  /*
  // total feeAmountKRW
  const totalFeeAmountKRW = await collection.aggregate([
    {
      $match: {
        //nickname: { $regex: searchNickname, $options: 'i' },
        status: 'paymentConfirmed',
        settlement: { $exists: true, $ne: null },

        //privateSale: { $ne: true },
        privateSale: privateSale,
        

        agentcode: { $regex: agentcode, $options: 'i' },
        //storecode: storecode,
        storecode: { $regex: storecode, $options: 'i' },

        nickname: { $regex: searchBuyer, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },


        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        ///totalFeeAmountKRW: { $sum: '$settlement.feeAmountKRW' },
        totalFeeAmountKRW: { $sum: { $toDouble: '$settlement.feeAmountKRW' } },
      }
    }
  ]).toArray();
  */



  /*
  // total agentFeeAmount, agentFeeAmountKRW
  const totalResult = await collection.aggregate([
    {
      $match: {
        //nickname: { $regex: searchNickname, $options: 'i' },
        status: 'paymentConfirmed',
        settlement: { $exists: true, $ne: null },
        //privateSale: { $ne: true },
        privateSale: privateSale,
        agentcode: { $regex: agentcode, $options: 'i' },
        //storecode: storecode,
        storecode: { $regex: storecode, $options: 'i' },
        nickname: { $regex: searchBuyer, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        totalAgentFeeAmount: { $sum: '$settlement.agentFeeAmount' },
        totalAgentFeeAmountKRW: { $sum: { $toDouble: '$settlement.agentFeeAmountKRW' } },
      }
    }
  ]).toArray();
  */






  //console.log('getAllTradesByAdmin totalCount: ' + totalCount);
  //console.log('getAllTradesByAdmin totalSettlementCount: ' + totalSettlementCount[0]?.totalSettlementCount);


  /*
  return {
    totalCount: totalCount,
    totalKrwAmount: totalKrwAmount ? totalKrwAmount[0]?.totalKrwAmount : 0,
    totalUsdtAmount: totalUsdtAmount ? totalUsdtAmount[0]?.totalUsdtAmount : 0,
    totalSettlementCount: totalSettlementCount ? totalSettlementCount[0]?.totalSettlementCount : 0,
    totalSettlementAmount: totalSettlementAmount ? totalSettlementAmount[0]?.totalSettlementAmount : 0,
    totalSettlementAmountKRW: totalSettlementAmountKRW ? totalSettlementAmountKRW[0]?.totalSettlementAmountKRW : 0,
    totalFeeAmount: totalFeeAmount ? totalFeeAmount[0]?.totalFeeAmount : 0,
    totalFeeAmountKRW: totalFeeAmountKRW ? totalFeeAmountKRW[0]?.totalFeeAmountKRW : 0,

    totalAgentFeeAmount: totalResult ? totalResult[0]?.totalAgentFeeAmount : 0,
    totalAgentFeeAmountKRW: totalResult ? totalResult[0]?.totalAgentFeeAmountKRW : 0,

    orders: results,
  };
  */
  return {
    totalCount: totalResult ? totalResult[0]?.totalCount : 0,
    totalKrwAmount: totalResult ? totalResult[0]?.totalKrwAmount : 0,
    totalUsdtAmount: totalResult ? totalResult[0]?.totalUsdtAmount : 0,
    totalSettlementCount: totalResult ? totalResult[0]?.totalSettlementCount : 0,
    totalSettlementAmount: totalResult ? totalResult[0]?.totalSettlementAmount : 0,
    totalSettlementAmountKRW: totalResult ? totalResult[0]?.totalSettlementAmountKRW : 0,
    totalFeeAmount: totalResult ? totalResult[0]?.totalFeeAmount : 0,
    totalFeeAmountKRW: totalResult ? totalResult[0]?.totalFeeAmountKRW : 0,
    totalAgentFeeAmount: totalResult ? totalResult[0]?.totalAgentFeeAmount : 0,
    totalAgentFeeAmountKRW: totalResult ? totalResult[0]?.totalAgentFeeAmountKRW : 0,
    orders: results,
  };

}











 // getAllClearancesByAdmin
  // all orders with status 'paymentConfirmed' and privateSale is true
 export async function getAllClearancesByAdmin(

  {
    limit,
    page,
    
    //startDate,
    //endDate,


    agentcode,
    searchNickname,
    walletAddress,
    storecode,
    searchOrderStatusCompleted,
    searchBuyer,
    searchDepositName,
    searchStoreBankAccountNumber,
    //privateSale,

    fromDate,
    toDate,
  }: {
    limit: number;
    page: number;

    //startDate: string;
    //endDate: string;

    agentcode: string,
    searchNickname: string,
    walletAddress: string;
    storecode: string;
    searchOrderStatusCompleted: boolean;
    searchBuyer: string;
    searchDepositName: string;
    searchStoreBankAccountNumber: string;
    //privateSale: boolean;

    fromDate: string,
    toDate: string,
  }

): Promise<any> {

  //const fromDateValue = fromDate ? fromDate + 'T00:00:00.000Z' : new Date(0).toISOString();
  const fromDateValue = fromDate ? new Date(fromDate + 'T00:00:00+09:00').toISOString() : '1970-01-01T00:00:00Z';


  //const toDateValue = toDate ? toDate + 'T23:59:59.999Z' : new Date().toISOString();
  const toDateValue = toDate ? new Date(toDate + 'T23:59:59+09:00').toISOString() : new Date().toISOString();


  /*
  console.log('getAllClearancesByAdmin startDate: ' + startDate);
  console.log('getAllClearancesByAdmin endDate: ' + endDate);
  console.log('getAllClearancesByAdmin searchNickname: ' + searchNickname);
  console.log('getAllClearancesByAdmin walletAddress: ' + walletAddress);
  console.log('getAllClearancesByAdmin storecode: ' + storecode);
  console.log('getAllClearancesByAdmin searchOrderStatusCompleted: ' + searchOrderStatusCompleted);
  console.log('getAllClearancesByAdmin searchBuyer: ' + searchBuyer);
  console.log('getAllClearancesByAdmin searchDepositName: ' + searchDepositName);
  console.log('getAllClearancesByAdmin searchStoreBankAccountNumber: ' + searchStoreBankAccountNumber);
  */
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }


  const results = await collection.find<UserProps>(
    {
      // 'seller.walletAddress': walletAddress,
      //status: 'paymentConfirmed', or 'paymentRequested'

      status : { $in: ['paymentConfirmed', 'paymentRequested'] },

      privateSale: true, // only private sale orders
      agentcode: { $regex: agentcode, $options: 'i' },
      storecode: { $regex: storecode, $options: 'i' },
      nickname: { $regex: searchBuyer, $options: 'i' },
      
      

      //'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
      ...(searchDepositName && searchDepositName.trim() !== '' ? {
        $or: [
          { 'store.bankInfo.accountHolder': { $regex: searchDepositName, $options: 'i' } },
          { 'buyer.depositName': { $regex: searchDepositName, $options: 'i' } },
        ],
      } : {}),



      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

      createdAt: { $gte: fromDateValue, $lt: toDateValue },
    },
  )
    .sort({ createdAt: -1 })
    // .sort({ paymentConfirmedAt: -1 })
    .limit(limit).skip((page - 1) * limit).toArray();







  // get total count of orders
  const totalCount = await collection.countDocuments(
    {
      // 'seller.walletAddress': walletAddress,
      //status: 'paymentConfirmed',
      status : { $in: ['paymentConfirmed', 'paymentRequested'] },


      privateSale: true, // only private sale orders
      agentcode: { $regex: agentcode, $options: 'i' },
      storecode: { $regex: storecode, $options: 'i' },
      nickname: { $regex: searchBuyer, $options: 'i' },
      
      
      
      //'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
      ...(searchDepositName && searchDepositName.trim() !== '' ? {
        $or: [
          { 'store.bankInfo.accountHolder': { $regex: searchDepositName, $options: 'i' } },
          { 'buyer.depositName': { $regex: searchDepositName, $options: 'i' } },
        ],
      } : {}),


      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

      createdAt: { $gte: fromDateValue, $lt: toDateValue },
    }
  );





  //console.log('getAllClearancesByAdmin totalCount: ' + totalCount);
  // sum of krwAmount
  const totalKrwAmount = await collection.aggregate([
    {
      $match: {
        // 'seller.walletAddress': walletAddress,
        status: 'paymentConfirmed',
        privateSale: true, // only private sale orders
        agentcode: { $regex: agentcode, $options: 'i' },
        storecode: { $regex: storecode, $options: 'i' },
        nickname: { $regex: searchBuyer, $options: 'i' },
        
        
        //'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        ...(searchDepositName && searchDepositName.trim() !== '' ? {
          $or: [
            { 'store.bankInfo.accountHolder': { $regex: searchDepositName, $options: 'i' } },
            { 'buyer.depositName': { $regex: searchDepositName, $options: 'i' } },
          ],
        } : {}),
 

        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        totalKrwAmount: { $sum: '$krwAmount' },
      }
    }
  ]).toArray();


  // sum of usdtAmount
  const totalUsdtAmount = await collection.aggregate([
    {
      $match: {
        // 'seller.walletAddress': walletAddress,
        status: 'paymentConfirmed',
        privateSale: true, // only private sale orders
        agentcode: { $regex: agentcode, $options: 'i' },
        storecode: { $regex: storecode, $options: 'i' },
        nickname: { $regex: searchBuyer, $options: 'i' },
        
        
        
        //'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        ...(searchDepositName && searchDepositName.trim() !== '' ? {
          $or: [
            { 'store.bankInfo.accountHolder': { $regex: searchDepositName, $options: 'i' } },
            { 'buyer.depositName': { $regex: searchDepositName, $options: 'i' } },
          ],
        } : {}),


        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        totalUsdtAmount: { $sum: '$usdtAmount' },
      }
    }
  ]).toArray();


  // totalSettlementCount
  const totalSettlementCount = await collection.aggregate([
    {
      $match: {
        // 'seller.walletAddress': walletAddress,
        status: 'paymentConfirmed',
        privateSale: true, // only private sale orders
        agentcode: { $regex: agentcode, $options: 'i' },
        storecode: { $regex: storecode, $options: 'i' },
        nickname: { $regex: searchBuyer, $options: 'i' },
        
        
        ///'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        ...(searchDepositName && searchDepositName.trim() !== '' ? {
          $or: [
            { 'store.bankInfo.accountHolder': { $regex: searchDepositName, $options: 'i' } },
            { 'buyer.depositName': { $regex: searchDepositName, $options: 'i' } },
          ],
        } : {}),



        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        settlement: { $exists: true, $ne: null },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        totalSettlementCount: { $sum: 1 },
      }
    }
  ]).toArray();


  // totalSettlementAmount
  const totalSettlementAmount = await collection.aggregate([
    {
      $match: {
        // 'seller.walletAddress': walletAddress,
        status: 'paymentConfirmed',
        privateSale: true, // only private sale orders
        agentcode: { $regex: agentcode, $options: 'i' },
        storecode: { $regex: storecode, $options: 'i' },
        nickname: { $regex: searchBuyer, $options: 'i' },
        
        
        //'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        ...(searchDepositName && searchDepositName.trim() !== '' ? {
          $or: [
            { 'store.bankInfo.accountHolder': { $regex: searchDepositName, $options: 'i' } },
            { 'buyer.depositName': { $regex: searchDepositName, $options: 'i' } },
          ],
        } : {}),




        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        settlement: { $exists: true, $ne: null },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        totalSettlementAmount: { $sum: '$settlement.settlementAmount' },
      }
    }
  ]).toArray();


  // totalSettlementAmountKRW
  const totalSettlementAmountKRW = await collection.aggregate([
    {
      $match: {
        // 'seller.walletAddress': walletAddress,
        status: 'paymentConfirmed',
        privateSale: true, // only private sale orders
        agentcode: { $regex: agentcode, $options: 'i' },
        storecode: { $regex: storecode, $options: 'i' },
        nickname: { $regex: searchBuyer, $options: 'i' },
        
        
        //'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        ...(searchDepositName && searchDepositName.trim() !== '' ? {
          $or: [
            { 'store.bankInfo.accountHolder': { $regex: searchDepositName, $options: 'i' } },
            { 'buyer.depositName': { $regex: searchDepositName, $options: 'i' } },
          ],
        } : {}),


        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        settlement: { $exists: true, $ne: null },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    // $settlement.settlementAmountKRW is string
    {
      $group: {
        _id: null,
        //totalSettlementAmountKRW: { $sum: '$settlement.settlementAmountKRW' },
        totalSettlementAmountKRW: { $sum: { $toDouble: '$settlement.settlementAmountKRW' } },
      }
    }
  ]).toArray();


  // total feeAmount
  const totalFeeAmount = await collection.aggregate([
    {
      $match: {
        // 'seller.walletAddress': walletAddress,
        status: 'paymentConfirmed',
        privateSale: true, // only private sale orders
        agentcode: { $regex: agentcode, $options: 'i' },
        storecode: { $regex: storecode, $options: 'i' },
        nickname: { $regex: searchBuyer, $options: 'i' },
        
        
        //'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        ...(searchDepositName && searchDepositName.trim() !== '' ? {
          $or: [
            { 'store.bankInfo.accountHolder': { $regex: searchDepositName, $options: 'i' } },
            { 'buyer.depositName': { $regex: searchDepositName, $options: 'i' } },
          ],
        } : {}),


        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        settlement: { $exists: true, $ne: null },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        totalFeeAmount: { $sum: '$settlement.feeAmount' },
      }
    }
  ]).toArray();


  // total feeAmountKRW
  const totalFeeAmountKRW = await collection.aggregate([
    {
      $match: {
        // 'seller.walletAddress': walletAddress,
        status: 'paymentConfirmed',
        privateSale: true, // only private sale orders
        agentcode: { $regex: agentcode, $options: 'i' },
        storecode: { $regex: storecode, $options: 'i' },
        nickname: { $regex: searchBuyer, $options: 'i' },
        
        
        //'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        ...(searchDepositName && searchDepositName.trim() !== '' ? {
          $or: [
            { 'store.bankInfo.accountHolder': { $regex: searchDepositName, $options: 'i' } },
            { 'buyer.depositName': { $regex: searchDepositName, $options: 'i' } },
          ],
        } : {}),


        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        settlement: { $exists: true, $ne: null },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },

        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    },
    {
      $group: {
        _id: null,
        //totalFeeAmountKRW: { $sum: '$settlement.feeAmountKRW' },
        totalFeeAmountKRW: { $sum: { $toDouble: '$settlement.feeAmountKRW' } },
      }
    }
  ]).toArray();
  //console.log('getAllClearancesByAdmin totalCount: ' + totalCount);
  //console.log('getAllClearancesByAdmin totalSettlementCount: ' + totalSettlementCount[0]?.totalSettlementCount);
  return {
    totalCount: totalCount,
    totalKrwAmount: totalKrwAmount ? totalKrwAmount[0]?.totalKrwAmount : 0,
    totalUsdtAmount: totalUsdtAmount ? totalUsdtAmount[0]?.totalUsdtAmount : 0,
    totalSettlementCount: totalSettlementCount ? totalSettlementCount[0]?.totalSettlementCount : 0,
    totalSettlementAmount: totalSettlementAmount ? totalSettlementAmount[0]?.totalSettlementAmount : 0,
    totalSettlementAmountKRW: totalSettlementAmountKRW ? totalSettlementAmountKRW[0]?.totalSettlementAmountKRW : 0,
    totalFeeAmount: totalFeeAmount ? totalFeeAmount[0]?.totalFeeAmount : 0,
    totalFeeAmountKRW: totalFeeAmountKRW ? totalFeeAmountKRW[0]?.totalFeeAmountKRW : 0,
    orders: results,
  };
}
























// getAllTradesForAgent agentcode
export async function getAllTradesForAgent(
  {
    limit,
    page,
    startDate,
    endDate,
    searchNickname,
    walletAddress,
    agentcode,
    searchOrderStatusCompleted,
    searchBuyer,
    searchDepositName,
    searchStoreBankAccountNumber,
  }: {
    limit: number;
    page: number;
    startDate: string;
    endDate: string;
    searchNickname: string,
    walletAddress: string;
    agentcode: string;
    searchOrderStatusCompleted: boolean;
    searchBuyer: string;
    searchDepositName: string;
    searchStoreBankAccountNumber: string;
  }
): Promise<any> {
  if (!startDate) {
    startDate = new Date(0).toISOString();
  }
  if (!endDate) {
    endDate = new Date().toISOString();
  }
  //console.log('getAllTradesForAgent startDate: ' + startDate);
  //console.log('getAllTradesForAgent endDate: ' + endDate);
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }

  const results = await collection.find<UserProps>(
    {
      privateSale: { $ne: true },
      agentcode: { $regex: agentcode, $options: 'i' },
      status: 'paymentConfirmed',
      nickname: { $regex: searchNickname, $options: 'i' },
      'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
    },
  )
    .sort({ paymentConfirmedAt: -1 })
    .limit(limit).skip((page - 1) * limit).toArray();
  // get total count of orders
  const totalCount = await collection.countDocuments(
    {
      privateSale: { $ne: true },
      agentcode: { $regex: agentcode, $options: 'i' },
      status: 'paymentConfirmed',
      nickname: { $regex: searchNickname, $options: 'i' },
      'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
    }
  );
  //console.log('getAllTradesForAgent totalCount: ' + totalCount);
  // sum of krwAmount
  const totalKrwAmount = await collection.aggregate([
    {
      $match: {
        privateSale: { $ne: true },
        agentcode: { $regex: agentcode, $options: 'i' },
        status: 'paymentConfirmed',
        nickname: { $regex: searchNickname, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      }
    },
    {
      $group: {
        _id: null,
        totalKrwAmount: { $sum: '$krwAmount' },
      }
    }
  ]).toArray();
  // sum of usdtAmount
  const totalUsdtAmount = await collection.aggregate([
    {
      $match: {
        privateSale: { $ne: true },
        agentcode: { $regex: agentcode, $options: 'i' },
        status: 'paymentConfirmed',
        nickname: { $regex: searchNickname, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      }
    },
    {
      $group: {
        _id: null,
        totalUsdtAmount: { $sum: '$usdtAmount' },
      }
    }
  ]).toArray();
  const totalSettlementCount = await collection.aggregate([
    {
      $match: {
        privateSale: { $ne: true },
        agentcode: { $regex: agentcode, $options: 'i' },
        status: 'paymentConfirmed',
        nickname: { $regex: searchNickname, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        settlement: { $exists: true, $ne: null },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      }
    },
    {
      $group: {
        _id: null,
        totalSettlementCount: { $sum: 1 },
      }
    }
  ]).toArray();
  // totalSettlementAmount
  const totalSettlementAmount = await collection.aggregate([
    {
      $match: {
        privateSale: { $ne: true },
        agentcode: { $regex: agentcode, $options: 'i' },
        status: 'paymentConfirmed',
        nickname: { $regex: searchNickname, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        settlement: { $exists: true, $ne: null },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      }
    },
    {
      $group: {
        _id: null,
        totalSettlementAmount: { $sum: '$settlement.settlementAmount' },
      }
    }
  ]).toArray();
  // totalSettlementAmountKRW
  const totalSettlementAmountKRW = await collection.aggregate([
    {
      $match: {
        privateSale: { $ne: true },
        agentcode: { $regex: agentcode, $options: 'i' },
        status: 'paymentConfirmed',
        nickname: { $regex: searchNickname, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        settlement: { $exists: true, $ne: null },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      }
    },
    {
      $group: {
        _id: null,
        totalSettlementAmountKRW: { $sum: { $toDouble: '$settlement.settlementAmountKRW' } },
      }
    }
  ]).toArray();
  // total feeAmount
  const totalFeeAmount = await collection.aggregate([
    {
      $match: {
        privateSale: { $ne: true },
        agentcode: { $regex: agentcode, $options: 'i' },
        status: 'paymentConfirmed',
        nickname: { $regex: searchNickname, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        settlement: { $exists: true, $ne: null },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      }
    },
    {
      $group: {
        _id: null,
        //totalFeeAmount: { $sum: '$settlement.feeAmount' },
        totalAgentFeeAmount: { $sum: '$settlement.agentFeeAmount' },
      }
    }
  ]).toArray();
  // total feeAmountKRW
  const totalFeeAmountKRW = await collection.aggregate([
    {
      $match: {
        privateSale: { $ne: true },
        agentcode: { $regex: agentcode, $options: 'i' },
        status: 'paymentConfirmed',
        nickname: { $regex: searchNickname, $options: 'i' },
        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },
        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },
        settlement: { $exists: true, $ne: null },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      }
    },
    {
      $group: {
        _id: null,
        //totalFeeAmountKRW: { $sum: { $toDouble: '$settlement.feeAmountKRW' } },
        totalAgentFeeAmountKRW: { $sum: { $toDouble: '$settlement.agentFeeAmountKRW' } },
      }
    }
  ]).toArray();
  //console.log('getAllTradesForAgent totalCount: ' + totalCount);
  return {
    totalCount: totalCount,
    totalKrwAmount: totalKrwAmount ? totalKrwAmount[0]?.totalKrwAmount : 0,
    totalUsdtAmount: totalUsdtAmount ? totalUsdtAmount[0]?.totalUsdtAmount : 0,
    totalSettlementCount: totalSettlementCount ? totalSettlementCount[0]?.totalSettlementCount : 0,
    totalSettlementAmount: totalSettlementAmount ? totalSettlementAmount[0]?.totalSettlementAmount : 0,
    totalSettlementAmountKRW: totalSettlementAmountKRW ? totalSettlementAmountKRW[0]?.totalSettlementAmountKRW : 0,
    totalFeeAmount: totalFeeAmount ? totalFeeAmount[0]?.totalFeeAmount : 0,
    totalFeeAmountKRW: totalFeeAmountKRW ? totalFeeAmountKRW[0]?.totalFeeAmountKRW : 0,
    orders: results,
  };
}


/*
   limit: 5,
    page: 1,
    startDate: "",
    endDate: "",
    searchNickname: "",
    walletAddress: "",
    agentcode: agentcode,
  });
  */
// getAllBuyOrdersForAgent agentcode
export async function getAllBuyOrdersForAgent(
  {
    limit,
    page,
    startDate,
    endDate,

    searchNickname,
    walletAddress,
    agentcode,
    status,
    hasBankInfo,
  }: {
    limit: number;
    page: number;
    startDate: string;
    endDate: string;
    searchNickname: string,
    walletAddress: string;
    agentcode: string;
    status?: string;
    hasBankInfo?: 'all' | 'yes' | 'no';
  }
): Promise<any> {
  const start = startDate?.trim?.() || '';
  const end = endDate?.trim?.() || '';



  ///console.log('getAllBuyOrdersForAgent agentcode: ' + agentcode);



  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }

  const agentcodeFilter = { $regex: agentcode, $options: 'i' };

  const baseMatch: Record<string, unknown> = {
    // agentcode can be stored at root or under seller.agentcode; include both
    $or: [
      { agentcode: agentcodeFilter },
      { 'seller.agentcode': agentcodeFilter },
    ],
  };

  if (searchNickname) {
    baseMatch.nickname = { $regex: searchNickname, $options: 'i' };
  }
  if (walletAddress) {
    baseMatch['buyer.walletAddress'] = { $regex: walletAddress, $options: 'i' };
  }
  // status filter
  const defaultStatuses = ['ordered', 'accepted', 'paymentRequested', 'paymentConfirmed', 'completed', 'cancelled'];
  if (status && status !== 'all') {
    baseMatch.status = status;
  } else {
    baseMatch.status = { $in: defaultStatuses };
  }
  // bank info filter
  if (hasBankInfo === 'yes') {
    baseMatch['seller.bankInfo.bankName'] = { $exists: true, $ne: '' };
  } else if (hasBankInfo === 'no') {
    baseMatch['seller.bankInfo.bankName'] = { $in: [null, ''] };
  }
  // date range (createdAt)
  if (start || end) {
    const range: Record<string, string> = {};
    if (start) range.$gte = start;
    if (end) range.$lte = end;
    baseMatch.createdAt = range;
  }

  const results = await collection.find<UserProps>(baseMatch)
    .sort({ paymentConfirmedAt: -1 })
    .limit(limit).skip((page - 1) * limit).toArray();
  
  
  //console.log('getAllBuyOrdersForAgent results: ' + JSON.stringify(results));




  // get total count of orders
  const totalCount = await collection.countDocuments(baseMatch);
  //console.log('getAllBuyOrdersForAgent totalCount: ' + totalCount);
  // sum of krwAmount
  const totalKrwAmount = await collection.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: null,
        totalKrwAmount: { $sum: '$krwAmount' },
      }
    }
  ]).toArray();
  // sum of usdtAmount
  const totalUsdtAmount = await collection.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: null,
        totalUsdtAmount: { $sum: '$usdtAmount' },
      }
    }
  ]).toArray();
  return {
    totalCount: totalCount,
    totalKrwAmount: totalKrwAmount ? totalKrwAmount[0]?.totalKrwAmount : 0,
    totalUsdtAmount: totalUsdtAmount ? totalUsdtAmount[0]?.totalUsdtAmount : 0,
    orders: results,
  };
}





// getAllTradesByStorecode
export async function getAllTradesByStorecode(
  {
    limit,
    page,
    startDate,
    endDate,
    storecode,
    searchBuyer,
    searchDepositName,
    searchStoreBankAccountNumber,

  }: {
    limit: number;
    page: number;
    startDate: string;
    endDate: string;
    storecode: string;
    searchBuyer: string;
    searchDepositName: string;
    searchStoreBankAccountNumber: string;
  }
): Promise<any> {
  if (!startDate) {
    startDate = new Date(0).toISOString();
  }
  if (!endDate) {
    endDate = new Date().toISOString();
  }
  //console.log('getAllTradesByStorecode startDate: ' + startDate);
  //console.log('getAllTradesByStorecode endDate: ' + endDate);
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }




    /*
        status: 'paymentConfirmed',

      privateSale: { $ne: true },

      //storecode: storecode,
      storecode: { $regex: storecode, $options: 'i' },

      nickname: { $regex: searchBuyer, $options: 'i' },

      'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

      */


  const results = await collection.find<UserProps>(
    {

      privateSale: { $ne: true },

      //storecode: storecode,
      storecode: { $regex: storecode, $options: 'i' },



      status: 'paymentConfirmed',



      nickname: { $regex: searchBuyer, $options: 'i' },

      'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

    



      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
    },
  )
    .sort({ paymentConfirmedAt: -1 })
    .limit(limit).skip((page - 1) * limit).toArray();


  // get total count of orders
  const totalCount = await collection.countDocuments(
    {

      privateSale: { $ne: true },

      //storecode: storecode,

      storecode: { $regex: storecode, $options: 'i' },


      status: 'paymentConfirmed',

      nickname: { $regex: searchBuyer, $options: 'i' },

      'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

    


      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
    }
  );
  //console.log('getAllTradesByStorecode totalCount: ' + totalCount);
  // sum of krwAmount
  const totalKrwAmount = await collection.aggregate([
    {
      $match: {

        privateSale: { $ne: true },


        //storecode: storecode,

        storecode: { $regex: storecode, $options: 'i' },


        status: 'paymentConfirmed',

        nickname: { $regex: searchBuyer, $options: 'i' },

        'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

        'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

    


        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      }
    },
    {
      $group: {
        _id: null,
        totalKrwAmount: { $sum: '$krwAmount' },
      }
    }
  ]).toArray();
  
  // sum of usdtAmount
  const totalUsdtAmount = await collection.aggregate([
    {
      $match: {

        privateSale: { $ne: true },

        //storecode: storecode,

        storecode: { $regex: storecode, $options: 'i' },


        status: 'paymentConfirmed',

      nickname: { $regex: searchBuyer, $options: 'i' },

      'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

    


        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      }
    },
    {
      $group: {
        _id: null,
        totalUsdtAmount: { $sum: '$usdtAmount' },
      }
    }
  ]).toArray();

  const totalSettlementCount = await collection.aggregate([
    {
      $match: {

        privateSale: { $ne: true },

        //storecode: storecode,

        storecode: { $regex: storecode, $options: 'i' },


        status: 'paymentConfirmed',

      nickname: { $regex: searchBuyer, $options: 'i' },

      'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },

    


        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      }
    },
    {
      $group: {
        _id: null,
        totalSettlementCount: { $sum: 1 },
      }
    }
  ]).toArray();

  // totalSettlementAmount
  const totalSettlementAmount = await collection.aggregate([
    {
      $match: {

        privateSale: { $ne: true },

        //storecode: storecode,

        storecode: { $regex: storecode, $options: 'i' },


        status: 'paymentConfirmed',


        nickname: { $regex: searchBuyer, $options: 'i' },

      'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },



        //settlement.settlementAmount: { $exists: true },
        'settlement.settlementAmount': { $exists: true, $ne: null },



    


      }
    },
    {
      $group: {
        _id: null,
        totalSettlementAmount: { $sum: { $toDouble: '$settlement.settlementAmount' } },
      }
    }
  ]).toArray();
  // totalSettlementAmountKRW
  const totalSettlementAmountKRW = await collection.aggregate([
    {
      $match: {

        privateSale: { $ne: true },

        //storecode: storecode,

        storecode: { $regex: storecode, $options: 'i' },


        status: 'paymentConfirmed',


        nickname: { $regex: searchBuyer, $options: 'i' },

      'buyer.depositName': { $regex: searchDepositName, $options: 'i' },

      'store.bankInfo.accountNumber': { $regex: searchStoreBankAccountNumber, $options: 'i' },



        //settlement.settlementAmountKRW: { $exists: true },
        'settlement.settlementAmountKRW': { $exists: true, $ne: null },
      }
    },
    // $settlement.settlementAmountKRW is string
    {
      $group: {
        _id: null,
        ///totalSettlementAmountKRW: { $sum: '$settlement.settlementAmountKRW' },
        totalSettlementAmountKRW: { $sum: { $toDouble: '$settlement.settlementAmountKRW' } },
      }
    }
  ]).toArray();
  return {
    totalCount: totalCount,
    totalKrwAmount: totalKrwAmount ? totalKrwAmount[0]?.totalKrwAmount : 0,
    totalUsdtAmount: totalUsdtAmount ? totalUsdtAmount[0]?.totalUsdtAmount : 0,
    totalSettlementCount: totalSettlementCount ? totalSettlementCount[0]?.totalSettlementCount : 0,
    totalSettlementAmount: totalSettlementAmount ? totalSettlementAmount[0]?.totalSettlementAmount : 0,
    totalSettlementAmountKRW: totalSettlementAmountKRW ? totalSettlementAmountKRW[0]?.totalSettlementAmountKRW : 0,
    trades: results,
  };
}











// getAllBuyOrdersByAdmin
// status is "ordered" or "accepted" or "paymentAccepted"
export async function getAllBuyOrdersByAdmin(
  {
    limit,
    page,
    startDate,
    endDate,
    agentcode,
    searchNickname,
    walletAddress,
  }: {
    limit: number;
    page: number;
    startDate: string;
    endDate: string;
    agentcode: string;
    searchNickname: string;
    walletAddress: string;
  }

): Promise<any> {

  //console.log('getAllBuyOrdersByAdmin startDate: ' + startDate);
  //console.log('getAllBuyOrdersByAdmin endDate: ' + endDate);

  if (!startDate) {
    startDate = new Date(0).toISOString();
  }
  if (!endDate) {
    endDate = new Date().toISOString();
  }
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }

  const results = await collection.find<UserProps>(
    {

      privateSale: { $ne: true },


      //status: 'ordered',
      //status: 'accepted',
      //status: { $in: ['ordered', 'accepted'] },
      status: { $in: ['ordered', 'accepted', 'paymentRequested'] },
      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      //walletAddress: walletAddress,
      //nickname: { $regex: searchNickname, $options: 'i' },


      agentcode: { $regex: agentcode, $options: 'i' },

      // storecode is exist
      storecode: {
        $ne: null,
      },


    },
  )
    .sort({ createdAt: -1 })
    .limit(limit).skip((page - 1) * limit).toArray();

  // get total count of orders
  const totalCount = await collection.countDocuments(
    {

      privateSale: { $ne: true },

      //status: 'ordered',
      //status: 'accepted',
      status: { $in: ['ordered', 'accepted', 'paymentRequested'] },
      //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
      //walletAddress: walletAddress,
      //nickname: { $regex: searchNickname, $options: 'i' },

      agentcode: { $regex: agentcode, $options: 'i' },
      // storecode is not null
      storecode: { $ne: null },
    }
  );
  //console.log('getAllBuyOrdersByAdmin totalCount: ' + totalCount);
  // sum of krwAmount
  // TypeError: Cannot read properties of undefined (reading 'totalKrwAmount')
  const totalKrwAmount = await collection.aggregate([
    {
      $match: {

        privateSale: { $ne: true },


        //status: 'ordered',
        //status: 'accepted',
        status: { $in: ['ordered', 'accepted', 'paymentRequested'] },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
        //walletAddress: walletAddress,
        //nickname: { $regex: searchNickname, $options: 'i' },

        agentcode: { $regex: agentcode, $options: 'i' },

        // storecode is not null
        storecode: { $ne: null },
      }
    },
    {
      $group: {
        _id: null,
        totalKrwAmount: { $sum: '$krwAmount' },
      }
    }
  ]).toArray();
  // totalUsdtAmount
  const totalUsdtAmount = await collection.aggregate([
    {
      $match: {

        privateSale: { $ne: true },

        
        //status: 'ordered',
        //status: 'accepted',
        status: { $in: ['ordered', 'accepted', 'paymentRequested'] },
        //paymentConfirmedAt: { $gte: startDate, $lt: endDate },
        //walletAddress: walletAddress,
        //nickname: { $regex: searchNickname, $options: 'i' },

        agentcode: { $regex: agentcode, $options: 'i' },

        // storecode is not null
        storecode: { $ne: null },
      }
    },
    {
      $group: {
        _id: null,
        totalUsdtAmount: { $sum: '$usdtAmount' },
      }
    }
  ]).toArray();


  return {
    totalCount: totalCount,
    totalKrwAmount: totalKrwAmount ? totalKrwAmount[0]?.totalKrwAmount : 0,
    totalUsdtAmount: totalUsdtAmount ? totalUsdtAmount[0]?.totalUsdtAmount : 0,
    orders: results,
  };
}

// getAllBuyOrdersByAdmin




















// getAllBuyOrdersForMatching
export async function getAllBuyOrdersForMatching(
  {
    limit,
    page,
    startDate,
    endDate,
  }: {
    limit: number;
    page: number;
    startDate: string;
    endDate: string;
  }
): Promise<any> {
  if (!startDate) {
    startDate = new Date(0).toISOString();
  }
  if (!endDate) {
    endDate = new Date().toISOString();
  }
  //console.log('getAllBuyOrdersForMatching startDate: ' + startDate);
  //console.log('getAllBuyOrdersForMatching endDate: ' + endDate);


  //console.log('getAllBuyOrdersForMatching limit: ' + limit);
  //console.log('getAllBuyOrdersForMatching page: ' + page);


  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');


  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }

  const results = await collection.find<UserProps>(
    {
      
      storecode: { $ne: "admin" },




      settlement: null,

      status: { $in: ['ordered'] },
      
      
      'store.sellerWalletAddress': { $exists: true, $ne: null },

            // 이것때문에 확인해야함 / 2025.05.28 // nevertry




    }
  )
    .sort({ createdAt: -1 })
    ///.limit(limit).skip((page - 1) * limit)

    .limit(limit).skip((page - 1) * limit)

    .toArray();



  ///console.log('getAllBuyOrdersForMatching results: ' + JSON.stringify(results));


  // get total count of orders
  const totalCount = await collection.countDocuments(
    {
      storecode: { $ne: "admin" },
      settlement: null,
      status: { $in: ['ordered'] },


      'store.sellerWalletAddress': { $exists: true, $ne: null },



    }
  );


  return {
    totalCount: totalCount,
    orders: results,
  };
}



// insertStore
export async function insertStore(data: any) {
  //console.log('insertStore data: ' + JSON.stringify(data));
  /*
  insertStore data: {"storecode":"teststorecode","storeName":"테스트상점","storeType":"test","storeUrl":"https://test.com","storeDescription":"설명입니다.","storeLogo":"https://test.com/logo.png","storeBanner":"https://test.com/banner.png"}
  */
  if (!data.storecode || !data.storeName) {
    
    
    console.log('insertStore data is invalid');
    console.log('insertStore data: ' + JSON.stringify(data));



    return null;
  }
  const client = await clientPromise;
  const collection = client.db(dbName).collection('stores');
  // check storecode is unique
  const stores = await collection.findOne<UserProps>(
    {
      //storecode: data.storecode or storeName: data.storeName
      $or: [
        { storecode: data.storecode },
        { storeName: data.storeName },
      ],

    }
  );

  console.log('insertStore stores: ' + JSON.stringify(stores));

  if (stores) {
    console.log('storecode or storeName is already exist');
    return null;
  }



  // insert storecode
  const result = await collection.insertOne(
    {
      storecode: data.storecode,
      storeName: data.storeName.trim(),
      storeType: data.storeType,
      storeUrl: data.storeUrl,
      storeDescription: data.storeDescription,
      storeLogo: data.storeLogo,
      storeBanner: data.storeBanner,
      createdAt: new Date().toISOString(),
    }
  );
  //console.log('insertStore result: ' + JSON.stringify(result));
  if (result) {
    const updated = await collection.findOne<UserProps>(
      { _id: result.insertedId }
    );
    return {
      _id: result.insertedId,
      storecode: data.storecode,
    };
  } else {
    return null;
  }
}







// deleteStoreCode
export async function deleteStoreCode(
  {
    storecode,
  }: {
    storecode: string;
  }
): Promise<boolean> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('stores');

  // delete storecode
  const result = await collection.deleteOne(
    { storecode: storecode }
  );
  if (result.deletedCount === 1) {
    return true;
  } else {
    return false;
  }
}


// getRandomStore
export async function getRandomStore(): Promise<any> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('stores');

  const result = await collection.aggregate<any>([
    { $sample: { size: 1 } }
  ]).toArray();

  if (result) {
    return result[0];
  } else {
    return null;
  }

}
















export async function getCollectOrdersForSeller(

  {
    storecode,
    limit,
    page,
    walletAddress,
    searchMyOrders,

    fromDate,
    toDate,
  }: {
    storecode: string;
    limit: number;
    page: number;
    walletAddress: string;
    searchMyOrders: boolean;

    fromDate?: string;
    toDate?: string;
  }

): Promise<any> {

  //console.log('getCollectOrdersForSeller fromDate: ' + fromDate);
  //console.log('getCollectOrdersForSeller toDate: ' + toDate);

  //const fromDateValue = fromDate ? fromDate + 'T00:00:00Z' : '1970-01-01T00:00:00Z';
  const fromDateValue = fromDate ? new Date(fromDate + 'T00:00:00+09:00').toISOString() : '1970-01-01T00:00:00Z';

  //const toDateValue = toDate ? toDate + 'T23:59:59Z' : new Date().toISOString();
  const toDateValue = toDate ? new Date(toDate + 'T23:59:59+09:00').toISOString() : new Date().toISOString();
  

  const client = await clientPromise;

  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }


  // status is not 'paymentConfirmed'


  // if searchMyOrders is true, get orders by buyer wallet address is walletAddress
  // else get all orders except paymentConfirmed

  // if storecode is empty, get all orders by wallet address

  // if storecode is not empty, get orders by storecode and wallet address




    const results = await collection.find<UserProps>(
      {
        // walletAddress is not equal to walletAddress
        //walletAddress: { $ne: walletAddress },


        //status: 'ordered',
  
        //status: { $ne: 'paymentConfirmed' },
  
        storecode: storecode,

        privateSale: true,


        'buyer.depositName': { $eq: '' },


        createdAt: { $gte: fromDateValue, $lt: toDateValue },

      },
      
      //{ projection: { _id: 0, emailVerified: 0 } }
  
    ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();
  

    const totalCount = await collection.countDocuments(
      {
        //walletAddress: { $ne: walletAddress },


        storecode: storecode,
        privateSale: true,

        'buyer.depositName': { $eq: '' },

        createdAt: { $gte: fromDateValue, $lt: toDateValue },
      }
    );


    // totalClearanceCount
    // totalclearanceAmount
    // totalClearanceAmountKRW
    const totalClearance = await collection.aggregate([
      {
        $match: {
          storecode: storecode,
          privateSale: true,
          status: 'paymentConfirmed',

          'buyer.depositName': { $eq: '' },

          createdAt: { $gte: fromDateValue, $lt: toDateValue },
        }
      },
      {
        $group: {
          _id: null,

          totalClearanceCount: { $sum: 1 },
          totalClearanceAmount: { $sum: '$usdtAmount' },
          totalClearanceAmountKRW: { $sum: { $toDouble: '$krwAmount' } }, // convert to double

        }
      }
    ]).toArray();

    const totalClearanceCount = totalClearance.length > 0 ? totalClearance[0].totalClearanceCount : 0;
    const totalClearanceAmount = totalClearance.length > 0 ? totalClearance[0].totalClearanceAmount : 0;
    const totalClearanceAmountKRW = totalClearance.length > 0 ? totalClearance[0].totalClearanceAmountKRW : 0;

    

    return {
      totalCount: totalCount,
      totalClearanceCount: totalClearanceCount,
      totalClearanceAmount: totalClearanceAmount,
      totalClearanceAmountKRW: totalClearanceAmountKRW,
      orders: results,
    };




}







export async function getCollectOrdersForUser(

  {
    storecode,
    limit,
    page,
    walletAddress,
    searchMyOrders,

    fromDate,
    toDate,

    searchWithdrawDepositName,
  }: {
    storecode: string;
    limit: number;
    page: number;
    walletAddress: string;
    searchMyOrders: boolean;

    fromDate?: string;
    toDate?: string;

    searchWithdrawDepositName?: string;
  }

): Promise<any> {

  //console.log('getCollectOrdersForUser fromDate: ' + fromDate);
  //console.log('getCollectOrdersForUser toDate: ' + toDate);

  //console.log('searchWithdrawDepositName: ' + searchWithdrawDepositName);



  //const fromDateValue = fromDate ? fromDate + 'T00:00:00Z' : '1970-01-01T00:00:00Z';
  // fromDate is korean date
  // then convert to UTC date
  const fromDateValue = fromDate ? new Date(fromDate + 'T00:00:00+09:00').toISOString() : '1970-01-01T00:00:00Z';

  // toDate is korean date
  //const toDateValue = toDate ? toDate + 'T23:59:59Z' : new Date().toISOString();
  const toDateValue = toDate ? new Date(toDate + 'T23:59:59+09:00').toISOString() : new Date().toISOString();
  

  const client = await clientPromise;

  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }


  // status is not 'paymentConfirmed'


  // if searchMyOrders is true, get orders by buyer wallet address is walletAddress
  // else get all orders except paymentConfirmed

  // if storecode is empty, get all orders by wallet address

  // if storecode is not empty, get orders by storecode and wallet address


    const results = await collection.find<UserProps>(
      {
        //walletAddress: walletAddress,


        //status: 'ordered',
  
        //status: { $ne: 'paymentConfirmed' },
  
        storecode: storecode,
        privateSale: true,


        // check buyer.depositName is exist and where searchWithdrawDepositName is store.buyer.depositName

        //'buyer.depositName': { $regex: searchWithdrawDepositName, $options: 'i' },

        // when 'buyer.depositName' is not '', then search by 'buyer.depositName'
        'buyer.depositName': { $exists: true, $ne: '', $regex: searchWithdrawDepositName, $options: 'i' },
  



        createdAt: { $gte: fromDateValue, $lt: toDateValue },

        // if store.bankInfo.accountHolder is exist, and searchWithdrawDepositName is not empty, then search by store.bankInfo.accountHolder
        // or buyer.depositName is exist, and searchWithdrawDepositName is not empty, then search by buyer.depositName

        /*
        $or: [
          { 'store.bankInfo.accountHolder': { $regex: searchWithdrawDepositName, $options: 'i' } },
          { 'buyer.depositName': { $regex: searchWithdrawDepositName, $options: 'i' } },
        ], 
        */
       /*
        errorLabelSet: Set(0) {},
        errorResponse: {
          ok: 0,
          errmsg: '$regex has to be a string',
          code: 2,
          codeName: 'BadValue',
          '$clusterTime': {
            clusterTime: new Timestamp({ t: 1754661900, i: 1 }),
            signature: [Object]
          },
          operationTime: new Timestamp({ t: 1754661900, i: 1 })
        },
        ok: 0,
        code: 2,
        codeName: 'BadValue',
        '$clusterTime': {
          clusterTime: new Timestamp({ t: 1754661900, i: 1 }),
          signature: {
            hash: Binary.createFromBase64('m44on9ySijyLEn0GO4Rg4B65sTQ=', 0),
            keyId: new Long('7511921603412754437')
          }
        },
        operationTime: new Timestamp({ t: 1754661900, i: 1 })
        */


        // check if store.bankInfo.accountHolder is exist and where searchWithdrawDepositName is store.bankInfo.accountHolder
        /*
        ...(searchWithdrawDepositName && searchWithdrawDepositName.trim() !== '' ? {
          $or: [
            { 'store.bankInfo.accountHolder': { $regex: searchWithdrawDepositName, $options: 'i' } },
            { 'buyer.depositName': { $regex: searchWithdrawDepositName, $options: 'i' } },
          ],
        } : {}),
         */


      },
      
      //{ projection: { _id: 0, emailVerified: 0 } }
  
    ).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).toArray();


    //console.log('getCollectOrdersForUser results: ' + JSON.stringify(results));


  

    const totalCount = await collection.countDocuments(
      {
        //walletAddress: walletAddress,

        storecode: storecode,
        privateSale: true,

        'buyer.depositName': { $exists: true, $ne: '', $regex: searchWithdrawDepositName, $options: 'i' },

        // if store.bankInfo.accountHolder is exist, and searchWithdrawDepositName is not empty, then search by store.bankInfo.accountHolder
        // or buyer.depositName is exist, and searchWithdrawDepositName is not empty, then search by buyer.depositName
        /*
        $or: [
          { 'store.bankInfo.accountHolder': { $regex: searchWithdrawDepositName, $options: 'i' } },
          { 'buyer.depositName': { $regex: searchWithdrawDepositName, $options: 'i' } },
        ],
        */


        createdAt: { $gte: fromDateValue, $lt: toDateValue },


      }
    );

    
    // totalClearanceCount
    // totalClearanceAmount
    // totalClearanceAmountKRW

    const totalClearance = await collection.aggregate([
      {
        $match: {
          storecode: storecode,
          privateSale: true,
          status: 'paymentConfirmed',
          'buyer.depositName': { $exists: true, $ne: '', $regex: searchWithdrawDepositName, $options: 'i' },
          createdAt: { $gte: fromDateValue, $lt: toDateValue },
        }
      },
      {
        $group: {
          _id: null,

          totalClearanceCount: { $sum: 1 },
          totalClearanceAmount: { $sum: '$usdtAmount' },
          totalClearanceAmountKRW: { $sum: { $toDouble: '$krwAmount' } }, // convert to double

        }
      }
    ]).toArray();

    const totalClearanceCount = totalClearance.length > 0 ? totalClearance[0].totalClearanceCount : 0;
    const totalClearanceAmount = totalClearance.length > 0 ? totalClearance[0].totalClearanceAmount : 0;
    const totalClearanceAmountKRW = totalClearance.length > 0 ? totalClearance[0].totalClearanceAmountKRW : 0;

    

    return {
      totalCount: totalCount,
      totalClearanceCount: totalClearanceCount,
      totalClearanceAmount: totalClearanceAmount,
      totalClearanceAmountKRW: totalClearanceAmountKRW,
      //totalKrwAmount: totalKrwAmount
      orders: results,
    };




}






// getAllBuyOrdersForRequestPayment
export async function getAllBuyOrdersForRequestPayment(
  {
    limit,
    page,
  }: {
    limit: number;
    page: number;
  }

): Promise<any> {

  const client = await clientPromise;

  const collection = client.db(dbName).collection('buyorders');

  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }

  const results = await collection.find<UserProps>(
    {


      //payactionResult.status is not 'error'

      "payactionResult.status": { $ne: 'error' },  // ==================> 중요한부분



      // storecode is exist
      //storecode: { exists: true, $ne: null },
      //"buyer.depositName": { exists: true, $ne: null },

      storecode: { $ne: null },
      // "buyer.depositName" is exist
      "buyer.depositName": { $ne: null },


      status: 'accepted',
    }
  ).sort({ createdAt: -1 })
    .limit(limit).skip((page - 1) * limit).toArray();


  // get total count of orders
  const totalCount = await collection.countDocuments(
    {
      storecode: { $ne: null },
      "buyer.depositName": { $ne: null },
      status: 'accepted',
    }
  );


  return {
    totalCount: totalCount,
    orders: results,
  };
}







// updateBuyOrderPayactionResult
export async function updateBuyOrderPayactionResult(
  {
    orderId,
    api,
    payactionResult,
  }: {
    orderId: string;
    api: string;
    payactionResult: any;
  }
): Promise<boolean> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  // update buyorder
  const result = await collection.updateOne(
    { _id: new ObjectId(orderId) },
    { $set: {
      api: api,
      payactionResult: payactionResult,
    } }
  );
  if (result.modifiedCount === 1) {
    return true;
  } else {
    return false;
  }
}




// getTradeId
export async function getTradeId(
  {
    orderId,
  }: {
    orderId: string;
  }
): Promise<string | null> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  // get tradeId
  const result = await collection.findOne<any>(
    { _id: new ObjectId(orderId) },
    { projection: { tradeId: 1 } }
  );


  console.log('getTradeId result: ' + JSON.stringify(result));

  

  if (result && result.tradeId) {
    return result.tradeId;
  } else {
    return null;
  }
}




// updateBuyOrderSettlement
export async function updateBuyOrderSettlement(
  {
    updater,
    orderId,
    settlement,
    ///////////storecode,
  }: {
    updater: string; // who is updating the settlement
    orderId: string;
    settlement: any;
    ////////////storecode: string;
  }
): Promise<boolean> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  // update buyorder
  const result = await collection.updateOne(
    { _id: new ObjectId(orderId) },
    { $set: {
      settlement: settlement,
      settlementUpdatedAt: new Date().toISOString(),
      settlementUpdatedBy: updater, // who updates the settlement
    } }
  );


  if (result.modifiedCount === 1) {

    // get storecode from buyorder
    const buyOrder = await collection.findOne<any>(
      { _id: new ObjectId(orderId) },
      { projection: { storecode: 1 } }
    );
    if (!buyOrder || !buyOrder.storecode) {
      console.log('updateBuyOrderSettlement: storecode not found in buyorder');
      return false;
    }
    const storecode = buyOrder.storecode;
    console.log('updateBuyOrderSettlement: storecode found in buyorder: ' + storecode);


    const collectionBuyorders = client.db(dbName).collection('buyorders');

    // update store with settlement data
    try {

      const collectionStore = client.db(dbName).collection('stores');

      // totalSettlementCount is count of all buyorders with settlement and storecode
      /*
      const totalSettlementCount = await collectionBuyorders.countDocuments({
          storecode: storecode,
          settlement: {$exists: true},
          privateSale: { $ne: true }, // exclude privateSale orders
      });
      //console.log("totalSettlementCount", totalSettlementCount);
      */

      const totalSettlementAmountResult = await collectionBuyorders.aggregate([
          {
              $match: {
                  storecode: storecode,
                  settlement: {$exists: true},
                  privateSale: { $ne: true }, // exclude privateSale orders
              }
          },
          {
              $group: {
                  _id: null,
                  totalSettlementCount: { $sum: 1 },
                  totalSettlementAmount: { $sum: "$settlement.settlementAmount" },
                  totalSettlementAmountKRW: { $sum: { $toDouble: "$settlement.settlementAmountKRW" } },

                  totalFeeAmount: { $sum: "$settlement.feeAmount" },
                  totalFeeAmountKRW: { $sum: { $toDouble: "$settlement.feeAmountKRW" } },

                  totalAgentFeeAmount: { $sum: "$settlement.agentFeeAmount" },
                  totalAgentFeeAmountKRW: { $sum: { $toDouble: "$settlement.agentFeeAmountKRW" } }

              }
          }
      ]).toArray();

      const totalSettlementCount = totalSettlementAmountResult[0].totalSettlementCount;

      const totalSettlementAmount = totalSettlementAmountResult[0].totalSettlementAmount;
      const totalSettlementAmountKRW = totalSettlementAmountResult[0].totalSettlementAmountKRW;

      const totalFeeAmount = totalSettlementAmountResult[0].totalFeeAmount;
      const totalFeeAmountKRW = totalSettlementAmountResult[0].totalFeeAmountKRW;

      const totalAgentFeeAmount = totalSettlementAmountResult[0].totalAgentFeeAmount;
      const totalAgentFeeAmountKRW = totalSettlementAmountResult[0].totalAgentFeeAmountKRW;

      // update store
      const resultStore = await collectionStore.updateOne(
          { storecode: storecode },
          {
              $set: {
                  totalSettlementCount: totalSettlementCount,
                  totalSettlementAmount: totalSettlementAmount,
                  totalSettlementAmountKRW: totalSettlementAmountKRW,

                  totalFeeAmount: totalFeeAmount,
                  totalFeeAmountKRW: totalFeeAmountKRW,

                  totalAgentFeeAmount: totalAgentFeeAmount,
                  totalAgentFeeAmountKRW: totalAgentFeeAmountKRW,
              },
          }
      );


      if (resultStore.modifiedCount === 1) {
        console.log('updateBuyOrderSettlement: store updated successfully');
      } else {
        console.log('updateBuyOrderSettlement: store update failed');
      }

    } catch (error) {
      console.error('Error updating store with settlement data:', error);
    }




    // update agent with settlement data
    try {

      // get agentcode from buyorder
      const buyOrder = await collectionBuyorders.findOne<any>(
        { _id: new ObjectId(orderId) },
        { projection: { agentcode: 1 } }
      );
      if (!buyOrder || !buyOrder.agentcode) {
        console.log('updateBuyOrderSettlement: agentcode not found in buyorder');
        return false;
      }
      const agentcode = buyOrder.agentcode;

      const collectionAgents = client.db(dbName).collection('agents');

      /*
      // totalSettlementCount is count of all buyorders with settlement and agentcode
      const totalSettlementCount = await collectionBuyorders.countDocuments({
        agentcode: agentcode,
        settlement: { $exists: true },
        privateSale: { $ne: true }, // exclude privateSale orders
      });
      console.log("updateBuyOrderSettlement totalSettlementCount", totalSettlementCount);
      */

      const totalSettlementAmountResult = await collectionBuyorders.aggregate([
        {
          $match: {
            agentcode: agentcode,
            settlement: { $exists: true },
            privateSale: { $ne: true }, // exclude privateSale orders
          }
        },
        {
          $group: {
            _id: null,
            totalSettlementCount: { $sum: 1 },

            totalSettlementAmount: { $sum: "$settlement.settlementAmount" },
            totalSettlementAmountKRW: { $sum: { $toDouble: "$settlement.settlementAmountKRW" } },
            totalFeeAmount: { $sum: "$settlement.feeAmount" },
            totalFeeAmountKRW: { $sum: { $toDouble: "$settlement.feeAmountKRW" } },
          }
        }
      ]).toArray();

      const totalSettlementCount = totalSettlementAmountResult[0].totalSettlementCount;
      const totalSettlementAmount = totalSettlementAmountResult[0].totalSettlementAmount;
      const totalSettlementAmountKRW = totalSettlementAmountResult[0].totalSettlementAmountKRW;
      const totalFeeAmount = totalSettlementAmountResult[0].totalFeeAmount;
      const totalFeeAmountKRW = totalSettlementAmountResult[0].totalFeeAmountKRW;
      // update agent
      const resultAgent = await collectionAgents.updateOne(
        { agentcode: agentcode },
        {
          $set: {
            totalSettlementCount: totalSettlementCount,
            totalSettlementAmount: totalSettlementAmount,
            totalSettlementAmountKRW: totalSettlementAmountKRW,
            totalFeeAmount: totalFeeAmount,
            totalFeeAmountKRW: totalFeeAmountKRW,
          },
        }
      );

      if (resultAgent.modifiedCount === 1) {
        console.log('updateBuyOrderSettlement: agent updated successfully');
      } else {
        console.log('updateBuyOrderSettlement: agent update failed');
      }

    } catch (error) {
      console.error('Error updating agent with settlement data:', error);
    }


    return true;
  } else {

    console.log('updateBuyOrderSettlement failed for orderId: ' + orderId);
    console.log('updateBuyOrderSettlement result: ' + JSON.stringify(result));

    return false;
  }
}




// getTotalNumberOfBuyOrders
export async function getTotalNumberOfBuyOrders(
  {
    storecode,
  }: {
    storecode: string;
  }
): Promise<{
  totalCount: number;
  orders: any[];
  audioOnCount: number
}> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  // get total number of buy orders
  const totalCount = await collection.countDocuments(
    {
      storecode: {
        $regex: storecode || '', // if storecode is empty, it will match all
        
        $options: 'i',
      },
      privateSale: { $ne: true },
      //status: 'paymentConfirmed',
      
      ////status: { $in: ['ordered', 'accepted', 'paymentRequested'] },
      status: { $in: ['ordered', 'accepted',] },

    }
  );


  // project only necessary fields
  // tradieId, store,
  const results = await collection.find<any>(
    {
      storecode: {
        $regex: storecode || '', // if storecode is empty, it will match all
        $options: 'i',
      },
      privateSale: { $ne: true },
      //////status: { $in: ['ordered', 'accepted', 'paymentRequested'] },
      status: { $in: ['ordered', 'accepted',] },
    },
    { projection: {
      tradeId: 1,
      walletAddress: 1,
      isWeb3Wallet: 1,
      nickname: 1,
      avatar: 1,
      store: 1,
      buyer: 1,
      seller: 1,
      createdAt: 1,
      acceptedAt: 1,
      paymentRequestedAt: 1,
      status: 1,
      krwAmount: 1,
      usdtAmount: 1,
      rate: 1,
    } }
  )
    .sort({ createdAt: -1 })
    .toArray();



  // count of audioOn is true
  const audioOnCount = await collection.countDocuments(
    {
      storecode: {
        $regex: storecode || '', // if storecode is empty, it will match all
        $options: 'i',
      },
      privateSale: { $ne: true },
      
      //status: { $in: ['ordered', 'accepted', 'paymentRequested'] },
      status: { $in: ['ordered', 'accepted',] },

      audioOn: true,
    }
  );

  return {
    totalCount: totalCount,
    orders: results,
    audioOnCount: audioOnCount,
  }
}




// getTotalNumberOfClearanceOrders
export async function getTotalNumberOfClearanceOrders(): Promise<{ totalCount: number }> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  // get total number of buy orders
  const totalCount = await collection.countDocuments(
    {
      privateSale: true,
      //status: 'paymentConfirmed',
      status: { $in: ['paymentConfirmed'] },
      'buyer.depositCompleted': false, // buyer has not completed deposit
    }
  );

  ///console.log('getTotalNumberOfClearanceOrders totalCount: ' + totalCount);

  return {
    totalCount: totalCount,
  }
}










// buyOrderWebhook
export async function buyOrderWebhook(
  {
    orderId,
    webhookData,
  }: {
    orderId: string;
    webhookData: any;
  }
): Promise<boolean> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  // update buyorder
  const result = await collection.updateOne(
    { _id: new ObjectId(orderId) },
    { $set: {
      webhookData: webhookData,
    } }
  );
  if (result.modifiedCount === 1) {
    return true;
  } else {
    return false;
  }
}



// getBuyOrderByEscrowWalletAddress
export async function getBuyOrderByEscrowWalletAddress(
  {
    escrowWalletAddress,
  }: {
    escrowWalletAddress: string;
  }
): Promise<any | null> {

  console.log('getBuyOrderByEscrowWalletAddress escrowWalletAddress: ' + escrowWalletAddress);

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  // get buyorder by escrow wallet address
  const result = await collection.findOne<any>(
    { 'escrowWallet.address': escrowWalletAddress },
  );
  if (result) {
    return result;
  } else {
    return null;
  }
}

// updateBuyOrderEscrowBalance
export async function updateBuyOrderEscrowBalance(
  {
    orderId,
    escrowBalance,
    transactionHash,
  }: {
    orderId: string;
    escrowBalance: number;
    transactionHash: string;
  }
): Promise<boolean> {

  console.log('updateBuyOrderEscrowBalance orderId: ' + orderId);
  console.log('updateBuyOrderEscrowBalance escrowBalance: ' + escrowBalance);

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  // update buyorder
  const result = await collection.updateOne(
    { _id: new ObjectId(orderId) },
    { $set: {
      'escrowWallet.balance': escrowBalance,
      'escrowWallet.transactionHash': transactionHash,
      'escrowWallet.updatedAt': new Date().toISOString(),
    } }
  );

  console.log('updateBuyOrderEscrowBalance result: ' + JSON.stringify(result));

  if (result.modifiedCount === 1) {
    return true;
  } else {
    return false;
  }
}






// escrows collection
// date: 20240101, depositAmount, withdrawAmount, beforeBalance, afterBalance
// deposit escrow
export async function depositEscrow(
  {
    storecode,
    date,
    depositAmount,
  }: {
    storecode: string;
    date: string;
    depositAmount: number;
  }
): Promise<boolean> {

  // get store.escrowAmountUSDT from storecode
  const client = await clientPromise;
  const collection = client.db(dbName).collection('stores');
  const store = await collection.findOne<any>(
    { storecode: storecode },
    { projection: { escrowAmountUSDT: 1 } }
  );

  if (!store) {
    //console.log('store not found for storecode: ' + storecode);
    return false;
  }


  const storeEscrowAmountUSDT = store.escrowAmountUSDT || 0;

  // insert escrow record
  const escrowCollection = client.db(dbName).collection('escrows');
  const result = await escrowCollection.insertOne(
    {
      storecode: storecode,
      date: date,
      depositAmount: depositAmount,
      beforeBalance: storeEscrowAmountUSDT,
      afterBalance: storeEscrowAmountUSDT + depositAmount,
    }
  );
  if (result.insertedId) {
    // update store.escrowAmountUSDT
    const updateResult = await collection.updateOne(
      { storecode: storecode },
      { $inc: { escrowAmountUSDT: depositAmount } }
    );
    if (updateResult.modifiedCount === 1) {
      return true;
    } else {
      console.log('update store escrowAmountUSDT failed for storecode: ' + storecode);
      return false;
    }
  } else {
    console.log('insert escrow record failed for storecode: ' + storecode);
    return false;
  }
}

// withdraw escrow
export async function withdrawEscrow(
  {
    storecode,
    date,
    withdrawAmount,
  }: {
    storecode: string;
    date: string;
    withdrawAmount: number;
  }
): Promise<boolean> {

  // get store.escrowAmountUSDT from storecode
  const client = await clientPromise;
  const collection = client.db(dbName).collection('stores');
  const store = await collection.findOne<any>(
    { storecode: storecode },
    { projection: { escrowAmountUSDT: 1 } }
  );

  if (!store) {
    //console.log('store not found for storecode: ' + storecode);
    return false;
  }

  const storeEscrowAmountUSDT = store.escrowAmountUSDT || 0;

  if (storeEscrowAmountUSDT < withdrawAmount) {
    console.log('store.escrowAmountUSDT is less than withdrawAmount for storecode: ' + storecode);
    return false;
  }

  // insert escrow record
  const escrowCollection = client.db(dbName).collection('escrows');
  const result = await escrowCollection.insertOne(
    {
      storecode: storecode,
      date: date,
      withdrawAmount: withdrawAmount,
      beforeBalance: storeEscrowAmountUSDT,
      afterBalance: storeEscrowAmountUSDT - withdrawAmount,
    }
  );
  
  if (result.insertedId) {
    // update store.escrowAmountUSDT
    const updateResult = await collection.updateOne(
      { storecode: storecode },
      { $inc: { escrowAmountUSDT: -withdrawAmount } }
    );
    
    if (updateResult.modifiedCount === 1) {
      return true;
    } else {
      console.log('update store escrowAmountUSDT failed for storecode: ' + storecode);
      return false;
    }
  } else {
    console.log('insert escrow record failed for storecode: ' + storecode);
    return false;
  }
}

  

// getEscrowHistory
export async function getEscrowHistory(
  {
    storecode,
    limit,
    page,
  }: {
    storecode: string;
    limit: number;
    page: number;
  }
): Promise<any> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('escrows');

  // if limit is more than 1000, set limit to 1000
  if (limit > 1000) {
    limit = 1000;
  }

  const results = await collection.find<any>(
    { storecode: storecode },
  ).sort({ _id: -1 }).limit(limit).skip((page - 1) * limit).toArray();

  const totalCount = await collection.countDocuments(
    { storecode: storecode }
  );

  return {
    totalCount: totalCount,
    escrows: results,
  };
}












// updateBuyOrderDepositCompleted
// update buyer.depositCompleted to true
// and depositCompletedAt to current date
// this is used when the buyer has completed the deposit
export async function updateBuyOrderDepositCompleted(
  {
    orderId,
  }: {
    orderId: string;
  }
): Promise<boolean> {

  console.log('updateBuyOrderDepositCompleted orderId: ' + orderId);




  const client = await clientPromise;

  const collection = client.db(dbName).collection('buyorders');


  /*
  // get buyer from order
  const order = await collection.findOne<any>(
    { _id: new ObjectId(orderId) },
    { projection: { buyer: 1 } }
  );

  if (!order) {
    console.log('order not found for orderId: ' + orderId);
    return false;
  }

  // get buyer walletAddress from order
  const buyerWalletAddress = order.walletAddress;

  // update user total buy amount 
  const collectionUsers = client.db(dbName).collection('users');
  const resultUser = await collectionUsers.updateOne(
    { walletAddress: buyerWalletAddress },
    { $inc: { 'buyer.totalBuyAmount': order.totalAmount } }
  );
  */


  // update buyorder
  const result = await collection.updateOne(
    { _id: new ObjectId(orderId) },
    { $set: {
      'buyer.depositCompleted': true,
      'buyer.depositCompletedAt': new Date().toISOString(),
    } }
  );




  ////console.log('updateBuyOrderDepositCompleted result: ' + JSON.stringify(result));

  if (result.modifiedCount === 1) {
    return true;
  } else {
    return false;
  }
}








// getEscrowBalanceByStorecode
// Get the escrow balance for a specific storecode
export async function getEscrowBalanceByStorecode(
  {
    storecode,
  }: {
    storecode: string;
  }
): Promise<any> {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('stores');
  const store = await collection.findOne<any>(
    { storecode: storecode },
    { projection: { escrowAmountUSDT: 1 } }
  );

  if (!store) {
    //console.log('store not found for storecode: ' + storecode);
    return {
      escrowBalance: 0,
    };
  }




  // get latest date from escrows collection with withdrawAmount > 0
  // if no escrows found, return 0
 
  const escrowCollection = client.db(dbName).collection('escrows');
  const buyordersCollection = client.db(dbName).collection('buyorders');




  const latestEscrow = await escrowCollection.find<any>(
    { storecode: storecode, withdrawAmount: { $gt: 0 } },
  ).sort({ date: -1 }).limit(1).toArray();

  //console.log('getEscrowBalanceByStorecode latestEscrow: ' + JSON.stringify(latestEscrow));
  //  [{"_id":"6888e772edb063fa5cfe9ead","storecode":"dtwuzgst","date":"2025-07-29","withdrawAmount":113.42,"beforeBalance":1579.7389999999996,"afterBalance":1466.3189999999995}]


  if (latestEscrow.length === 0) {

    const totalSettlement = await buyordersCollection.aggregate([
      {
        $match: {
          storecode: storecode,
          settlement: { $exists: true },
        },
      },
      {
        $group: {
          _id: null,
          totalFeeAmount: { $sum: { $ifNull: ['$$ROOT.settlement.feeAmount', 0] } },
          totalAgentFeeAmount: { $sum: { $ifNull: ['$$ROOT.settlement.agentFeeAmount', 0] } },
        },
      },
    ]).toArray();

    if (totalSettlement.length === 0) {

      return {
        escrowBalance: store.escrowAmountUSDT || 0,
        todayMinusedEscrowAmount: 0,
      };

    } else {

      const totalFeeAmount = totalSettlement[0].totalFeeAmount || 0;
      const totalAgentFeeAmount = totalSettlement[0].totalAgentFeeAmount || 0;

      const todayMinusedEscrowAmount = totalFeeAmount + totalAgentFeeAmount;

      // calculate escrow balance
      const escrowBalance = (store.escrowAmountUSDT || 0) - todayMinusedEscrowAmount;

      return {
        escrowBalance: escrowBalance,
        todayMinusedEscrowAmount: todayMinusedEscrowAmount,
      };

    }



  } else {

    // get sum of settlement.feeAmount + settlement.agentFeeAmount from buyorders where storecode is storecode
    // where settlement.createdAt is greater than  latestEscrow[0].date


    // latestEscrow[0].date is in 'YYYY-MM-DD' format and korean timezone
    // so we need to convert it to UTC date format
    // and plus one day to get the end of the day
    // e.g. '2025-07-28' -> '2025-07

    //const latestEscrowDate = new Date(latestEscrow[0].date + 'T00:00:00+09:00').toISOString();

    const latestEscrowDate = new Date(latestEscrow[0].date + 'T00:00:00+09:00').toISOString();
    // plus one day to get the end of the day
    const latestEscrowDatePlusOne = 
      new Date(new Date(latestEscrowDate).getTime() + 24 * 60 * 60 * 1000).toISOString();

    ///console.log('getEscrowBalanceByStorecode latestEscrowDatePlusOne: ' + latestEscrowDatePlusOne);
    // 2025-07-28T15:00:00.000Z
    // getEscrowBalanceByStorecode latestEscrowDatePlusOne: 2025-08-08T15:00:00.000Z

    const totalSettlement = await buyordersCollection.aggregate([
      {
        $match: {
          storecode: storecode,
          'settlement.createdAt': { $gt: latestEscrowDatePlusOne },
          settlement: { $exists: true },
        },
      },
      {
        $group: {
          _id: null,
          totalFeeAmount: { $sum: { $ifNull: ['$$ROOT.settlement.feeAmount', 0] } },
          
          totalAgentFeeAmount: { $sum: { $ifNull: ['$$ROOT.settlement.agentFeeAmount', 0] } },

        },
      },
    ]).toArray();

    //console.log('getEscrowBalanceByStorecode totalSettlement: ' + JSON.stringify(totalSettlement));


    if (totalSettlement.length === 0) {

      return {
        escrowBalance: store.escrowAmountUSDT || 0,
        todayMinusedEscrowAmount: 0,
      };

    } else {

      const totalFeeAmount = totalSettlement[0].totalFeeAmount || 0;

      const totalAgentFeeAmount = totalSettlement[0].totalAgentFeeAmount || 0;

      const todayMinusedEscrowAmount = totalFeeAmount + totalAgentFeeAmount;

      // calculate escrow balance
      const escrowBalance = (store.escrowAmountUSDT || 0) - todayMinusedEscrowAmount;

      return {
        escrowBalance: escrowBalance,
        todayMinusedEscrowAmount: todayMinusedEscrowAmount,
      };

    }

  }


}




// getPaymentRequestedCount
export async function getPaymentRequestedCount(storecode: string, walletAddress: string) {

  //console.log('getPaymentRequestedCount storecode: ' + storecode);
  //console.log('getPaymentRequestedCount walletAddress: ' + walletAddress);

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');


  // get all of the paymentRequested orders
  // project tradeId
  const paymentRequestedOrders = await collection.find(
    {
      privateSale: true,
      storecode: storecode,
      'buyer.depositName': { $eq: '' },
      status: 'paymentRequested',
    },
    {
      projection: {
        tradeId: 1,
      },
    }
  ).toArray();

  ////console.log('getPaymentRequestedCount paymentRequestedOrders: ' + JSON.stringify(paymentRequestedOrders));

  // get count of paymentRequested orders
  const count = await collection.countDocuments(
    {
      privateSale: true,
      storecode: storecode,
      
      
      //'seller.walletAddress': walletAddress,

      'buyer.depositName': { $eq: '' },


      status: 'paymentRequested',
    }
  );

  return count;
}



// updateAudioNotification
export async function updateAudioNotification(data: any) {

  if (!data.orderId || data.audioOn === undefined) {
    return null;
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');

  const result = await collection.updateOne(
    { _id: new ObjectId(data.orderId) },
    { $set: { audioOn: data.audioOn } }
  );
  
  if (result.modifiedCount === 1) {
    const updated = await collection.findOne<UserProps>(
      { _id: new ObjectId(data.orderId) }
    );
    return updated;
  } else {
    return null;
  }
}




export async function buyOrderConfirmPaymentEnqueueTransaction(data: any) {
  // orderId, queueId
  if (!data.orderId || !data.queueId) {
    return null;
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  const result = await collection.updateOne(
    { _id: new ObjectId(data.orderId+'')},
    { $set: {
      queueId: data.queueId,
      status: 'paymentConfirmed',
      paymentConfirmedAt: new Date().toISOString(),
    } }
  );
  return {
    success: result.modifiedCount === 1,
  };
}


// buyOrderConfirmPaymentCompleted
export async function buyOrderConfirmPaymentCompleted(data: any) {
  // queueId, transactionHash
  if (!data.queueId || !data.transactionHash) {
    return null;
  }


  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  const result = await collection.updateOne(
    { queueId: data.queueId },
    { $set: {
      transactionHash: data.transactionHash,
      status: 'paymentConfirmed',
      paymentConfirmedAt: new Date().toISOString(),
    } }
  );

  if (result.modifiedCount === 1) {

    // get the buyorder to find the user
    const buyOrder = await collection.findOne<any>(
      { queueId: data.queueId },
      { projection: { 'seller.walletAddress': 1 } }
    );

    if (buyOrder) {

      // update user.seller.buyOrder.transactionHash
      const userCollection = client.db(dbName).collection('users');
      const sellerEscrowWalletAddress = resolveSellerEscrowWalletAddress(buyOrder);
      if (sellerEscrowWalletAddress) {
        await userCollection.updateOne(
          { 'seller.escrowWalletAddress': sellerEscrowWalletAddress },
          { $set: {
              'seller.buyOrder.transactionHash': data.transactionHash,
          } }
        );
      }

    }
  
    return {
      success: result.modifiedCount === 1,
    };

  } else {
    return {
      success: false,
    };
  }

}


// buyOrderConfirmPaymentReverted
export async function buyOrderConfirmPaymentReverted(data: any) {
  // tradeId
  if (!data.tradeId) {
    return null;
  }
  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  const result = await collection.updateOne(
    { tradeId: data.tradeId },
    { $set: {
      queueId: null,
    } }
  );
  return {
    success: result.modifiedCount === 1,
  };
}



// acceptBuyOrderPrivateSale
// insertBuyOrder function 을 참조
export type AcceptBuyOrderPrivateSaleProgressStatus =
  | 'processing'
  | 'completed'
  | 'error';

export type AcceptBuyOrderPrivateSaleProgressEvent = {
  step: string;
  title: string;
  description: string;
  status: AcceptBuyOrderPrivateSaleProgressStatus;
  occurredAt: string;
  detail?: string;
  data?: Record<string, unknown>;
};

export type AcceptBuyOrderPrivateSaleResult =
  | { success: true }
  | {
      success: false;
      error:
        | 'SELLER_NOT_FOUND'
        | 'SELLER_ESCROW_WALLET_MISSING'
        | 'BUYER_NOT_FOUND'
        | 'BUYER_ACCOUNT_HOLDER_MISSING'
        | 'INVALID_USDT_AMOUNT'
        | 'THIRDWEB_SECRET_KEY_MISSING'
        | 'BUYER_ESCROW_WALLET_CREATE_FAILED'
        | 'BUYER_ESCROW_WALLET_EMPTY'
        | 'PLATFORM_FEE_WALLET_NOT_CONFIGURED'
        | 'ESCROW_TRANSFER_FAILED'
        | 'BUYORDER_INSERT_FAILED';
      detail?: string;
    };

export async function acceptBuyOrderPrivateSale(
  {
    buyerWalletAddress,
    sellerWalletAddress,
    buyerStorecode,
    usdtAmount,
    krwAmount,
    requesterIpAddress = '',
    onProgress,
  }: {
    buyerWalletAddress: string;
    sellerWalletAddress: string;
    buyerStorecode?: string;
    usdtAmount: number;
    krwAmount?: number;
    requesterIpAddress?: string;
    onProgress?: (
      event: AcceptBuyOrderPrivateSaleProgressEvent,
    ) => void | Promise<void>;
  }): Promise<AcceptBuyOrderPrivateSaleResult> {

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

    const emitProgress = async ({
      step,
      title,
      description,
      status,
      detail,
      data,
    }: {
      step: string;
      title: string;
      description: string;
      status: AcceptBuyOrderPrivateSaleProgressStatus;
      detail?: string;
      data?: Record<string, unknown>;
    }) => {
      if (!onProgress) {
        return;
      }
      try {
        await onProgress({
          step,
          title,
          description,
          status,
          occurredAt: new Date().toISOString(),
          ...(detail ? { detail } : {}),
          ...(data ? { data } : {}),
        });
      } catch (progressError) {
        console.warn('acceptBuyOrderPrivateSale progress callback failed', progressError);
      }
    };

    const normalizedSellerWalletAddress = String(sellerWalletAddress || '').trim();
    const normalizedBuyerWalletAddress = String(buyerWalletAddress || '').trim();
    const normalizedBuyerStorecode = String(buyerStorecode || '').trim();
    const resolvedBuyerStorecode = normalizedBuyerStorecode || 'admin';
    const sellerWalletRegex = {
      $regex: `^${escapeRegex(normalizedSellerWalletAddress)}$`,
      $options: 'i',
    };
    const buyerWalletRegex = {
      $regex: `^${escapeRegex(normalizedBuyerWalletAddress)}$`,
      $options: 'i',
    };

    // new buyorder for private sale
    const client = await clientPromise;

    // get seller information from users collection
    // and seller usdtToKrwRate
    const usersCollection = client.db(dbName).collection('users');
    const seller = await usersCollection.findOne<any>(
      {
        storecode: 'admin',
        walletAddress: sellerWalletRegex,
      },
      { projection: { storecode: 1, nickname: 1, avatar: 1, seller: 1, agentcode: 1, walletAddress: 1 } }
    );

    if (!seller) {
      console.log('acceptBuyOrderPrivateSale: seller not found for walletAddress: ' + sellerWalletAddress);
      return { success: false, error: 'SELLER_NOT_FOUND' };
    }

    const usdtToKrwRate = seller.seller.usdtToKrwRate || 1;
    const sellerEscrowWalletAddress = (() => {
      const candidates = [
        seller?.seller?.escrowWalletAddress,
        seller?.seller?.escrowWallet?.smartAccountAddress,
      ];
      for (const candidate of candidates) {
        const normalized = String(candidate || '').trim();
        if (isWalletAddress(normalized)) {
          return normalized;
        }
      }
      return '';
    })();
    const sellerEscrowWalletSignerAddressFromSeller = String(
      seller?.seller?.escrowWalletSignerAddress
      || seller?.seller?.escrowWallet?.signerAddress
      || ''
    ).trim();
    const sellerEscrowWalletSmartAccountAddressFromSeller = String(
      seller?.seller?.escrowWallet?.smartAccountAddress
      || sellerEscrowWalletAddress
      || ''
    ).trim();

    if (!isWalletAddress(sellerEscrowWalletAddress)) {
      console.log('acceptBuyOrderPrivateSale: seller escrow wallet is missing for walletAddress: ' + sellerWalletAddress);
      return { success: false, error: 'SELLER_ESCROW_WALLET_MISSING' };
    }

    const matchedSellerWalletAddress =
      typeof seller.walletAddress === 'string' && seller.walletAddress.trim()
        ? seller.walletAddress.trim()
        : normalizedSellerWalletAddress;

    await emitProgress({
      step: 'SELLER_VALIDATED',
      title: '판매자 확인',
      description: '판매자 정보와 에스크로 지갑을 확인했습니다.',
      status: 'completed',
      data: {
        sellerWalletAddress: matchedSellerWalletAddress || normalizedSellerWalletAddress,
      },
    });

    const sellerBankInfo =
      seller?.seller?.bankInfo && typeof seller.seller.bankInfo === 'object'
        ? seller.seller.bankInfo
        : {};
    const sellerPaymentMethods = Array.isArray(seller?.seller?.paymentMethods)
      ? seller.seller.paymentMethods
          .map((item: any) => String(item || '').trim())
          .filter(Boolean)
      : [];
    const sellerBankName = String(sellerBankInfo?.bankName || '').trim();
    const sellerAccountNumber = String(sellerBankInfo?.accountNumber || '').trim();
    const sellerAccountHolder = String(sellerBankInfo?.accountHolder || '').trim();
    const sellerContactMemo = String(sellerBankInfo?.contactMemo || '').trim();
    const isSellerContactTransfer = sellerBankName === '연락처송금';
    const normalizedPaymentMethod =
      sellerPaymentMethods[0]
      || (isSellerContactTransfer ? 'contact' : (sellerBankName ? 'bank' : ''));



    // get buyer information from users collection
    const buyer = await usersCollection.findOne<any>(
      {
        storecode: resolvedBuyerStorecode,
        walletAddress: buyerWalletRegex,
      },
      { projection: { nickname: 1, avatar: 1, buyer: 1, walletAddress: 1 } }
    );

    if (!buyer) {
      console.log(
        'acceptBuyOrderPrivateSale: buyer not found for storecode/walletAddress:',
        resolvedBuyerStorecode,
        buyerWalletAddress,
      );
      return { success: false, error: 'BUYER_NOT_FOUND' };
    }

    const buyerAccountHolder = String(
      buyer?.buyer?.bankInfo?.accountHolder
      || buyer?.buyer?.bankInfo?.depositName
      || buyer?.buyer?.depositName
      || '',
    ).trim();

    if (!buyerAccountHolder) {
      console.log('acceptBuyOrderPrivateSale: buyer does not have a deposit/account holder for walletAddress: ' + buyerWalletAddress);
      return { success: false, error: 'BUYER_ACCOUNT_HOLDER_MISSING' };
    }

    const matchedBuyerWalletAddress =
      typeof buyer.walletAddress === 'string' && buyer.walletAddress.trim()
        ? buyer.walletAddress.trim()
        : normalizedBuyerWalletAddress;

    await emitProgress({
      step: 'BUYER_VALIDATED',
      title: '구매자 확인',
      description: '구매자 지갑 및 입금자명 정보를 확인했습니다.',
      status: 'completed',
      data: {
        buyerWalletAddress: matchedBuyerWalletAddress || normalizedBuyerWalletAddress,
      },
    });
    const matchedSellerWalletRegex = {
      $regex: `^${escapeRegex(matchedSellerWalletAddress)}$`,
      $options: 'i',
    };
    const matchedBuyerWalletRegex = {
      $regex: `^${escapeRegex(matchedBuyerWalletAddress)}$`,
      $options: 'i',
    };
    const normalizedRequesterIpAddress = normalizeIpAddress(requesterIpAddress);

 
    const collection = client.db(dbName).collection('buyorders');

    // new buyorder document
    // generate new buyorder tradeId like insertBuyOrder function
    
    const tradeId = Math.floor(Math.random() * 900000000) + 100000000 + '';

    // Keep requested KRW amount as-is when provided.
    // Fall back to server-side calculation only when KRW is omitted.
    const normalizedUsdtAmount = roundDownUsdtAmount(usdtAmount);
    const calculatedKrwAmount = calculateKrwAmountFromUsdtAndRate({
      usdtAmount: normalizedUsdtAmount,
      rate: usdtToKrwRate,
    });
    const normalizedRequestedKrwAmount =
      typeof krwAmount === 'number' && Number.isFinite(krwAmount) && krwAmount > 0
        ? Math.floor(krwAmount)
        : 0;
    const normalizedKrwAmount =
      normalizedRequestedKrwAmount > 0
        ? normalizedRequestedKrwAmount
        : calculatedKrwAmount;

    if (!Number.isFinite(normalizedUsdtAmount) || normalizedUsdtAmount <= 0) {
      console.error('acceptBuyOrderPrivateSale: invalid normalized usdt amount', normalizedUsdtAmount);
      return { success: false, error: 'INVALID_USDT_AMOUNT' };
    }
    if (!Number.isFinite(normalizedKrwAmount) || normalizedKrwAmount <= 0) {
      console.error('acceptBuyOrderPrivateSale: invalid normalized krw amount', {
        normalizedUsdtAmount,
        usdtToKrwRate,
        normalizedKrwAmount,
      });
      return { success: false, error: 'INVALID_USDT_AMOUNT' };
    }
    if (
      normalizedRequestedKrwAmount > 0
      && normalizedRequestedKrwAmount !== calculatedKrwAmount
    ) {
      console.warn('acceptBuyOrderPrivateSale: requested krw amount mismatch preserved', {
        buyerWalletAddress: matchedBuyerWalletAddress,
        sellerWalletAddress: matchedSellerWalletAddress,
        requestedKrwAmount: normalizedRequestedKrwAmount,
        calculatedKrwAmount,
        normalizedKrwAmount,
        normalizedUsdtAmount,
        rate: usdtToKrwRate,
      });
    }

    await emitProgress({
      step: 'AMOUNT_VALIDATED',
      title: '주문 금액 확정',
      description: 'USDT/KRW 주문 금액과 환율 정보를 확정했습니다.',
      status: 'completed',
      data: {
        usdtAmount: normalizedUsdtAmount,
        krwAmount: normalizedKrwAmount,
        rate: usdtToKrwRate,
      },
    });

    const resolvedPlatformFee = resolvePrivateOrderPlatformFee({
      order: null,
      sellerUser: seller,
    });
    const platformFeeUsdtAmount =
      resolvedPlatformFee.feeRatePercent > 0
        ? roundDownUsdtAmount((normalizedUsdtAmount * resolvedPlatformFee.feeRatePercent) / 100)
        : 0;
    const shouldTransferPlatformFee = platformFeeUsdtAmount > 0;

    if (shouldTransferPlatformFee && !isWalletAddress(resolvedPlatformFee.feeWalletAddress)) {
      console.error('acceptBuyOrderPrivateSale: platform fee wallet is missing', {
        sellerWalletAddress: matchedSellerWalletAddress,
        feeRatePercent: resolvedPlatformFee.feeRatePercent,
        feeWalletAddress: resolvedPlatformFee.feeWalletAddress,
      });
      return { success: false, error: 'PLATFORM_FEE_WALLET_NOT_CONFIGURED' };
    }

    await emitProgress({
      step: 'PLATFORM_FEE_VALIDATED',
      title: '수수료 설정 확인',
      description: '플랫폼 수수료 설정과 락업 수량을 확인했습니다.',
      status: 'completed',
      data: {
        platformFeeRatePercent: resolvedPlatformFee.feeRatePercent,
        platformFeeUsdtAmount,
        escrowLockUsdtAmount: roundDownUsdtAmount(normalizedUsdtAmount + platformFeeUsdtAmount),
      },
    });

    const escrowLockUsdtAmount = roundDownUsdtAmount(normalizedUsdtAmount + platformFeeUsdtAmount);

    // create a dedicated buyer escrow smart wallet address (thirdweb server wallet)
    const thirdwebSecretKey = process.env.THIRDWEB_SECRET_KEY || '';
    if (!thirdwebSecretKey) {
      console.log('acceptBuyOrderPrivateSale: THIRDWEB_SECRET_KEY is missing');
      return { success: false, error: 'THIRDWEB_SECRET_KEY_MISSING' };
    }

    const thirdwebClient = createThirdwebClient({ secretKey: thirdwebSecretKey });

    let buyerEscrowWalletAddress = '';
    let buyerEscrowSignerAddress = '';
    let buyerEscrowSmartAccountAddress = '';
    try {
      const createdServerWallet = await Engine.createServerWallet({
        client: thirdwebClient,
        label: `private-buy-${matchedBuyerWalletAddress.slice(0, 8)}-${Date.now()}`,
      });
      buyerEscrowSignerAddress = String((createdServerWallet as any)?.address || '').trim();
      buyerEscrowSmartAccountAddress = String((createdServerWallet as any)?.smartAccountAddress || '').trim();
      cacheEngineWalletResolution({
        signerAddress: buyerEscrowSignerAddress,
        smartAccountAddress: buyerEscrowSmartAccountAddress,
      });
      buyerEscrowWalletAddress = resolveEngineWalletAddress(createdServerWallet);
    } catch (error) {
      console.error('acceptBuyOrderPrivateSale: failed to create buyer escrow wallet', error);
      return {
        success: false,
        error: 'BUYER_ESCROW_WALLET_CREATE_FAILED',
        detail: toErrorMessage(error),
      };
    }

    if (!buyerEscrowWalletAddress) {
      console.error('acceptBuyOrderPrivateSale: buyer escrow wallet address is empty');
      return { success: false, error: 'BUYER_ESCROW_WALLET_EMPTY' };
    }

    await emitProgress({
      step: 'BUYER_ESCROW_WALLET_CREATED',
      title: '구매 에스크로 지갑 생성',
      description: '구매자 전용 에스크로 지갑 생성을 완료했습니다.',
      status: 'completed',
      data: {
        buyerEscrowWalletAddress,
      },
    });

    if (!isWalletAddress(buyerEscrowSignerAddress) || !isWalletAddress(buyerEscrowSmartAccountAddress)) {
      const buyerEscrowResolution = await resolveEngineWalletResolution({
        client: thirdwebClient,
        walletAddress: buyerEscrowWalletAddress,
      });
      if (!isWalletAddress(buyerEscrowSignerAddress)) {
        buyerEscrowSignerAddress = String(buyerEscrowResolution.signerAddress || '').trim();
      }
      if (!isWalletAddress(buyerEscrowSmartAccountAddress)) {
        buyerEscrowSmartAccountAddress = String(buyerEscrowResolution.smartAccountAddress || '').trim();
      }
    }

    let sellerEscrowSignerAddress = isWalletAddress(sellerEscrowWalletSignerAddressFromSeller)
      ? sellerEscrowWalletSignerAddressFromSeller
      : '';
    let sellerEscrowSmartAccountAddress = isWalletAddress(sellerEscrowWalletSmartAccountAddressFromSeller)
      ? sellerEscrowWalletSmartAccountAddressFromSeller
      : sellerEscrowWalletAddress;
    let sellerEscrowResolutionMatchedServerWallet = false;
    if (!isWalletAddress(sellerEscrowSignerAddress) || !isWalletAddress(sellerEscrowSmartAccountAddress)) {
      const sellerEscrowResolution = await resolveEngineWalletResolution({
        client: thirdwebClient,
        walletAddress: sellerEscrowWalletAddress,
      });
      const resolvedSignerAddress = String(sellerEscrowResolution.signerAddress || '').trim();
      const resolvedSmartAccountAddress = String(sellerEscrowResolution.smartAccountAddress || '').trim();
      if (
        isWalletAddress(resolvedSignerAddress)
        && isWalletAddress(resolvedSmartAccountAddress)
        && resolvedSignerAddress.toLowerCase() !== resolvedSmartAccountAddress.toLowerCase()
      ) {
        sellerEscrowResolutionMatchedServerWallet = true;
      }
      if (!isWalletAddress(sellerEscrowSignerAddress)) {
        sellerEscrowSignerAddress = resolvedSignerAddress;
      }
      if (!isWalletAddress(sellerEscrowSmartAccountAddress)) {
        sellerEscrowSmartAccountAddress = resolvedSmartAccountAddress;
      }
    }
    if (!isWalletAddress(sellerEscrowSmartAccountAddress)) {
      sellerEscrowSmartAccountAddress = sellerEscrowWalletAddress;
    }

    const hasTrustedSignerForBackfill =
      isWalletAddress(sellerEscrowWalletSignerAddressFromSeller)
      || sellerEscrowResolutionMatchedServerWallet;
    if (
      hasTrustedSignerForBackfill
      && isWalletAddress(sellerEscrowSignerAddress)
      && isWalletAddress(sellerEscrowSmartAccountAddress)
    ) {
      const normalizedStoredSigner = sellerEscrowWalletSignerAddressFromSeller.toLowerCase();
      const normalizedStoredSmart = sellerEscrowWalletSmartAccountAddressFromSeller.toLowerCase();
      const normalizedResolvedSigner = sellerEscrowSignerAddress.toLowerCase();
      const normalizedResolvedSmart = sellerEscrowSmartAccountAddress.toLowerCase();
      const normalizedStoredLegacyEscrow = sellerEscrowWalletAddress.toLowerCase();
      const shouldBackfillSellerEscrowWallet =
        normalizedStoredSigner !== normalizedResolvedSigner
        || normalizedStoredSmart !== normalizedResolvedSmart
        || normalizedStoredLegacyEscrow !== normalizedResolvedSmart;

      if (shouldBackfillSellerEscrowWallet) {
        const sellerUpdateFilter = seller?._id
          ? { _id: seller._id }
          : {
              storecode: 'admin',
              walletAddress: sellerWalletRegex,
            };

        await usersCollection.updateOne(
          sellerUpdateFilter as any,
          {
            $set: {
              'seller.escrowWalletAddress': sellerEscrowSmartAccountAddress,
              'seller.escrowWalletSignerAddress': sellerEscrowSignerAddress,
              'seller.escrowWallet': {
                signerAddress: sellerEscrowSignerAddress,
                smartAccountAddress: sellerEscrowSmartAccountAddress,
              },
            },
          },
        );
      }
    }

    const orderEscrowWalletSignerAddress =
      (isWalletAddress(buyerEscrowSignerAddress)
        ? buyerEscrowSignerAddress
        : (isWalletAddress(buyerEscrowWalletAddress) ? buyerEscrowWalletAddress : ''));
    const orderEscrowWalletSmartAccountAddress =
      (isWalletAddress(buyerEscrowSmartAccountAddress)
        ? buyerEscrowSmartAccountAddress
        : (isWalletAddress(buyerEscrowWalletAddress) ? buyerEscrowWalletAddress : ''));

    let escrowTransferTransactionHash = '';
    let escrowTransferTransactionId = '';
    const transferConfig = resolveUsdtTransferConfig();
    const usdtDecimals = resolveUsdtDecimals();
    const usdtContract = getContract({
      client: thirdwebClient,
      chain: transferConfig.chain,
      address: transferConfig.contractAddress,
    });
    try {
      const sellerEscrowWallet = await createEngineServerWallet({
        client: thirdwebClient,
        walletAddress: sellerEscrowWalletAddress,
        chain: transferConfig.chain,
      });
      const transferTx = transfer({
        contract: usdtContract,
        to: buyerEscrowWalletAddress,
        amount: escrowLockUsdtAmount,
      });

      const { transactionId } = await sellerEscrowWallet.enqueueTransaction({
        transaction: transferTx,
      });
      escrowTransferTransactionId = String(transactionId || '').trim();

      await emitProgress({
        step: 'ESCROW_TRANSFER_SUBMITTED',
        title: '에스크로 전송 요청',
        description: '판매자 에스크로에서 구매 에스크로로 전송을 요청했습니다.',
        status: 'processing',
        data: {
          transactionId: escrowTransferTransactionId,
          escrowLockUsdtAmount,
        },
      });

      const hashResult = await Engine.waitForTransactionHash({
        client: thirdwebClient,
        transactionId: escrowTransferTransactionId,
        timeoutInSeconds: 90,
      });
      const txHash = typeof hashResult?.transactionHash === 'string' ? hashResult.transactionHash : '';
      if (txHash) {
        escrowTransferTransactionHash = txHash;
      }
      if (!txHash) {
        throw new Error('empty transaction hash');
      }

      let transferConfirmed = false;
      for (let i = 0; i < 25; i += 1) {
        const txStatus = await Engine.getTransactionStatus({
          client: thirdwebClient,
          transactionId: escrowTransferTransactionId,
        });

        const statusTxHash =
          typeof (txStatus as any)?.transactionHash === 'string'
            ? String((txStatus as any).transactionHash)
            : '';
        if (statusTxHash) {
          escrowTransferTransactionHash = statusTxHash;
        }

        if (txStatus.status === 'FAILED') {
          throw new Error(txStatus.error || 'engine transaction failed');
        }

        if (txStatus.status === 'CONFIRMED') {
          if (txStatus.onchainStatus !== 'SUCCESS') {
            throw new Error(`engine transaction reverted: ${txStatus.onchainStatus}`);
          }
          const confirmedTxHash =
            typeof (txStatus as any)?.transactionHash === 'string'
              ? String((txStatus as any).transactionHash)
              : '';
          escrowTransferTransactionHash =
            confirmedTxHash
              ? confirmedTxHash
              : txHash;
          transferConfirmed = true;
          break;
        }

        await waitMs(1500);
      }

      if (!transferConfirmed) {
        throw new Error('engine transaction confirmation timeout');
      }

      await emitProgress({
        step: 'ESCROW_TRANSFER_CONFIRMED',
        title: '에스크로 전송 확인',
        description: '온체인 전송이 확인되었습니다.',
        status: 'completed',
        data: {
          transactionId: escrowTransferTransactionId,
          transactionHash: escrowTransferTransactionHash,
        },
      });
    } catch (error) {
      const reconciliation = await reconcileEscrowTransferOutcome({
        client: thirdwebClient,
        transactionId: escrowTransferTransactionId,
        usdtContract,
        recipientWalletAddress: buyerEscrowWalletAddress,
        expectedUsdtAmount: escrowLockUsdtAmount,
        usdtDecimals,
        knownTransactionHash: escrowTransferTransactionHash,
      });

      if (!reconciliation.success) {
        console.error('acceptBuyOrderPrivateSale: escrow transfer failed', error, reconciliation.detail);
        return {
          success: false,
          error: 'ESCROW_TRANSFER_FAILED',
          detail: [toErrorMessage(error), reconciliation.detail].filter(Boolean).join(' | '),
        };
      }

      if (reconciliation.transactionHash) {
        escrowTransferTransactionHash = reconciliation.transactionHash;
      }

      console.warn('acceptBuyOrderPrivateSale: escrow transfer reconciled after engine failure', {
        transactionId: escrowTransferTransactionId,
        transactionHash: escrowTransferTransactionHash,
        reason: reconciliation.reason,
        detail: reconciliation.detail,
      });

      await emitProgress({
        step: 'ESCROW_TRANSFER_CONFIRMED',
        title: '에스크로 전송 확인',
        description: '전송 상태를 조회해 최종 반영했습니다.',
        status: 'completed',
        detail: reconciliation.detail || '',
        data: {
          transactionId: escrowTransferTransactionId,
          transactionHash: escrowTransferTransactionHash,
          reconciliationReason: reconciliation.reason,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const privateSaleAgentcode = String(seller?.agentcode || '').trim();
    const privateSaleAgent = privateSaleAgentcode
      ? await client.db(dbName).collection('agents').findOne<any>(
          { agentcode: privateSaleAgentcode },
          {
            projection: {
              _id: 0,
              agentcode: 1,
              agentFeePercent: 1,
              platformFeePercent: 1,
              creditWallet: 1,
              smartAccountAddress: 1,
            },
          },
        )
      : null;
    const privateSaleClientInfo = await getClientInfoByClientId({
      mongoClient: client,
      clientId: String(process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || '').trim(),
    });
    const agentPlatformFee = resolveAgentPlatformFeeConfig({
      agent: privateSaleAgent,
      clientInfo: privateSaleClientInfo,
    });

    const newBuyOrder = {
      tradeId: tradeId,
      walletAddress: matchedBuyerWalletAddress,
      buyerIpAddress: normalizedRequesterIpAddress,
      ipAddress: normalizedRequesterIpAddress,
      isWeb3Wallet: true,
      nickname: buyer.nickname || '',
      avatar: buyer.avatar || '',
      privateSale: true,
      usdtAmount: normalizedUsdtAmount,
      escrowLockUsdtAmount,
      rate: usdtToKrwRate,
      krwAmount: normalizedKrwAmount,
      requestedKrwAmount: normalizedRequestedKrwAmount || undefined,
      tradeFeeRate: resolvedPlatformFee.feeRatePercent,
      centerFeeRate: resolvedPlatformFee.feeRatePercent,
      platformFeeRate: resolvedPlatformFee.feeRatePercent,
      platformFeeAmount: platformFeeUsdtAmount,
      platformFeeWalletAddress: resolvedPlatformFee.feeWalletAddress,
      platformFee: {
        percentage: resolvedPlatformFee.feeRatePercent,
        rate: resolvedPlatformFee.feeRatePercent,
        amount: platformFeeUsdtAmount,
        amountUsdt: platformFeeUsdtAmount,
        walletAddress: resolvedPlatformFee.feeWalletAddress,
        address: resolvedPlatformFee.feeWalletAddress,
        escrowLockAmount: escrowLockUsdtAmount,
        totalEscrowAmount: escrowLockUsdtAmount,
        source: resolvedPlatformFee.source,
      },
      agentPlatformFee,
      paymentMethod: normalizedPaymentMethod,
      paymentBankName: sellerBankName,
      storecode: 'admin',
      ...(privateSaleAgentcode ? { agentcode: privateSaleAgentcode } : {}),
      totalAmount: normalizedUsdtAmount,
      escrowWallet: {
        address: buyerEscrowWalletAddress,
        signerAddress: orderEscrowWalletSignerAddress,
        smartAccountAddress: orderEscrowWalletSmartAccountAddress,
        buyer: {
          signerAddress: isWalletAddress(buyerEscrowSignerAddress) ? buyerEscrowSignerAddress : '',
          smartAccountAddress: isWalletAddress(buyerEscrowSmartAccountAddress) ? buyerEscrowSmartAccountAddress : '',
        },
        seller: {
          signerAddress: isWalletAddress(sellerEscrowSignerAddress) ? sellerEscrowSignerAddress : '',
          smartAccountAddress: isWalletAddress(sellerEscrowSmartAccountAddress) ? sellerEscrowSmartAccountAddress : '',
        },
      },
      settlement: {
        platformFeePercent: resolvedPlatformFee.feeRatePercent,
        platformFeeAmount: platformFeeUsdtAmount,
        platformFeeWalletAddress: resolvedPlatformFee.feeWalletAddress,
        escrowLockUsdtAmount,
      },
      status: 'paymentRequested',
      createdAt: nowIso,
      acceptedAt: nowIso,
      paymentRequestedAt: nowIso,
      buyerConsent: {
        required: true,
        keyword: '동의함',
        status: 'pending',
        accepted: false,
        requestedAt: nowIso,
        reminderCount: 0,
      },
      buyer: {
        nickname: buyer.nickname || '',
        avatar: buyer.avatar || '',
        walletAddress: matchedBuyerWalletAddress,
        ipAddress: normalizedRequesterIpAddress,
        publicIpAddress: normalizedRequesterIpAddress,
        escrowWalletAddress: buyerEscrowWalletAddress,
        lockTransactionHash: escrowTransferTransactionHash,
        escrowLockedUsdtAmount: escrowLockUsdtAmount,
        depositName: buyerAccountHolder,
        depositCompleted: false,
      },
      seller: {
        agentcode: seller.agentcode || '',
        walletAddress: matchedSellerWalletAddress,
        escrowWalletAddress: sellerEscrowWalletAddress,
        lockTransactionHash: escrowTransferTransactionHash,
        escrowLockedUsdtAmount: escrowLockUsdtAmount,
        nickname: seller.nickname || '',
        avatar: seller.avatar || '',
        storecode: seller.storecode || '',
        paymentMethods: sellerPaymentMethods,
        bankInfo: {
          bankName: sellerBankName,
          accountNumber: sellerAccountNumber,
          accountHolder: sellerAccountHolder,
          contactMemo: sellerContactMemo,
        },
      },
    };

    try {
      const result = await collection.insertOne(newBuyOrder);
      if (!result.insertedId) {
        return {
          success: false,
          error: 'BUYORDER_INSERT_FAILED',
          detail: 'insertOne did not return insertedId',
        };
      }

      // buyOrder for objectid
      const buyOrder = await collection.findOne<any>(
        { _id: result.insertedId },
      );

      try {
        if (buyOrder) {
          await upsertAgentPlatformFeeReceivableForOrder({
            mongoClient: client,
            orderId: String(result.insertedId),
            orderLike: buyOrder,
          });
        }
      } catch (error) {
        console.error('acceptBuyOrderPrivateSale: failed to upsert agent platform fee receivable', error);
      }

      // seller buyOrder update
      await usersCollection.updateOne(
        {
          walletAddress: matchedSellerWalletRegex,
          storecode: 'admin',
        },
        { $set: {
          'seller.buyOrder': buyOrder,
        } }
      );

      // buyer buyOrderStatus update
      await usersCollection.updateOne(
        {
          walletAddress: matchedBuyerWalletRegex,
          storecode: 'admin',
        },
        {
          $set: {
            'buyer.buyOrderStatus': 'paymentRequested',
            buyOrderStatus: 'paymentRequested',
          },
        },
      );

      await emitProgress({
        step: 'ORDER_INSERTED',
        title: '주문 생성 완료',
        description: '주문이 저장되고 입금요청 상태로 전환되었습니다.',
        status: 'completed',
        data: {
          orderId: String(result.insertedId),
          tradeId,
          status: 'paymentRequested',
        },
      });


      return { success: true };
    } catch (error) {
      console.error('acceptBuyOrderPrivateSale: buyorder insert/update failed', error);
      return {
        success: false,
        error: 'BUYORDER_INSERT_FAILED',
        detail: toErrorMessage(error),
      };
    }
}

export type RecoverMissingPrivateBuyOrderResult =
  | {
      success: true;
      existed: boolean;
      orderId: string;
      tradeId: string;
    }
  | {
      success: false;
      error:
        | 'INVALID_INPUT'
        | 'SELLER_NOT_FOUND'
        | 'SELLER_ESCROW_WALLET_MISSING'
        | 'BUYER_NOT_FOUND'
        | 'BUYER_ACCOUNT_HOLDER_MISSING'
        | 'INVALID_USDT_AMOUNT'
        | 'PLATFORM_FEE_WALLET_NOT_CONFIGURED'
        | 'ACTIVE_TRADE_EXISTS'
        | 'BUYORDER_INSERT_FAILED';
      detail?: string;
    };

export async function recoverMissingPrivateBuyOrder(
  {
    buyerWalletAddress,
    sellerEscrowWalletAddress,
    buyerEscrowWalletAddress,
    transactionHash,
    transactionId = '',
    usdtAmount,
    confirmedAt,
    requesterWalletAddress = '',
    requesterIpAddress = '',
  }: {
    buyerWalletAddress: string;
    sellerEscrowWalletAddress: string;
    buyerEscrowWalletAddress: string;
    transactionHash: string;
    transactionId?: string;
    usdtAmount: number;
    confirmedAt?: string;
    requesterWalletAddress?: string;
    requesterIpAddress?: string;
  },
): Promise<RecoverMissingPrivateBuyOrderResult> {
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

  const normalizedBuyerWalletAddress = String(buyerWalletAddress || '').trim();
  const normalizedSellerEscrowWalletAddress = String(sellerEscrowWalletAddress || '').trim();
  const normalizedBuyerEscrowWalletAddress = String(buyerEscrowWalletAddress || '').trim();
  const normalizedTransactionHash = String(transactionHash || '').trim();
  const normalizedTransactionId = String(transactionId || '').trim();
  const normalizedRequesterWalletAddress = String(requesterWalletAddress || '').trim();
  const normalizedRequesterIpAddress = normalizeIpAddress(requesterIpAddress);
  const normalizedUsdtAmount = roundDownUsdtAmount(usdtAmount);

  if (
    !isWalletAddress(normalizedBuyerWalletAddress)
    || !isWalletAddress(normalizedSellerEscrowWalletAddress)
    || !isWalletAddress(normalizedBuyerEscrowWalletAddress)
    || !/^0x[a-fA-F0-9]{64}$/.test(normalizedTransactionHash)
    || !Number.isFinite(normalizedUsdtAmount)
    || normalizedUsdtAmount <= 0
  ) {
    return {
      success: false,
      error: 'INVALID_INPUT',
      detail: 'buyer/seller escrow wallet, transaction hash, usdt amount must be valid',
    };
  }

  const sellerEscrowWalletRegex = {
    $regex: `^${escapeRegex(normalizedSellerEscrowWalletAddress)}$`,
    $options: 'i',
  };
  const buyerWalletRegex = {
    $regex: `^${escapeRegex(normalizedBuyerWalletAddress)}$`,
    $options: 'i',
  };
  const transactionHashRegex = {
    $regex: `^${escapeRegex(normalizedTransactionHash)}$`,
    $options: 'i',
  };

  const client = await clientPromise;
  const usersCollection = client.db(dbName).collection('users');
  const buyordersCollection = client.db(dbName).collection('buyorders');

  const existingByTransactionHash = await buyordersCollection.findOne<any>(
    {
      $or: [
        { 'buyer.lockTransactionHash': transactionHashRegex },
        { 'seller.lockTransactionHash': transactionHashRegex },
      ],
    },
    {
      projection: {
        _id: 1,
        tradeId: 1,
      },
    },
  );
  if (existingByTransactionHash?._id) {
    return {
      success: true,
      existed: true,
      orderId: String(existingByTransactionHash._id),
      tradeId: String(existingByTransactionHash.tradeId || ''),
    };
  }

  const seller = await usersCollection.findOne<any>(
    {
      storecode: 'admin',
      $or: [
        { 'seller.escrowWalletAddress': sellerEscrowWalletRegex },
        { 'seller.escrowWallet.smartAccountAddress': sellerEscrowWalletRegex },
        { 'seller.escrowWalletSignerAddress': sellerEscrowWalletRegex },
        { 'seller.escrowWallet.signerAddress': sellerEscrowWalletRegex },
      ],
    },
    {
      projection: {
        walletAddress: 1,
        nickname: 1,
        avatar: 1,
        seller: 1,
        agentcode: 1,
        storecode: 1,
      },
    },
  );
  if (!seller) {
    return {
      success: false,
      error: 'SELLER_NOT_FOUND',
      detail: 'seller not found by escrow wallet address',
    };
  }

  const resolvedSellerEscrowWalletAddress = (() => {
    const candidates = [
      seller?.seller?.escrowWalletAddress,
      seller?.seller?.escrowWallet?.smartAccountAddress,
      normalizedSellerEscrowWalletAddress,
    ];
    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim();
      if (isWalletAddress(normalized)) {
        return normalized;
      }
    }
    return '';
  })();
  if (!isWalletAddress(resolvedSellerEscrowWalletAddress)) {
    return {
      success: false,
      error: 'SELLER_ESCROW_WALLET_MISSING',
    };
  }

  const buyer = await usersCollection.findOne<any>(
    {
      storecode: 'admin',
      walletAddress: buyerWalletRegex,
    },
    {
      projection: {
        walletAddress: 1,
        nickname: 1,
        avatar: 1,
        buyer: 1,
      },
    },
  );
  if (!buyer) {
    return {
      success: false,
      error: 'BUYER_NOT_FOUND',
    };
  }

  const buyerAccountHolder = String(
    buyer?.buyer?.bankInfo?.accountHolder
    || buyer?.buyer?.bankInfo?.depositName
    || buyer?.buyer?.depositName
    || '',
  ).trim();
  if (!buyerAccountHolder) {
    return {
      success: false,
      error: 'BUYER_ACCOUNT_HOLDER_MISSING',
    };
  }

  const matchedSellerWalletAddress =
    typeof seller.walletAddress === 'string' && seller.walletAddress.trim()
      ? seller.walletAddress.trim()
      : '';
  if (!isWalletAddress(matchedSellerWalletAddress)) {
    return {
      success: false,
      error: 'SELLER_NOT_FOUND',
      detail: 'seller wallet address is missing',
    };
  }

  const matchedBuyerWalletAddress =
    typeof buyer.walletAddress === 'string' && buyer.walletAddress.trim()
      ? buyer.walletAddress.trim()
      : normalizedBuyerWalletAddress;

  const matchedSellerWalletRegex = {
    $regex: `^${escapeRegex(matchedSellerWalletAddress)}$`,
    $options: 'i',
  };
  const matchedBuyerWalletRegex = {
    $regex: `^${escapeRegex(matchedBuyerWalletAddress)}$`,
    $options: 'i',
  };

  const existingActiveTrade = await buyordersCollection.findOne<any>(
    {
      privateSale: true,
      status: { $in: ['ordered', 'accepted', 'paymentRequested'] },
      walletAddress: matchedBuyerWalletRegex,
      'seller.walletAddress': matchedSellerWalletRegex,
    },
    {
      projection: {
        _id: 1,
        tradeId: 1,
      },
    },
  );
  if (existingActiveTrade?._id) {
    return {
      success: false,
      error: 'ACTIVE_TRADE_EXISTS',
      detail: `existing active tradeId=${String(existingActiveTrade.tradeId || '')}`,
    };
  }

  const usdtToKrwRate = Number(seller?.seller?.usdtToKrwRate || 0);
  if (!Number.isFinite(usdtToKrwRate) || usdtToKrwRate <= 0) {
    return {
      success: false,
      error: 'INVALID_USDT_AMOUNT',
      detail: 'seller usdtToKrwRate is invalid',
    };
  }

  const normalizedKrwAmount = calculateKrwAmountFromUsdtAndRate({
    usdtAmount: normalizedUsdtAmount,
    rate: usdtToKrwRate,
  });
  if (!Number.isFinite(normalizedKrwAmount) || normalizedKrwAmount <= 0) {
    return {
      success: false,
      error: 'INVALID_USDT_AMOUNT',
      detail: 'normalized krw amount is invalid',
    };
  }

  const sellerBankInfo =
    seller?.seller?.bankInfo && typeof seller.seller.bankInfo === 'object'
      ? seller.seller.bankInfo
      : {};
  const sellerPaymentMethods = Array.isArray(seller?.seller?.paymentMethods)
    ? seller.seller.paymentMethods
        .map((item: any) => String(item || '').trim())
        .filter(Boolean)
    : [];
  const sellerBankName = String(sellerBankInfo?.bankName || '').trim();
  const sellerAccountNumber = String(sellerBankInfo?.accountNumber || '').trim();
  const sellerAccountHolder = String(sellerBankInfo?.accountHolder || '').trim();
  const sellerContactMemo = String(sellerBankInfo?.contactMemo || '').trim();
  const isSellerContactTransfer = sellerBankName === '연락처송금';
  const normalizedPaymentMethod =
    sellerPaymentMethods[0]
    || (isSellerContactTransfer ? 'contact' : (sellerBankName ? 'bank' : ''));

  const resolvedPlatformFee = resolvePrivateOrderPlatformFee({
    order: null,
    sellerUser: seller,
  });
  const platformFeeUsdtAmount =
    resolvedPlatformFee.feeRatePercent > 0
      ? roundDownUsdtAmount((normalizedUsdtAmount * resolvedPlatformFee.feeRatePercent) / 100)
      : 0;
  const shouldTransferPlatformFee = platformFeeUsdtAmount > 0;

  if (shouldTransferPlatformFee && !isWalletAddress(resolvedPlatformFee.feeWalletAddress)) {
    return {
      success: false,
      error: 'PLATFORM_FEE_WALLET_NOT_CONFIGURED',
      detail: 'platform fee wallet is missing',
    };
  }

  const escrowLockUsdtAmount = roundDownUsdtAmount(normalizedUsdtAmount + platformFeeUsdtAmount);
  if (!Number.isFinite(escrowLockUsdtAmount) || escrowLockUsdtAmount <= 0) {
    return {
      success: false,
      error: 'INVALID_USDT_AMOUNT',
      detail: 'escrow lock amount is invalid',
    };
  }

  const thirdwebSecretKey = process.env.THIRDWEB_SECRET_KEY || '';
  const thirdwebClient = thirdwebSecretKey
    ? createThirdwebClient({ secretKey: thirdwebSecretKey })
    : null;

  let buyerEscrowSignerAddress = '';
  let buyerEscrowSmartAccountAddress = '';
  if (thirdwebClient) {
    const buyerEscrowResolution = await resolveEngineWalletResolution({
      client: thirdwebClient,
      walletAddress: normalizedBuyerEscrowWalletAddress,
    });
    buyerEscrowSignerAddress = String(buyerEscrowResolution.signerAddress || '').trim();
    buyerEscrowSmartAccountAddress = String(buyerEscrowResolution.smartAccountAddress || '').trim();
  }
  if (!isWalletAddress(buyerEscrowSignerAddress)) {
    buyerEscrowSignerAddress = normalizedBuyerEscrowWalletAddress;
  }
  if (!isWalletAddress(buyerEscrowSmartAccountAddress)) {
    buyerEscrowSmartAccountAddress = normalizedBuyerEscrowWalletAddress;
  }

  const sellerEscrowWalletSignerAddressFromSeller = String(
    seller?.seller?.escrowWalletSignerAddress
    || seller?.seller?.escrowWallet?.signerAddress
    || '',
  ).trim();
  const sellerEscrowWalletSmartAccountAddressFromSeller = String(
    seller?.seller?.escrowWallet?.smartAccountAddress
    || resolvedSellerEscrowWalletAddress
    || '',
  ).trim();

  let sellerEscrowSignerAddress = isWalletAddress(sellerEscrowWalletSignerAddressFromSeller)
    ? sellerEscrowWalletSignerAddressFromSeller
    : '';
  let sellerEscrowSmartAccountAddress = isWalletAddress(sellerEscrowWalletSmartAccountAddressFromSeller)
    ? sellerEscrowWalletSmartAccountAddressFromSeller
    : resolvedSellerEscrowWalletAddress;
  let sellerEscrowResolutionMatchedServerWallet = false;

  if (
    thirdwebClient
    && (!isWalletAddress(sellerEscrowSignerAddress) || !isWalletAddress(sellerEscrowSmartAccountAddress))
  ) {
    const sellerEscrowResolution = await resolveEngineWalletResolution({
      client: thirdwebClient,
      walletAddress: resolvedSellerEscrowWalletAddress,
    });
    const resolvedSignerAddress = String(sellerEscrowResolution.signerAddress || '').trim();
    const resolvedSmartAccountAddress = String(sellerEscrowResolution.smartAccountAddress || '').trim();
    if (
      isWalletAddress(resolvedSignerAddress)
      && isWalletAddress(resolvedSmartAccountAddress)
      && resolvedSignerAddress.toLowerCase() !== resolvedSmartAccountAddress.toLowerCase()
    ) {
      sellerEscrowResolutionMatchedServerWallet = true;
    }
    if (!isWalletAddress(sellerEscrowSignerAddress)) {
      sellerEscrowSignerAddress = resolvedSignerAddress;
    }
    if (!isWalletAddress(sellerEscrowSmartAccountAddress)) {
      sellerEscrowSmartAccountAddress = resolvedSmartAccountAddress;
    }
  }

  if (!isWalletAddress(sellerEscrowSignerAddress)) {
    sellerEscrowSignerAddress = resolvedSellerEscrowWalletAddress;
  }
  if (!isWalletAddress(sellerEscrowSmartAccountAddress)) {
    sellerEscrowSmartAccountAddress = resolvedSellerEscrowWalletAddress;
  }

  const hasTrustedSignerForBackfill =
    isWalletAddress(sellerEscrowWalletSignerAddressFromSeller)
    || sellerEscrowResolutionMatchedServerWallet;
  if (
    hasTrustedSignerForBackfill
    && isWalletAddress(sellerEscrowSignerAddress)
    && isWalletAddress(sellerEscrowSmartAccountAddress)
  ) {
    const normalizedStoredSigner = sellerEscrowWalletSignerAddressFromSeller.toLowerCase();
    const normalizedStoredSmart = sellerEscrowWalletSmartAccountAddressFromSeller.toLowerCase();
    const normalizedResolvedSigner = sellerEscrowSignerAddress.toLowerCase();
    const normalizedResolvedSmart = sellerEscrowSmartAccountAddress.toLowerCase();
    const normalizedStoredLegacyEscrow = resolvedSellerEscrowWalletAddress.toLowerCase();
    const shouldBackfillSellerEscrowWallet =
      normalizedStoredSigner !== normalizedResolvedSigner
      || normalizedStoredSmart !== normalizedResolvedSmart
      || normalizedStoredLegacyEscrow !== normalizedResolvedSmart;

    if (shouldBackfillSellerEscrowWallet) {
      await usersCollection.updateOne(
        { _id: seller._id },
        {
          $set: {
            'seller.escrowWalletAddress': sellerEscrowSmartAccountAddress,
            'seller.escrowWalletSignerAddress': sellerEscrowSignerAddress,
            'seller.escrowWallet': {
              signerAddress: sellerEscrowSignerAddress,
              smartAccountAddress: sellerEscrowSmartAccountAddress,
            },
          },
        },
      );
    }
  }

  const parsedConfirmedAtMs = confirmedAt ? new Date(confirmedAt).getTime() : Number.NaN;
  const recoveredAtIso = new Date().toISOString();
  const nowIso = Number.isFinite(parsedConfirmedAtMs)
    ? new Date(parsedConfirmedAtMs).toISOString()
    : recoveredAtIso;
  const privateSaleAgentcode = String(seller?.agentcode || '').trim();
  const privateSaleAgent = privateSaleAgentcode
    ? await client.db(dbName).collection('agents').findOne<any>(
        { agentcode: privateSaleAgentcode },
        {
          projection: {
            _id: 0,
            agentcode: 1,
            agentFeePercent: 1,
            platformFeePercent: 1,
            creditWallet: 1,
            smartAccountAddress: 1,
          },
        },
      )
    : null;
  const privateSaleClientInfo = await getClientInfoByClientId({
    mongoClient: client,
    clientId: String(process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || '').trim(),
  });
  const agentPlatformFee = resolveAgentPlatformFeeConfig({
    agent: privateSaleAgent,
    clientInfo: privateSaleClientInfo,
  });
  const tradeId = `${Math.floor(Math.random() * 900000000) + 100000000}`;

  const newBuyOrder = {
    tradeId,
    walletAddress: matchedBuyerWalletAddress,
    buyerIpAddress: normalizedRequesterIpAddress,
    ipAddress: normalizedRequesterIpAddress,
    isWeb3Wallet: true,
    nickname: buyer.nickname || '',
    avatar: buyer.avatar || '',
    privateSale: true,
    usdtAmount: normalizedUsdtAmount,
    escrowLockUsdtAmount,
    rate: usdtToKrwRate,
    krwAmount: normalizedKrwAmount,
    tradeFeeRate: resolvedPlatformFee.feeRatePercent,
    centerFeeRate: resolvedPlatformFee.feeRatePercent,
    platformFeeRate: resolvedPlatformFee.feeRatePercent,
    platformFeeAmount: platformFeeUsdtAmount,
    platformFeeWalletAddress: resolvedPlatformFee.feeWalletAddress,
    platformFee: {
      percentage: resolvedPlatformFee.feeRatePercent,
      rate: resolvedPlatformFee.feeRatePercent,
      amount: platformFeeUsdtAmount,
      amountUsdt: platformFeeUsdtAmount,
      walletAddress: resolvedPlatformFee.feeWalletAddress,
      address: resolvedPlatformFee.feeWalletAddress,
      escrowLockAmount: escrowLockUsdtAmount,
      totalEscrowAmount: escrowLockUsdtAmount,
      source: resolvedPlatformFee.source,
    },
    agentPlatformFee,
    paymentMethod: normalizedPaymentMethod,
    paymentBankName: sellerBankName,
    storecode: 'admin',
    ...(privateSaleAgentcode ? { agentcode: privateSaleAgentcode } : {}),
    totalAmount: normalizedUsdtAmount,
    escrowWallet: {
      address: normalizedBuyerEscrowWalletAddress,
      signerAddress: isWalletAddress(buyerEscrowSignerAddress) ? buyerEscrowSignerAddress : '',
      smartAccountAddress: isWalletAddress(buyerEscrowSmartAccountAddress) ? buyerEscrowSmartAccountAddress : '',
      buyer: {
        signerAddress: isWalletAddress(buyerEscrowSignerAddress) ? buyerEscrowSignerAddress : '',
        smartAccountAddress: isWalletAddress(buyerEscrowSmartAccountAddress) ? buyerEscrowSmartAccountAddress : '',
      },
      seller: {
        signerAddress: isWalletAddress(sellerEscrowSignerAddress) ? sellerEscrowSignerAddress : '',
        smartAccountAddress: isWalletAddress(sellerEscrowSmartAccountAddress) ? sellerEscrowSmartAccountAddress : '',
      },
    },
    settlement: {
      platformFeePercent: resolvedPlatformFee.feeRatePercent,
      platformFeeAmount: platformFeeUsdtAmount,
      platformFeeWalletAddress: resolvedPlatformFee.feeWalletAddress,
      escrowLockUsdtAmount,
    },
    status: 'paymentRequested',
    createdAt: nowIso,
    acceptedAt: nowIso,
    paymentRequestedAt: nowIso,
    buyerConsent: {
      required: true,
      keyword: '동의함',
      status: 'pending',
      accepted: false,
      requestedAt: nowIso,
      reminderCount: 0,
    },
    recovery: {
      type: 'MISSING_BUYORDER_RECOVERY',
      recoveredAt: recoveredAtIso,
      recoveredByWalletAddress: normalizedRequesterWalletAddress,
      sourceTransactionHash: normalizedTransactionHash,
      sourceTransactionId: normalizedTransactionId,
    },
    buyer: {
      nickname: buyer.nickname || '',
      avatar: buyer.avatar || '',
      walletAddress: matchedBuyerWalletAddress,
      ipAddress: normalizedRequesterIpAddress,
      publicIpAddress: normalizedRequesterIpAddress,
      escrowWalletAddress: normalizedBuyerEscrowWalletAddress,
      lockTransactionHash: normalizedTransactionHash,
      escrowLockedUsdtAmount: escrowLockUsdtAmount,
      depositName: buyerAccountHolder,
      depositCompleted: false,
    },
    seller: {
      agentcode: seller.agentcode || '',
      walletAddress: matchedSellerWalletAddress,
      escrowWalletAddress: resolvedSellerEscrowWalletAddress,
      lockTransactionHash: normalizedTransactionHash,
      escrowLockedUsdtAmount: escrowLockUsdtAmount,
      nickname: seller.nickname || '',
      avatar: seller.avatar || '',
      storecode: seller.storecode || '',
      paymentMethods: sellerPaymentMethods,
      bankInfo: {
        bankName: sellerBankName,
        accountNumber: sellerAccountNumber,
        accountHolder: sellerAccountHolder,
        contactMemo: sellerContactMemo,
      },
    },
  };

  try {
    const insertResult = await buyordersCollection.insertOne(newBuyOrder);
    if (!insertResult.insertedId) {
      return {
        success: false,
        error: 'BUYORDER_INSERT_FAILED',
        detail: 'insertOne did not return insertedId',
      };
    }

    const createdOrder = await buyordersCollection.findOne<any>(
      { _id: insertResult.insertedId },
    );

    try {
      if (createdOrder) {
        await upsertAgentPlatformFeeReceivableForOrder({
          mongoClient: client,
          orderId: String(insertResult.insertedId),
          orderLike: createdOrder,
        });
      }
    } catch (error) {
      console.error('recoverMissingPrivateBuyOrder: failed to upsert agent platform fee receivable', error);
    }

    await usersCollection.updateOne(
      {
        walletAddress: matchedSellerWalletRegex,
        storecode: 'admin',
      },
      {
        $set: {
          'seller.buyOrder': createdOrder,
        },
      },
    );

    await usersCollection.updateOne(
      {
        walletAddress: matchedBuyerWalletRegex,
        storecode: 'admin',
      },
      {
        $set: {
          'buyer.buyOrderStatus': 'paymentRequested',
          buyOrderStatus: 'paymentRequested',
        },
      },
    );

    return {
      success: true,
      existed: false,
      orderId: String(insertResult.insertedId),
      tradeId,
    };
  } catch (error) {
    console.error('recoverMissingPrivateBuyOrder: insert failed', error);
    return {
      success: false,
      error: 'BUYORDER_INSERT_FAILED',
      detail: toErrorMessage(error),
    };
  }
}
