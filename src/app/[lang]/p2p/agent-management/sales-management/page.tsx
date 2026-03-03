'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useActiveAccount } from 'thirdweb/react';
import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider';
import GroupChannel from '@sendbird/uikit-react/GroupChannel';

import AgentInfoCard from '../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  formatKrw,
  formatUsdt,
  toDateTime,
  type AgentSummary,
} from '../_shared';

type AgentSalesOrderItem = {
  id: string;
  tradeId: string;
  chain: string;
  transactionHash: string;
  cancelReleaseTransactionHash: string;
  escrowTransactionHash: string;
  status: string;
  privateSale: boolean;
  paymentMethod: string;
  canceller: string;
  cancelledByRole: string;
  cancelledByWalletAddress: string;
  cancelledByNickname: string;
  cancelledByIpAddress: string;
  paymentConfirmedByRole: string;
  paymentConfirmedByWalletAddress: string;
  paymentConfirmedByNickname: string;
  paymentConfirmedByIpAddress: string;
  storecode: string;
  storeName: string;
  walletAddress: string;
  ipAddress: string;
  buyerIpAddress: string;
  buyerNickname: string;
  buyerDepositName: string;
  buyerWalletAddress: string;
  buyerEscrowWalletAddress: string;
  buyerReleaseTransactionHash: string;
  buyerRollbackTransactionHash: string;
  sellerNickname: string;
  sellerWalletAddress: string;
  sellerEscrowWalletAddress: string;
  sellerAvatar: string;
  sellerBankName: string;
  sellerBankAccountNumber: string;
  sellerBankAccountHolder: string;
  sellerContactMemo: string;
  sellerLockTransactionHash: string;
  sellerRollbackTransactionHash: string;
  sellerReleaseTransactionHash: string;
  agentcode: string;
  agentName: string;
  agentLogo: string;
  agentSmartAccountAddress: string;
  agentCreditWalletSmartAccountAddress: string;
  agentPlatformFeePercentage: number;
  agentPlatformFeeAmount: number;
  agentPlatformFeeFromAddress: string;
  agentPlatformFeeToAddress: string;
  agentPlatformFeeTransactionHash: string;
  usdtAmount: number;
  krwAmount: number;
  rate: number;
  platformFeeRate: number;
  platformFeeAmount: number;
  platformFeeWalletAddress: string;
  createdAt: string;
  paymentRequestedAt: string;
  paymentConfirmedAt: string;
  buyerConsent: {
    status: string;
    accepted: boolean;
    acceptedAt: string;
    requestedAt: string;
    requestMessageSentAt: string;
    channelUrl: string;
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

type EscrowWalletBalanceState = {
  loading: boolean;
  displayValue: string;
  error: string;
  lastCheckedAt: string;
  cooldownUntilMs: number;
};

type SearchFilters = {
  date: string;
  searchTradeId: string;
  searchBuyer: string;
  searchDepositName: string;
  searchStoreName: string;
  selectedStorecode: string;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isRecord(value) && typeof value.$oid === 'string') return value.$oid;
  return '';
};
const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};
const toNonNegativeNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
};

const normalizeSalesOrder = (value: unknown): AgentSalesOrderItem => {
  const source = isRecord(value) ? value : {};
  const store = isRecord(source.store) ? source.store : {};
  const buyer = isRecord(source.buyer) ? source.buyer : {};
  const seller = isRecord(source.seller) ? source.seller : {};
  const agentInfo = isRecord(source.agent) ? source.agent : {};
  const agentCreditWallet = isRecord(agentInfo.creditWallet) ? agentInfo.creditWallet : {};
  const agentPlatformFee = isRecord(source.agentPlatformFee) ? source.agentPlatformFee : {};
  const buyerBankInfo = isRecord(buyer.bankInfo) ? buyer.bankInfo : {};
  const sellerBankInfo = isRecord(seller.bankInfo) ? seller.bankInfo : {};
  const paymentConfirmedBy = isRecord(source.paymentConfirmedBy) ? source.paymentConfirmedBy : {};
  const platformFee = isRecord(source.platformFee) ? source.platformFee : {};
  const settlement = isRecord(source.settlement) ? source.settlement : {};
  const buyerConsent = isRecord(source.buyerConsent) ? source.buyerConsent : {};
  const usdtAmount = toNumber(source.usdtAmount);

  const resolvedPlatformFeeRate =
    [
      source.platformFeeRate,
      source.platform_fee_rate,
      platformFee.rate,
      platformFee.percentage,
      settlement.platformFeePercent,
      source.tradeFeeRate,
      source.centerFeeRate,
    ]
      .map((candidate) => toNonNegativeNumber(candidate))
      .find((candidate) => candidate !== null)
    || 0;

  const storedPlatformFeeAmount =
    [
      source.platformFeeAmount,
      source.platform_fee_amount,
      platformFee.amountUsdt,
      platformFee.amount,
      settlement.platformFeeAmount,
    ]
      .map((candidate) => toNonNegativeNumber(candidate))
      .find((candidate) => candidate !== null)
    || 0;

  const resolvedPlatformFeeAmount =
    storedPlatformFeeAmount > 0
      ? storedPlatformFeeAmount
      : resolvedPlatformFeeRate > 0 && usdtAmount > 0
        ? Number(((usdtAmount * resolvedPlatformFeeRate) / 100).toFixed(6))
        : 0;

  const storedAgentPlatformFeeAmount =
    [
      agentPlatformFee.amountUsdt,
      agentPlatformFee.expectedAmountUsdt,
      agentPlatformFee.amount,
    ]
      .map((candidate) => toNonNegativeNumber(candidate))
      .find((candidate) => candidate !== null)
    || 0;

  const agentPlatformFeePercent = toNumber(agentPlatformFee.percentage);
  const resolvedAgentPlatformFeeAmount =
    storedAgentPlatformFeeAmount > 0
      ? storedAgentPlatformFeeAmount
      : agentPlatformFeePercent > 0 && usdtAmount > 0
        ? Math.floor(((usdtAmount * agentPlatformFeePercent) / 100) * 1_000_000) / 1_000_000
        : 0;

  return {
    id: toText(source._id) || toText(source.id),
    tradeId: toText(source.tradeId),
    chain: toText(source.chain),
    transactionHash: toText(source.transactionHash),
    cancelReleaseTransactionHash: toText(source.cancelReleaseTransactionHash),
    escrowTransactionHash: toText(source.escrowTransactionHash),
    status: toText(source.status),
    privateSale: source.privateSale === true,
    paymentMethod: toText(source.paymentMethod),
    canceller: toText(source.canceller),
    cancelledByRole: toText(source.cancelledByRole),
    cancelledByWalletAddress: toText(source.cancelledByWalletAddress),
    cancelledByNickname: toText(source.cancelledByNickname),
    cancelledByIpAddress: toText(source.cancelledByIpAddress),
    paymentConfirmedByRole: toText(source.paymentConfirmedByRole) || toText(paymentConfirmedBy.role),
    paymentConfirmedByWalletAddress: toText(source.paymentConfirmedByWalletAddress) || toText(paymentConfirmedBy.walletAddress),
    paymentConfirmedByNickname: toText(source.paymentConfirmedByNickname) || toText(paymentConfirmedBy.nickname),
    paymentConfirmedByIpAddress: toText(source.paymentConfirmedByIpAddress) || toText(paymentConfirmedBy.ipAddress),
    storecode: toText(source.storecode),
    storeName: toText(store.storeName) || toText(source.storeName) || toText(source.storecode),
    walletAddress: toText(source.walletAddress),
    ipAddress: toText(source.ipAddress),
    buyerIpAddress: toText(source.buyerIpAddress),
    buyerNickname: toText(source.nickname) || toText(buyer.nickname),
    buyerDepositName: toText(buyer.depositName) || toText(buyerBankInfo.accountHolder) || toText(buyerBankInfo.depositName),
    buyerWalletAddress: toText(buyer.walletAddress) || toText(source.walletAddress),
    buyerEscrowWalletAddress: toText(buyer.escrowWalletAddress || source.buyerEscrowWalletAddress),
    buyerReleaseTransactionHash: toText(buyer.releaseTransactionHash),
    buyerRollbackTransactionHash: toText(buyer.rollbackTransactionHash),
    sellerNickname: toText(seller.nickname),
    sellerWalletAddress: toText(seller.walletAddress),
    sellerEscrowWalletAddress: toText(seller.escrowWalletAddress || source.sellerEscrowWalletAddress),
    sellerAvatar: toText(seller.avatar),
    sellerBankName: toText(sellerBankInfo.bankName),
    sellerBankAccountNumber: toText(sellerBankInfo.accountNumber),
    sellerBankAccountHolder: toText(sellerBankInfo.accountHolder),
    sellerContactMemo: toText(sellerBankInfo.contactMemo),
    sellerLockTransactionHash: toText(seller.lockTransactionHash),
    sellerRollbackTransactionHash: toText(seller.rollbackTransactionHash),
    sellerReleaseTransactionHash: toText(seller.releaseTransactionHash),
    agentcode: toText(source.agentcode) || toText(seller.agentcode) || toText(agentInfo.agentcode),
    agentName: toText(source.agentName) || toText(agentInfo.agentName),
    agentLogo: toText(source.agentLogo) || toText(agentInfo.agentLogo),
    agentSmartAccountAddress: toText(agentInfo.smartAccountAddress),
    agentCreditWalletSmartAccountAddress: toText(agentCreditWallet.smartAccountAddress),
    agentPlatformFeePercentage: agentPlatformFeePercent,
    agentPlatformFeeAmount: resolvedAgentPlatformFeeAmount,
    agentPlatformFeeFromAddress: toText(agentPlatformFee.fromAddress),
    agentPlatformFeeToAddress: toText(agentPlatformFee.toAddress),
    agentPlatformFeeTransactionHash: toText(
      agentPlatformFee.transactionHash
      || agentPlatformFee.txHash
      || source.agentPlatformFeeTransactionHash,
    ),
    usdtAmount,
    krwAmount: toNumber(source.krwAmount),
    rate: toNumber(source.rate),
    platformFeeRate: resolvedPlatformFeeRate,
    platformFeeAmount: resolvedPlatformFeeAmount,
    platformFeeWalletAddress: toText(
      source.platformFeeWalletAddress
      || platformFee.walletAddress
      || platformFee.address
      || settlement.platformFeeWalletAddress,
    ),
    createdAt: toText(source.createdAt),
    paymentRequestedAt: toText(source.paymentRequestedAt),
    paymentConfirmedAt: toText(source.paymentConfirmedAt),
    buyerConsent: {
      status: toText(buyerConsent.status),
      accepted: buyerConsent.accepted === true || String(buyerConsent.status || '').trim().toLowerCase() === 'accepted',
      acceptedAt: toText(buyerConsent.acceptedAt),
      requestedAt: toText(buyerConsent.requestedAt),
      requestMessageSentAt: toText(buyerConsent.requestMessageSentAt),
      channelUrl: toText(buyerConsent.channelUrl),
    },
  };
};

const shortWallet = (value: string) => {
  const source = String(value || '').trim();
  if (!source) return '-';
  if (source.length <= 12) return source;
  return `${source.slice(0, 6)}...${source.slice(-4)}`;
};

const normalizeWalletKey = (walletAddress: string) => String(walletAddress || '').trim().toLowerCase();

const isWalletAddress = (value: unknown) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

const resolveOrderEscrowWalletAddress = (order: AgentSalesOrderItem) => {
  const candidates = [
    order.buyerEscrowWalletAddress,
    order.sellerEscrowWalletAddress,
  ];

  for (const candidate of candidates) {
    const normalizedAddress = String(candidate || '').trim();
    if (isWalletAddress(normalizedAddress)) {
      return normalizedAddress;
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

const normalizeOrderStatus = (status?: string | null) => String(status || '').trim().toLowerCase();

const getStatusLabel = (status?: string | null) => {
  const normalized = normalizeOrderStatus(status);
  if (normalized === 'ordered') return '주문생성';
  if (normalized === 'accepted') return '주문접수';
  if (normalized === 'paymentrequested') return '입금요청';
  if (normalized === 'paymentconfirmed') return '입금확인';
  if (normalized === 'completed') return '거래완료';
  if (normalized === 'cancelled') return '주문취소';
  return String(status || '').trim() || '-';
};

const getStatusBadgeClassName = (status?: string | null) => {
  const normalized = normalizeOrderStatus(status);
  if (normalized === 'ordered') return 'border-slate-300 bg-slate-100 text-slate-700';
  if (normalized === 'accepted') return 'border-blue-300 bg-blue-100 text-blue-700';
  if (normalized === 'paymentrequested') return 'border-amber-300 bg-amber-100 text-amber-700';
  if (normalized === 'paymentconfirmed') return 'border-emerald-300 bg-emerald-100 text-emerald-700';
  if (normalized === 'completed') return 'border-cyan-300 bg-cyan-100 text-cyan-700';
  if (normalized === 'cancelled') return 'border-rose-300 bg-rose-100 text-rose-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
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

const formatDateOnly = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const formatTimeOnly = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
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

const resolveTransferChain = (order: AgentSalesOrderItem) => {
  const chainFromOrder = normalizeChainKey(order.chain);
  if (chainFromOrder) return chainFromOrder;
  return normalizeChainKey(process.env.NEXT_PUBLIC_CHAIN) || 'polygon';
};

const getTransferExplorerUrlByHash = (order: AgentSalesOrderItem, txHash: string) => {
  const normalizedTxHash = String(txHash || '').trim();
  if (!normalizedTxHash) return '';
  const chain = resolveTransferChain(order);
  const explorerBaseUrl = TX_EXPLORER_BASE_BY_CHAIN[chain];
  if (!explorerBaseUrl) return '';
  return `${explorerBaseUrl}${normalizedTxHash}`;
};
const getSellerDisplayName = (item: SellerSalesSummaryItem) =>
  String(item.sellerNickname || '').trim() || shortWallet(item.sellerWalletAddress) || '-';
const getSellerAvatarFallback = (item: SellerSalesSummaryItem) => {
  const name = getSellerDisplayName(item).replace(/\s+/g, '');
  if (!name || name === '-') return 'S';
  return name.slice(0, 1).toUpperCase();
};
const formatPercent = (value: number) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0';
  return (Math.round(numeric * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
};

const roundDownUsdtSix = (value: number) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor((numeric + Number.EPSILON) * 1_000_000) / 1_000_000;
};

const formatUsdtSix = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(roundDownUsdtSix(value));

const formatRate = (value?: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '-';
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(numeric);
};

const getOrderExchangeRate = (order: AgentSalesOrderItem) => {
  const explicitRate = Number(order.rate || 0);
  if (Number.isFinite(explicitRate) && explicitRate > 0) return explicitRate;

  const krwAmount = Number(order.krwAmount || 0);
  const usdtAmount = Number(order.usdtAmount || 0);
  if (Number.isFinite(krwAmount) && Number.isFinite(usdtAmount) && krwAmount > 0 && usdtAmount > 0) {
    return krwAmount / usdtAmount;
  }

  return 0;
};
const PAGE_SIZE = 20;
const POLLING_INTERVAL_MS = 5000;
const BALANCE_CHECK_COOLDOWN_MS = 10_000;
const PAYMENT_REQUEST_COUNTDOWN_LIMIT_MS = 30 * 60 * 1000;
const SENDBIRD_APP_ID = process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID
  || process.env.NEXT_PUBLIC_SENDBIRD_APP_ID
  || '';
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

const getPaymentRequestedRemainingMs = (order: AgentSalesOrderItem, nowMs: number) => {
  const baseTimeSource = String(order.paymentRequestedAt || order.createdAt || '').trim();
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

const resolveCancellerRole = (order: AgentSalesOrderItem): 'buyer' | 'seller' | 'admin' | 'agent' | 'unknown' => {
  const role = String(order.cancelledByRole || order.canceller || '').trim().toLowerCase();
  if (role === 'buyer' || role.includes('구매')) return 'buyer';
  if (role === 'seller' || role.includes('판매')) return 'seller';
  if (role === 'admin' || role.includes('관리')) return 'admin';
  if (role === 'agent' || role.includes('에이전트')) return 'agent';
  return 'unknown';
};

const getCancellerRoleLabel = (order: AgentSalesOrderItem) => {
  const role = resolveCancellerRole(order);
  if (role === 'buyer') return '구매자';
  if (role === 'seller') return '판매자';
  if (role === 'admin') return '관리자';
  if (role === 'agent') return '에이전트';
  return '미확인';
};

const getCancellerLabel = (order: AgentSalesOrderItem) => {
  const nickname = String(order.cancelledByNickname || '').trim();
  const walletAddress = String(order.cancelledByWalletAddress || '').trim();
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

const getBuyerDepositNameLabel = (order: AgentSalesOrderItem) =>
  String(order.buyerDepositName || '').trim() || '-';

const getOrderBuyerConsentSnapshot = (order: AgentSalesOrderItem): BuyerConsentSnapshot => {
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

const getBuyerIp = (order: AgentSalesOrderItem) => {
  const candidates = [
    order.buyerIpAddress,
    order.ipAddress,
    String(order.cancelledByRole || '').trim().toLowerCase() === 'buyer' ? order.cancelledByIpAddress : '',
    String(order.paymentConfirmedByRole || '').trim().toLowerCase() === 'buyer' ? order.paymentConfirmedByIpAddress : '',
  ];

  for (const candidate of candidates) {
    const normalizedIpAddress = String(candidate || '').trim();
    if (normalizedIpAddress) return normalizedIpAddress;
  }

  return '-';
};

const getPaymentMethodLabel = (order: AgentSalesOrderItem) => {
  const method = String(order.paymentMethod || '').trim().toLowerCase();
  const bankName = String(order.sellerBankName || '').trim();

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

const isContactTransferPayment = (order: AgentSalesOrderItem) => {
  const method = String(order.paymentMethod || '').trim().toLowerCase();
  const bankName = String(order.sellerBankName || '').trim();
  return bankName === '연락처송금' || method === 'contact';
};

const getPaymentMethodDetail = (order: AgentSalesOrderItem) => {
  if (isContactTransferPayment(order)) {
    return String(order.sellerContactMemo || '').trim() || '-';
  }

  const method = String(order.paymentMethod || '').trim().toLowerCase();
  const bankName = String(order.sellerBankName || '').trim();
  const accountNumber = String(order.sellerBankAccountNumber || '').trim();
  const accountHolder = String(order.sellerBankAccountHolder || '').trim();
  const isBankInfoPayment = method === 'bank' || Boolean(bankName || accountNumber || accountHolder);
  if (!isBankInfoPayment) return '-';

  const bankInfoParts = [bankName, accountNumber, accountHolder].filter(Boolean);
  return bankInfoParts.join(' ').trim() || '-';
};

const resolveTransferTransactionHash = (order: AgentSalesOrderItem) =>
  String(order.transactionHash || order.buyerReleaseTransactionHash || order.sellerReleaseTransactionHash || '').trim();

const resolveCancelRecoveryTransactionHash = (order: AgentSalesOrderItem) =>
  String(order.cancelReleaseTransactionHash || order.buyerRollbackTransactionHash || order.sellerRollbackTransactionHash || '').trim();

const resolvePaymentConfirmerRole = (order: AgentSalesOrderItem): 'buyer' | 'seller' | 'admin' | 'unknown' => {
  const role = String(order.paymentConfirmedByRole || '').trim().toLowerCase();
  if (role === 'buyer' || role.includes('구매')) return 'buyer';
  if (role === 'seller' || role.includes('판매')) return 'seller';
  if (role === 'admin' || role.includes('관리')) return 'admin';
  return 'unknown';
};

const getPaymentConfirmerLabel = (order: AgentSalesOrderItem) => {
  const nickname = String(order.paymentConfirmedByNickname || order.sellerNickname || '').trim();
  const walletAddress = String(order.paymentConfirmedByWalletAddress || order.sellerWalletAddress || '').trim();
  const role = resolvePaymentConfirmerRole(order);

  if (nickname && walletAddress) return `${nickname} (${shortWallet(walletAddress)})`;
  if (nickname) return nickname;
  if (walletAddress) return shortWallet(walletAddress);
  if (role === 'buyer') return '구매자';
  if (role === 'seller') return '판매자';
  if (role === 'admin') return '관리자';
  return '-';
};

const getPaymentConfirmerIp = (order: AgentSalesOrderItem) =>
  String(order.paymentConfirmedByIpAddress || '').trim() || '-';

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
    searchDepositName: '',
    searchStoreName: '',
    selectedStorecode: '',
  };
};

export default function P2PAgentSalesManagementPage() {
  const searchParams = useSearchParams();
  const activeAccount = useActiveAccount();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [orders, setOrders] = useState<AgentSalesOrderItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [copiedTradeId, setCopiedTradeId] = useState('');
  const [copiedWalletAddress, setCopiedWalletAddress] = useState('');
  const [escrowWalletBalanceByAddress, setEscrowWalletBalanceByAddress] = useState<
    Record<string, EscrowWalletBalanceState>
  >({});
  const [escrowWalletBalanceTickMs, setEscrowWalletBalanceTickMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isOrderChatDrawerOpen, setIsOrderChatDrawerOpen] = useState(false);
  const [selectedOrderChatChannelUrl, setSelectedOrderChatChannelUrl] = useState('');
  const [selectedOrderChatTradeId, setSelectedOrderChatTradeId] = useState('');
  const [orderChatSessionToken, setOrderChatSessionToken] = useState<string | null>(null);
  const [orderChatSessionLoading, setOrderChatSessionLoading] = useState(false);
  const [orderChatSessionError, setOrderChatSessionError] = useState<string | null>(null);
  const [cancelTargetOrder, setCancelTargetOrder] = useState<AgentSalesOrderItem | null>(null);
  const [cancelingOrder, setCancelingOrder] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelProgressSteps, setCancelProgressSteps] =
    useState<CancelOrderProgressStepItem[]>(createInitialCancelOrderProgressSteps());
  const [cancelProgressSummary, setCancelProgressSummary] = useState('취소 요청 전입니다.');
  const [cancelProgressPhase, setCancelProgressPhase] = useState<'idle' | 'processing' | 'completed' | 'error'>('idle');
  const requestInFlightRef = useRef(false);
  const orderChatViewerUserId = String(activeAccount?.address || agent?.adminWalletAddress || '').trim();
  const orderChatViewerNickname = String(agent?.agentName || '').trim() || '에이전트';

  const loadData = useCallback(async (mode: 'manual' | 'polling' = 'manual') => {
    if (!agentcode) {
      setAgent(null);
      setOrders([]);
      setTotalCount(0);
      setPolling(false);
      setError(null);
      return;
    }

    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    if (mode === 'polling') {
      setPolling(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const selectedDate = appliedFilters.date || getTodayDate();
      const [agentData, response] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetch('/api/agent/get-buyorders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentcode,
            page: 1,
            limit: 200,
            searchTerm: '',
            status: 'all',
            hasBankInfo: 'all',
            startDate: selectedDate,
            endDate: selectedDate,
          }),
        }),
      ]);

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '판매 거래내역을 불러오지 못했습니다.'));
      }

      const payloadRecord = isRecord(payload) ? payload : {};
      const payloadResult = isRecord(payloadRecord.result) ? payloadRecord.result : {};
      const items = Array.isArray(payloadRecord.items)
        ? (payloadRecord.items as unknown[])
        : Array.isArray(payloadResult.orders)
        ? (payloadResult.orders as unknown[])
        : [];
      const normalizedOrders = items.map((item) => normalizeSalesOrder(item));
      const resolvedTotalCount = toNumber(payloadRecord.totalCount || payloadResult.totalCount || normalizedOrders.length);

      setAgent(agentData);
      setOrders(normalizedOrders);
      setTotalCount(resolvedTotalCount);
    } catch (loadError) {
      if (mode === 'polling') {
        console.error('Failed to poll agent sales orders', loadError);
      } else {
        setAgent(null);
        setOrders([]);
        setTotalCount(0);
        setError(loadError instanceof Error ? loadError.message : '판매 거래내역을 불러오지 못했습니다.');
      }
    } finally {
      requestInFlightRef.current = false;
      if (mode === 'polling') {
        setPolling(false);
      } else {
        setLoading(false);
      }
    }
  }, [agentcode, appliedFilters.date]);

  useEffect(() => {
    void loadData('manual');
    const interval = setInterval(() => {
      void loadData('polling');
    }, POLLING_INTERVAL_MS);
    return () => {
      clearInterval(interval);
    };
  }, [loadData]);

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
    if (!isOrderChatDrawerOpen) {
      setOrderChatSessionError(null);
      return;
    }
    if (!SENDBIRD_APP_ID) {
      setOrderChatSessionToken(null);
      setOrderChatSessionError('채팅 설정이 비어 있습니다. NEXT_PUBLIC_SENDBIRD_APP_ID 값을 확인해 주세요.');
      return;
    }
    if (!orderChatViewerUserId) {
      setOrderChatSessionToken(null);
      setOrderChatSessionError('에이전트 지갑 정보를 확인할 수 없습니다.');
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
            userId: orderChatViewerUserId,
            nickname: orderChatViewerNickname || `agent_${orderChatViewerUserId.slice(0, 6)}`,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.sessionToken) {
          throw new Error(payload?.error || '에이전트 채팅 세션 토큰 발급에 실패했습니다.');
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
  }, [isOrderChatDrawerOpen, orderChatViewerNickname, orderChatViewerUserId]);

  const filteredOrders = useMemo(() => {
    const normalizedTradeId = appliedFilters.searchTradeId.trim().toLowerCase();
    const normalizedBuyer = appliedFilters.searchBuyer.trim().toLowerCase();
    const normalizedDepositName = appliedFilters.searchDepositName.trim().toLowerCase();
    const normalizedStoreName = appliedFilters.searchStoreName.trim().toLowerCase();
    const normalizedSelectedStorecode = appliedFilters.selectedStorecode.trim().toLowerCase();

    return orders.filter((order) => {
      const orderTradeId = String(order.tradeId || '').toLowerCase();
      const orderBuyerNickname = String(order.buyerNickname || '').toLowerCase();
      const orderDepositName = String(order.buyerDepositName || '').toLowerCase();
      const orderStoreName = String(order.storeName || '').toLowerCase();
      const orderStorecode = String(order.storecode || '').toLowerCase();

      if (normalizedTradeId && !orderTradeId.includes(normalizedTradeId)) return false;
      if (normalizedBuyer && !orderBuyerNickname.includes(normalizedBuyer)) return false;
      if (normalizedDepositName && !orderDepositName.includes(normalizedDepositName)) return false;
      if (normalizedSelectedStorecode && orderStorecode !== normalizedSelectedStorecode) return false;
      if (normalizedStoreName && !orderStoreName.includes(normalizedStoreName) && !orderStorecode.includes(normalizedStoreName)) {
        return false;
      }

      return true;
    });
  }, [
    appliedFilters.searchBuyer,
    appliedFilters.searchDepositName,
    appliedFilters.selectedStorecode,
    appliedFilters.searchStoreName,
    appliedFilters.searchTradeId,
    orders,
  ]);

  const selectableStores = useMemo(() => {
    const storeMap = new Map<string, { storecode: string; storeName: string }>();
    orders.forEach((order) => {
      const storecode = String(order.storecode || '').trim();
      if (!storecode) return;
      const normalizedStorecode = storecode.toLowerCase();
      const storeName = String(order.storeName || '').trim() || storecode;
      if (!storeMap.has(normalizedStorecode)) {
        storeMap.set(normalizedStorecode, { storecode, storeName });
      }
    });

    return Array.from(storeMap.values()).sort((a, b) => (
      a.storeName.localeCompare(b.storeName, 'ko')
      || a.storecode.localeCompare(b.storecode, 'ko')
    ));
  }, [orders]);

  const dashboardStats = useMemo(() => {
    let paymentRequestedCount = 0;
    let paymentConfirmedCount = 0;
    let cancelledCount = 0;
    let paymentConfirmedKrwAmount = 0;
    let paymentConfirmedUsdtAmount = 0;

    filteredOrders.forEach((order) => {
      const status = normalizeOrderStatus(order.status);
      if (status === 'paymentrequested') {
        paymentRequestedCount += 1;
      }
      if (status === 'paymentconfirmed') {
        paymentConfirmedCount += 1;
        paymentConfirmedKrwAmount += Number(order.krwAmount || 0) || 0;
        paymentConfirmedUsdtAmount += Number(order.usdtAmount || 0) || 0;
      }
      if (status === 'cancelled') {
        cancelledCount += 1;
      }
    });

    return {
      paymentRequestedCount,
      paymentConfirmedCount,
      cancelledCount,
      paymentConfirmedKrwAmount,
      paymentConfirmedUsdtAmount,
    };
  }, [filteredOrders]);

  const sellerSalesSummarySorted = useMemo(() => {
    const summaryBySeller = new Map<string, SellerSalesSummaryItem>();

    filteredOrders.forEach((order) => {
      const orderStatus = normalizeOrderStatus(order.status);
      if (orderStatus !== 'paymentconfirmed') return;

      const walletAddress = String(order.sellerWalletAddress || '').trim();
      const nickname = String(order.sellerNickname || '').trim();
      const avatar = String(order.sellerAvatar || '').trim();
      const key = walletAddress
        ? walletAddress.toLowerCase()
        : `nickname:${nickname.toLowerCase() || 'unknown'}`;

      const current = summaryBySeller.get(key);
      if (!current) {
        summaryBySeller.set(key, {
          sellerWalletAddress: walletAddress,
          sellerNickname: nickname,
          sellerAvatar: avatar,
          totalKrwAmount: Number(order.krwAmount || 0) || 0,
          totalUsdtAmount: Number(order.usdtAmount || 0) || 0,
          paymentConfirmedCount: 1,
          latestCreatedAt: String(order.createdAt || '').trim(),
        });
        return;
      }

      current.totalKrwAmount += Number(order.krwAmount || 0) || 0;
      current.totalUsdtAmount += Number(order.usdtAmount || 0) || 0;
      current.paymentConfirmedCount += 1;
      if (!current.sellerAvatar && avatar) current.sellerAvatar = avatar;
      if (!current.sellerNickname && nickname) current.sellerNickname = nickname;
      if (!current.sellerWalletAddress && walletAddress) current.sellerWalletAddress = walletAddress;

      const currentLatestTime = new Date(current.latestCreatedAt).getTime();
      const nextLatestTime = new Date(String(order.createdAt || '').trim()).getTime();
      if (Number.isFinite(nextLatestTime) && (!Number.isFinite(currentLatestTime) || nextLatestTime > currentLatestTime)) {
        current.latestCreatedAt = String(order.createdAt || '').trim();
      }
    });

    return Array.from(summaryBySeller.values()).sort((a, b) => (
      (b.totalKrwAmount - a.totalKrwAmount)
      || (b.totalUsdtAmount - a.totalUsdtAmount)
      || (b.paymentConfirmedCount - a.paymentConfirmedCount)
    ));
  }, [filteredOrders]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE)),
    [filteredOrders.length],
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredOrders.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredOrders]);

  const visiblePageNumbers = useMemo(() => {
    const windowSize = 5;
    const start = Math.max(1, currentPage - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    const adjustedStart = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [currentPage, totalPages]);

  const isPreviousDisabled = currentPage <= 1 || loading;
  const isNextDisabled = currentPage >= totalPages || loading;

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedFilters: SearchFilters = {
      date: draftFilters.date || getTodayDate(),
      searchTradeId: draftFilters.searchTradeId.trim(),
      searchBuyer: draftFilters.searchBuyer.trim(),
      searchDepositName: draftFilters.searchDepositName.trim(),
      searchStoreName: draftFilters.searchStoreName.trim(),
      selectedStorecode: draftFilters.selectedStorecode.trim(),
    };
    setCurrentPage(1);
    setAppliedFilters(normalizedFilters);
  };

  const handleSearchReset = () => {
    const defaults = createDefaultFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setCurrentPage(1);
  };

  const copyTradeId = useCallback(async (tradeId: string) => {
    const normalizedTradeId = String(tradeId || '').trim();
    if (!normalizedTradeId) return;

    try {
      await navigator.clipboard.writeText(normalizedTradeId);
      setCopiedTradeId(normalizedTradeId);
      toast.success('거래번호를 복사했습니다.');
      setTimeout(() => {
        setCopiedTradeId((current) => (current === normalizedTradeId ? '' : current));
      }, 1400);
    } catch (clipboardError) {
      toast.error('거래번호 복사에 실패했습니다.');
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

  const closeCancelModal = () => {
    if (cancelingOrder) return;
    setCancelTargetOrder(null);
    setCancelError(null);
    resetCancelOrderProgressFlow();
  };

  const cancelPrivateOrderByAgent = useCallback(async () => {
    const failCancel = (message: string) => {
      setCancelError(message);
      markCancelProgressAsError(message);
      toast.error(message);
      return false;
    };

    const targetOrderId = String(cancelTargetOrder?.id || '').trim();
    if (!targetOrderId) {
      return failCancel('취소할 주문 식별자를 찾을 수 없습니다.');
    }
    if (cancelingOrder) return false;

    const actorWalletAddress = String(activeAccount?.address || agent?.adminWalletAddress || '').trim();
    const actorNickname = String(agent?.agentName || '').trim() || '에이전트';

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
          adminWalletAddress: actorWalletAddress,
          cancelledByRole: 'agent',
          cancelledByNickname: actorNickname,
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
            console.warn('cancelPrivateOrderByAgent progress line parse failed', parseError);
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
      await loadData();
      return true;
    } catch (cancelErrorValue) {
      const message = cancelErrorValue instanceof Error ? cancelErrorValue.message : '주문 취소 처리 중 오류가 발생했습니다.';
      return failCancel(message);
    } finally {
      setCancelingOrder(false);
    }
  }, [
    activeAccount?.address,
    agent?.adminWalletAddress,
    agent?.agentName,
    applyCancelProgressEvent,
    cancelTargetOrder?.id,
    cancelingOrder,
    loadData,
    markCancelProgressAsError,
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
      closeCancelModal();
      return;
    }
    await cancelPrivateOrderByAgent();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Buyorder Management</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">구매주문 관리</h1>
        <p className="mt-1 text-sm text-slate-600">agentcode 기준 buyorders P2P 거래내역을 조회합니다.</p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 구매주문 관리 페이지를 사용할 수 있습니다.
        </div>
      )}

      {agentcode && (
        <>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                void loadData();
              }}
              disabled={loading || polling}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '조회 중...' : polling ? '동기화 중...' : '새로고침'}
            </button>
          </div>

          <AgentInfoCard agent={agent} fallbackAgentcode={agentcode} />

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <form className="grid grid-cols-1 gap-3 lg:grid-cols-12" onSubmit={handleSearchSubmit}>
              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  조회 일자
                </label>
                <input
                  type="date"
                  value={draftFilters.date}
                  onChange={(event) => setDraftFilters((prev) => ({ ...prev, date: event.target.value }))}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500"
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
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
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
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
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
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
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
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  가맹점 선택
                </label>
                <select
                  value={draftFilters.selectedStorecode}
                  onChange={(event) => setDraftFilters((prev) => ({ ...prev, selectedStorecode: event.target.value }))}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500"
                >
                  <option value="">전체 가맹점</option>
                  {selectableStores.map((store) => (
                    <option key={store.storecode} value={store.storecode}>
                      {store.storeName} ({store.storecode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-12 flex items-end justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSearchReset}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  초기화
                </button>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  검색
                </button>
              </div>
            </form>
          </section>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">전체 거래</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{totalCount.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">표시중</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{filteredOrders.length.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-700">입금확인</p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">{dashboardStats.paymentConfirmedCount.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50/50 px-4 py-3">
              <p className="text-xs font-semibold text-rose-700">주문취소</p>
              <p className="mt-1 text-2xl font-bold text-rose-800">{dashboardStats.cancelledCount.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-3">
              <p className="text-xs font-semibold text-amber-700">입금요청</p>
              <p className="mt-1 text-2xl font-bold text-amber-800">{dashboardStats.paymentRequestedCount.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">총 결제 금액</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {String(formatKrw(dashboardStats.paymentConfirmedKrwAmount)).replace(/원$/, '').trim()} KRW
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">총 주문 수량</p>
              <p className="mt-1 text-xl font-bold text-cyan-700">{formatUsdt(dashboardStats.paymentConfirmedUsdtAmount)}</p>
            </div>
          </section>

          {!loading && !error && (
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
                            <p className="justify-self-end text-[11px] font-extrabold text-slate-900">
                              {String(formatKrw(item.totalKrwAmount)).replace(/원$/, '').trim()} KRW
                            </p>
                            <p className="font-semibold text-slate-500">합산 판매수량</p>
                            <p className="justify-self-end text-[11px] font-extrabold text-slate-900">
                              {new Intl.NumberFormat('ko-KR', {
                                minimumFractionDigits: 3,
                                maximumFractionDigits: 3,
                              }).format(Number(item.totalUsdtAmount || 0))} USDT
                            </p>
                            <p className="font-semibold text-slate-500">입금확인건수</p>
                            <p className="justify-self-end text-[11px] font-extrabold text-slate-900">{item.paymentConfirmedCount.toLocaleString()}건</p>
                            <p className="font-semibold text-slate-500">최근 주문시각</p>
                            <p
                              className="justify-self-end truncate text-[10px] font-semibold text-slate-700"
                              title={toDateTime(item.latestCreatedAt)}
                            >
                              {toDateTime(item.latestCreatedAt)}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              판매 거래내역을 불러오는 중입니다...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div>
          )}

          {!loading && !error && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full table-fixed">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-[10%] px-3 py-3">상태</th>
                    <th className="w-[13%] px-3 py-3">주문시각/거래번호(TID)</th>
                    <th className="w-[10%] px-3 py-3">구매자</th>
                    <th className="w-[9%] px-3 py-3 text-right">주문금액</th>
                    <th className="w-[14%] px-3 py-3">판매자/결제방법</th>
                    <th className="w-[13%] px-3 py-3">에이전트 정보</th>
                    <th className="w-[9%] px-3 py-3">플랫폼 수수료</th>
                    <th className="w-[7%] px-3 py-3">전송내역</th>
                    <th className="w-[8%] px-3 py-3">이용동의</th>
                    <th className="w-[5%] px-3 py-3 text-center">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-500">
                        표시할 거래가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map((order) => {
                      const orderStatus = normalizeOrderStatus(order.status);
                      const isPaymentRequested = orderStatus === 'paymentrequested';
                      const isPaymentConfirmed = orderStatus === 'paymentconfirmed';
                      const isCancelled = orderStatus === 'cancelled';
                      const paymentRequestedRemainingMs = isPaymentRequested
                        ? getPaymentRequestedRemainingMs(order, nowMs)
                        : null;
                      const transferTxHash = resolveTransferTransactionHash(order);
                      const cancelReleaseTxHash = resolveCancelRecoveryTransactionHash(order);
                      const cancelReleaseTxUrl = getTransferExplorerUrlByHash(order, cancelReleaseTxHash);
                      const fallbackTransferTxHash = isCancelled ? '' : transferTxHash;
                      const fallbackTransferTxUrl = getTransferExplorerUrlByHash(order, fallbackTransferTxHash);
                      const sellerLockTxHash = String(order.sellerLockTransactionHash || '').trim();
                      const sellerLockTxUrl = getTransferExplorerUrlByHash(order, sellerLockTxHash);
                      const escrowTransferTxHash = String(order.escrowTransactionHash || '').trim();
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
                      const canCancelOrderByStatus = order.privateSale === true && orderStatus === 'paymentrequested';
                      const canCancelOrder = Boolean(activeAccount?.address || agent?.adminWalletAddress) && canCancelOrderByStatus;
                      const platformFeeRate = Number(order.platformFeeRate || 0) || 0;
                      const platformFeeAmount = Number(order.platformFeeAmount || 0) || 0;
                      const platformFeeWalletAddress = String(order.platformFeeWalletAddress || '').trim();
                      const agentPlatformFeeRate = Number(order.agentPlatformFeePercentage || 0) || 0;
                      const agentPlatformFeeAmount = Number(order.agentPlatformFeeAmount || 0) || 0;
                      const agentPlatformFeeFromAddress = String(order.agentPlatformFeeFromAddress || '').trim();
                      const agentPlatformFeeToAddress = String(order.agentPlatformFeeToAddress || '').trim();
                      const agentPlatformFeeTransactionHash = String(order.agentPlatformFeeTransactionHash || '').trim();
                      const isCompletedLikeOrderStatus =
                        orderStatus === 'paymentconfirmed' || orderStatus === 'completed';
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
                      const buyerWalletAddress = String(order.buyerWalletAddress || order.walletAddress || '').trim();
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
                      const sellerEscrowWalletAddress = String(order.sellerEscrowWalletAddress || '').trim();
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
                      const resolvedAgentName = String(
                        order.agentName || agent?.agentName || order.agentcode || agent?.agentcode || '',
                      ).trim() || '-';
                      const resolvedAgentLogo = String(order.agentLogo || agent?.agentLogo || '').trim();
                      const agentCreditWalletAddress = String(
                        order.agentCreditWalletSmartAccountAddress
                        || order.agentSmartAccountAddress
                        || order.agentPlatformFeeFromAddress
                        || '',
                      ).trim();
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
                      const orderCreatedDateLabel = formatDateOnly(order.createdAt);
                      const orderCreatedTimeLabel = formatTimeOnly(order.createdAt);

                      return (
                      <tr key={order.id || order.tradeId} className="bg-white text-sm text-slate-700">
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClassName(order.status)}`}>
                              {getStatusLabel(order.status)}
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
                            {orderStatus === 'cancelled' && (
                              <>
                                <p className="truncate text-[11px] font-semibold text-slate-600">
                                  취소주체 {getCancellerRoleLabel(order)}
                                </p>
                                <p className="truncate text-[11px] text-slate-500">
                                  취소자 {getCancellerLabel(order)}
                                </p>
                                <p className="break-all text-[11px] leading-tight text-slate-500">
                                  IP {order.cancelledByIpAddress || '-'}
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
                          <div className="flex flex-col leading-tight">
                            <span className="text-[12px] font-semibold text-slate-700">
                              {orderCreatedDateLabel}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">
                              {orderCreatedTimeLabel}
                            </span>
                            {order.tradeId ? (
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

                            {escrowWalletAddress ? (
                              <div className="mt-2 flex flex-col gap-1 border-t border-slate-100 pt-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void copyWalletAddress(escrowWalletAddress);
                                  }}
                                  className="inline-flex w-fit items-center gap-1 truncate text-[11px] font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-cyan-700 hover:decoration-cyan-300"
                                  title={escrowWalletAddress}
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
                                    className={`inline-flex h-6 w-fit items-center justify-center rounded-md border px-2 text-[10px] font-semibold transition ${
                                      escrowWalletBalanceState?.loading
                                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                                    }`}
                                  >
                                    {escrowWalletBalanceState?.loading ? '조회중...' : '잔고확인'}
                                  </button>
                                ) : (
                                  <div className="flex w-[84px] flex-col gap-1">
                                    <span className="text-[10px] font-semibold text-amber-700">
                                      <span>{escrowWalletCooldownRemainingSeconds}s</span>
                                    </span>
                                    <span className="h-1.5 overflow-hidden rounded-full bg-amber-100">
                                      <span
                                        className="block h-full rounded-full bg-amber-500 transition-all duration-200"
                                        style={{ width: `${escrowWalletCooldownProgressPercent.toFixed(2)}%` }}
                                      />
                                    </span>
                                  </div>
                                )}
                                <span className={`text-[10px] ${
                                  escrowWalletBalanceState?.error ? 'text-rose-600' : 'text-slate-600'
                                }`}>
                                  {escrowWalletBalanceState?.error
                                    ? escrowWalletBalanceState.error
                                    : escrowWalletBalanceState?.displayValue
                                    ? `${escrowWalletBalanceState.displayValue} USDT`
                                    : '잔고 미조회'}
                                </span>
                              </div>
                            ) : (
                              <span className="mt-1 text-[10px] text-slate-400">에스크로 지갑 미확인</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <span className="break-all text-base font-extrabold leading-tight text-slate-900">
                              {getBuyerDepositNameLabel(order)}
                            </span>
                            <span className="truncate font-medium text-slate-900">
                              {order.buyerNickname || '-'}
                            </span>
                            {buyerWalletAddress ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void copyWalletAddress(buyerWalletAddress);
                                }}
                                className="mt-0.5 inline-flex w-fit items-center gap-1 truncate text-xs text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-cyan-700 hover:decoration-cyan-300"
                                title={buyerWalletAddress}
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
                                    className={`inline-flex h-6 w-fit items-center justify-center rounded-md border px-2 text-[10px] font-semibold transition ${
                                      buyerWalletBalanceState?.loading
                                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                                    }`}
                                  >
                                    {buyerWalletBalanceState?.loading ? '조회중...' : '잔고확인'}
                                  </button>
                                ) : (
                                  <div className="flex w-[84px] flex-col gap-1">
                                    <span className="text-[10px] font-semibold text-amber-700">
                                      <span>{buyerWalletCooldownRemainingSeconds}s</span>
                                    </span>
                                    <span className="h-1.5 overflow-hidden rounded-full bg-amber-100">
                                      <span
                                        className="block h-full rounded-full bg-amber-500 transition-all duration-200"
                                        style={{ width: `${buyerWalletCooldownProgressPercent.toFixed(2)}%` }}
                                      />
                                    </span>
                                  </div>
                                )}
                                <span className={`text-[10px] ${
                                  buyerWalletBalanceState?.error ? 'text-rose-600' : 'text-slate-600'
                                }`}>
                                  {buyerWalletBalanceState?.error
                                    ? buyerWalletBalanceState.error
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
                            <span className="text-base font-extrabold leading-tight text-slate-900">
                              {String(formatKrw(order.krwAmount)).replace(/원$/, '').trim()} KRW
                            </span>
                            <span className="text-sm font-bold text-slate-600">
                              {new Intl.NumberFormat('ko-KR', {
                                minimumFractionDigits: 3,
                                maximumFractionDigits: 3,
                              }).format(Number(order.usdtAmount || 0))} USDT
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500">
                              환율 {formatRate(getOrderExchangeRate(order))}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-col">
                              <span className="truncate text-base font-extrabold leading-tight text-slate-900">{order.sellerNickname || '-'}</span>
                              {sellerEscrowWalletAddress ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void copyWalletAddress(sellerEscrowWalletAddress);
                                  }}
                                  className="mt-0.5 inline-flex w-fit items-center gap-1 truncate text-xs text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-cyan-700 hover:decoration-cyan-300"
                                  title={sellerEscrowWalletAddress}
                                >
                                  {shortWallet(sellerEscrowWalletAddress)}
                                  {copiedWalletAddress === sellerEscrowWalletAddress && (
                                    <span className="text-[10px] font-semibold text-cyan-700">복사됨</span>
                                  )}
                                </button>
                              ) : (
                                <span className="truncate text-xs text-slate-400">에스크로 지갑 미확인</span>
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
                                      className={`inline-flex h-6 w-fit items-center justify-center rounded-md border px-2 text-[10px] font-semibold transition ${
                                        sellerEscrowWalletBalanceState?.loading
                                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                                      }`}
                                    >
                                      {sellerEscrowWalletBalanceState?.loading ? '조회중...' : '잔고확인'}
                                    </button>
                                  ) : (
                                    <div className="flex w-[84px] flex-col gap-1">
                                      <span className="text-[10px] font-semibold text-amber-700">
                                        <span>{sellerEscrowWalletCooldownRemainingSeconds}s</span>
                                      </span>
                                      <span className="h-1.5 overflow-hidden rounded-full bg-amber-100">
                                        <span
                                          className="block h-full rounded-full bg-amber-500 transition-all duration-200"
                                          style={{ width: `${sellerEscrowWalletCooldownProgressPercent.toFixed(2)}%` }}
                                        />
                                      </span>
                                    </div>
                                  )}
                                  <span className={`text-[10px] ${
                                    sellerEscrowWalletBalanceState?.error ? 'text-rose-600' : 'text-slate-600'
                                  }`}>
                                    {sellerEscrowWalletBalanceState?.error
                                      ? sellerEscrowWalletBalanceState.error
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
                              {resolvedAgentLogo ? (
                                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white">
                                  <span
                                    className="h-full w-full bg-cover bg-center"
                                    style={{ backgroundImage: `url(${encodeURI(resolvedAgentLogo)})` }}
                                    aria-label={resolvedAgentName}
                                  />
                                </span>
                              ) : (
                                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-500">
                                  A
                                </span>
                              )}
                              <span className="truncate text-xs font-semibold text-slate-700">{resolvedAgentName}</span>
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
                                    className={`inline-flex h-6 w-fit items-center justify-center rounded-md border px-2 text-[10px] font-semibold transition ${
                                      agentCreditWalletBalanceState?.loading
                                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                                    }`}
                                  >
                                    {agentCreditWalletBalanceState?.loading ? '조회중...' : '잔고확인'}
                                  </button>
                                ) : (
                                  <div className="flex w-[84px] flex-col gap-1">
                                    <span className="text-[10px] font-semibold text-amber-700">
                                      <span>{agentCreditWalletCooldownRemainingSeconds}s</span>
                                    </span>
                                    <span className="h-1.5 overflow-hidden rounded-full bg-amber-100">
                                      <span
                                        className="block h-full rounded-full bg-amber-500 transition-all duration-200"
                                        style={{ width: `${agentCreditWalletCooldownProgressPercent.toFixed(2)}%` }}
                                      />
                                    </span>
                                  </div>
                                )}
                                <span className={`text-[10px] ${
                                  agentCreditWalletBalanceState?.error ? 'text-rose-600' : 'text-slate-600'
                                }`}>
                                  {agentCreditWalletBalanceState?.error
                                    ? agentCreditWalletBalanceState.error
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
                                    {formatUsdt(platformFeeAmount)}
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
                                  <span className="inline-flex w-fit whitespace-nowrap rounded-md bg-sky-50 px-2 py-0.5 text-xs font-extrabold text-sky-700">
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
                                  <span className="inline-flex w-fit whitespace-nowrap rounded-md bg-rose-50 px-2 py-0.5 text-xs font-extrabold text-rose-700">
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
                                  <span className="inline-flex w-fit whitespace-nowrap rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-700">
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
                                  <span className="inline-flex w-fit whitespace-nowrap rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
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
                              <span className="inline-flex w-fit items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                동의완료
                              </span>
                            ) : (
                              <span className="inline-flex w-fit items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                                미완료
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {canCancelOrderByStatus ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!canCancelOrder) return;
                                setCancelTargetOrder(order);
                                setCancelError(null);
                                resetCancelOrderProgressFlow();
                              }}
                              disabled={!canCancelOrder}
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
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && filteredOrders.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600">
                  페이지 {currentPage} / {totalPages} · 총 {filteredOrders.length.toLocaleString()}건
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={isPreviousDisabled}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    이전
                  </button>

                  {visiblePageNumbers.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setCurrentPage(pageNumber)}
                      disabled={loading}
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition ${
                        pageNumber === currentPage
                          ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      {pageNumber}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={isNextDisabled}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    다음
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}

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
              ) : !orderChatViewerUserId ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  에이전트 지갑 정보 확인 후 채팅 내역을 확인할 수 있습니다.
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
                    userId={orderChatViewerUserId}
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
          onClick={closeCancelModal}
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
              <div className="grid grid-cols-[126px_1fr] gap-x-3 gap-y-3">
                <p className="text-sm font-semibold text-slate-500">주문 ID</p>
                <p className="break-all text-base font-medium text-slate-900">{cancelTargetOrder.id || '-'}</p>
                <p className="text-sm font-semibold text-slate-500">거래번호(TID)</p>
                <p className="break-all text-base font-medium text-slate-900">{cancelTargetOrder.tradeId || '-'}</p>
                <p className="text-sm font-semibold text-slate-500">구매자</p>
                <p className="break-all text-base font-semibold text-slate-900">
                  {cancelTargetOrder.buyerNickname || '-'} ({shortWallet(cancelTargetOrder.buyerWalletAddress)})
                </p>
                <p className="text-sm font-semibold text-slate-500">판매자</p>
                <p className="break-all text-base font-semibold text-slate-900">
                  {cancelTargetOrder.sellerNickname || '-'} ({shortWallet(cancelTargetOrder.sellerWalletAddress)})
                </p>
                <p className="text-sm font-semibold text-slate-500">반환 수량</p>
                <p className="text-base font-bold text-slate-900">{formatUsdt(cancelTargetOrder.usdtAmount)}</p>
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
                onClick={closeCancelModal}
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
                  || (!isCancelOrderActionCompleted && !(cancelTargetOrder.privateSale === true && cancelTargetOrder.status === 'paymentRequested'))
                }
                className="inline-flex h-11 items-center justify-center rounded-lg border border-rose-600 bg-rose-600 px-4 text-sm font-semibold text-white transition hover:border-rose-700 hover:bg-rose-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {cancelOrderActionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
