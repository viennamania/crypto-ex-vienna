'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';

type BuyOrderItem = {
  _id?: string;
  tradeId?: string;
  createdAt?: string;
  paymentConfirmedAt?: string;
  status?: string;
  storecode?: string;
  krwAmount?: number;
  usdtAmount?: number;
  paymentMethod?: string;
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
  };
  settlement?: {
    platformFeePercent?: number;
    platformFeeAmount?: number | string;
    platformFeeWalletAddress?: string;
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
  searchStorecode: string;
  searchAgentcode: string;
};

type BuyerStoreReferralGroup = {
  storecode: string;
  storeName: string;
  storeLogo: string;
  count: number;
};

const DEFAULT_PAGE_SIZE = 30;
const PAGE_SIZE_OPTIONS = [20, 30, 50, 100];
const FIXED_STATUS = 'paymentconfirmed';

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
    searchStorecode: '',
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

const getOrderPlatformFeeRate = (order: BuyOrderItem) => {
  const candidates = [
    order?.platformFeeRate,
    order?.platformFee?.rate,
    order?.platformFee?.percentage,
    order?.settlement?.platformFeePercent,
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

export default function BuyOrderTradeHistoryPage() {
  const params = useParams<{ lang?: string }>();
  const lang = String(params?.lang || '').trim();
  const buyOrderManagementPath = lang
    ? `/${lang}/administration/buyorder-management`
    : '/administration/buyorder-management';

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
          storecode: appliedFilters.searchStorecode,
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

      setOrders(fetchedOrders);
      setTotalCount(Number(payload?.result?.totalCount || 0) || 0);
      setSummary({
        totalKrwAmount: Number(payload?.result?.totalKrwAmount || 0) || 0,
        totalUsdtAmount: Number(payload?.result?.totalUsdtAmount || 0) || 0,
        totalFeeAmount: Number(payload?.result?.totalPlatformFeeAmount || 0) || 0,
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
      searchStorecode: draftFilters.searchStorecode.trim(),
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

  return (
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
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">스토어코드</label>
              <input
                type="text"
                value={draftFilters.searchStorecode}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchStorecode: event.target.value }))}
                placeholder="예: r1mmtgzp"
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">합산 플랫폼 수수료</p>
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
              <table className="w-full min-w-[1120px] table-fixed lg:min-w-0">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-[10%] px-3 py-3">상태</th>
                    <th className="w-[12%] px-3 py-3">주문시각/완료시각</th>
                    <th className="w-[10%] px-3 py-3">거래번호</th>
                    <th className="w-[14%] px-3 py-3">구매자 정보</th>
                    <th className="w-[12%] px-3 py-3">판매자 정보</th>
                    <th className="w-[10%] px-3 py-3 text-right">거래금액</th>
                    <th className="w-[9%] px-3 py-3">결제정보</th>
                    <th className="w-[8%] px-3 py-3">에이전트</th>
                    <th className="w-[9%] px-3 py-3">플랫폼 수수료</th>
                    <th className="w-[6%] px-3 py-3">전송 Tx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order, index) => {
                    const exchangeRate = getOrderExchangeRate(order);
                    const platformFeeRate = getOrderPlatformFeeRate(order);
                    const platformFeeAmount = getOrderPlatformFeeAmount(order);
                    const platformFeeWalletAddress = getOrderPlatformFeeWalletAddress(order);
                    const transactionHash = String(order?.transactionHash || '').trim();
                    const transactionHashUrl = getExplorerUrlByHash(order, transactionHash);
                    const buyerWalletAddress = String(order?.buyer?.walletAddress || order?.walletAddress || '').trim();
                    const sellerWalletAddress = String(order?.seller?.walletAddress || '').trim();
                    const agentcode = String(order?.agent?.agentcode || order?.agentcode || order?.seller?.agentcode || '').trim();
                    const agentName = String(order?.agent?.agentName || order?.agentName || '').trim();
                    const buyerStoreReferral = getBuyerStoreReferral(order);

                    return (
                      <tr key={order._id || order.tradeId || `row-${index}`} className="align-top text-sm text-slate-700">
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClassName(order?.status)}`}>
                            {getStatusLabel(order?.status)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-0.5 text-xs">
                            <p className="font-semibold text-slate-800">주문 {formatDateTime(order?.createdAt)}</p>
                            <p className="text-slate-500">완료 {formatDateTime(order?.paymentConfirmedAt)}</p>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <p className="break-all text-xs font-semibold text-slate-900">{String(order?.tradeId || '-')}</p>
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
                            <p className="font-semibold text-slate-900">
                              {agentName && agentcode ? `${agentName} (${agentcode})` : (agentName || agentcode || '-')}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-0.5 text-xs">
                            <p className="font-semibold text-slate-900">{formatPercent(platformFeeRate)}%</p>
                            <p className="text-slate-500">{formatUsdt(platformFeeAmount)} USDT</p>
                            <p className="break-all text-[10px] text-slate-400">{platformFeeWalletAddress || '-'}</p>
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
  );
}
