'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider';
import GroupChannel from '@sendbird/uikit-react/GroupChannel';
import { useActiveAccount } from 'thirdweb/react';

type BuyOrderItem = {
  _id?: string;
  tradeId?: string;
  createdAt?: string;
  paymentConfirmedAt?: string;
  status?: string;
  privateSale?: boolean;
  storecode?: string;
  krwAmount?: number;
  usdtAmount?: number;
  paymentMethod?: string;
  platformFeeRate?: number;
  platformFeeAmount?: number;
  platformFeeWalletAddress?: string;
  agentFeeRate?: number;
  agentFeePercent?: number;
  agentFeeAmount?: number;
  agentFeeUsdtAmount?: number;
  walletAddress?: string;
  nickname?: string;
  platformFee?: {
    percentage?: number;
    rate?: number;
    address?: string;
    walletAddress?: string;
    amount?: number;
    amountUsdt?: number;
  };
  buyer?: {
    walletAddress?: string;
    nickname?: string;
    depositName?: string;
    storeReferral?: {
      storecode?: string;
      storeName?: string;
      storeLogo?: string;
    };
    bankInfo?: {
      accountHolder?: string;
      depositName?: string;
    };
  };
  seller?: {
    walletAddress?: string;
    nickname?: string;
    agentcode?: string;
    bankInfo?: {
      bankName?: string;
      accountNumber?: string;
      accountHolder?: string;
      contactMemo?: string;
    };
  };
  agentcode?: string;
  agentName?: string;
  agent?: {
    agentcode?: string;
    agentName?: string;
    agentFeePercent?: number;
  };
  store?: {
    agentFeePercent?: number;
  };
  settlement?: {
    platformFeePercent?: number;
    platformFeeAmount?: number | string;
    platformFeeWalletAddress?: string;
    agentFeePercent?: number | string;
    agentFeeAmount?: number | string;
    agentFeeAmountUSDT?: number | string;
    agentFeeWalletAddress?: string;
  };
  buyerConsent?: {
    status?: string;
    accepted?: boolean;
    acceptedAt?: string;
    requestedAt?: string;
    requestMessageSentAt?: string;
    channelUrl?: string;
  };
  transactionHash?: string;
  chain?: string;
};

type SearchFilters = {
  fromDate: string;
  toDate: string;
  searchTradeId: string;
  searchBuyer: string;
  searchBuyerWalletAddress: string;
  searchBuyerStoreReferralStorecode: string;
  searchSellerId: string;
  searchSellerWalletAddress: string;
  searchDepositName: string;
  searchPaymentMethod: string;
  searchAgentcode: string;
};

type BuyerStoreReferralGroup = {
  storecode: string;
  storeName: string;
  storeLogo: string;
  count: number;
};

type BuyerConsentSnapshot = {
  accepted: boolean;
  acceptedAt: string;
  requestedAt: string;
  channelUrl: string;
};

const DEFAULT_PAGE_SIZE = 30;
const PAGE_SIZE_OPTIONS = [20, 30, 50, 100];
const FIXED_STATUS = 'paymentconfirmed';
const SENDBIRD_APP_ID = process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID
  || process.env.NEXT_PUBLIC_SENDBIRD_APP_ID
  || '';
const SENDBIRD_MANAGER_CHAT_USER_ID = String(process.env.NEXT_PUBLIC_SENDBIRD_MANAGER_ID || '').trim();

const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'bank', label: '은행송금' },
  { value: 'contact', label: '연락처송금' },
  { value: 'card', label: '카드' },
  { value: 'pg', label: 'PG' },
  { value: 'cash', label: '현금' },
  { value: 'crypto', label: '암호화폐' },
  { value: 'giftcard', label: '기프트카드' },
  { value: 'mkrw', label: 'MKRW' },
  { value: '연락처송금', label: '연락처송금(은행명)' },
] as const;

const TX_EXPLORER_BASE_BY_CHAIN: Record<string, string> = {
  ethereum: 'https://etherscan.io/tx/',
  polygon: 'https://polygonscan.com/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  bsc: 'https://bscscan.com/tx/',
};

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
    fromDate: today,
    toDate: today,
    searchTradeId: '',
    searchBuyer: '',
    searchBuyerWalletAddress: '',
    searchBuyerStoreReferralStorecode: '',
    searchSellerId: '',
    searchSellerWalletAddress: '',
    searchDepositName: '',
    searchPaymentMethod: '',
    searchAgentcode: '',
  };
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

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatKrw = (value?: number) =>
  new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number(value || 0));

const formatUsdt = (value?: number) =>
  new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 6 }).format(Number(value || 0));

const formatUsdtFixed6 = (value?: number) =>
  new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(Number(value || 0));
const roundDownUsdt6 = (value: number) => Math.floor(Number(value || 0) * 1_000_000) / 1_000_000;

const formatPercent = (value?: number) => {
  const numeric = toFiniteNumber(value);
  if (numeric <= 0) return '0';
  return (Math.round(numeric * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
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

const getExplorerUrlByHash = (order: BuyOrderItem, txHash: string) => {
  const normalizedTxHash = String(txHash || '').trim();
  if (!normalizedTxHash) return '';
  const chain = normalizeChainKey(order?.chain) || normalizeChainKey(process.env.NEXT_PUBLIC_CHAIN) || 'polygon';
  const explorerBaseUrl = TX_EXPLORER_BASE_BY_CHAIN[chain];
  if (!explorerBaseUrl) return '';
  return `${explorerBaseUrl}${normalizedTxHash}`;
};

const getStatusLabel = (status?: string | null) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'ordered') return '주문생성';
  if (normalized === 'accepted') return '주문접수';
  if (normalized === 'paymentrequested') return '입금요청';
  if (normalized === 'paymentconfirmed') return '입금확인';
  if (normalized === 'completed') return '거래완료';
  if (normalized === 'cancelled') return '주문취소';
  return normalized || '-';
};

const getStatusBadgeClassName = (status?: string | null) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'ordered') return 'border-slate-300 bg-slate-100 text-slate-700';
  if (normalized === 'accepted') return 'border-blue-300 bg-blue-100 text-blue-700';
  if (normalized === 'paymentrequested') return 'border-amber-300 bg-amber-100 text-amber-700';
  if (normalized === 'paymentconfirmed') return 'border-emerald-300 bg-emerald-100 text-emerald-700';
  if (normalized === 'completed') return 'border-cyan-300 bg-cyan-100 text-cyan-700';
  if (normalized === 'cancelled') return 'border-rose-300 bg-rose-100 text-rose-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
};

const getPaymentMethodLabel = (order: BuyOrderItem) => {
  const method = String(order?.paymentMethod || '').trim().toLowerCase();
  const bankName = String(order?.seller?.bankInfo?.bankName || '').trim();

  if ((!method || method === 'bank') && bankName === '연락처송금') return '연락처송금';
  if (method === 'bank') return '은행송금';
  if (method === 'contact' || method === 'contacttransfer' || method === 'contact_transfer') return '연락처송금';
  if (method === 'card') return '카드';
  if (method === 'pg') return 'PG';
  if (method === 'cash') return '현금';
  if (method === 'crypto') return '암호화폐';
  if (method === 'giftcard') return '기프트카드';
  if (method === 'mkrw') return 'MKRW';
  if (bankName) return bankName;
  return '기타';
};

const getPaymentMethodDetail = (order: BuyOrderItem) => {
  const method = String(order?.paymentMethod || '').trim().toLowerCase();
  const bankInfo = order?.seller?.bankInfo;
  const bankName = String(bankInfo?.bankName || '').trim();

  if (bankName === '연락처송금' || method === 'contact' || method === 'contacttransfer' || method === 'contact_transfer') {
    return String(bankInfo?.contactMemo || '').trim() || '-';
  }

  const accountNumber = String(bankInfo?.accountNumber || '').trim();
  const accountHolder = String(bankInfo?.accountHolder || '').trim();
  const parts = [bankName, accountNumber, accountHolder].filter(Boolean);
  return parts.join(' ').trim() || '-';
};

const getOrderExchangeRate = (order: BuyOrderItem) => {
  const krwAmount = toFiniteNumber(order?.krwAmount);
  const usdtAmount = toFiniteNumber(order?.usdtAmount);
  if (krwAmount > 0 && usdtAmount > 0) return krwAmount / usdtAmount;
  return 0;
};

const getOrderAgentFeeRate = (order: BuyOrderItem) => {
  const candidates = [
    order?.agentFeeRate,
    order?.agentFeePercent,
    order?.settlement?.agentFeePercent,
    order?.store?.agentFeePercent,
    order?.agent?.agentFeePercent,
    (order as any)?.agent?.platformFeePercent,
    (order as any)?.seller?.agentFeePercent,
  ];
  for (const candidate of candidates) {
    const numeric = toFiniteNumber(candidate);
    if (numeric > 0) return numeric;
  }
  return 0;
};

const getOrderAgentFeeAmount = (order: BuyOrderItem, resolvedAgentFeeRate = 0) => {
  const usdtAmount = toFiniteNumber(order?.usdtAmount);
  if (resolvedAgentFeeRate > 0 && usdtAmount > 0) {
    return roundDownUsdt6((usdtAmount * resolvedAgentFeeRate) / 100);
  }

  const candidates = [
    order?.agentFeeAmount,
    order?.agentFeeUsdtAmount,
    order?.settlement?.agentFeeAmount,
    order?.settlement?.agentFeeAmountUSDT,
  ];
  for (const candidate of candidates) {
    const numeric = toFiniteNumber(candidate);
    if (numeric > 0) return roundDownUsdt6(numeric);
  }

  return 0;
};

const getBuyerDisplayName = (order: BuyOrderItem) =>
  String(order?.buyer?.nickname || order?.nickname || '').trim() || '-';

const getBuyerDepositName = (order: BuyOrderItem) =>
  String(
    order?.buyer?.depositName
    || order?.buyer?.bankInfo?.accountHolder
    || order?.buyer?.bankInfo?.depositName
    || '',
  ).trim() || '-';

const getBuyerStoreReferral = (order: BuyOrderItem) => {
  const storeReferral = order?.buyer?.storeReferral;
  const storecode = String(storeReferral?.storecode || '').trim();
  const storeName = String(storeReferral?.storeName || '').trim();
  const storeLogo = String(storeReferral?.storeLogo || '').trim();
  return {
    storecode,
    storeName,
    storeLogo,
    hasValue: Boolean(storecode || storeName || storeLogo),
  };
};

const getBuyerStoreReferralLabel = (storeReferral: ReturnType<typeof getBuyerStoreReferral>) => {
  if (storeReferral.storeName && storeReferral.storecode) {
    return `${storeReferral.storeName} (${storeReferral.storecode})`;
  }
  return storeReferral.storeName || storeReferral.storecode || '-';
};

const normalizeStoreReferralKey = (value: unknown) =>
  String(value || '').trim().toLowerCase();

const formatBuyerStoreReferralGroupLabel = (item: BuyerStoreReferralGroup | null) => {
  if (!item) return '전체';
  const normalizedStoreName = String(item.storeName || '').trim();
  const normalizedStorecode = String(item.storecode || '').trim();
  if (normalizedStoreName && normalizedStorecode) {
    return `${normalizedStoreName} (${normalizedStorecode})`;
  }
  return normalizedStoreName || normalizedStorecode || '-';
};

const getSellerDisplayName = (order: BuyOrderItem) =>
  String(order?.seller?.nickname || '').trim() || shortWallet(order?.seller?.walletAddress) || '-';

const toChannelToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const getOrderBuyerConsentSnapshot = (order: BuyOrderItem): BuyerConsentSnapshot => {
  const consent = order?.buyerConsent && typeof order.buyerConsent === 'object'
    ? order.buyerConsent
    : null;
  const normalizedOrderStatus = String(order?.status || '').trim().toLowerCase();
  const normalizedConsentStatus = String(consent?.status || '').trim().toLowerCase();
  const accepted = consent?.accepted === true || normalizedConsentStatus === 'accepted';
  const acceptedAt = String(consent?.acceptedAt || '').trim();
  const requestedAt = String(consent?.requestedAt || consent?.requestMessageSentAt || '').trim();
  const fallbackPrivateSaleChannelUrl = (() => {
    if (order?.privateSale !== true) {
      return '';
    }
    const tradeToken = toChannelToken(String(order?.tradeId || ''));
    if (!tradeToken) {
      return '';
    }
    return `private-sale-order-${tradeToken}`;
  })();
  const fallbackChannelUrl = fallbackPrivateSaleChannelUrl || (
    normalizedOrderStatus && normalizedOrderStatus !== 'ordered'
      ? String(order?._id || '').trim()
      : ''
  );

  return {
    accepted,
    acceptedAt,
    requestedAt,
    channelUrl: String(consent?.channelUrl || fallbackChannelUrl).trim(),
  };
};

export default function BuyOrderTradeHistoryPage() {
  const params = useParams<{ lang?: string }>();
  const lang = String(params?.lang || '').trim();
  const buyOrderManagementPath = lang
    ? `/${lang}/administration/buyorder-management`
    : '/administration/buyorder-management';
  const activeAccount = useActiveAccount();
  const adminWalletAddress = String(activeAccount?.address || '').trim();
  const orderChatUserId = useMemo(
    () => SENDBIRD_MANAGER_CHAT_USER_ID || adminWalletAddress,
    [adminWalletAddress],
  );
  const orderChatNickname = useMemo(() => {
    const baseToken = String(orderChatUserId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 8);
    return baseToken ? `admin_${baseToken}` : '관리자';
  }, [orderChatUserId]);

  const [orders, setOrders] = useState<BuyOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [buyerStoreReferralGroups, setBuyerStoreReferralGroups] = useState<BuyerStoreReferralGroup[]>([]);
  const [buyerStoreReferralMenuOpen, setBuyerStoreReferralMenuOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [isOrderChatDrawerOpen, setIsOrderChatDrawerOpen] = useState(false);
  const [selectedOrderChatChannelUrl, setSelectedOrderChatChannelUrl] = useState('');
  const [selectedOrderChatTradeId, setSelectedOrderChatTradeId] = useState('');
  const [orderChatSessionToken, setOrderChatSessionToken] = useState<string | null>(null);
  const [orderChatSessionLoading, setOrderChatSessionLoading] = useState(false);
  const [orderChatChannelAccessLoading, setOrderChatChannelAccessLoading] = useState(false);
  const [orderChatSessionError, setOrderChatSessionError] = useState<string | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / pageSize)),
    [totalCount, pageSize],
  );

  useEffect(() => {
    if (pageNumber > totalPages) {
      setPageNumber(totalPages);
    }
  }, [pageNumber, totalPages]);

  const statusMix = useMemo(() => {
    const statusCountMap = new Map<string, number>();

    orders.forEach((order) => {
      const status = String(order?.status || '').trim() || 'unknown';
      statusCountMap.set(status, (statusCountMap.get(status) || 0) + 1);
    });

    return [...statusCountMap.entries()].sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const selectedBuyerStoreReferralGroup = useMemo(() => {
    const selectedKey = normalizeStoreReferralKey(draftFilters.searchBuyerStoreReferralStorecode);
    if (!selectedKey) return null;
    return (
      buyerStoreReferralGroups.find(
        (item) => normalizeStoreReferralKey(item.storecode) === selectedKey,
      ) || null
    );
  }, [draftFilters.searchBuyerStoreReferralStorecode, buyerStoreReferralGroups]);

  const fetchTradeHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/order/getBuyOrderDashboardList', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: pageSize,
          page: pageNumber,
          searchTradeId: appliedFilters.searchTradeId,
          searchBuyer: appliedFilters.searchBuyer,
          searchBuyerWalletAddress: appliedFilters.searchBuyerWalletAddress,
          searchBuyerStoreReferralStorecode: appliedFilters.searchBuyerStoreReferralStorecode,
          searchSellerId: appliedFilters.searchSellerId,
          searchSellerWalletAddress: appliedFilters.searchSellerWalletAddress,
          searchDepositName: appliedFilters.searchDepositName,
          searchPaymentMethod: appliedFilters.searchPaymentMethod,
          searchAgentcode: appliedFilters.searchAgentcode,
          status: FIXED_STATUS,
          fromDate: appliedFilters.fromDate,
          toDate: appliedFilters.toDate,
          privateSaleMode: 'private',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || '거래내역 조회에 실패했습니다.'));
      }

      const fetchedOrders = Array.isArray(payload?.result?.orders)
        ? (payload.result.orders as BuyOrderItem[])
        : [];
      const totalFeeAmount = Number(
        payload?.result?.totalAgentFeeAmount ?? payload?.result?.totalPlatformFeeAmount ?? 0,
      ) || 0;

      setOrders(fetchedOrders);
      setTotalCount(Number(payload?.result?.totalCount || 0) || 0);
      setSummary({
        totalKrwAmount: Number(payload?.result?.totalKrwAmount || 0) || 0,
        totalUsdtAmount: Number(payload?.result?.totalUsdtAmount || 0) || 0,
        totalFeeAmount,
      });
      const groupedStoreReferrals = Array.isArray(payload?.result?.buyerStoreReferralGroups)
        ? payload.result.buyerStoreReferralGroups
            .map((item: any) => ({
              storecode: String(item?.storecode || '').trim(),
              storeName: String(item?.storeName || '').trim(),
              storeLogo: String(item?.storeLogo || '').trim(),
              count: Number(item?.count || 0),
            }))
            .filter((item: BuyerStoreReferralGroup) => Boolean(item.storecode))
        : [];
      setBuyerStoreReferralGroups(groupedStoreReferrals);
      setLastUpdatedAt(new Date().toISOString());
      setError(null);
    } catch (fetchError: any) {
      const message = String(fetchError?.message || '거래내역 조회 중 오류가 발생했습니다.');
      setError(message);
      setBuyerStoreReferralGroups([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, pageNumber, pageSize]);

  useEffect(() => {
    void fetchTradeHistory();
  }, [fetchTradeHistory]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (draftFilters.fromDate && draftFilters.toDate && draftFilters.fromDate > draftFilters.toDate) {
      toast.error('시작일은 종료일보다 늦을 수 없습니다.');
      return;
    }

    const normalizedFilters: SearchFilters = {
      fromDate: draftFilters.fromDate || getTodayDate(),
      toDate: draftFilters.toDate || draftFilters.fromDate || getTodayDate(),
      searchTradeId: draftFilters.searchTradeId.trim(),
      searchBuyer: draftFilters.searchBuyer.trim(),
      searchBuyerWalletAddress: draftFilters.searchBuyerWalletAddress.trim(),
      searchBuyerStoreReferralStorecode: draftFilters.searchBuyerStoreReferralStorecode.trim(),
      searchSellerId: draftFilters.searchSellerId.trim(),
      searchSellerWalletAddress: draftFilters.searchSellerWalletAddress.trim(),
      searchDepositName: draftFilters.searchDepositName.trim(),
      searchPaymentMethod: draftFilters.searchPaymentMethod.trim(),
      searchAgentcode: draftFilters.searchAgentcode.trim(),
    };

    setPageNumber(1);
    setAppliedFilters(normalizedFilters);
  };

  const handleSearchReset = () => {
    const defaults = createDefaultFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setPageNumber(1);
    setBuyerStoreReferralMenuOpen(false);
  };

  useEffect(() => {
    if (!isOrderChatDrawerOpen) {
      setOrderChatChannelAccessLoading(false);
    }
  }, [isOrderChatDrawerOpen]);

  useEffect(() => {
    let cancelled = false;

    if (!isOrderChatDrawerOpen) {
      setOrderChatSessionLoading(false);
      setOrderChatSessionError(null);
      return () => {
        cancelled = true;
      };
    }

    if (!orderChatUserId) {
      setOrderChatSessionToken(null);
      setOrderChatSessionLoading(false);
      setOrderChatSessionError('관리자 채팅 사용자 ID가 없습니다.');
      return () => {
        cancelled = true;
      };
    }

    const issueSessionToken = async () => {
      setOrderChatSessionLoading(true);
      setOrderChatSessionError(null);
      try {
        const response = await fetch('/api/sendbird/session-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: orderChatUserId,
            nickname: orderChatNickname,
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
  }, [isOrderChatDrawerOpen, orderChatNickname, orderChatUserId]);

  const handleCopyTradeId = useCallback(async (tradeIdValue: string) => {
    const normalizedTradeId = String(tradeIdValue || '').trim();
    if (!normalizedTradeId) {
      toast.error('복사할 거래번호가 없습니다.');
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      toast.error('현재 환경에서 클립보드 복사를 지원하지 않습니다.');
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedTradeId);
      toast.success(`거래번호가 복사되었습니다. (${normalizedTradeId})`);
    } catch (copyError) {
      console.error('Failed to copy trade id', copyError);
      toast.error('거래번호 복사에 실패했습니다.');
    }
  }, []);

  const openOrderChatDrawer = useCallback(async (order: BuyOrderItem, channelUrl: string) => {
    const normalizedChannelUrl = String(channelUrl || '').trim();
    if (!normalizedChannelUrl) {
      toast.error('해당 주문의 채팅 채널 정보가 없습니다.');
      return;
    }
    if (!orderChatUserId) {
      toast.error('관리자 채팅 사용자 ID가 없습니다.');
      return;
    }

    setSelectedOrderChatChannelUrl(normalizedChannelUrl);
    setSelectedOrderChatTradeId(String(order?.tradeId || '').trim());
    setIsOrderChatDrawerOpen(true);
    setOrderChatSessionError(null);
    setOrderChatChannelAccessLoading(true);

    const ensureChannelAccess = async (targetChannelUrl: string) => {
      const response = await fetch('/api/sendbird/ensure-group-channel-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelUrl: targetChannelUrl,
          userId: orderChatUserId,
          nickname: orderChatNickname,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          String(payload?.error || payload?.message || '채팅 채널 접근 권한을 준비하지 못했습니다.'),
        );
      }
    };

    try {
      await ensureChannelAccess(normalizedChannelUrl);
    } catch (firstAccessError) {
      const firstMessage = String(
        firstAccessError instanceof Error
          ? firstAccessError.message
          : '채팅 채널 접근 권한을 준비하지 못했습니다.',
      );
      const isChannelNotFound = /channel/i.test(firstMessage) && /not found/i.test(firstMessage);
      const targetOrderId = String(order?._id || '').trim();

      if (!isChannelNotFound || !targetOrderId) {
        setOrderChatSessionError(firstMessage);
        setOrderChatChannelAccessLoading(false);
        return;
      }

      try {
        const repairResponse = await fetch('/api/sendbird/repair-buyorder-channel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: targetOrderId,
          }),
        });
        const repairPayload = await repairResponse.json().catch(() => ({}));
        if (!repairResponse.ok) {
          throw new Error(
            String(repairPayload?.error || repairPayload?.message || '주문 채팅 채널 복구에 실패했습니다.'),
          );
        }

        const repairedChannelUrl = String(repairPayload?.channelUrl || '').trim();
        if (!repairedChannelUrl) {
          throw new Error('주문 채팅 채널 복구 결과가 비어 있습니다.');
        }

        setSelectedOrderChatChannelUrl(repairedChannelUrl);
        await ensureChannelAccess(repairedChannelUrl);
      } catch (repairError) {
        setOrderChatSessionError(
          repairError instanceof Error
            ? repairError.message
            : '채팅 채널 접근 권한을 준비하지 못했습니다.',
        );
      }
    } finally {
      setOrderChatChannelAccessLoading(false);
    }
  }, [orderChatNickname, orderChatUserId]);

  return (
    <>
      <main className="min-h-screen bg-transparent">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pb-20 pt-6 lg:px-6 lg:pt-8">
        <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_28px_60px_-42px_rgba(15,23,42,0.38)] backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/95 shadow-sm">
                <Image src="/icon-buyorder.png" alt="Trade History" width={22} height={22} className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Buy Order Trade History</p>
                <h1 className="text-xl font-bold text-slate-900">입금확인 거래내역</h1>
                <p className="text-sm text-slate-500">입금확인 상태의 구매주문만 대상으로 상세 검색과 페이지네이션 조회를 제공합니다.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={buyOrderManagementPath}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                구매주문 관리
              </Link>
              <button
                type="button"
                onClick={() => {
                  void fetchTradeHistory();
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                새로고침
              </button>
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Last Updated</p>
                <p className="text-xs font-semibold text-slate-700">{lastUpdatedAt ? formatDateTime(lastUpdatedAt) : '-'}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.42)]">
          <form className="grid grid-cols-1 gap-3 lg:grid-cols-12" onSubmit={handleSearchSubmit}>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">시작일</label>
              <input
                type="date"
                value={draftFilters.fromDate}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, fromDate: event.target.value }))}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">종료일</label>
              <input
                type="date"
                value={draftFilters.toDate}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, toDate: event.target.value }))}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">조회 상태</label>
              <div className="inline-flex h-10 w-full items-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">
                입금확인 (고정)
              </div>
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">결제수단</label>
              <select
                value={draftFilters.searchPaymentMethod}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchPaymentMethod: event.target.value }))}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
              >
                {PAYMENT_METHOD_OPTIONS.map((item) => (
                  <option key={item.value || 'all'} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">구매자 소속 가맹점</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setBuyerStoreReferralMenuOpen((prev) => !prev)}
                  className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition hover:border-slate-400"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {selectedBuyerStoreReferralGroup?.storeLogo ? (
                      <span
                        className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-cover bg-center bg-no-repeat"
                        style={{ backgroundImage: `url(${encodeURI(selectedBuyerStoreReferralGroup.storeLogo)})` }}
                        aria-label={selectedBuyerStoreReferralGroup.storeName || selectedBuyerStoreReferralGroup.storecode || '가맹점'}
                      />
                    ) : (
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-[10px] font-semibold text-slate-600">
                        전
                      </span>
                    )}
                    <span className="truncate">{formatBuyerStoreReferralGroupLabel(selectedBuyerStoreReferralGroup)}</span>
                  </span>
                  <span className="text-xs text-slate-500">{buyerStoreReferralMenuOpen ? '▲' : '▼'}</span>
                </button>

                {buyerStoreReferralMenuOpen ? (
                  <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="max-h-60 overflow-y-auto p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setDraftFilters((prev) => ({ ...prev, searchBuyerStoreReferralStorecode: '' }));
                          setBuyerStoreReferralMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                          !draftFilters.searchBuyerStoreReferralStorecode
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-[10px] font-semibold text-slate-600">전</span>
                          전체
                        </span>
                        <span className={`text-xs ${!draftFilters.searchBuyerStoreReferralStorecode ? 'text-slate-200' : 'text-slate-400'}`}>
                          ALL
                        </span>
                      </button>

                      {buyerStoreReferralGroups.map((item) => {
                        const groupLabel = formatBuyerStoreReferralGroupLabel(item);
                        const isActive =
                          normalizeStoreReferralKey(draftFilters.searchBuyerStoreReferralStorecode)
                          === normalizeStoreReferralKey(item.storecode);

                        return (
                          <button
                            key={item.storecode}
                            type="button"
                            onClick={() => {
                              setDraftFilters((prev) => ({ ...prev, searchBuyerStoreReferralStorecode: item.storecode }));
                              setBuyerStoreReferralMenuOpen(false);
                            }}
                            className={`mt-0.5 flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                              isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {item.storeLogo ? (
                                <span
                                  className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-cover bg-center bg-no-repeat"
                                  style={{ backgroundImage: `url(${encodeURI(item.storeLogo)})` }}
                                  aria-label={item.storeName || item.storecode}
                                />
                              ) : (
                                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-[10px] font-semibold text-slate-600">
                                  점
                                </span>
                              )}
                              <span className="truncate">{groupLabel}</span>
                            </span>
                            <span className={`text-xs ${isActive ? 'text-slate-200' : 'text-slate-400'}`}>
                              {item.count.toLocaleString()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">페이지 크기</label>
              <select
                value={pageSize}
                onChange={(event) => {
                  const nextSize = Number(event.target.value) || DEFAULT_PAGE_SIZE;
                  setPageSize(nextSize);
                  setPageNumber(1);
                }}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
              >
                {PAGE_SIZE_OPTIONS.map((sizeOption) => (
                  <option key={sizeOption} value={sizeOption}>{sizeOption}개</option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">거래번호(TID)</label>
              <input
                type="text"
                value={draftFilters.searchTradeId}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchTradeId: event.target.value }))}
                placeholder="예: T-20260306"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">구매자 닉네임</label>
              <input
                type="text"
                value={draftFilters.searchBuyer}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchBuyer: event.target.value }))}
                placeholder="구매자 닉네임"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">구매자 지갑주소</label>
              <input
                type="text"
                value={draftFilters.searchBuyerWalletAddress}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchBuyerWalletAddress: event.target.value }))}
                placeholder="0x..."
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">입금자명</label>
              <input
                type="text"
                value={draftFilters.searchDepositName}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchDepositName: event.target.value }))}
                placeholder="입금자명"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">판매자 닉네임/ID</label>
              <input
                type="text"
                value={draftFilters.searchSellerId}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchSellerId: event.target.value }))}
                placeholder="판매자 닉네임"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">판매자 지갑주소</label>
              <input
                type="text"
                value={draftFilters.searchSellerWalletAddress}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchSellerWalletAddress: event.target.value }))}
                placeholder="0x..."
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">에이전트코드</label>
              <input
                type="text"
                value={draftFilters.searchAgentcode}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchAgentcode: event.target.value }))}
                placeholder="예: ag1234"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>

            <div className="lg:col-span-12 flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-xs text-slate-500">
                총 {totalCount.toLocaleString()}건 · {pageNumber.toLocaleString()} / {totalPages.toLocaleString()} 페이지
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSearchReset}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  초기화
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  검색
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">조회 건수</p>
            <p className="mt-2 text-right text-3xl font-bold tabular-nums text-slate-900">{totalCount.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-500">검색 조건 전체 건수</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">합산 결제금액</p>
            <p className="mt-2 text-right text-3xl font-bold tabular-nums text-slate-900">{formatKrw(summary.totalKrwAmount)}</p>
            <p className="mt-1 text-xs text-slate-500">KRW</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">합산 판매수량</p>
            <p className="mt-2 text-right text-3xl font-bold tabular-nums text-slate-900">{formatUsdtFixed6(summary.totalUsdtAmount)}</p>
            <p className="mt-1 text-xs text-slate-500">USDT</p>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/55 p-4 shadow-[0_18px_38px_-32px_rgba(79,70,229,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">합산 에이전트 수수료</p>
            <p className="mt-2 text-right text-3xl font-bold tabular-nums text-indigo-900">{formatUsdtFixed6(summary.totalFeeAmount)}</p>
            <p className="mt-1 text-xs text-indigo-700/80">USDT</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.52)]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status Mix</p>
            {statusMix.length > 0 ? (
              statusMix.map(([status, count]) => (
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">입금확인 거래내역 목록</p>
              <p className="text-xs text-slate-500">
                기간 {appliedFilters.fromDate || '-'} ~ {appliedFilters.toDate || '-'} · 페이지 {pageNumber.toLocaleString()} / {totalPages.toLocaleString()}
              </p>
            </div>
            {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          </div>

          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={`skeleton-${index}`} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">검색된 거래내역이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto lg:overflow-x-visible">
              <table className="w-full min-w-[1080px] table-fixed lg:min-w-0">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-[14%] px-3 py-3">상태/거래번호/이용동의</th>
                    <th className="w-[16%] px-3 py-3">주문시각/완료시각</th>
                    <th className="w-[13%] px-3 py-3">구매자/가맹점 정보</th>
                    <th className="w-[16%] px-3 py-3">판매자/에이전트 정보</th>
                    <th className="w-[11%] px-3 py-3 text-right">거래금액</th>
                    <th className="w-[9%] px-3 py-3">결제정보</th>
                    <th className="w-[13%] px-3 py-3">에이전트 수수료</th>
                    <th className="w-[8%] px-3 py-3">전송 Tx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order, index) => {
                    const exchangeRate = getOrderExchangeRate(order);
                    const agentFeeRate = getOrderAgentFeeRate(order);
                    const agentFeeAmount = getOrderAgentFeeAmount(order, agentFeeRate);
                    const transactionHash = String(order?.transactionHash || '').trim();
                    const transactionHashUrl = getExplorerUrlByHash(order, transactionHash);
                    const buyerWalletAddress = String(order?.buyer?.walletAddress || order?.walletAddress || '').trim();
                    const sellerWalletAddress = String(order?.seller?.walletAddress || '').trim();
                    const agentcode = String(order?.agent?.agentcode || order?.agentcode || order?.seller?.agentcode || '').trim();
                    const agentName = String(order?.agent?.agentName || order?.agentName || '').trim();
                    const buyerStoreReferral = getBuyerStoreReferral(order);
                    const buyerConsentSnapshot = getOrderBuyerConsentSnapshot(order);
                    const buyerConsentAcceptedAtLabel = buyerConsentSnapshot.acceptedAt
                      ? `동의 ${formatDateTime(buyerConsentSnapshot.acceptedAt)}`
                      : '동의 시각 없음';
                    const buyerConsentRequestedAtLabel = buyerConsentSnapshot.requestedAt
                      ? `요청 ${formatDateTime(buyerConsentSnapshot.requestedAt)}`
                      : '요청 이력 없음';
                    const tradeId = String(order?.tradeId || '').trim();

                    return (
                      <tr key={order._id || order.tradeId || `row-${index}`} className="align-top text-sm text-slate-700">
                        <td className="px-3 py-3">
                          <div className="space-y-1.5 text-xs">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClassName(order?.status)}`}>
                              {getStatusLabel(order?.status)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                void handleCopyTradeId(tradeId);
                              }}
                              className="break-all text-left font-semibold text-sky-700 underline-offset-2 transition hover:text-sky-800 hover:underline"
                            >
                              {tradeId || '-'}
                            </button>
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
                              <button
                                type="button"
                                onClick={() => {
                                  void openOrderChatDrawer(order, buyerConsentSnapshot.channelUrl);
                                }}
                                disabled={!buyerConsentSnapshot.accepted || !buyerConsentSnapshot.channelUrl}
                                className={`mt-0.5 inline-flex w-fit items-center justify-center rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                                  buyerConsentSnapshot.accepted && buyerConsentSnapshot.channelUrl
                                    ? 'border-sky-300 bg-sky-50 text-sky-700 hover:border-sky-400 hover:bg-sky-100'
                                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                }`}
                              >
                                {buyerConsentSnapshot.accepted
                                  ? (buyerConsentSnapshot.channelUrl ? '채팅 보기' : '채널 없음')
                                  : '미동의'}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-0.5 text-xs">
                            <p className="font-semibold text-slate-800">주문 {formatDateTime(order?.createdAt)}</p>
                            <p className="text-slate-500">완료 {formatDateTime(order?.paymentConfirmedAt)}</p>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-0.5 text-xs">
                            <p className="font-semibold text-slate-900">{getBuyerDisplayName(order)}</p>
                            <p className="text-slate-500">{shortWallet(buyerWalletAddress)}</p>
                            <p className="text-slate-500">입금자명 {getBuyerDepositName(order)}</p>
                            {buyerStoreReferral.hasValue ? (
                              <div className="mt-1 flex items-center gap-1.5">
                                {buyerStoreReferral.storeLogo ? (
                                  <span
                                    className="h-4 w-4 shrink-0 rounded-full border border-slate-200 bg-cover bg-center bg-no-repeat"
                                    style={{ backgroundImage: `url(${encodeURI(buyerStoreReferral.storeLogo)})` }}
                                    aria-label={buyerStoreReferral.storeName || buyerStoreReferral.storecode || '가맹점'}
                                  />
                                ) : (
                                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-[9px] font-semibold text-slate-600">
                                    점
                                  </span>
                                )}
                                <p className="min-w-0 truncate text-slate-500">
                                  {getBuyerStoreReferralLabel(buyerStoreReferral)}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-0.5 text-xs">
                            <p className="font-semibold text-slate-900">{getSellerDisplayName(order)}</p>
                            <p className="text-slate-500">{shortWallet(sellerWalletAddress)}</p>
                            <p className="text-slate-500">
                              에이전트 {agentName && agentcode ? `${agentName} (${agentcode})` : (agentName || agentcode || '-')}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="space-y-0.5 text-xs">
                            <p className="font-extrabold text-slate-900">{formatKrw(order?.krwAmount)} KRW</p>
                            <p className="font-semibold text-slate-700">{formatUsdt(order?.usdtAmount)} USDT</p>
                            <p className="text-slate-500">환율 {exchangeRate > 0 ? formatKrw(exchangeRate) : '-'} KRW</p>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-0.5 text-xs">
                            <p className="font-semibold text-slate-900">{getPaymentMethodLabel(order)}</p>
                            <p className="break-all text-slate-500">{getPaymentMethodDetail(order)}</p>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-0.5 text-xs">
                            <p className="font-semibold text-slate-900">{formatPercent(agentFeeRate)}%</p>
                            <p className="text-slate-500">{formatUsdtFixed6(agentFeeAmount)} USDT</p>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {transactionHash ? (
                            <div className="space-y-1 text-xs">
                              <p className="break-all text-slate-700">{shortWallet(transactionHash)}</p>
                              {transactionHashUrl ? (
                                <a
                                  href={transactionHashUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 font-semibold text-sky-700 transition hover:border-sky-400 hover:bg-sky-100"
                                >
                                  Explorer
                                </a>
                              ) : null}
                            </div>
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
              페이지당 {pageSize.toLocaleString()}건 · 총 {totalCount.toLocaleString()}건
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPageNumber(1)}
                disabled={pageNumber <= 1 || loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                처음
              </button>
              <button
                type="button"
                onClick={() => setPageNumber((prev) => Math.max(1, prev - 1))}
                disabled={pageNumber <= 1 || loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
              </button>
              <span className="text-sm font-semibold text-slate-700">{pageNumber.toLocaleString()} / {totalPages.toLocaleString()}</span>
              <button
                type="button"
                onClick={() => setPageNumber((prev) => Math.min(totalPages, prev + 1))}
                disabled={pageNumber >= totalPages || loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음
              </button>
              <button
                type="button"
                onClick={() => setPageNumber(totalPages)}
                disabled={pageNumber >= totalPages || loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                마지막
              </button>
            </div>
          </div>
        </section>
      </div>
      </main>

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
          className={`fixed right-0 top-0 z-[105] h-dvh w-[min(94vw,460px)] border-l border-slate-200 bg-white shadow-[-6px_35px_80px_-45px_rgba(15,23,42,0.75)] transition-transform duration-200 ${
            isOrderChatDrawerOpen ? 'translate-x-0' : 'translate-x-full'
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
              ) : !orderChatUserId ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  관리자 채팅 사용자 ID를 확인할 수 없습니다.
                </div>
              ) : orderChatSessionError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                  {orderChatSessionError}
                </div>
              ) : !selectedOrderChatChannelUrl ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  이용동의 완료 주문의 `채팅 보기` 버튼을 눌러 채팅 내역을 열어주세요.
                </div>
              ) : orderChatChannelAccessLoading ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  채팅 채널 접근 권한을 준비 중입니다...
                </div>
              ) : orderChatSessionLoading || !orderChatSessionToken ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  채팅 세션을 준비 중입니다...
                </div>
              ) : (
                <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <SendbirdProvider
                    appId={SENDBIRD_APP_ID}
                    userId={orderChatUserId}
                    accessToken={orderChatSessionToken}
                    theme="light"
                  >
                    <GroupChannel
                      channelUrl={selectedOrderChatChannelUrl}
                      renderMessageInput={() => <></>}
                    />
                  </SendbirdProvider>
                </div>
              )}
            </div>
          </div>
        </aside>
      </>
    </>
  );
}
