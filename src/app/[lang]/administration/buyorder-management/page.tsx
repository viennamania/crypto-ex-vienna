'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { toast } from 'react-hot-toast';
import { useActiveAccount } from 'thirdweb/react';

import { client } from '@/app/client';
import { ConnectButton } from '@/components/OrangeXConnectButton';
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
};

const POLLING_INTERVAL_MS = 5000;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100];
const walletAuthOptions = ['google', 'email', 'phone'];

type SearchFilters = {
  date: string;
  searchTradeId: string;
  searchBuyer: string;
  searchDepositName: string;
  searchStoreName: string;
};

type CancelActorInfo = {
  role: string;
  nickname: string;
};

const ACTIVE_STATUSES = new Set(['ordered', 'accepted', 'paymentRequested']);
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

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatPercent = (value?: number) => {
  const numeric = toFiniteNumber(value);
  if (numeric <= 0) return '0';
  return (Math.round(numeric * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
};

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
    hour12: false,
  });
};

const shortWallet = (value?: string) => {
  const source = String(value || '').trim();
  if (!source) return '-';
  if (source.length <= 12) return source;
  return `${source.slice(0, 6)}...${source.slice(-4)}`;
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

const getCancellerIp = (order: BuyOrderItem) =>
  String(order?.cancelledByIpAddress || '').trim() || '-';

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
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [cancelTargetOrder, setCancelTargetOrder] = useState<BuyOrderItem | null>(null);
  const [cancelingOrder, setCancelingOrder] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [copiedTradeId, setCopiedTradeId] = useState('');
  const [cancelActorInfo, setCancelActorInfo] = useState<CancelActorInfo>({
    role: 'admin',
    nickname: '관리자',
  });
  const [publicIpAddress, setPublicIpAddress] = useState('');
  const [loadingPublicIpAddress, setLoadingPublicIpAddress] = useState(false);

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

  const closeCancelOrderModal = () => {
    if (cancelingOrder) return;
    setCancelTargetOrder(null);
    setCancelError(null);
  };

  const cancelPrivateOrderByAdmin = useCallback(async () => {
    if (!isWalletConnected) {
      const message = '지갑을 연결해주세요.';
      setCancelError(message);
      toast.error(message);
      return;
    }
    const targetOrderId = String(cancelTargetOrder?._id || '').trim();
    if (!targetOrderId) {
      setCancelError('취소할 주문 식별자를 찾을 수 없습니다.');
      return;
    }
    if (cancelingOrder) return;

    setCancelingOrder(true);
    setCancelError(null);
    try {
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
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.result?.success) {
        throw new Error(String(payload?.error || '주문 취소 처리에 실패했습니다.'));
      }

      const txHash = String(payload?.result?.transactionHash || '').trim();
      toast.success(txHash ? `주문 취소 완료 (TX: ${shortWallet(txHash)})` : '주문 취소 완료');

      setCancelTargetOrder(null);
      await fetchLatestBuyOrders('query');
    } catch (error) {
      const message = error instanceof Error ? error.message : '주문 취소 처리 중 오류가 발생했습니다.';
      setCancelError(message);
      toast.error(message);
    } finally {
      setCancelingOrder(false);
    }
  }, [
    adminWalletAddress,
    cancelActorNickname,
    cancelActorRole,
    cancelTargetOrder?._id,
    cancelingOrder,
    fetchLatestBuyOrders,
    isWalletConnected,
    publicIpAddress,
  ]);

  useEffect(() => {
    if (isWalletConnected) return;
    setCancelTargetOrder(null);
    setCancelError(null);
  }, [isWalletConnected]);

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
            <p className="mt-2 text-3xl font-bold text-slate-900">{dashboardStats.totalCount.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-500">검색 조건 전체 건수</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">진행중 주문</p>
            <p className="mt-2 text-3xl font-bold text-amber-700">{dashboardStats.activeCount.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-500">ordered / accepted / paymentRequested</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">총 결제 금액</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatKrw(dashboardStats.totalKrwAmount)}</p>
            <p className="mt-1 text-xs text-slate-500">KRW</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">총 주문 수량</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatUsdt(dashboardStats.totalUsdtAmount)}</p>
            <p className="mt-1 text-xs text-slate-500">USDT</p>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/55 p-4 shadow-[0_18px_38px_-32px_rgba(79,70,229,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">총 수수료량</p>
            <p className="mt-2 text-3xl font-bold text-indigo-900">{formatUsdt(dashboardStats.totalFeeAmount)}</p>
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
            <div className="overflow-x-auto">
              <table className="min-w-[1240px] w-full table-fixed">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-[120px] px-3 py-3">상태</th>
                    <th className="w-[108px] px-3 py-3">주문시각</th>
                    <th className="w-[132px] px-3 py-3">거래번호(TID)</th>
                    <th className="w-[130px] px-3 py-3">구매자</th>
                    <th className="w-[124px] px-3 py-3">판매자</th>
                    <th className="w-[96px] px-3 py-3">결제방법</th>
                    <th className="w-[118px] px-3 py-3 text-right">주문금액</th>
                    <th className="w-[154px] px-3 py-3">플랫폼 수수료</th>
                    <th className="w-[158px] px-3 py-3">전송내역</th>
                    <th className="w-[96px] px-3 py-3 text-center">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order, index) => {
                    const orderStatus = String(order?.status || '').trim();
                    const isPaymentRequested = orderStatus === 'paymentRequested';
                    const isPaymentConfirmed = orderStatus === 'paymentConfirmed';
                    const isCancelled = orderStatus === 'cancelled';
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
                    const hasPlatformFeeInfo =
                      platformFeeRate > 0 || platformFeeAmount > 0 || Boolean(platformFeeWalletAddress);

                    return (
                    <tr key={`${order?._id || order?.tradeId || 'order'}-${index}`} className="bg-white text-sm text-slate-700">
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClassName(order?.status)}`}>
                            {getStatusLabel(order?.status)}
                          </span>
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
                        <div className="flex flex-col leading-tight">
                          <span className="text-[13px] font-medium text-slate-700">
                            {formatDateOnly(order?.createdAt)}
                          </span>
                          <span className="mt-0.5 text-xs text-slate-500">
                            {formatTimeOnly(order?.createdAt)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          {order?.tradeId ? (
                            <button
                              type="button"
                              onClick={() => {
                                void copyTradeId(order.tradeId || '');
                              }}
                              className="inline-flex w-fit items-center gap-1 truncate font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                            >
                              {order.tradeId}
                              {copiedTradeId === order.tradeId && (
                                <span className="text-[10px] font-semibold text-cyan-700">복사됨</span>
                              )}
                            </button>
                          ) : (
                            <span className="truncate font-semibold text-slate-900">-</span>
                          )}
                          <span className="truncate text-xs text-slate-500">{shortWallet(order?._id)}</span>
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
                          <span className="truncate text-xs text-slate-500">
                            {shortWallet(order?.buyer?.walletAddress || order?.walletAddress)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <span className="truncate text-base font-extrabold leading-tight text-slate-900">{order?.seller?.nickname || '-'}</span>
                          <span className="truncate text-xs text-slate-500">{shortWallet(order?.seller?.walletAddress)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex w-fit whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {getPaymentMethodLabel(order)}
                          </span>
                          <span className="truncate text-xs text-slate-500">
                            {getPaymentMethodDetail(order)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-base font-extrabold leading-tight text-slate-900">{formatKrw(order?.krwAmount)} KRW</span>
                          <span className="text-sm font-bold text-slate-600">{formatUsdt(order?.usdtAmount)} USDT</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {hasPlatformFeeInfo ? (
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
                              if (!isWalletConnected) return;
                              setCancelTargetOrder(order);
                              setCancelError(null);
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

      {cancelTargetOrder && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/45 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={closeCancelOrderModal}
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
                onClick={cancelPrivateOrderByAdmin}
                disabled={cancelingOrder || !isWalletConnected || !isAdminCancelablePrivateOrder(cancelTargetOrder)}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-rose-600 bg-rose-600 px-4 text-sm font-semibold text-white transition hover:border-rose-700 hover:bg-rose-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {cancelingOrder ? '취소 처리 중...' : 'USDT 반환 후 주문 취소'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
