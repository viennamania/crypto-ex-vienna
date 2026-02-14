'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { toast } from 'react-hot-toast';

type BuyOrderItem = {
  _id?: string;
  tradeId?: string;
  status?: string;
  createdAt?: string;
  paymentRequestedAt?: string;
  paymentConfirmedAt?: string;
  cancelledAt?: string;
  krwAmount?: number;
  usdtAmount?: number;
  paymentMethod?: string;
  walletAddress?: string;
  nickname?: string;
  buyer?: {
    walletAddress?: string;
    nickname?: string;
    depositName?: string;
    bankInfo?: {
      depositName?: string;
    };
  };
  seller?: {
    walletAddress?: string;
    nickname?: string;
    bankInfo?: {
      bankName?: string;
    };
  };
  store?: {
    storeName?: string;
  };
};

const POLLING_INTERVAL_MS = 5000;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

type SearchFilters = {
  date: string;
  searchBuyer: string;
  searchDepositName: string;
  searchStoreName: string;
};

const ACTIVE_STATUSES = new Set(['ordered', 'accepted', 'paymentRequested']);

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
    searchBuyer: '',
    searchDepositName: '',
    searchStoreName: '',
  };
};

export default function BuyOrderManagementPage() {
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
  });
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(() => createDefaultFilters());

  const mountedRef = useRef(true);
  const requestInFlightRef = useRef(false);
  const initializedRef = useRef(false);

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
      activeCount,
      statusItems,
    };
  }, [orders, summary.totalKrwAmount, summary.totalUsdtAmount, totalCount]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedFilters: SearchFilters = {
      date: draftFilters.date || getTodayDate(),
      searchBuyer: draftFilters.searchBuyer.trim(),
      searchDepositName: draftFilters.searchDepositName.trim(),
      searchStoreName: draftFilters.searchStoreName.trim(),
    };
    setPageNumber(1);
    setAppliedFilters(normalizedFilters);
  };

  const handleSearchReset = () => {
    const defaults = createDefaultFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setPageNumber(1);
  };

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
                onClick={() => fetchLatestBuyOrders('query')}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                새로고침
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.42)]">
          <form className="grid grid-cols-1 gap-3 lg:grid-cols-12" onSubmit={handleSearchSubmit}>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                조회 일자 (Daily)
              </label>
              <input
                type="date"
                value={draftFilters.date}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, date: event.target.value }))}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                구매자 닉네임
              </label>
              <input
                type="text"
                value={draftFilters.searchBuyer}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchBuyer: event.target.value }))}
                placeholder="구매자 검색"
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
                  const nextSize = Number(event.target.value) || DEFAULT_PAGE_SIZE;
                  setPageSize(nextSize);
                  setPageNumber(1);
                }}
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
          </form>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              <table className="min-w-[1180px] w-full">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-4 py-3">상태</th>
                    <th className="px-4 py-3">생성시각</th>
                    <th className="px-4 py-3">주문식별</th>
                    <th className="px-4 py-3">구매자</th>
                    <th className="px-4 py-3">판매자</th>
                    <th className="px-4 py-3">결제방법</th>
                    <th className="px-4 py-3 text-right">주문금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order, index) => (
                    <tr key={`${order?._id || order?.tradeId || 'order'}-${index}`} className="bg-white text-sm text-slate-700">
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClassName(order?.status)}`}>
                          {getStatusLabel(order?.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(order?.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">TID {order?.tradeId || '-'}</span>
                          <span className="text-xs text-slate-500">{shortWallet(order?._id)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">
                            {order?.buyer?.nickname || order?.nickname || '-'}
                          </span>
                          <span className="text-xs text-slate-500">
                            {shortWallet(order?.buyer?.walletAddress || order?.walletAddress)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{order?.seller?.nickname || '-'}</span>
                          <span className="text-xs text-slate-500">{shortWallet(order?.seller?.walletAddress)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {getPaymentMethodLabel(order)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-slate-900">{formatKrw(order?.krwAmount)} KRW</span>
                          <span className="text-xs font-semibold text-slate-500">{formatUsdt(order?.usdtAmount)} USDT</span>
                        </div>
                      </td>
                    </tr>
                  ))}
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
              <span className="text-sm font-semibold text-slate-700">
                {pageNumber.toLocaleString()} / {totalPages.toLocaleString()}
              </span>
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

        <section className="text-center text-xs text-slate-500">
          고급 모니터링 UI · 자동 상태 동기화 ({POLLING_INTERVAL_MS / 1000}초 주기)
        </section>
      </div>
    </main>
  );
}
