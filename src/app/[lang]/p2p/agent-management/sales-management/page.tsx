'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useActiveAccount } from 'thirdweb/react';

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
  buyerReleaseTransactionHash: string;
  buyerRollbackTransactionHash: string;
  sellerNickname: string;
  sellerWalletAddress: string;
  sellerAvatar: string;
  sellerBankName: string;
  sellerBankAccountNumber: string;
  sellerBankAccountHolder: string;
  sellerContactMemo: string;
  sellerLockTransactionHash: string;
  sellerRollbackTransactionHash: string;
  sellerReleaseTransactionHash: string;
  usdtAmount: number;
  krwAmount: number;
  rate: number;
  platformFeeRate: number;
  platformFeeAmount: number;
  platformFeeWalletAddress: string;
  createdAt: string;
  paymentRequestedAt: string;
  paymentConfirmedAt: string;
};

type SellerSalesSummaryItem = {
  sellerWalletAddress: string;
  sellerNickname: string;
  sellerAvatar: string;
  totalKrwAmount: number;
  totalUsdtAmount: number;
  orderCount: number;
  latestCreatedAt: string;
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
  const buyerBankInfo = isRecord(buyer.bankInfo) ? buyer.bankInfo : {};
  const sellerBankInfo = isRecord(seller.bankInfo) ? seller.bankInfo : {};
  const paymentConfirmedBy = isRecord(source.paymentConfirmedBy) ? source.paymentConfirmedBy : {};
  const platformFee = isRecord(source.platformFee) ? source.platformFee : {};
  const settlement = isRecord(source.settlement) ? source.settlement : {};
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
    buyerReleaseTransactionHash: toText(buyer.releaseTransactionHash),
    buyerRollbackTransactionHash: toText(buyer.rollbackTransactionHash),
    sellerNickname: toText(seller.nickname),
    sellerWalletAddress: toText(seller.walletAddress),
    sellerAvatar: toText(seller.avatar),
    sellerBankName: toText(sellerBankInfo.bankName),
    sellerBankAccountNumber: toText(sellerBankInfo.accountNumber),
    sellerBankAccountHolder: toText(sellerBankInfo.accountHolder),
    sellerContactMemo: toText(sellerBankInfo.contactMemo),
    sellerLockTransactionHash: toText(seller.lockTransactionHash),
    sellerRollbackTransactionHash: toText(seller.rollbackTransactionHash),
    sellerReleaseTransactionHash: toText(seller.releaseTransactionHash),
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
  };
};

const shortWallet = (value: string) => {
  const source = String(value || '').trim();
  if (!source) return '-';
  if (source.length <= 12) return source;
  return `${source.slice(0, 6)}...${source.slice(-4)}`;
};

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
const PAYMENT_REQUEST_COUNTDOWN_LIMIT_MS = 30 * 60 * 1000;

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

export default function P2PAgentSalesManagementPage() {
  const searchParams = useSearchParams();
  const activeAccount = useActiveAccount();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [orders, setOrders] = useState<AgentSalesOrderItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalKrwAmount, setTotalKrwAmount] = useState(0);
  const [totalUsdtAmount, setTotalUsdtAmount] = useState(0);
  const [totalPlatformFeeAmount, setTotalPlatformFeeAmount] = useState(0);
  const [copiedTradeId, setCopiedTradeId] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [cancelTargetOrder, setCancelTargetOrder] = useState<AgentSalesOrderItem | null>(null);
  const [cancelingOrder, setCancelingOrder] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);

  const loadData = useCallback(async (mode: 'manual' | 'polling' = 'manual') => {
    if (!agentcode) {
      setAgent(null);
      setOrders([]);
      setTotalCount(0);
      setTotalKrwAmount(0);
      setTotalUsdtAmount(0);
      setTotalPlatformFeeAmount(0);
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
      const resolvedTotalKrwAmount = toNumber(payloadRecord.totalKrwAmount || payloadResult.totalKrwAmount);
      const resolvedTotalUsdtAmount = toNumber(payloadRecord.totalUsdtAmount || payloadResult.totalUsdtAmount);
      const resolvedTotalPlatformFeeAmount = toNumber(
        payloadRecord.totalPlatformFeeAmount || payloadResult.totalPlatformFeeAmount,
      );

      setAgent(agentData);
      setOrders(normalizedOrders);
      setTotalCount(resolvedTotalCount);
      setTotalKrwAmount(resolvedTotalKrwAmount);
      setTotalUsdtAmount(resolvedTotalUsdtAmount);
      setTotalPlatformFeeAmount(resolvedTotalPlatformFeeAmount);
    } catch (loadError) {
      if (mode === 'polling') {
        console.error('Failed to poll agent sales orders', loadError);
      } else {
        setAgent(null);
        setOrders([]);
        setTotalCount(0);
        setTotalKrwAmount(0);
        setTotalUsdtAmount(0);
        setTotalPlatformFeeAmount(0);
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
  }, [agentcode]);

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

  const filteredOrders = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return orders;
    }
    return orders.filter((order) => {
      return (
        order.tradeId.toLowerCase().includes(normalizedKeyword)
        || order.status.toLowerCase().includes(normalizedKeyword)
        || order.storecode.toLowerCase().includes(normalizedKeyword)
        || order.storeName.toLowerCase().includes(normalizedKeyword)
        || order.buyerNickname.toLowerCase().includes(normalizedKeyword)
        || order.sellerNickname.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [orders, keyword]);

  const sellerSalesSummarySorted = useMemo(() => {
    const summaryBySeller = new Map<string, SellerSalesSummaryItem>();

    filteredOrders.forEach((order) => {
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
          orderCount: 1,
          latestCreatedAt: String(order.createdAt || '').trim(),
        });
        return;
      }

      current.totalKrwAmount += Number(order.krwAmount || 0) || 0;
      current.totalUsdtAmount += Number(order.usdtAmount || 0) || 0;
      current.orderCount += 1;
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
      || (b.orderCount - a.orderCount)
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

  const closeCancelModal = () => {
    if (cancelingOrder) return;
    setCancelTargetOrder(null);
    setCancelError(null);
  };

  const cancelPrivateOrderByAgent = useCallback(async () => {
    const targetOrderId = String(cancelTargetOrder?.id || '').trim();
    if (!targetOrderId) {
      setCancelError('취소할 주문 식별자를 찾을 수 없습니다.');
      return;
    }
    if (cancelingOrder) return;

    const actorWalletAddress = String(activeAccount?.address || agent?.adminWalletAddress || '').trim();
    const actorNickname = String(agent?.agentName || '').trim() || '에이전트';

    setCancelingOrder(true);
    setCancelError(null);
    try {
      const response = await fetch('/api/order/cancelPrivateBuyOrderByAdminToBuyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: targetOrderId,
          adminWalletAddress: actorWalletAddress,
          cancelledByRole: 'agent',
          cancelledByNickname: actorNickname,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.result?.success) {
        throw new Error(String(payload?.error || '주문 취소 처리에 실패했습니다.'));
      }

      const txHash = String(payload?.result?.transactionHash || '').trim();
      toast.success(txHash ? `주문 취소 완료 (TX: ${shortWallet(txHash)})` : '주문 취소 완료');
      setCancelTargetOrder(null);
      await loadData();
    } catch (cancelErrorValue) {
      const message = cancelErrorValue instanceof Error ? cancelErrorValue.message : '주문 취소 처리 중 오류가 발생했습니다.';
      setCancelError(message);
      toast.error(message);
    } finally {
      setCancelingOrder(false);
    }
  }, [activeAccount?.address, agent?.adminWalletAddress, agent?.agentName, cancelTargetOrder?.id, cancelingOrder, loadData]);

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

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">전체 거래</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{totalCount.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">총 KRW</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatKrw(totalKrwAmount)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">총 USDT</p>
              <p className="mt-1 text-xl font-bold text-cyan-700">{formatUsdt(totalUsdtAmount)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">표시중</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{filteredOrders.length.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">플랫폼 수수료</p>
              <p className="mt-1 text-xl font-bold text-indigo-700">{formatUsdt(totalPlatformFeeAmount)}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">P2P 거래내역</p>
              <input
                type="text"
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="거래ID/상태/가맹점/구매자/판매자 검색"
                className="h-9 w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
              />
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
                            <p className="justify-self-end text-[11px] font-extrabold text-slate-900">{formatKrw(item.totalKrwAmount)} KRW</p>
                            <p className="font-semibold text-slate-500">합산 판매수량</p>
                            <p className="justify-self-end text-[11px] font-extrabold text-slate-900">{formatUsdt(item.totalUsdtAmount)}</p>
                            <p className="font-semibold text-slate-500">주문건수</p>
                            <p className="justify-self-end text-[11px] font-extrabold text-slate-900">{item.orderCount.toLocaleString()}건</p>
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
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-[1120px] w-full table-fixed">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-[108px] px-3 py-3">상태</th>
                    <th className="w-[140px] px-3 py-3">주문시각/거래번호(TID)</th>
                    <th className="w-[104px] px-3 py-3">구매자</th>
                    <th className="w-[104px] px-3 py-3">판매자/결제방법</th>
                    <th className="w-[108px] px-3 py-3 text-right">주문금액</th>
                    <th className="w-[84px] px-3 py-3">플랫폼 수수료</th>
                    <th className="w-[76px] px-3 py-3">전송내역</th>
                    <th className="w-[72px] px-3 py-3 text-center">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                        표시할 거래가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map((order) => {
                      const orderStatus = String(order.status || '').trim();
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
                      const canCancelOrderByStatus = order.privateSale === true && orderStatus === 'paymentRequested';
                      const canCancelOrder = Boolean(activeAccount?.address || agent?.adminWalletAddress) && canCancelOrderByStatus;
                      const platformFeeRate = Number(order.platformFeeRate || 0) || 0;
                      const platformFeeAmount = Number(order.platformFeeAmount || 0) || 0;
                      const platformFeeWalletAddress = String(order.platformFeeWalletAddress || '').trim();
                      const hasPlatformFeeInfo =
                        platformFeeRate > 0 || platformFeeAmount > 0 || Boolean(platformFeeWalletAddress);

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
                            <span className="whitespace-nowrap text-[13px] font-medium text-slate-700">
                              {formatDateTime(order.createdAt)}
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
                            <span className="truncate text-xs text-slate-500">
                              {shortWallet(order.buyerWalletAddress || order.walletAddress)}
                            </span>
                            <span className="break-all text-[11px] leading-tight text-slate-500">
                              IP {getBuyerIp(order)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-col">
                              <span className="truncate text-base font-extrabold leading-tight text-slate-900">{order.sellerNickname || '-'}</span>
                              <span className="truncate text-xs text-slate-500">{shortWallet(order.sellerWalletAddress)}</span>
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
                        <td className="px-3 py-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-base font-extrabold leading-tight text-slate-900">{formatKrw(order.krwAmount)} KRW</span>
                            <span className="text-sm font-bold text-slate-600">{formatUsdt(order.usdtAmount)}</span>
                            <span className="text-[11px] font-semibold text-slate-500">
                              환율 {formatRate(getOrderExchangeRate(order))}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {hasPlatformFeeInfo ? (
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
                        <td className="px-3 py-3 text-center">
                          {canCancelOrderByStatus ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!canCancelOrder) return;
                                setCancelTargetOrder(order);
                                setCancelError(null);
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

      {cancelTargetOrder && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/45 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={closeCancelModal}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-[0_42px_90px_-52px_rgba(15,23,42,0.9)]"
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

            <div className="space-y-4 px-5 py-5">
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
                  void cancelPrivateOrderByAgent();
                }}
                disabled={cancelingOrder || !(cancelTargetOrder.privateSale === true && cancelTargetOrder.status === 'paymentRequested')}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-rose-600 bg-rose-600 px-4 text-sm font-semibold text-white transition hover:border-rose-700 hover:bg-rose-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {cancelingOrder ? '취소 처리 중...' : 'USDT 반환 후 주문 취소'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
