'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { toast } from 'react-hot-toast';
import { useActiveAccount } from 'thirdweb/react';
import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider';
import GroupChannel from '@sendbird/uikit-react/GroupChannel';

import { client } from '@/app/client';
import { ConnectButton } from '@/components/WalletConnectButton';
import { useClientWallets } from '@/lib/useClientWallets';

type BuyOrderItem = {
  _id?: string;
  tradeId?: string;
  chain?: string;
  transactionHash?: string;
  cancelReleaseTransactionHash?: string;
  escrowTransactionHash?: string;
  privateSale?: boolean;
  status?: string;
  storecode?: string;
  canceller?: string;
  cancelledByRole?: string;
  cancelledByWalletAddress?: string;
  cancelledByNickname?: string;
  cancelledByIpAddress?: string;
  cancelledByUserAgent?: string;
  createdAt?: string;
  paymentRequestedAt?: string;
  paymentConfirmedAt?: string;
  paymentConfirmedByRole?: string;
  paymentConfirmedByWalletAddress?: string;
  paymentConfirmedByNickname?: string;
  paymentConfirmedByIpAddress?: string;
  paymentConfirmedByUserAgent?: string;
  cancelledAt?: string;
  krwAmount?: number;
  usdtAmount?: number;
  paymentMethod?: string;
  tradeFeeRate?: number;
  centerFeeRate?: number;
  platformFeeRate?: number;
  platformFeeAmount?: number;
  platformFeeWalletAddress?: string;
  walletAddress?: string;
  nickname?: string;
  platformFee?: {
    percentage?: number;
    rate?: number;
    address?: string;
    walletAddress?: string;
    amount?: number;
    amountUsdt?: number;
    buyerTransferAmount?: number;
    totalTransferAmount?: number;
  };
  buyer?: {
    walletAddress?: string;
    escrowWalletAddress?: string;
    nickname?: string;
    depositName?: string;
    rollbackTransactionHash?: string;
    releaseTransactionHash?: string;
    bankInfo?: {
      accountHolder?: string;
      depositName?: string;
    };
  };
  seller?: {
    walletAddress?: string;
    escrowWalletAddress?: string;
    nickname?: string;
    lockTransactionHash?: string;
    rollbackTransactionHash?: string;
    releaseTransactionHash?: string;
    bankInfo?: {
      bankName?: string;
      accountNumber?: string;
      accountHolder?: string;
      contactMemo?: string;
    };
  };
  paymentConfirmedBy?: {
    role?: string;
    walletAddress?: string;
    nickname?: string;
    ipAddress?: string;
    userAgent?: string;
    confirmedAt?: string;
  };
  agentcode?: string;
  agentName?: string;
  agentLogo?: string;
  agent?: {
    agentcode?: string;
    agentName?: string;
    agentLogo?: string;
    smartAccountAddress?: string;
    creditWallet?: {
      smartAccountAddress?: string;
    };
  };
  agentPlatformFee?: {
    percentage?: number;
    fromAddress?: string;
    toAddress?: string;
    amount?: number | string;
    amountUsdt?: number | string;
    expectedAmountUsdt?: number | string;
    transactionHash?: string;
    txHash?: string;
  };
  store?: {
    storeName?: string;
    storeLogo?: string;
  };
  settlement?: {
    platformFeePercent?: number;
    platformFeeAmount?: number | string;
    platformFeeWalletAddress?: string;
    buyerTransferAmount?: number | string;
    totalTransferAmount?: number | string;
  };
  buyerIpAddress?: string;
  ipAddress?: string;
  buyerConsent?: {
    status?: string;
    accepted?: boolean;
    acceptedAt?: string;
    requestedAt?: string;
    requestMessageSentAt?: string;
    channelUrl?: string;
  };
};

type EscrowWalletBalanceState = {
  loading: boolean;
  displayValue: string;
  error: string;
  lastCheckedAt: string;
  cooldownUntilMs: number;
};

const POLLING_INTERVAL_MS = 5000;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100];
const BALANCE_CHECK_COOLDOWN_MS = 10_000;
const walletAuthOptions = ['google', 'email', 'phone'];
const SENDBIRD_APP_ID = process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID
  || process.env.NEXT_PUBLIC_SENDBIRD_APP_ID
  || '';

type SearchFilters = {
  date: string;
  searchTradeId: string;
  searchBuyer: string;
  searchSellerId: string;
  searchDepositName: string;
  searchStoreName: string;
};

type CancelActorInfo = {
  role: string;
  nickname: string;
};

type CancelOrderProgressStepState = 'pending' | 'active' | 'completed' | 'error';

type CancelOrderProgressStepItem = {
  key: string;
  title: string;
  description: string;
  state: CancelOrderProgressStepState;
  updatedAt: string;
  detail?: string;
};

type CancelOrderProgressApiEvent =
  | {
      type: 'progress';
      step?: string;
      title?: string;
      description?: string;
      status?: 'processing' | 'completed' | 'error';
      occurredAt?: string;
      detail?: string;
      data?: Record<string, unknown>;
    }
  | {
      type: 'result';
      payload?: {
        result?: {
          success?: boolean;
          transactionHash?: string;
          cancelledAt?: string;
          transferSkipped?: boolean;
          transferSkipReason?: string;
          error?: string;
        };
      };
    }
  | {
      type: 'error';
      status?: number;
      payload?: {
        error?: string;
        message?: string;
        detail?: string;
      };
    };

type SellerSalesSummaryItem = {
  sellerWalletAddress: string;
  sellerNickname: string;
  sellerAvatar: string;
  totalKrwAmount: number;
  totalUsdtAmount: number;
  paymentConfirmedCount: number;
  latestCreatedAt: string;
};

type BuyerConsentSnapshot = {
  accepted: boolean;
  acceptedAt: string;
  requestedAt: string;
  channelUrl: string;
};

const ACTIVE_STATUSES = new Set(['ordered', 'accepted', 'paymentRequested']);
const PAYMENT_REQUEST_COUNTDOWN_LIMIT_MS = 30 * 60 * 1000;
const CANCEL_ORDER_PROGRESS_STEP_DEFINITIONS: Array<{
  key: string;
  title: string;
  description: string;
}> = [
  {
    key: 'REQUEST_VALIDATED',
    title: '요청 검증',
    description: '취소 요청 정보를 확인합니다.',
  },
  {
    key: 'ORDER_VALIDATED',
    title: '주문 확인',
    description: '취소 가능한 주문 상태를 확인합니다.',
  },
  {
    key: 'ESCROW_WALLET_VALIDATED',
    title: '에스크로 지갑 확인',
    description: '회수 대상 지갑 주소를 확인합니다.',
  },
  {
    key: 'ROLLBACK_AMOUNT_VALIDATED',
    title: '회수 수량 확인',
    description: '반환할 USDT 수량을 검증합니다.',
  },
  {
    key: 'ENGINE_READY',
    title: '서버 지갑 준비',
    description: '전송 실행 환경을 준비합니다.',
  },
  {
    key: 'ROLLBACK_TRANSFER_SUBMITTED',
    title: '에스크로 반환 요청',
    description: '구매 에스크로에서 판매자 에스크로로 반환을 요청합니다.',
  },
  {
    key: 'ROLLBACK_TRANSFER_CONFIRMED',
    title: '에스크로 반환 확인',
    description: '온체인 반환 완료를 확인합니다.',
  },
  {
    key: 'ORDER_CANCELLED',
    title: '주문 취소 반영',
    description: '주문 상태를 취소로 반영합니다.',
  },
  {
    key: 'SELLER_SNAPSHOT_UPDATED',
    title: '판매자 동기화',
    description: '판매자 주문 스냅샷을 갱신합니다.',
  },
  {
    key: 'BUYER_STATUS_UPDATED',
    title: '구매자 동기화',
    description: '구매자 주문 상태를 갱신합니다.',
  },
  {
    key: 'CANCEL_COMPLETED',
    title: '취소 처리 완료',
    description: '취소 처리가 최종 완료되었습니다.',
  },
];

const createInitialCancelOrderProgressSteps = (): CancelOrderProgressStepItem[] =>
  CANCEL_ORDER_PROGRESS_STEP_DEFINITIONS.map((item) => ({
    key: item.key,
    title: item.title,
    description: item.description,
    state: item.key === 'REQUEST_VALIDATED' ? 'active' : 'pending',
    updatedAt: '',
  }));

const getCancelOrderProgressStatusLabel = (state: CancelOrderProgressStepState) => {
  if (state === 'completed') return '완료';
  if (state === 'active') return '진행중';
  if (state === 'error') return '실패';
  return '대기';
};

const getCancelOrderProgressStyle = (state: CancelOrderProgressStepState) => {
  if (state === 'completed') {
    return {
      container: 'border-emerald-200 bg-emerald-50/70',
      badge: 'border-emerald-300 bg-emerald-100 text-emerald-700',
      title: 'text-emerald-900',
      description: 'text-emerald-700',
      status: 'text-emerald-700',
    };
  }
  if (state === 'active') {
    return {
      container: 'border-cyan-200 bg-cyan-50/70',
      badge: 'border-cyan-300 bg-cyan-100 text-cyan-700',
      title: 'text-cyan-900',
      description: 'text-cyan-700',
      status: 'text-cyan-700',
    };
  }
  if (state === 'error') {
    return {
      container: 'border-rose-200 bg-rose-50/80',
      badge: 'border-rose-300 bg-rose-100 text-rose-700',
      title: 'text-rose-900',
      description: 'text-rose-700',
      status: 'text-rose-700',
    };
  }
  return {
    container: 'border-slate-200 bg-white/90',
    badge: 'border-slate-300 bg-slate-100 text-slate-600',
    title: 'text-slate-700',
    description: 'text-slate-500',
    status: 'text-slate-500',
  };
};

const isAdminCancelablePrivateOrder = (order: BuyOrderItem) =>
  order?.privateSale === true && String(order?.status || '').trim() === 'paymentRequested';

const getStatusLabel = (status?: string | null) => {
  const normalized = String(status || '').trim();
  if (normalized === 'ordered') return '주문생성';
  if (normalized === 'accepted') return '주문접수';
  if (normalized === 'paymentRequested') return '입금요청';
  if (normalized === 'paymentConfirmed') return '입금확인';
  if (normalized === 'completed') return '거래완료';
  if (normalized === 'cancelled') return '주문취소';
  return normalized || '-';
};

const getStatusBadgeClassName = (status?: string | null) => {
  const normalized = String(status || '').trim();
  if (normalized === 'ordered') return 'border-slate-300 bg-slate-100 text-slate-700';
  if (normalized === 'accepted') return 'border-blue-300 bg-blue-100 text-blue-700';
  if (normalized === 'paymentRequested') return 'border-amber-300 bg-amber-100 text-amber-700';
  if (normalized === 'paymentConfirmed') return 'border-emerald-300 bg-emerald-100 text-emerald-700';
  if (normalized === 'completed') return 'border-cyan-300 bg-cyan-100 text-cyan-700';
  if (normalized === 'cancelled') return 'border-rose-300 bg-rose-100 text-rose-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
};

const formatKrw = (value?: number) =>
  new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number(value || 0));

const formatUsdt = (value?: number) =>
  new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(value || 0));

const formatRate = (value?: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '-';
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(numeric);
};

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatPercent = (value?: number) => {
  const numeric = toFiniteNumber(value);
  if (numeric <= 0) return '0';
  return (Math.round(numeric * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
};

const roundDownUsdtSix = (value: number) => {
  const numeric = toFiniteNumber(value);
  if (numeric <= 0) return 0;
  return Math.floor((numeric + Number.EPSILON) * 1_000_000) / 1_000_000;
};

const formatUsdtSix = (value?: number) =>
  new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(
    roundDownUsdtSix(Number(value || 0)),
  );

const getOrderPlatformFeeRate = (order: BuyOrderItem) => {
  const candidates = [
    order?.platformFeeRate,
    order?.platformFee?.rate,
    order?.platformFee?.percentage,
    order?.settlement?.platformFeePercent,
    order?.tradeFeeRate,
    order?.centerFeeRate,
  ];
  for (const candidate of candidates) {
    const numeric = toFiniteNumber(candidate);
    if (numeric > 0) return numeric;
  }
  return 0;
};

const getOrderPlatformFeeAmount = (order: BuyOrderItem) => {
  const candidates = [
    order?.platformFeeAmount,
    order?.platformFee?.amountUsdt,
    order?.platformFee?.amount,
    order?.settlement?.platformFeeAmount,
  ];
  for (const candidate of candidates) {
    const numeric = toFiniteNumber(candidate);
    if (numeric > 0) return numeric;
  }
  return 0;
};

const getOrderPlatformFeeWalletAddress = (order: BuyOrderItem) =>
  String(
    order?.platformFeeWalletAddress
    || order?.platformFee?.walletAddress
    || order?.platformFee?.address
    || order?.settlement?.platformFeeWalletAddress
    || '',
  ).trim();

const getOrderAgentPlatformFeeRate = (order: BuyOrderItem) => {
  const candidates = [
    order?.agentPlatformFee?.percentage,
  ];
  for (const candidate of candidates) {
    const numeric = toFiniteNumber(candidate);
    if (numeric > 0) return numeric;
  }
  return 0;
};

const getOrderAgentPlatformFeeAmount = (order: BuyOrderItem) => {
  const directCandidates = [
    order?.agentPlatformFee?.amountUsdt,
    order?.agentPlatformFee?.expectedAmountUsdt,
    order?.agentPlatformFee?.amount,
  ];
  for (const candidate of directCandidates) {
    const numeric = roundDownUsdtSix(Number(candidate || 0));
    if (numeric > 0) return numeric;
  }

  const usdtAmount = roundDownUsdtSix(toFiniteNumber(order?.usdtAmount));
  const feePercent = getOrderAgentPlatformFeeRate(order);
  if (usdtAmount <= 0 || feePercent <= 0) return 0;

  return roundDownUsdtSix((usdtAmount * feePercent) / 100);
};

const getOrderAgentPlatformFeeFromAddress = (order: BuyOrderItem) =>
  String(order?.agentPlatformFee?.fromAddress || '').trim();

const getOrderAgentPlatformFeeToAddress = (order: BuyOrderItem) =>
  String(order?.agentPlatformFee?.toAddress || '').trim();

const getOrderAgentPlatformFeeTransactionHash = (order: BuyOrderItem) =>
  String(
    order?.agentPlatformFee?.transactionHash
    || order?.agentPlatformFee?.txHash
    || (order as any)?.agentPlatformFeeTransactionHash
    || '',
  ).trim();

const getOrderExchangeRate = (order: BuyOrderItem) => {
  const explicitRate = toFiniteNumber((order as any)?.rate);
  if (explicitRate > 0) return explicitRate;

  const krwAmount = toFiniteNumber(order?.krwAmount);
  const usdtAmount = toFiniteNumber(order?.usdtAmount);
  if (krwAmount > 0 && usdtAmount > 0) return krwAmount / usdtAmount;

  return 0;
};

const getDisplayKrwAmount = (order: BuyOrderItem) => {
  const storedKrwAmount = Math.floor(toFiniteNumber(order?.krwAmount));
  if (storedKrwAmount <= 0) return 0;

  const usdtAmount = roundDownUsdtSix(toFiniteNumber(order?.usdtAmount));
  const rate = getOrderExchangeRate(order);
  if (usdtAmount <= 0 || rate <= 0) return storedKrwAmount;

  const recalculatedKrwAmount = Math.round(usdtAmount * rate);
  if (Math.abs(recalculatedKrwAmount - storedKrwAmount) <= 1) {
    return recalculatedKrwAmount;
  }
  return storedKrwAmount;
};

const getOrderAgentCode = (order: BuyOrderItem) =>
  String(order?.agent?.agentcode || order?.agentcode || (order as any)?.seller?.agentcode || '').trim();

const getOrderAgentName = (order: BuyOrderItem) => {
  const explicitName = String(order?.agent?.agentName || order?.agentName || '').trim();
  if (explicitName) return explicitName;
  const agentcode = getOrderAgentCode(order);
  if (agentcode) return `에이전트 ${agentcode}`;
  return '-';
};

const getOrderAgentLogo = (order: BuyOrderItem) =>
  String(order?.agent?.agentLogo || order?.agentLogo || '').trim();

const getOrderAgentCreditWalletAddress = (order: BuyOrderItem) =>
  String(
    order?.agent?.creditWallet?.smartAccountAddress
    || order?.agent?.smartAccountAddress
    || (order as any)?.agentPlatformFee?.fromAddress
    || '',
  ).trim();

const getPaymentRequestedRemainingMs = (order: BuyOrderItem, nowMs: number) => {
  const baseTimeSource = String(order?.paymentRequestedAt || order?.createdAt || '').trim();
  if (!baseTimeSource) return null;

  const baseTime = new Date(baseTimeSource).getTime();
  if (Number.isNaN(baseTime)) return null;

  return baseTime + PAYMENT_REQUEST_COUNTDOWN_LIMIT_MS - nowMs;
};

const formatCountdownLabel = (remainingMs: number | null) => {
  if (remainingMs === null) return '남은 --:--';
  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const seconds = String(remainingSeconds % 60).padStart(2, '0');
  return `남은 ${minutes}:${seconds}`;
};

const TX_EXPLORER_BASE_BY_CHAIN: Record<string, string> = {
  ethereum: 'https://etherscan.io/tx/',
  polygon: 'https://polygonscan.com/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  bsc: 'https://bscscan.com/tx/',
};

const normalizeChainKey = (value?: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'eth') return 'ethereum';
  if (normalized === 'matic') return 'polygon';
  if (normalized === 'arb') return 'arbitrum';
  if (normalized === 'bnb') return 'bsc';
  return normalized;
};

const resolveTransferTransactionHash = (order: BuyOrderItem) =>
  String(
    order?.transactionHash
    || order?.buyer?.releaseTransactionHash
    || order?.seller?.releaseTransactionHash
    || '',
  ).trim();

const resolveCancelRecoveryTransactionHash = (order: BuyOrderItem) =>
  String(
    order?.cancelReleaseTransactionHash
    || order?.buyer?.rollbackTransactionHash
    || order?.seller?.rollbackTransactionHash
    || '',
  ).trim();

const resolveTransferChain = (order: BuyOrderItem) => {
  const chainFromOrder = normalizeChainKey(order?.chain);
  if (chainFromOrder) return chainFromOrder;
  return normalizeChainKey(process.env.NEXT_PUBLIC_CHAIN) || 'polygon';
};

const getTransferExplorerUrlByHash = (order: BuyOrderItem, txHash: string) => {
  const normalizedTxHash = String(txHash || '').trim();
  if (!normalizedTxHash) return '';

  const chain = resolveTransferChain(order);
  const explorerBaseUrl = TX_EXPLORER_BASE_BY_CHAIN[chain];
  if (!explorerBaseUrl) return '';

  return `${explorerBaseUrl}${normalizedTxHash}`;
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const shortWallet = (value?: string) => {
  const source = String(value || '').trim();
  if (!source) return '-';
  if (source.length <= 12) return source;
  return `${source.slice(0, 6)}...${source.slice(-4)}`;
};

const normalizeWalletKey = (walletAddress: string) => String(walletAddress || '').trim().toLowerCase();

const isWalletAddress = (value: unknown) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

const resolveOrderEscrowWalletAddress = (order: BuyOrderItem) => {
  const candidates = [
    order?.buyer?.escrowWalletAddress,
    order?.seller?.escrowWalletAddress,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (isWalletAddress(normalized)) {
      return normalized;
    }
  }
  return '';
};

const formatUsdtBalanceDisplayValue = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(parsed);
};

const getSellerDisplayName = (item: SellerSalesSummaryItem) =>
  String(item?.sellerNickname || '').trim() || shortWallet(item?.sellerWalletAddress) || '-';

const getSellerAvatarFallback = (item: SellerSalesSummaryItem) => {
  const name = getSellerDisplayName(item).replace(/\s+/g, '');
  if (!name || name === '-') return 'S';
  return name.slice(0, 1).toUpperCase();
};

const getPaymentMethodLabel = (order: BuyOrderItem) => {
  const method = String(order?.paymentMethod || '').trim().toLowerCase();
  const bankName = String(order?.seller?.bankInfo?.bankName || '').trim();

  if ((!method || method === 'bank') && bankName === '연락처송금') return '연락처송금';
  if (method === 'bank') return '은행송금';
  if (method === 'card') return '카드';
  if (method === 'pg') return 'PG';
  if (method === 'cash') return '현금';
  if (method === 'crypto') return '암호화폐';
  if (method === 'giftcard') return '기프트카드';
  if (method === 'mkrw') return 'MKRW';
  if (bankName) return bankName;
  return '기타';
};

const isContactTransferPayment = (order: BuyOrderItem) => {
  const method = String(order?.paymentMethod || '').trim().toLowerCase();
  const bankName = String(order?.seller?.bankInfo?.bankName || '').trim();
  return bankName === '연락처송금' || method === 'contact';
};

const getPaymentMethodDetail = (order: BuyOrderItem) => {
  if (isContactTransferPayment(order)) {
    return String(order?.seller?.bankInfo?.contactMemo || '').trim() || '-';
  }

  const method = String(order?.paymentMethod || '').trim().toLowerCase();
  const bankName = String(order?.seller?.bankInfo?.bankName || '').trim();
  const accountNumber = String(order?.seller?.bankInfo?.accountNumber || '').trim();
  const accountHolder = String(order?.seller?.bankInfo?.accountHolder || '').trim();
  const isBankInfoPayment = method === 'bank' || Boolean(bankName || accountNumber || accountHolder);
  if (!isBankInfoPayment) return '-';

  const bankInfoParts = [bankName, accountNumber, accountHolder].filter(Boolean);
  return bankInfoParts.join(' ').trim() || '-';
};

const getBuyerIdLabel = (order: BuyOrderItem) =>
  String(order?.buyer?.nickname || order?.nickname || '').trim() || '-';

const getBuyerDepositNameLabel = (order: BuyOrderItem) =>
  String(
    order?.buyer?.depositName
    || order?.buyer?.bankInfo?.accountHolder
    || order?.buyer?.bankInfo?.depositName
    || '',
  ).trim() || '-';

const getOrderBuyerConsentSnapshot = (order: BuyOrderItem): BuyerConsentSnapshot => {
  const consent = order?.buyerConsent && typeof order.buyerConsent === 'object'
    ? order.buyerConsent
    : null;
  const status = String(consent?.status || '').trim().toLowerCase();
  const accepted = consent?.accepted === true || status === 'accepted';
  const acceptedAt = String(consent?.acceptedAt || '').trim();
  const requestedAt = String(consent?.requestedAt || consent?.requestMessageSentAt || '').trim();
  const channelUrl = String(consent?.channelUrl || '').trim();

  return {
    accepted,
    acceptedAt,
    requestedAt,
    channelUrl,
  };
};

const getBuyerIp = (order: BuyOrderItem) => {
  const candidates = [
    order?.buyerIpAddress,
    order?.ipAddress,
    (order as any)?.buyer?.ipAddress,
    (order as any)?.buyer?.publicIpAddress,
    (order as any)?.buyer?.buyOrder?.ipAddress,
    (order as any)?.buyer?.buyOrder?.publicIpAddress,
    (order as any)?.buyer?.buyOrder?.createdByIpAddress,
    (order as any)?.buyer?.buyOrder?.cancelledByIpAddress,
    (order as any)?.buyer?.buyOrder?.paymentConfirmedByIpAddress,
    String(order?.cancelledByRole || '').trim().toLowerCase() === 'buyer' ? order?.cancelledByIpAddress : '',
    String(order?.paymentConfirmedByRole || '').trim().toLowerCase() === 'buyer' ? order?.paymentConfirmedByIpAddress : '',
  ];

  for (const candidate of candidates) {
    const normalizedIpAddress = String(candidate || '').trim();
    if (normalizedIpAddress) {
      return normalizedIpAddress;
    }
  }

  return '-';
};

const resolveCancellerRole = (order: BuyOrderItem): 'buyer' | 'seller' | 'admin' | 'agent' | 'unknown' => {
  const role = String(order?.cancelledByRole || order?.canceller || '').trim().toLowerCase();

  if (role === 'buyer' || role.includes('구매')) return 'buyer';
  if (role === 'seller' || role.includes('판매')) return 'seller';
  if (role === 'admin' || role.includes('관리')) return 'admin';
  if (role === 'agent' || role.includes('에이전트')) return 'agent';
  return 'unknown';
};

const getCancellerRoleLabel = (order: BuyOrderItem) => {
  const role = resolveCancellerRole(order);
  if (role === 'buyer') return '구매자';
  if (role === 'seller') return '판매자';
  if (role === 'admin') return '관리자';
  if (role === 'agent') return '에이전트';
  return '미확인';
};

const getCancellerLabel = (order: BuyOrderItem) => {
  const nickname = String(order?.cancelledByNickname || '').trim();
  const walletAddress = String(order?.cancelledByWalletAddress || '').trim();
  const role = resolveCancellerRole(order);

  if (nickname && walletAddress) return `${nickname} (${shortWallet(walletAddress)})`;
  if (nickname) return nickname;
  if (walletAddress) return shortWallet(walletAddress);
  if (role === 'buyer') return '구매자';
  if (role === 'seller') return '판매자';
  if (role === 'admin') return '관리자';
  if (role === 'agent') return '에이전트';
  return '-';
};

const getCancellerIp = (order: BuyOrderItem) => {
  const candidates = [
    order?.cancelledByIpAddress,
    (order as any)?.cancelledBy?.ipAddress,
    (order as any)?.seller?.buyOrder?.cancelledByIpAddress,
    (order as any)?.buyer?.buyOrder?.cancelledByIpAddress,
  ];

  for (const candidate of candidates) {
    const normalizedIpAddress = String(candidate || '').trim();
    if (normalizedIpAddress) {
      return normalizedIpAddress;
    }
  }

  return '-';
};

const resolvePaymentConfirmerRole = (order: BuyOrderItem): 'buyer' | 'seller' | 'admin' | 'unknown' => {
  const role = String(order?.paymentConfirmedByRole || order?.paymentConfirmedBy?.role || '').trim().toLowerCase();
  if (role === 'buyer' || role.includes('구매')) return 'buyer';
  if (role === 'seller' || role.includes('판매')) return 'seller';
  if (role === 'admin' || role.includes('관리')) return 'admin';
  return 'unknown';
};

const getPaymentConfirmerLabel = (order: BuyOrderItem) => {
  const nickname = String(
    order?.paymentConfirmedByNickname
    || order?.paymentConfirmedBy?.nickname
    || order?.seller?.nickname
    || '',
  ).trim();
  const walletAddress = String(
    order?.paymentConfirmedByWalletAddress
    || order?.paymentConfirmedBy?.walletAddress
    || order?.seller?.walletAddress
    || '',
  ).trim();
  const role = resolvePaymentConfirmerRole(order);

  if (nickname && walletAddress) return `${nickname} (${shortWallet(walletAddress)})`;
  if (nickname) return nickname;
  if (walletAddress) return shortWallet(walletAddress);
  if (role === 'buyer') return '구매자';
  if (role === 'seller') return '판매자';
  if (role === 'admin') return '관리자';
  return '-';
};

const getPaymentConfirmerIp = (order: BuyOrderItem) =>
  String(order?.paymentConfirmedByIpAddress || order?.paymentConfirmedBy?.ipAddress || '').trim() || '-';

const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createDefaultFilters = (): SearchFilters => {
  const today = getTodayDate();
  return {
    date: today,
    searchTradeId: '',
    searchBuyer: '',
    searchSellerId: '',
    searchDepositName: '',
    searchStoreName: '',
  };
};

export default function BuyOrderManagementPage() {
  const activeAccount = useActiveAccount();
  const adminWalletAddress = String(activeAccount?.address || '').trim();
  const isWalletConnected = Boolean(adminWalletAddress);
  const { wallet, wallets } = useClientWallets({ authOptions: walletAuthOptions });

  const [orders, setOrders] = useState<BuyOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>('');
  const [totalCount, setTotalCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [summary, setSummary] = useState({
    totalKrwAmount: 0,
    totalUsdtAmount: 0,
    totalFeeAmount: 0,
  });
  const [sellerSalesSummary, setSellerSalesSummary] = useState<SellerSalesSummaryItem[]>([]);
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [cancelTargetOrder, setCancelTargetOrder] = useState<BuyOrderItem | null>(null);
  const [cancelingOrder, setCancelingOrder] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelProgressSteps, setCancelProgressSteps] =
    useState<CancelOrderProgressStepItem[]>(createInitialCancelOrderProgressSteps());
  const [cancelProgressSummary, setCancelProgressSummary] = useState('취소 요청 전입니다.');
  const [cancelProgressPhase, setCancelProgressPhase] = useState<'idle' | 'processing' | 'completed' | 'error'>('idle');
  const [copiedTradeId, setCopiedTradeId] = useState('');
  const [copiedWalletAddress, setCopiedWalletAddress] = useState('');
  const [escrowWalletBalanceByAddress, setEscrowWalletBalanceByAddress] = useState<
    Record<string, EscrowWalletBalanceState>
  >({});
  const [escrowWalletBalanceTickMs, setEscrowWalletBalanceTickMs] = useState(() => Date.now());
  const [cancelActorInfo, setCancelActorInfo] = useState<CancelActorInfo>({
    role: 'admin',
    nickname: '관리자',
  });
  const [publicIpAddress, setPublicIpAddress] = useState('');
  const [loadingPublicIpAddress, setLoadingPublicIpAddress] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isOrderChatDrawerOpen, setIsOrderChatDrawerOpen] = useState(false);
  const [selectedOrderChatChannelUrl, setSelectedOrderChatChannelUrl] = useState('');
  const [selectedOrderChatTradeId, setSelectedOrderChatTradeId] = useState('');
  const [orderChatSessionToken, setOrderChatSessionToken] = useState<string | null>(null);
  const [orderChatSessionLoading, setOrderChatSessionLoading] = useState(false);
  const [orderChatSessionError, setOrderChatSessionError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const requestInFlightRef = useRef(false);
  const initializedRef = useRef(false);

  const fetchPublicIpAddress = useCallback(async () => {
    setLoadingPublicIpAddress(true);
    try {
      let resolvedIpAddress = '';

      try {
        const response = await fetch('/api/server/getServerInfo', {
          method: 'GET',
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
          resolvedIpAddress = String(payload?.ipAddress || '').trim();
        }
      } catch (serverIpError) {
        console.error('Failed to fetch server side ip address', serverIpError);
      }

      if (!resolvedIpAddress) {
        const ipifyResponse = await fetch('https://api64.ipify.org?format=json', {
          method: 'GET',
          cache: 'no-store',
        });
        const ipifyPayload = await ipifyResponse.json().catch(() => ({}));
        if (ipifyResponse.ok) {
          resolvedIpAddress = String(ipifyPayload?.ip || '').trim();
        }
      }

      setPublicIpAddress(resolvedIpAddress);
    } catch (fetchPublicIpError) {
      console.error('Failed to fetch public ip address', fetchPublicIpError);
      setPublicIpAddress('');
    } finally {
      setLoadingPublicIpAddress(false);
    }
  }, []);

  useEffect(() => {
    void fetchPublicIpAddress();
  }, [fetchPublicIpAddress]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const hasActiveEscrowWalletBalanceCooldown = useMemo(
    () =>
      Object.values(escrowWalletBalanceByAddress).some(
        (item) => Number(item?.cooldownUntilMs || 0) > escrowWalletBalanceTickMs,
      ),
    [escrowWalletBalanceByAddress, escrowWalletBalanceTickMs],
  );

  useEffect(() => {
    if (!hasActiveEscrowWalletBalanceCooldown) return;
    const intervalId = window.setInterval(() => {
      setEscrowWalletBalanceTickMs(Date.now());
    }, 200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasActiveEscrowWalletBalanceCooldown]);

  useEffect(() => {
    let isMounted = true;
    const fetchCancelActorInfo = async () => {
      const resolvedWalletAddress = String(adminWalletAddress || '').trim();
      if (!resolvedWalletAddress) {
        if (isMounted) {
          setCancelActorInfo({
            role: 'admin',
            nickname: '관리자',
          });
        }
        return;
      }

      try {
        const response = await fetch('/api/user/getUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storecode: 'admin',
            walletAddress: resolvedWalletAddress,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error || 'FAILED_TO_FETCH_ADMIN_PROFILE'));
        }

        const role = String(payload?.result?.role || 'admin').trim().toLowerCase() || 'admin';
        const nickname = String(payload?.result?.nickname || '').trim()
          || (role === 'agent' ? '에이전트' : '관리자');
        if (!isMounted) return;
        setCancelActorInfo({
          role,
          nickname,
        });
      } catch (fetchActorError) {
        console.error('Failed to fetch cancel actor info', fetchActorError);
        if (!isMounted) return;
        setCancelActorInfo({
          role: 'admin',
          nickname: '관리자',
        });
      }
    };

    void fetchCancelActorInfo();
    return () => {
      isMounted = false;
    };
  }, [adminWalletAddress]);

  const cancelActorRole = String(cancelActorInfo.role || 'admin').trim().toLowerCase() || 'admin';
  const cancelActorRoleLabel = cancelActorRole === 'agent' ? '에이전트' : '관리자';
  const cancelActorNickname = String(cancelActorInfo.nickname || '').trim()
    || (cancelActorRole === 'agent' ? '에이전트' : '관리자');

  useEffect(() => {
    if (!isOrderChatDrawerOpen) {
      setOrderChatSessionError(null);
      return;
    }
    if (!SENDBIRD_APP_ID) {
      setOrderChatSessionToken(null);
      setOrderChatSessionError('채팅 설정이 비어 있습니다. NEXT_PUBLIC_SENDBIRD_APP_ID 값을 확인해 주세요.');
      return;
    }
    if (!adminWalletAddress) {
      setOrderChatSessionToken(null);
      setOrderChatSessionError('관리자 지갑 연결이 필요합니다.');
      return;
    }

    let cancelled = false;
    const issueSessionToken = async () => {
      setOrderChatSessionLoading(true);
      setOrderChatSessionError(null);
      try {
        const response = await fetch('/api/sendbird/session-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: adminWalletAddress,
            nickname: cancelActorNickname || `admin_${adminWalletAddress.slice(0, 6)}`,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.sessionToken) {
          throw new Error(payload?.error || '관리자 채팅 세션 토큰 발급에 실패했습니다.');
        }
        if (!cancelled) {
          setOrderChatSessionToken(String(payload.sessionToken));
        }
      } catch (sessionError: any) {
        if (!cancelled) {
          setOrderChatSessionToken(null);
          setOrderChatSessionError(String(sessionError?.message || '채팅 세션 발급에 실패했습니다.'));
        }
      } finally {
        if (!cancelled) {
          setOrderChatSessionLoading(false);
        }
      }
    };

    void issueSessionToken();
    return () => {
      cancelled = true;
    };
  }, [adminWalletAddress, cancelActorNickname, isOrderChatDrawerOpen]);

  const fetchLatestBuyOrders = useCallback(async (mode: 'initial' | 'query' | 'polling' = 'query') => {
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    if (mode === 'polling') {
      setPolling(true);
    } else {
      setLoading(true);
    }

    try {
      const selectedDate = appliedFilters.date || getTodayDate();

      const response = await fetch('/api/order/getBuyOrderDashboardList', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: 'admin',
          limit: pageSize,
          page: pageNumber,
          searchStoreName: appliedFilters.searchStoreName || '',
          searchTradeId: appliedFilters.searchTradeId || '',
          searchBuyer: appliedFilters.searchBuyer || '',
          searchSellerId: appliedFilters.searchSellerId || '',
          searchDepositName: appliedFilters.searchDepositName || '',
          fromDate: selectedDate,
          toDate: selectedDate,
          privateSaleMode: 'all',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || '구매주문 목록 조회에 실패했습니다.');
      }

      const fetchedOrders = Array.isArray(payload?.result?.orders) ? payload.result.orders : [];
      if (!mountedRef.current) return;

      setOrders(fetchedOrders);
      setTotalCount(Number(payload?.result?.totalCount || 0) || 0);
      setSummary({
        totalKrwAmount: Number(payload?.result?.totalKrwAmount || 0) || 0,
        totalUsdtAmount: Number(payload?.result?.totalUsdtAmount || 0) || 0,
        totalFeeAmount: Number(payload?.result?.totalPlatformFeeAmount || 0) || 0,
      });
      const nextSellerSalesSummary = Array.isArray(payload?.result?.sellerSalesSummary)
        ? payload.result.sellerSalesSummary
        : [];
      setSellerSalesSummary(
        nextSellerSalesSummary.map((item: any) => ({
          sellerWalletAddress: String(item?.sellerWalletAddress || '').trim(),
          sellerNickname: String(item?.sellerNickname || '').trim(),
          sellerAvatar: String(item?.sellerAvatar || '').trim(),
          totalKrwAmount: Number(item?.totalKrwAmount || 0) || 0,
          totalUsdtAmount: Number(item?.totalUsdtAmount || 0) || 0,
          paymentConfirmedCount: Number(item?.paymentConfirmedCount || item?.orderCount || 0) || 0,
          latestCreatedAt: String(item?.latestCreatedAt || '').trim(),
        })),
      );
      setError(null);
      setLastUpdatedAt(new Date().toISOString());
    } catch (fetchError: any) {
      if (!mountedRef.current) return;
      const message = String(fetchError?.message || '구매주문 목록 조회 중 오류가 발생했습니다.');
      setError(message);
      if (mode !== 'polling') {
        toast.error(message);
      }
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setPolling(false);
      }
    }
  }, [appliedFilters, pageNumber, pageSize]);

  useEffect(() => {
    mountedRef.current = true;
    fetchLatestBuyOrders(initializedRef.current ? 'query' : 'initial');
    initializedRef.current = true;

    const interval = setInterval(() => {
      fetchLatestBuyOrders('polling');
    }, POLLING_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchLatestBuyOrders]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / pageSize)),
    [totalCount, pageSize],
  );

  useEffect(() => {
    if (pageNumber > totalPages) {
      setPageNumber(totalPages);
    }
  }, [pageNumber, totalPages]);

  const dashboardStats = useMemo(() => {
    let activeCount = 0;
    const statusCountMap = new Map<string, number>();

    orders.forEach((order) => {
      const status = String(order?.status || '').trim() || 'unknown';
      statusCountMap.set(status, (statusCountMap.get(status) || 0) + 1);
      if (ACTIVE_STATUSES.has(status)) {
        activeCount += 1;
      }
    });

    const statusItems = [...statusCountMap.entries()].sort((a, b) => b[1] - a[1]);

    return {
      totalCount,
      totalKrwAmount: summary.totalKrwAmount,
      totalUsdtAmount: summary.totalUsdtAmount,
      totalFeeAmount: summary.totalFeeAmount,
      activeCount,
      statusItems,
    };
  }, [orders, summary.totalFeeAmount, summary.totalKrwAmount, summary.totalUsdtAmount, totalCount]);

  const sellerSalesSummarySorted = useMemo(
    () => [...sellerSalesSummary].sort((a, b) => (
      (b.totalKrwAmount - a.totalKrwAmount)
      || (b.totalUsdtAmount - a.totalUsdtAmount)
      || (b.paymentConfirmedCount - a.paymentConfirmedCount)
    )),
    [sellerSalesSummary],
  );

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isWalletConnected) {
      toast.error('지갑을 연결해주세요.');
      return;
    }
    const normalizedFilters: SearchFilters = {
      date: draftFilters.date || getTodayDate(),
      searchTradeId: draftFilters.searchTradeId.trim(),
      searchBuyer: draftFilters.searchBuyer.trim(),
      searchSellerId: draftFilters.searchSellerId.trim(),
      searchDepositName: draftFilters.searchDepositName.trim(),
      searchStoreName: draftFilters.searchStoreName.trim(),
    };
    setPageNumber(1);
    setAppliedFilters(normalizedFilters);
  };

  const handleSearchReset = () => {
    if (!isWalletConnected) {
      toast.error('지갑을 연결해주세요.');
      return;
    }
    const defaults = createDefaultFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setPageNumber(1);
  };

  const resetCancelOrderProgressFlow = useCallback(() => {
    setCancelProgressSteps(createInitialCancelOrderProgressSteps());
    setCancelProgressSummary('취소 요청 전입니다.');
    setCancelProgressPhase('idle');
  }, []);

  const resolveCancelProgressDetail = useCallback(
    (event: Extract<CancelOrderProgressApiEvent, { type: 'progress' }>) => {
      const detail = typeof event.detail === 'string' ? event.detail.trim() : '';
      if (detail) {
        return detail;
      }

      const data = event.data;
      if (!data || typeof data !== 'object') {
        return '';
      }

      const transactionHash =
        typeof data.transactionHash === 'string' ? data.transactionHash.trim() : '';
      const transactionId =
        typeof data.transactionId === 'string' ? data.transactionId.trim() : '';
      const tradeId = typeof data.tradeId === 'string' ? data.tradeId.trim() : '';

      if (transactionHash) return `Tx: ${transactionHash}`;
      if (transactionId) return `Queue: ${transactionId}`;
      if (tradeId) return `TID: ${tradeId}`;
      return '';
    },
    [],
  );

  const applyCancelProgressEvent = useCallback(
    (event: Extract<CancelOrderProgressApiEvent, { type: 'progress' }>) => {
      const stepKey = typeof event.step === 'string' ? event.step.trim() : '';
      const incomingTitle = typeof event.title === 'string' ? event.title.trim() : '';
      const incomingDescription =
        typeof event.description === 'string' ? event.description.trim() : '';
      const occurredAt =
        typeof event.occurredAt === 'string' && event.occurredAt
          ? event.occurredAt
          : new Date().toISOString();
      const status =
        event.status === 'completed' || event.status === 'error' || event.status === 'processing'
          ? event.status
          : 'processing';
      const nextState: CancelOrderProgressStepState =
        status === 'completed' ? 'completed' : status === 'error' ? 'error' : 'active';
      const detail = resolveCancelProgressDetail(event);

      setCancelProgressSteps((prev) => {
        const stepIndex = prev.findIndex((item) => item.key === stepKey);
        const withSettledActive = prev.map((item, index) => {
          if (
            item.state === 'active'
            && status !== 'error'
            && (stepIndex < 0 || index !== stepIndex)
          ) {
            return {
              ...item,
              state: 'completed' as CancelOrderProgressStepState,
              updatedAt: item.updatedAt || occurredAt,
            };
          }
          return item;
        });

        if (!stepKey) {
          return withSettledActive;
        }

        if (stepIndex >= 0) {
          return withSettledActive.map((item, index) => {
            if (index !== stepIndex) {
              return item;
            }
            return {
              ...item,
              title: incomingTitle || item.title,
              description: incomingDescription || item.description,
              state: nextState,
              updatedAt: occurredAt,
              detail: detail || item.detail,
            };
          });
        }

        return [
          ...withSettledActive,
          {
            key: stepKey,
            title: incomingTitle || stepKey,
            description: incomingDescription || '',
            state: nextState,
            updatedAt: occurredAt,
            ...(detail ? { detail } : {}),
          },
        ];
      });

      const stepTitle = incomingTitle || stepKey || '취소 처리';
      if (status === 'error') {
        setCancelProgressPhase('error');
        setCancelProgressSummary(`${stepTitle} 단계에서 오류가 발생했습니다.`);
        return;
      }

      if ((stepKey === 'CANCEL_COMPLETED' || stepKey === 'CANCEL_RESULT_READY') && status === 'completed') {
        setCancelProgressPhase('completed');
        setCancelProgressSummary('주문 취소가 완료되었습니다.');
        return;
      }

      setCancelProgressPhase('processing');
      setCancelProgressSummary(
        status === 'completed'
          ? `${stepTitle} 단계를 완료했습니다.`
          : `${stepTitle} 단계를 처리중입니다.`,
      );
    },
    [resolveCancelProgressDetail],
  );

  const markCancelProgressAsError = useCallback((message: string) => {
    const occurredAt = new Date().toISOString();
    setCancelProgressPhase('error');
    setCancelProgressSummary(message);
    setCancelProgressSteps((prev) => {
      const activeIndex = prev.findIndex((item) => item.state === 'active');
      if (activeIndex < 0) {
        return prev;
      }
      return prev.map((item, index) => {
        if (index !== activeIndex) {
          return item;
        }
        return {
          ...item,
          state: 'error' as CancelOrderProgressStepState,
          updatedAt: occurredAt,
          detail: message,
        };
      });
    });
  }, []);

  const closeCancelOrderModal = () => {
    if (cancelingOrder) return;
    setCancelTargetOrder(null);
    setCancelError(null);
    resetCancelOrderProgressFlow();
  };

  const cancelPrivateOrderByAdmin = useCallback(async () => {
    const failCancel = (message: string) => {
      setCancelError(message);
      markCancelProgressAsError(message);
      toast.error(message);
      return false;
    };

    if (!isWalletConnected) {
      return failCancel('지갑을 연결해주세요.');
    }
    const targetOrderId = String(cancelTargetOrder?._id || '').trim();
    if (!targetOrderId) {
      return failCancel('취소할 주문 식별자를 찾을 수 없습니다.');
    }
    if (cancelingOrder) return false;

    setCancelingOrder(true);
    setCancelError(null);
    setCancelProgressSteps(createInitialCancelOrderProgressSteps());
    setCancelProgressPhase('processing');
    setCancelProgressSummary('요청 검증 단계를 처리중입니다.');

    try {
      type CancelApiPayload = {
        result?: {
          success?: boolean;
          transactionHash?: string;
          cancelledAt?: string;
          transferSkipped?: boolean;
          transferSkipReason?: string;
          error?: string;
        };
        message?: string;
        detail?: string;
        error?: string;
      };

      const resolveApiErrorMessage = (payload?: {
        message?: string;
        detail?: string;
        error?: string;
      }) =>
        payload?.message
        || payload?.detail
        || payload?.error
        || '주문 취소 처리에 실패했습니다.';

      const response = await fetch('/api/order/cancelPrivateBuyOrderByAdminToBuyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: targetOrderId,
          adminWalletAddress,
          cancelledByRole: cancelActorRole,
          cancelledByNickname: cancelActorNickname,
          cancelledByIpAddress: String(publicIpAddress || '').trim(),
          cancelledByUserAgent: typeof window !== 'undefined' ? window.navigator.userAgent : '',
          liveProgress: true,
        }),
      });

      let payload: CancelApiPayload | null = null;
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/x-ndjson')) {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('실시간 취소 진행 상태를 읽을 수 없습니다.');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let streamResult: CancelApiPayload | null = null;
        let streamErrorMessage = '';

        const handleStreamLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return;
          }
          try {
            const parsed = JSON.parse(trimmed) as CancelOrderProgressApiEvent;
            if (parsed.type === 'progress') {
              applyCancelProgressEvent(parsed);
              return;
            }
            if (parsed.type === 'result') {
              if (parsed.payload && typeof parsed.payload === 'object') {
                streamResult = parsed.payload as CancelApiPayload;
              }
              return;
            }
            if (parsed.type === 'error') {
              streamErrorMessage = resolveApiErrorMessage(parsed.payload);
            }
          } catch (parseError) {
            console.warn('cancelPrivateOrderByAdmin progress line parse failed', parseError);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(0), { stream: !done });

          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex >= 0) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            handleStreamLine(line);
            newlineIndex = buffer.indexOf('\n');
          }

          if (done) {
            break;
          }
        }

        if (buffer.trim()) {
          handleStreamLine(buffer);
        }

        if (streamErrorMessage) {
          throw new Error(streamErrorMessage);
        }
        const finalizedStreamResult = streamResult as CancelApiPayload | null;
        const streamSucceeded = finalizedStreamResult?.result?.success === true;
        if (!response.ok || !streamSucceeded) {
          throw new Error(resolveApiErrorMessage(finalizedStreamResult || undefined));
        }
        payload = finalizedStreamResult;
      } else {
        payload = (await response.json().catch(() => ({}))) as CancelApiPayload;
        if (!response.ok || !payload?.result?.success) {
          throw new Error(resolveApiErrorMessage(payload));
        }
      }

      const txHash = String(payload?.result?.transactionHash || '').trim();
      const transferSkipped = payload?.result?.transferSkipped === true;
      const transferSkipReason = String(payload?.result?.transferSkipReason || '').trim();

      if (transferSkipped && transferSkipReason === 'ALREADY_RECOVERED') {
        toast.success('주문 취소 완료 (이미 회수됨, 전송 생략)');
      } else {
        toast.success(txHash ? `주문 취소 완료 (TX: ${shortWallet(txHash)})` : '주문 취소 완료');
      }

      setCancelProgressPhase('completed');
      setCancelProgressSummary('주문 취소가 완료되었습니다.');
      await fetchLatestBuyOrders('query');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '주문 취소 처리 중 오류가 발생했습니다.';
      return failCancel(message);
    } finally {
      setCancelingOrder(false);
    }
  }, [
    adminWalletAddress,
    applyCancelProgressEvent,
    cancelActorNickname,
    cancelActorRole,
    cancelTargetOrder?._id,
    cancelingOrder,
    fetchLatestBuyOrders,
    isWalletConnected,
    markCancelProgressAsError,
    publicIpAddress,
  ]);

  const cancelProgressPhaseMeta = useMemo(() => {
    if (cancelProgressPhase === 'processing') {
      return {
        container: 'border-cyan-200 bg-cyan-50/70',
        badge: 'border-cyan-300 bg-cyan-100 text-cyan-700',
        summary: 'text-cyan-800',
        label: '처리중',
      };
    }
    if (cancelProgressPhase === 'completed') {
      return {
        container: 'border-emerald-200 bg-emerald-50/70',
        badge: 'border-emerald-300 bg-emerald-100 text-emerald-700',
        summary: 'text-emerald-800',
        label: '완료',
      };
    }
    if (cancelProgressPhase === 'error') {
      return {
        container: 'border-rose-200 bg-rose-50/80',
        badge: 'border-rose-300 bg-rose-100 text-rose-700',
        summary: 'text-rose-800',
        label: '실패',
      };
    }
    return {
      container: 'border-slate-200 bg-slate-50/60',
      badge: 'border-slate-300 bg-slate-100 text-slate-600',
      summary: 'text-slate-700',
      label: '대기',
    };
  }, [cancelProgressPhase]);

  const isCancelOrderActionCompleted = cancelProgressPhase === 'completed';
  const cancelOrderActionLabel = (() => {
    if (cancelingOrder) return '취소 처리 중...';
    if (isCancelOrderActionCompleted) return '확인';
    if (cancelProgressPhase === 'error') return '다시 시도';
    return 'USDT 반환 후 주문 취소';
  })();

  const confirmCancelOrderFromModal = async () => {
    if (isCancelOrderActionCompleted) {
      closeCancelOrderModal();
      return;
    }
    await cancelPrivateOrderByAdmin();
  };

  useEffect(() => {
    if (isWalletConnected) return;
    setCancelTargetOrder(null);
    setCancelError(null);
    resetCancelOrderProgressFlow();
  }, [isWalletConnected, resetCancelOrderProgressFlow]);

  const copyTradeId = useCallback(async (tradeId: string) => {
    const normalizedTradeId = String(tradeId || '').trim();
    if (!normalizedTradeId) return;

    try {
      await navigator.clipboard.writeText(normalizedTradeId);
      setCopiedTradeId(normalizedTradeId);
      window.setTimeout(() => {
        setCopiedTradeId((prev) => (prev === normalizedTradeId ? '' : prev));
      }, 1500);
    } catch (error) {
      console.error('Failed to copy trade id', error);
    }
  }, []);

  const copyWalletAddress = useCallback(async (walletAddress: string) => {
    const normalizedWalletAddress = String(walletAddress || '').trim();
    if (!normalizedWalletAddress) return;

    try {
      await navigator.clipboard.writeText(normalizedWalletAddress);
      setCopiedWalletAddress(normalizedWalletAddress);
      window.setTimeout(() => {
        setCopiedWalletAddress((prev) => (prev === normalizedWalletAddress ? '' : prev));
      }, 1500);
    } catch (error) {
      console.error('Failed to copy wallet address', error);
    }
  }, []);

  const handleCheckEscrowWalletBalance = useCallback(async (walletAddress: string) => {
    const normalizedWalletAddress = String(walletAddress || '').trim();
    if (!isWalletAddress(normalizedWalletAddress)) return;

    const walletKey = normalizeWalletKey(normalizedWalletAddress);
    const now = Date.now();
    const currentState = escrowWalletBalanceByAddress[walletKey];
    if (currentState?.loading) return;
    if (Number(currentState?.cooldownUntilMs || 0) > now) return;

    const nextCooldownUntil = now + BALANCE_CHECK_COOLDOWN_MS;
    setEscrowWalletBalanceByAddress((prev) => {
      const existing = prev[walletKey];
      return {
        ...prev,
        [walletKey]: {
          loading: true,
          displayValue: existing?.displayValue || '',
          error: '',
          lastCheckedAt: existing?.lastCheckedAt || '',
          cooldownUntilMs: nextCooldownUntil,
        },
      };
    });

    try {
      const response = await fetch('/api/user/getUSDTBalanceByWalletAddress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: normalizedWalletAddress,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      const rawDisplayValue = String(payload?.result?.displayValue || payload?.result?.balance || '0');
      const displayValue = formatUsdtBalanceDisplayValue(rawDisplayValue);
      const errorMessage = !response.ok
        ? String(payload?.error || '잔고 조회에 실패했습니다.')
        : String(payload?.error || '');

      setEscrowWalletBalanceByAddress((prev) => {
        const existing = prev[walletKey];
        return {
          ...prev,
          [walletKey]: {
            loading: false,
            displayValue,
            error: errorMessage,
            lastCheckedAt: new Date().toISOString(),
            cooldownUntilMs: existing?.cooldownUntilMs || nextCooldownUntil,
          },
        };
      });
    } catch (error) {
      console.error('Failed to fetch escrow wallet balance', error);
      setEscrowWalletBalanceByAddress((prev) => {
        const existing = prev[walletKey];
        return {
          ...prev,
          [walletKey]: {
            loading: false,
            displayValue: existing?.displayValue || '',
            error: '잔고 조회 중 오류가 발생했습니다.',
            lastCheckedAt: existing?.lastCheckedAt || '',
            cooldownUntilMs: existing?.cooldownUntilMs || nextCooldownUntil,
          },
        };
      });
    }
  }, [escrowWalletBalanceByAddress]);

  return (
    <main className="min-h-screen bg-transparent">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pb-20 pt-6 lg:px-6 lg:pt-8">
        <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_28px_60px_-42px_rgba(15,23,42,0.38)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/95 shadow-sm">
                <Image src="/icon-buyorder.png" alt="Buy Order" width={22} height={22} className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                  Buy Order Dashboard
                </p>
                <h1 className="text-xl font-bold text-slate-900">구매주문 관리</h1>
                <p className="text-sm text-slate-500">일별 검색 조건과 페이지를 유지한 채 5초마다 자동 갱신합니다.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className={`h-2.5 w-2.5 rounded-full ${polling ? 'animate-pulse bg-emerald-500' : 'bg-emerald-400'}`} />
                {polling ? '갱신 중' : '실시간 모니터링'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!isWalletConnected) return;
                  void fetchLatestBuyOrders('query');
                }}
                disabled={!isWalletConnected}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                새로고침
              </button>
            </div>
          </div>
        </section>

        {!isWalletConnected && (
          <section className="rounded-2xl border border-cyan-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.98)_100%)] p-4 shadow-[0_20px_48px_-36px_rgba(14,116,144,0.65)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-slate-900">지갑 연결이 필요합니다</p>
                <p className="mt-1 text-xs text-slate-600">
                  구매주문 관리 기능을 사용하려면 지갑을 연결해 주세요.
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  지원 방식: 구글, 이메일, 전화번호
                </p>
              </div>
              <div className="w-full sm:w-auto">
                <ConnectButton
                  client={client}
                  wallets={wallets.length ? wallets : wallet ? [wallet] : []}
                  locale="ko_KR"
                  theme="light"
                  connectButton={{
                    label: '지갑 연결',
                    style: {
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      borderRadius: '9999px',
                      border: '1px solid rgba(15,23,42,0.3)',
                      height: '42px',
                      minWidth: '148px',
                      fontWeight: 700,
                      fontSize: '14px',
                      width: '100%',
                    },
                  }}
                  connectModal={{
                    size: 'wide',
                    showThirdwebBranding: false,
                  }}
                />
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.42)]">
          <form className="grid grid-cols-1 gap-3 lg:grid-cols-12" onSubmit={handleSearchSubmit}>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                조회 일자 (Daily)
              </label>
              <input
                type="date"
                value={draftFilters.date}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, date: event.target.value }))}
                disabled={!isWalletConnected}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                거래번호
              </label>
              <input
                type="text"
                value={draftFilters.searchTradeId}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchTradeId: event.target.value }))}
                placeholder="거래번호 검색"
                disabled={!isWalletConnected}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                구매자 닉네임
              </label>
              <input
                type="text"
                value={draftFilters.searchBuyer}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchBuyer: event.target.value }))}
                placeholder="구매자 검색"
                disabled={!isWalletConnected}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                판매자 아이디
              </label>
              <input
                type="text"
                value={draftFilters.searchSellerId}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchSellerId: event.target.value }))}
                placeholder="판매자 아이디 검색"
                disabled={!isWalletConnected}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                입금자명
              </label>
              <input
                type="text"
                value={draftFilters.searchDepositName}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchDepositName: event.target.value }))}
                placeholder="입금자명 검색"
                disabled={!isWalletConnected}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                가맹점명
              </label>
              <input
                type="text"
                value={draftFilters.searchStoreName}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchStoreName: event.target.value }))}
                placeholder="가맹점명 검색"
                disabled={!isWalletConnected}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                페이지 크기
              </label>
              <select
                value={pageSize}
                onChange={(event) => {
                  if (!isWalletConnected) return;
                  const nextSize = Number(event.target.value) || DEFAULT_PAGE_SIZE;
                  setPageSize(nextSize);
                  setPageNumber(1);
                }}
                disabled={!isWalletConnected}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
              >
                {PAGE_SIZE_OPTIONS.map((sizeOption) => (
                  <option key={sizeOption} value={sizeOption}>
                    {sizeOption}개
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-12 flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleSearchReset}
                disabled={!isWalletConnected}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                초기화
              </button>
              <button
                type="submit"
                disabled={!isWalletConnected}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                검색
              </button>
            </div>
          </form>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">최신 주문 수</p>
            <p className="mt-2 text-right text-3xl font-bold tabular-nums text-slate-900">
              {dashboardStats.totalCount.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">검색 조건 전체 건수</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">진행중 주문</p>
            <p className="mt-2 text-right text-3xl font-bold tabular-nums text-amber-700">
              {dashboardStats.activeCount.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">총 결제 금액</p>
            <p className="mt-2 text-right text-3xl font-bold tabular-nums text-slate-900">
              {formatKrw(dashboardStats.totalKrwAmount)}
            </p>
            <p className="mt-1 text-xs text-slate-500">입금확인 기준 KRW</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">총 주문 수량</p>
            <p className="mt-2 text-right text-3xl font-bold tabular-nums text-slate-900">
              {formatUsdt(dashboardStats.totalUsdtAmount)}
            </p>
            <p className="mt-1 text-xs text-slate-500">입금확인 기준 USDT</p>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/55 p-4 shadow-[0_18px_38px_-32px_rgba(79,70,229,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">총 수수료량</p>
            <p className="mt-2 text-right text-3xl font-bold tabular-nums text-indigo-900">
              {formatUsdt(dashboardStats.totalFeeAmount)}
            </p>
            <p className="mt-1 text-xs text-indigo-700/80">USDT</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.52)]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status Mix</p>
            {dashboardStats.statusItems.length > 0 ? (
              dashboardStats.statusItems.map(([status, count]) => (
                <span
                  key={status}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClassName(status)}`}
                >
                  {getStatusLabel(status)}
                  <span className="font-bold">{count.toLocaleString()}</span>
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-500">표시할 주문이 없습니다.</span>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.52)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">판매자 판매량 합산 (검색 결과)</p>
            <span className="text-xs font-semibold text-slate-500">
              총 {sellerSalesSummarySorted.length.toLocaleString()}명
            </span>
          </div>
          {sellerSalesSummarySorted.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">판매자 합산 데이터가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto px-3 py-3">
              <div className="flex min-w-max gap-2">
                {sellerSalesSummarySorted.map((item, index) => (
                  <article
                    key={`${item.sellerWalletAddress || 'seller'}-${item.sellerNickname || 'unknown'}-${index}`}
                    className="w-[220px] shrink-0 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_10px_20px_-18px_rgba(15,23,42,0.4)]"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex items-center gap-1.5">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[10px] font-extrabold text-white">
                          {index + 1}
                        </span>
                        <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                          {item.sellerAvatar ? (
                            <Image
                              src={item.sellerAvatar}
                              alt={getSellerDisplayName(item)}
                              width={32}
                              height={32}
                              className="h-8 w-8 object-cover"
                            />
                          ) : (
                            <span className="text-[10px] font-extrabold text-slate-600">{getSellerAvatarFallback(item)}</span>
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-extrabold leading-tight text-slate-900">
                            {getSellerDisplayName(item)}
                          </p>
                          <p className="truncate text-[9px] text-slate-500">
                            {shortWallet(item.sellerWalletAddress)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                      <div className="grid grid-cols-[72px_1fr] items-center gap-y-1.5 text-[10px] leading-tight">
                        <p className="font-semibold text-slate-500">합산 판매금액</p>
                        <p className="justify-self-end text-[11px] font-extrabold text-slate-900">{formatKrw(item.totalKrwAmount)} KRW</p>
                        <p className="font-semibold text-slate-500">합산 판매수량</p>
                        <p className="justify-self-end text-[11px] font-extrabold text-slate-900">{formatUsdt(item.totalUsdtAmount)} USDT</p>
                        <p className="font-semibold text-slate-500">입금확인건수</p>
                        <p className="justify-self-end text-[11px] font-extrabold text-slate-900">{item.paymentConfirmedCount.toLocaleString()}건</p>
                        <p className="font-semibold text-slate-500">최근 주문시각</p>
                        <p
                          className="justify-self-end truncate text-[10px] font-semibold text-slate-700"
                          title={formatDateTime(item.latestCreatedAt)}
                        >
                          {formatDateTime(item.latestCreatedAt)}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_26px_56px_-46px_rgba(15,23,42,0.45)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">최신 구매주문 목록</p>
              <p className="text-xs text-slate-500">
                마지막 갱신 {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : '-'}
              </p>
              <p className="text-xs text-slate-500">
                페이지 {pageNumber.toLocaleString()} / {totalPages.toLocaleString()} · 총 {totalCount.toLocaleString()}건
              </p>
            </div>
            {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          </div>

          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={`skeleton-${index}`} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">검색된 주문 데이터가 없습니다.</div>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full table-fixed">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-[10%] px-3 py-3">상태</th>
                    <th className="w-[15%] px-3 py-3">주문시각/거래번호(TID)</th>
                    <th className="w-[10%] px-3 py-3">구매자</th>
                    <th className="w-[11%] px-3 py-3 text-right">주문금액</th>
                    <th className="w-[11%] px-3 py-3">판매자/결제방법</th>
                    <th className="w-[13%] px-3 py-3">에이전트 정보</th>
                    <th className="w-[9%] px-3 py-3">플랫폼 수수료</th>
                    <th className="w-[7%] px-3 py-3">전송내역</th>
                    <th className="w-[8%] px-3 py-3">이용동의</th>
                    <th className="w-[6%] px-3 py-3 text-center">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order, index) => {
                    const orderStatus = String(order?.status || '').trim();
                    const isPaymentRequested = orderStatus === 'paymentRequested';
                    const isPaymentConfirmed = orderStatus === 'paymentConfirmed';
                    const isCancelled = orderStatus === 'cancelled';
                    const paymentRequestedRemainingMs = isPaymentRequested
                      ? getPaymentRequestedRemainingMs(order, nowMs)
                      : null;
                    const transferTxHash = resolveTransferTransactionHash(order);
                    const cancelReleaseTxHash = resolveCancelRecoveryTransactionHash(order);
                    const cancelReleaseTxUrl = getTransferExplorerUrlByHash(order, cancelReleaseTxHash);
                    const fallbackTransferTxHash = isCancelled ? '' : transferTxHash;
                    const fallbackTransferTxUrl = getTransferExplorerUrlByHash(order, fallbackTransferTxHash);
                    const sellerLockTxHash = String(order?.seller?.lockTransactionHash || '').trim();
                    const sellerLockTxUrl = getTransferExplorerUrlByHash(order, sellerLockTxHash);
                    const escrowTransferTxHash = String(order?.escrowTransactionHash || '').trim();
                    const escrowTransferTxUrl = getTransferExplorerUrlByHash(order, escrowTransferTxHash);
                    const hasSellerLockTx = Boolean(sellerLockTxHash);
                    const hasCancelReleaseTx = Boolean(cancelReleaseTxHash);
                    const hasFallbackTransferTx = Boolean(fallbackTransferTxHash);
                    const hasEscrowTransferTx =
                      Boolean(escrowTransferTxHash)
                      && escrowTransferTxHash !== sellerLockTxHash
                      && escrowTransferTxHash !== cancelReleaseTxHash
                      && escrowTransferTxHash !== fallbackTransferTxHash;
                    const hasTransferDetails =
                      hasSellerLockTx || hasCancelReleaseTx || hasFallbackTransferTx || hasEscrowTransferTx;
                    const canCancelOrderByStatus = isAdminCancelablePrivateOrder(order);
                    const canCancelOrder = isWalletConnected && canCancelOrderByStatus;
                    const platformFeeRate = getOrderPlatformFeeRate(order);
                    const platformFeeAmount = getOrderPlatformFeeAmount(order);
                    const platformFeeWalletAddress = getOrderPlatformFeeWalletAddress(order);
                    const agentPlatformFeeRate = getOrderAgentPlatformFeeRate(order);
                    const agentPlatformFeeAmount = getOrderAgentPlatformFeeAmount(order);
                    const agentPlatformFeeFromAddress = getOrderAgentPlatformFeeFromAddress(order);
                    const agentPlatformFeeToAddress = getOrderAgentPlatformFeeToAddress(order);
                    const agentPlatformFeeTransactionHash = getOrderAgentPlatformFeeTransactionHash(order);
                    const isCompletedLikeOrderStatus =
                      orderStatus === 'paymentConfirmed' || orderStatus === 'completed';
                    const isAgentPlatformFeeUncollected =
                      isCompletedLikeOrderStatus
                      && agentPlatformFeeRate > 0
                      && !agentPlatformFeeTransactionHash;
                    const hasAgentPlatformFeeInfo =
                      agentPlatformFeeRate > 0
                      || agentPlatformFeeAmount > 0
                      || Boolean(agentPlatformFeeFromAddress)
                      || Boolean(agentPlatformFeeToAddress);
                    const hasPlatformFeeInfo =
                      platformFeeRate > 0
                      || platformFeeAmount > 0
                      || Boolean(platformFeeWalletAddress)
                      || hasAgentPlatformFeeInfo;
                    const escrowWalletAddress = resolveOrderEscrowWalletAddress(order);
                    const escrowWalletKey = escrowWalletAddress ? normalizeWalletKey(escrowWalletAddress) : '';
                    const escrowWalletBalanceState = escrowWalletKey
                      ? escrowWalletBalanceByAddress[escrowWalletKey]
                      : undefined;
                    const escrowWalletCooldownRemainingMs = Math.max(
                      0,
                      Number(escrowWalletBalanceState?.cooldownUntilMs || 0) - escrowWalletBalanceTickMs,
                    );
                    const escrowWalletCooldownRemainingSeconds = escrowWalletCooldownRemainingMs > 0
                      ? Math.ceil(escrowWalletCooldownRemainingMs / 1000)
                      : 0;
                    const escrowWalletCooldownProgressPercent = Math.max(
                      0,
                      Math.min(
                        100,
                        (escrowWalletCooldownRemainingMs / BALANCE_CHECK_COOLDOWN_MS) * 100,
                      ),
                    );
                    const sellerEscrowWalletAddress = String(order?.seller?.escrowWalletAddress || '').trim();
                    const buyerWalletAddress = String(order?.buyer?.walletAddress || order?.walletAddress || '').trim();
                    const agentName = getOrderAgentName(order);
                    const agentLogo = getOrderAgentLogo(order);
                    const agentCreditWalletAddress = getOrderAgentCreditWalletAddress(order);
                    const buyerWalletKey = buyerWalletAddress ? normalizeWalletKey(buyerWalletAddress) : '';
                    const buyerWalletBalanceState = buyerWalletKey
                      ? escrowWalletBalanceByAddress[buyerWalletKey]
                      : undefined;
                    const buyerWalletCooldownRemainingMs = Math.max(
                      0,
                      Number(buyerWalletBalanceState?.cooldownUntilMs || 0) - escrowWalletBalanceTickMs,
                    );
                    const buyerWalletCooldownRemainingSeconds = buyerWalletCooldownRemainingMs > 0
                      ? Math.ceil(buyerWalletCooldownRemainingMs / 1000)
                      : 0;
                    const buyerWalletCooldownProgressPercent = Math.max(
                      0,
                      Math.min(
                        100,
                        (buyerWalletCooldownRemainingMs / BALANCE_CHECK_COOLDOWN_MS) * 100,
                      ),
                    );
                    const sellerEscrowWalletKey = sellerEscrowWalletAddress
                      ? normalizeWalletKey(sellerEscrowWalletAddress)
                      : '';
                    const sellerEscrowWalletBalanceState = sellerEscrowWalletKey
                      ? escrowWalletBalanceByAddress[sellerEscrowWalletKey]
                      : undefined;
                    const sellerEscrowWalletCooldownRemainingMs = Math.max(
                      0,
                      Number(sellerEscrowWalletBalanceState?.cooldownUntilMs || 0) - escrowWalletBalanceTickMs,
                    );
                    const sellerEscrowWalletCooldownRemainingSeconds = sellerEscrowWalletCooldownRemainingMs > 0
                      ? Math.ceil(sellerEscrowWalletCooldownRemainingMs / 1000)
                      : 0;
                    const sellerEscrowWalletCooldownProgressPercent = Math.max(
                      0,
                      Math.min(
                        100,
                        (sellerEscrowWalletCooldownRemainingMs / BALANCE_CHECK_COOLDOWN_MS) * 100,
                      ),
                    );
                    const agentCreditWalletKey = agentCreditWalletAddress
                      ? normalizeWalletKey(agentCreditWalletAddress)
                      : '';
                    const agentCreditWalletBalanceState = agentCreditWalletKey
                      ? escrowWalletBalanceByAddress[agentCreditWalletKey]
                      : undefined;
                    const agentCreditWalletCooldownRemainingMs = Math.max(
                      0,
                      Number(agentCreditWalletBalanceState?.cooldownUntilMs || 0) - escrowWalletBalanceTickMs,
                    );
                    const agentCreditWalletCooldownRemainingSeconds = agentCreditWalletCooldownRemainingMs > 0
                      ? Math.ceil(agentCreditWalletCooldownRemainingMs / 1000)
                      : 0;
                    const agentCreditWalletCooldownProgressPercent = Math.max(
                      0,
                      Math.min(
                        100,
                        (agentCreditWalletCooldownRemainingMs / BALANCE_CHECK_COOLDOWN_MS) * 100,
                      ),
                    );
                    const buyerConsentSnapshot = getOrderBuyerConsentSnapshot(order);
                    const buyerConsentAcceptedAtLabel = buyerConsentSnapshot.acceptedAt
                      ? formatDateTime(buyerConsentSnapshot.acceptedAt)
                      : '-';
                    const buyerConsentRequestedAtLabel = buyerConsentSnapshot.requestedAt
                      ? formatDateTime(buyerConsentSnapshot.requestedAt)
                      : '-';

                    return (
                    <tr
                      key={`${order?._id || order?.tradeId || 'order'}-${index}`}
                      className={isPaymentRequested ? 'bg-amber-50/60 text-sm text-slate-700' : 'bg-white text-sm text-slate-700'}
                    >
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClassName(order?.status)}`}>
                            {getStatusLabel(order?.status)}
                          </span>
                          {isPaymentRequested && (
                            <p
                              className={`text-[11px] font-extrabold ${
                                paymentRequestedRemainingMs !== null && paymentRequestedRemainingMs > 0
                                  ? 'animate-pulse text-amber-700'
                                  : 'animate-pulse text-rose-700'
                              }`}
                            >
                              {paymentRequestedRemainingMs !== null && paymentRequestedRemainingMs > 0
                                ? formatCountdownLabel(paymentRequestedRemainingMs)
                                : '입금시간 초과'}
                            </p>
                          )}
                          {String(order?.status || '').trim() === 'cancelled' && (
                            <>
                              <p className="truncate text-[11px] font-semibold text-slate-600">
                                취소주체 {getCancellerRoleLabel(order)}
                              </p>
                              <p className="truncate text-[11px] text-slate-500">
                                취소자 {getCancellerLabel(order)}
                              </p>
                              <p className="break-all text-[11px] leading-tight text-slate-500">
                                IP {getCancellerIp(order)}
                              </p>
                            </>
                          )}
                          {isPaymentConfirmed && (
                            <>
                              <p className="text-[11px] font-semibold text-emerald-700">
                                처리자 {getPaymentConfirmerLabel(order)}
                              </p>
                              <p className="break-all text-[11px] leading-tight text-slate-500">
                                IP {getPaymentConfirmerIp(order)}
                              </p>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <div className="flex flex-col gap-1 leading-tight">
                          <span className="whitespace-nowrap text-[13px] font-medium text-slate-700">
                            {formatDateTime(order?.createdAt)}
                          </span>
                          {order?.tradeId ? (
                            <button
                              type="button"
                              onClick={() => {
                                void copyTradeId(order.tradeId || '');
                              }}
                              className="mt-0.5 inline-flex w-fit items-center gap-1 truncate text-xs font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                            >
                              {order.tradeId}
                              {copiedTradeId === order.tradeId && (
                                <span className="text-[10px] font-semibold text-cyan-700">복사됨</span>
                              )}
                            </button>
                          ) : (
                            <span className="mt-0.5 truncate text-xs font-semibold text-slate-900">-</span>
                          )}

                          <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                            <p className="text-[10px] font-semibold text-slate-500">에스크로 지갑</p>
                            {escrowWalletAddress ? (
                              <div className="mt-0.5 flex flex-col gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void copyWalletAddress(escrowWalletAddress);
                                  }}
                                  className="inline-flex w-fit items-center gap-1 truncate text-xs font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                                >
                                  {shortWallet(escrowWalletAddress)}
                                  {copiedWalletAddress === escrowWalletAddress && (
                                    <span className="text-[10px] font-semibold text-cyan-700">복사됨</span>
                                  )}
                                </button>
                                {escrowWalletCooldownRemainingMs <= 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleCheckEscrowWalletBalance(escrowWalletAddress);
                                    }}
                                    disabled={Boolean(escrowWalletBalanceState?.loading)}
                                    className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                                      escrowWalletBalanceState?.loading
                                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                        : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100'
                                    }`}
                                  >
                                    {escrowWalletBalanceState?.loading ? '조회중...' : '잔고확인'}
                                  </button>
                                ) : (
                                  <div className="w-full max-w-[150px] rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1">
                                    <div className="flex items-center justify-between text-[10px] font-semibold text-indigo-700">
                                      <span>재조회 대기</span>
                                      <span>{escrowWalletCooldownRemainingSeconds}s</span>
                                    </div>
                                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/90">
                                      <div
                                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-[width] duration-200 ease-linear"
                                        style={{ width: `${escrowWalletCooldownProgressPercent.toFixed(2)}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                                <span
                                  className={`text-[10px] font-semibold ${
                                    escrowWalletBalanceState?.error ? 'text-rose-600' : 'text-slate-600'
                                  }`}
                                >
                                  {escrowWalletBalanceState?.error
                                    ? '조회실패'
                                    : escrowWalletBalanceState?.displayValue
                                    ? `${escrowWalletBalanceState.displayValue} USDT`
                                    : '잔고 미조회'}
                                </span>
                              </div>
                            ) : (
                              <span className="mt-0.5 text-[10px] text-slate-400">-</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <span className="break-all text-base font-extrabold leading-tight text-slate-900">
                            {getBuyerDepositNameLabel(order)}
                          </span>
                          <span className="truncate font-medium text-slate-900">
                            {order?.buyer?.nickname || order?.nickname || '-'}
                          </span>
                          {buyerWalletAddress ? (
                            <button
                              type="button"
                              onClick={() => {
                                void copyWalletAddress(buyerWalletAddress);
                              }}
                              className="inline-flex w-fit items-center gap-1 truncate text-xs text-slate-500 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                            >
                              {shortWallet(buyerWalletAddress)}
                              {copiedWalletAddress === buyerWalletAddress && (
                                <span className="text-[10px] font-semibold text-cyan-700">복사됨</span>
                              )}
                            </button>
                          ) : (
                            <span className="truncate text-xs text-slate-500">-</span>
                          )}
                          {buyerWalletAddress ? (
                            <div className="mt-1 flex flex-col gap-1">
                              {buyerWalletCooldownRemainingMs <= 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleCheckEscrowWalletBalance(buyerWalletAddress);
                                  }}
                                  disabled={Boolean(buyerWalletBalanceState?.loading)}
                                  className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                                    buyerWalletBalanceState?.loading
                                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                      : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100'
                                  }`}
                                >
                                  {buyerWalletBalanceState?.loading ? '조회중...' : '잔고확인'}
                                </button>
                              ) : (
                                <div className="w-full max-w-[130px] rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1">
                                  <div className="flex items-center justify-between text-[10px] font-semibold text-indigo-700">
                                    <span>재조회 대기</span>
                                    <span>{buyerWalletCooldownRemainingSeconds}s</span>
                                  </div>
                                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/90">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-[width] duration-200 ease-linear"
                                      style={{ width: `${buyerWalletCooldownProgressPercent.toFixed(2)}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                              <span
                                className={`text-[10px] font-semibold ${
                                  buyerWalletBalanceState?.error ? 'text-rose-600' : 'text-slate-600'
                                }`}
                              >
                                {buyerWalletBalanceState?.error
                                  ? '조회실패'
                                  : buyerWalletBalanceState?.displayValue
                                  ? `${buyerWalletBalanceState.displayValue} USDT`
                                  : '잔고 미조회'}
                              </span>
                            </div>
                          ) : null}
                          <span className="break-all text-[11px] leading-tight text-slate-500">
                            IP {getBuyerIp(order)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-base font-extrabold leading-tight text-slate-900">{formatKrw(getDisplayKrwAmount(order))} KRW</span>
                          <span className="text-sm font-bold text-slate-600">{formatUsdtSix(order?.usdtAmount)} USDT</span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            환율 {formatRate(getOrderExchangeRate(order))}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col">
                            <span className="truncate text-base font-extrabold leading-tight text-slate-900">{order?.seller?.nickname || '-'}</span>
                            {sellerEscrowWalletAddress ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void copyWalletAddress(sellerEscrowWalletAddress);
                                }}
                                className="inline-flex w-fit items-center gap-1 truncate text-xs text-slate-500 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                              >
                                {shortWallet(sellerEscrowWalletAddress)}
                                {copiedWalletAddress === sellerEscrowWalletAddress && (
                                  <span className="text-[10px] font-semibold text-cyan-700">복사됨</span>
                                )}
                              </button>
                            ) : (
                              <span className="truncate text-xs text-slate-500">-</span>
                            )}
                            {sellerEscrowWalletAddress ? (
                              <div className="mt-1 flex flex-col gap-1">
                                {sellerEscrowWalletCooldownRemainingMs <= 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleCheckEscrowWalletBalance(sellerEscrowWalletAddress);
                                    }}
                                    disabled={Boolean(sellerEscrowWalletBalanceState?.loading)}
                                    className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                                      sellerEscrowWalletBalanceState?.loading
                                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                        : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100'
                                    }`}
                                  >
                                    {sellerEscrowWalletBalanceState?.loading ? '조회중...' : '잔고확인'}
                                  </button>
                                ) : (
                                  <div className="w-full max-w-[130px] rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1">
                                    <div className="flex items-center justify-between text-[10px] font-semibold text-indigo-700">
                                      <span>재조회 대기</span>
                                      <span>{sellerEscrowWalletCooldownRemainingSeconds}s</span>
                                    </div>
                                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/90">
                                      <div
                                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-[width] duration-200 ease-linear"
                                        style={{ width: `${sellerEscrowWalletCooldownProgressPercent.toFixed(2)}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                                <span
                                  className={`text-[10px] font-semibold ${
                                    sellerEscrowWalletBalanceState?.error ? 'text-rose-600' : 'text-slate-600'
                                  }`}
                                >
                                  {sellerEscrowWalletBalanceState?.error
                                    ? '조회실패'
                                    : sellerEscrowWalletBalanceState?.displayValue
                                    ? `${sellerEscrowWalletBalanceState.displayValue} USDT`
                                    : '잔고 미조회'}
                                </span>
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                            <span className="inline-flex w-fit whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {getPaymentMethodLabel(order)}
                            </span>
                            <span className="truncate text-xs text-slate-500">
                              {getPaymentMethodDetail(order)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="inline-flex max-w-full items-center gap-1.5">
                            {agentLogo ? (
                              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white">
                                <span
                                  className="h-full w-full bg-cover bg-center"
                                  style={{ backgroundImage: `url(${encodeURI(agentLogo)})` }}
                                  aria-label={agentName}
                                />
                              </span>
                            ) : (
                              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-500">
                                A
                              </span>
                            )}
                            <span className="truncate text-xs font-semibold text-slate-700">{agentName}</span>
                          </div>
                          {agentCreditWalletAddress ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  void copyWalletAddress(agentCreditWalletAddress);
                                }}
                                className="inline-flex w-fit items-center gap-1 truncate text-xs text-slate-500 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                                title={agentCreditWalletAddress}
                              >
                                <span className="text-[10px] font-semibold text-slate-500">수수료 지급용</span>
                                {shortWallet(agentCreditWalletAddress)}
                                {copiedWalletAddress === agentCreditWalletAddress && (
                                  <span className="text-[10px] font-semibold text-cyan-700">복사됨</span>
                                )}
                              </button>
                              {agentCreditWalletCooldownRemainingMs <= 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleCheckEscrowWalletBalance(agentCreditWalletAddress);
                                  }}
                                  disabled={Boolean(agentCreditWalletBalanceState?.loading)}
                                  className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                                    agentCreditWalletBalanceState?.loading
                                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                      : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100'
                                  }`}
                                >
                                  {agentCreditWalletBalanceState?.loading ? '조회중...' : '잔고확인'}
                                </button>
                              ) : (
                                <div className="w-full max-w-[130px] rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1">
                                  <div className="flex items-center justify-between text-[10px] font-semibold text-indigo-700">
                                    <span>재조회 대기</span>
                                    <span>{agentCreditWalletCooldownRemainingSeconds}s</span>
                                  </div>
                                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/90">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-[width] duration-200 ease-linear"
                                      style={{ width: `${agentCreditWalletCooldownProgressPercent.toFixed(2)}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                              <span
                                className={`text-[10px] font-semibold ${
                                  agentCreditWalletBalanceState?.error ? 'text-rose-600' : 'text-slate-600'
                                }`}
                              >
                                {agentCreditWalletBalanceState?.error
                                  ? '조회실패'
                                  : agentCreditWalletBalanceState?.displayValue
                                  ? `${agentCreditWalletBalanceState.displayValue} USDT`
                                  : '잔고 미조회'}
                              </span>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-400">지갑 미설정</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {hasPlatformFeeInfo ? (
                          <div className="flex flex-col gap-1 leading-tight">
                            {(platformFeeRate > 0 || platformFeeAmount > 0 || Boolean(platformFeeWalletAddress)) && (
                              <div className="flex flex-col gap-1 leading-tight">
                                <span className="inline-flex w-fit rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-extrabold text-indigo-700">
                                  {formatPercent(platformFeeRate)}%
                                </span>
                                <span className="text-xs font-semibold text-indigo-800">
                                  {formatUsdt(platformFeeAmount)} USDT
                                </span>
                                <span className="truncate text-[11px] text-slate-500">
                                  {platformFeeWalletAddress ? shortWallet(platformFeeWalletAddress) : '-'}
                                </span>
                              </div>
                            )}
                            {hasAgentPlatformFeeInfo && (
                              <div
                                className={`flex flex-col gap-1 leading-tight ${
                                  platformFeeRate > 0 || platformFeeAmount > 0 || Boolean(platformFeeWalletAddress)
                                    ? 'border-t border-slate-200 pt-1'
                                    : ''
                                }`}
                              >
                                <span className="inline-flex w-fit items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-extrabold text-amber-700">
                                  <span>AG {formatPercent(agentPlatformFeeRate)}%</span>
                                  <span className="text-[10px] font-bold text-amber-800">
                                    {formatUsdtSix(agentPlatformFeeAmount)} USDT
                                  </span>
                                </span>
                                {isAgentPlatformFeeUncollected && (
                                  <span className="inline-flex w-fit rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold text-rose-700">
                                    미수납 상태
                                  </span>
                                )}
                                {agentPlatformFeeFromAddress ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void copyWalletAddress(agentPlatformFeeFromAddress);
                                    }}
                                    className="inline-flex w-fit items-center gap-1 truncate text-[11px] text-slate-500 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                                    title={agentPlatformFeeFromAddress}
                                  >
                                    지급 {shortWallet(agentPlatformFeeFromAddress)}
                                    {copiedWalletAddress === agentPlatformFeeFromAddress && (
                                      <span className="text-[10px] font-semibold text-cyan-700">복사됨</span>
                                    )}
                                  </button>
                                ) : (
                                  <span className="truncate text-[11px] text-slate-500">지급 -</span>
                                )}
                                {agentPlatformFeeToAddress ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void copyWalletAddress(agentPlatformFeeToAddress);
                                    }}
                                    className="inline-flex w-fit items-center gap-1 truncate text-[11px] text-slate-500 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                                    title={agentPlatformFeeToAddress}
                                  >
                                    수납 {shortWallet(agentPlatformFeeToAddress)}
                                    {copiedWalletAddress === agentPlatformFeeToAddress && (
                                      <span className="text-[10px] font-semibold text-cyan-700">복사됨</span>
                                    )}
                                  </button>
                                ) : (
                                  <span className="truncate text-[11px] text-slate-500">수납 -</span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {(isPaymentRequested || isPaymentConfirmed || isCancelled) && hasTransferDetails ? (
                          <div className="flex flex-col gap-1 leading-tight">
                            {hasSellerLockTx && (
                              <div className="flex flex-col">
                                <span className="inline-flex w-fit rounded-md bg-sky-50 px-2 py-0.5 text-xs font-extrabold text-sky-700">
                                  에스크로
                                </span>
                                {sellerLockTxUrl ? (
                                  <a
                                    href={sellerLockTxUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-0.5 inline-flex w-fit items-center truncate text-xs font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2"
                                  >
                                    {shortWallet(sellerLockTxHash)}
                                  </a>
                                ) : (
                                  <span className="mt-0.5 truncate text-xs font-semibold text-sky-800">{shortWallet(sellerLockTxHash)}</span>
                                )}
                              </div>
                            )}

                            {hasCancelReleaseTx && (
                              <div className={`flex flex-col ${hasSellerLockTx ? 'border-t border-slate-200 pt-1' : ''}`}>
                                <span className="inline-flex w-fit rounded-md bg-rose-50 px-2 py-0.5 text-xs font-extrabold text-rose-700">
                                  회수
                                </span>
                                {cancelReleaseTxUrl ? (
                                  <a
                                    href={cancelReleaseTxUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-0.5 inline-flex w-fit items-center truncate text-xs font-semibold text-rose-700 underline decoration-rose-300 underline-offset-2"
                                  >
                                    {shortWallet(cancelReleaseTxHash)}
                                  </a>
                                ) : (
                                  <span className="mt-0.5 truncate text-xs font-semibold text-rose-800">{shortWallet(cancelReleaseTxHash)}</span>
                                )}
                              </div>
                            )}

                            {hasFallbackTransferTx && (
                              <div className={`flex flex-col ${hasSellerLockTx || hasCancelReleaseTx ? 'border-t border-slate-200 pt-1' : ''}`}>
                                <span className="inline-flex w-fit rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-700">
                                  전송
                                </span>
                                {fallbackTransferTxUrl ? (
                                  <a
                                    href={fallbackTransferTxUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-0.5 inline-flex w-fit items-center truncate text-xs font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2"
                                  >
                                    {shortWallet(fallbackTransferTxHash)}
                                  </a>
                                ) : (
                                  <span className="mt-0.5 truncate text-xs font-semibold text-emerald-800">{shortWallet(fallbackTransferTxHash)}</span>
                                )}
                              </div>
                            )}

                            {hasEscrowTransferTx && (
                              <div className={`flex flex-col ${hasSellerLockTx || hasCancelReleaseTx || hasFallbackTransferTx ? 'border-t border-slate-200 pt-1' : ''}`}>
                                <span className="inline-flex w-fit rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                  Escrow
                                </span>
                                {escrowTransferTxUrl ? (
                                  <a
                                    href={escrowTransferTxUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-0.5 inline-flex w-fit items-center truncate text-xs font-semibold text-amber-700 underline decoration-amber-300 underline-offset-2"
                                  >
                                    {shortWallet(escrowTransferTxHash)}
                                  </a>
                                ) : (
                                  <span className="mt-0.5 truncate text-xs font-semibold text-amber-800">{shortWallet(escrowTransferTxHash)}</span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          {buyerConsentSnapshot.accepted ? (
                            <>
                              <span className="inline-flex w-fit items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                동의완료
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {buyerConsentAcceptedAtLabel}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="inline-flex w-fit items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                                미완료
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {buyerConsentRequestedAtLabel}
                              </span>
                            </>
                          )}
                          {buyerConsentSnapshot.channelUrl ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrderChatChannelUrl(buyerConsentSnapshot.channelUrl);
                                setSelectedOrderChatTradeId(String(order?.tradeId || '').trim());
                                setIsOrderChatDrawerOpen(true);
                              }}
                              className="inline-flex w-fit items-center rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-extrabold text-sky-700 transition hover:border-sky-400 hover:bg-sky-100"
                            >
                              채팅 보기
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">채널 없음</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {canCancelOrderByStatus ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!isWalletConnected) return;
                              setCancelTargetOrder(order);
                              setCancelError(null);
                              resetCancelOrderProgressFlow();
                              void fetchPublicIpAddress();
                            }}
                            disabled={!isWalletConnected}
                            className="inline-flex items-center justify-center rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            취소
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
            <div className="text-xs text-slate-500">
              일자: {appliedFilters.date} · 페이지당 {pageSize.toLocaleString()}건
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPageNumber(1)}
                disabled={!isWalletConnected || pageNumber <= 1 || loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                처음
              </button>
              <button
                type="button"
                onClick={() => setPageNumber((prev) => Math.max(1, prev - 1))}
                disabled={!isWalletConnected || pageNumber <= 1 || loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
              </button>
              <span className="text-sm font-semibold text-slate-700">
                {pageNumber.toLocaleString()} / {totalPages.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setPageNumber((prev) => Math.min(totalPages, prev + 1))}
                disabled={!isWalletConnected || pageNumber >= totalPages || loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음
              </button>
              <button
                type="button"
                onClick={() => setPageNumber(totalPages)}
                disabled={!isWalletConnected || pageNumber >= totalPages || loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                마지막
              </button>
            </div>
          </div>
        </section>

        <section className="text-center text-xs text-slate-500">
          고급 모니터링 UI · 자동 상태 동기화 ({POLLING_INTERVAL_MS / 1000}초 주기)
        </section>
      </div>

      <>
        <button
          type="button"
          aria-label="주문 채팅 패널 닫기"
          onClick={() => setIsOrderChatDrawerOpen(false)}
          className={`fixed inset-0 z-[104] bg-slate-900/45 transition-opacity duration-200 ${
            isOrderChatDrawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
        />
        <aside
          className={`fixed left-0 top-0 z-[105] h-dvh w-[min(94vw,460px)] border-r border-slate-200 bg-white shadow-[0_35px_80px_-45px_rgba(15,23,42,0.75)] transition-transform duration-200 ${
            isOrderChatDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">주문 채팅</p>
                <p className="text-sm font-bold text-slate-900">구매자 ↔ 판매자 대화 내역</p>
                <p className="text-[11px] text-slate-500">
                  TID: {selectedOrderChatTradeId || '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOrderChatDrawerOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              >
                닫기
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-3">
              {!SENDBIRD_APP_ID ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                  채팅 설정이 비어 있습니다. `NEXT_PUBLIC_SENDBIRD_APP_ID` 값을 확인해 주세요.
                </div>
              ) : !adminWalletAddress ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  관리자 지갑 연결 후 채팅 내역을 확인할 수 있습니다.
                </div>
              ) : orderChatSessionError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                  {orderChatSessionError}
                </div>
              ) : !selectedOrderChatChannelUrl ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  이용동의 컬럼의 `채팅 보기` 버튼을 눌러 채팅 내역을 열어주세요.
                </div>
              ) : orderChatSessionLoading || !orderChatSessionToken ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  채팅 세션을 준비 중입니다...
                </div>
              ) : (
                <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <SendbirdProvider
                    appId={SENDBIRD_APP_ID}
                    userId={adminWalletAddress}
                    accessToken={orderChatSessionToken}
                    theme="light"
                  >
                    <GroupChannel channelUrl={selectedOrderChatChannelUrl} />
                  </SendbirdProvider>
                </div>
              )}
            </div>
          </div>
        </aside>
      </>

      {cancelTargetOrder && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center overflow-y-auto bg-slate-900/45 p-3 backdrop-blur-[1px] sm:items-center sm:p-4"
          role="presentation"
          onClick={closeCancelOrderModal}
        >
          <div
            className="my-3 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_42px_90px_-52px_rgba(15,23,42,0.9)] sm:my-6"
            role="dialog"
            aria-modal="true"
            aria-label="주문 취소 확인"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-xl font-bold text-slate-900">주문 취소 확인</p>
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium leading-relaxed text-amber-900">
                취소를 확정하면 에스크로에 보관된 USDT가 판매자 지갑으로 반환되고, 주문 상태는
                <span className="mx-1 font-bold">주문취소</span>
                로 기록됩니다.
              </p>
            </div>

            <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-5">
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">
                  구매자 아이디
                </p>
                <p className="mt-1 break-all text-2xl font-extrabold leading-tight text-slate-900">
                  {getBuyerIdLabel(cancelTargetOrder)}
                </p>
              </div>

              <div className="grid grid-cols-[126px_1fr] gap-x-3 gap-y-3">
                <p className="text-sm font-semibold text-slate-500">주문 ID</p>
                <p className="break-all text-base font-medium text-slate-900">{cancelTargetOrder._id || '-'}</p>
                <p className="text-sm font-semibold text-slate-500">거래번호(TID)</p>
                <p className="break-all text-base font-medium text-slate-900">{cancelTargetOrder.tradeId || '-'}</p>
                <p className="text-sm font-semibold text-slate-500">구매자 아이디</p>
                <p className="break-all text-base font-semibold text-slate-900">
                  {getBuyerIdLabel(cancelTargetOrder)}
                </p>
                <p className="text-sm font-semibold text-slate-500">구매자 지갑</p>
                <p className="break-all text-base font-medium text-slate-900">
                  {cancelTargetOrder.buyer?.walletAddress || cancelTargetOrder.walletAddress || '-'}
                </p>
                <p className="text-sm font-semibold text-slate-500">판매자 지갑</p>
                <p className="break-all text-base font-medium text-slate-900">
                  {cancelTargetOrder.seller?.walletAddress || '-'}
                </p>
                <p className="text-sm font-semibold text-slate-500">취소 관리자</p>
                <p className="break-all text-base font-semibold text-slate-900">
                  {cancelActorNickname}
                  {adminWalletAddress ? ` (${shortWallet(adminWalletAddress)})` : ''}
                </p>
                <p className="text-sm font-semibold text-slate-500">관리자 역할</p>
                <p className="text-base font-medium text-slate-900">
                  {cancelActorRoleLabel}
                </p>
                <p className="text-sm font-semibold text-slate-500">접속 퍼블릭 IP</p>
                <p className="break-all text-base font-medium text-slate-900">
                  {loadingPublicIpAddress ? '조회 중...' : publicIpAddress || '-'}
                </p>
                <p className="text-sm font-semibold text-slate-500">반환 수량</p>
                <p className="text-base font-bold text-slate-900">{formatUsdt(cancelTargetOrder.usdtAmount)} USDT</p>
                <p className="text-sm font-semibold text-slate-500">현재 상태</p>
                <p className="text-base font-medium text-slate-900">{getStatusLabel(cancelTargetOrder.status)}</p>
              </div>

              <div className={`rounded-xl border px-3 py-3 ${cancelProgressPhaseMeta.container}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                    취소 진행 상태
                  </p>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cancelProgressPhaseMeta.badge}`}>
                    {cancelProgressPhaseMeta.label}
                  </span>
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-500">
                  취소 API 단계를 실시간으로 표시합니다.
                </p>
                <p className={`mt-1 text-[11px] font-semibold ${cancelProgressPhaseMeta.summary}`}>
                  {cancelProgressSummary}
                </p>

                <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {cancelProgressSteps.map((step, index) => {
                    const style = getCancelOrderProgressStyle(step.state);
                    return (
                      <div
                        key={step.key}
                        className={`rounded-lg border px-2.5 py-2 ${style.container}`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${style.badge}`}
                          >
                            {step.state === 'completed' ? '✓' : index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-xs font-semibold ${style.title}`}>{step.title}</p>
                              <span className={`text-[10px] font-semibold ${style.status}`}>
                                {getCancelOrderProgressStatusLabel(step.state)}
                              </span>
                            </div>
                            <p className={`mt-0.5 text-[11px] ${style.description}`}>
                              {step.description}
                            </p>
                            {(step.updatedAt || step.detail) && (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                                {step.updatedAt && (
                                  <span className="font-semibold tabular-nums">
                                    {formatDateTime(step.updatedAt)}
                                  </span>
                                )}
                                {step.detail && (
                                  <span className="truncate font-semibold">{step.detail}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {cancelError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {cancelError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeCancelOrderModal}
                disabled={cancelingOrder}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmCancelOrderFromModal();
                }}
                disabled={
                  cancelingOrder
                  || !isWalletConnected
                  || (!isCancelOrderActionCompleted && !isAdminCancelablePrivateOrder(cancelTargetOrder))
                }
                className="inline-flex h-11 items-center justify-center rounded-lg border border-rose-600 bg-rose-600 px-4 text-sm font-semibold text-white transition hover:border-rose-700 hover:bg-rose-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {cancelOrderActionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
