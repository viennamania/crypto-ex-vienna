'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';

type SellerUser = {
  _id?: string;
  nickname?: string;
  walletAddress: string;
  avatar?: string;
  seller?: {
    status?: string;
    enabled?: boolean;
    escrowWalletAddress?: string;
    buyOrder?: {
      status?: string;
      tradeId?: string;
      krwAmount?: number;
      usdtAmount?: number;
      rate?: number;
      createdAt?: string;
      paymentRequestedAt?: string;
      paymentConfirmedAt?: string;
      transactionHash?: string;
      cancelledAt?: string;
    };
    totalPaymentConfirmedCount?: number;
    totalPaymentConfirmedUsdtAmount?: number;
    totalPaymentConfirmedKrwAmount?: number;
  };
  currentUsdtBalance?: number;
};

type Summary = {
  total: number;
  totalCurrentUsdtBalance: number;
};

const toneStyles: Record<
  string,
  { badge: string; bar: string }
> = {
  idle: {
    badge: 'border-slate-200 bg-slate-50 text-slate-700',
    bar: 'bg-slate-400',
  },
  accepted: {
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    bar: 'bg-sky-500',
  },
  paymentRequested: {
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    bar: 'bg-amber-500',
  },
  paymentConfirmed: {
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    bar: 'bg-blue-500',
  },
  done: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    bar: 'bg-emerald-500',
  },
  cancelled: {
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    bar: 'bg-rose-400',
  },
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
};

const truncate = (value?: string, front = 6, back = 4) => {
  if (!value) return '-';
  if (value.length <= front + back) return value;
  return `${value.slice(0, front)}...${value.slice(-back)}`;
};

const getSaleState = (seller: SellerUser) => {
  const order = seller?.seller?.buyOrder;
  if (!order) {
    return { key: 'idle', label: '대기중', note: '진행중인 판매 없음', progress: 8 };
  }

  const txDone = order.transactionHash && order.transactionHash !== '0x';

  switch (order.status) {
    case 'ordered':
    case 'accepted':
      return { key: 'accepted', label: '매칭됨', note: '입금요청 전 단계', progress: 25 };
    case 'paymentRequested':
      return { key: 'paymentRequested', label: '입금요청', note: '입금 확인 대기', progress: 50 };
    case 'paymentConfirmed':
      if (txDone) {
        return { key: 'done', label: '판매완료', note: 'USDT 전송 완료', progress: 100 };
      }
      return { key: 'paymentConfirmed', label: '전송중', note: 'USDT 전송 처리중', progress: 75 };
    case 'cancelled':
      return { key: 'cancelled', label: '취소됨', note: '거래가 취소되었습니다', progress: 12 };
    default:
      return { key: 'idle', label: '대기중', note: '진행중인 판매 없음', progress: 8 };
  }
};

export default function SellerSalesStatusPage() {
  const params = useParams<{ lang?: string }>();
  const router = useRouter();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';

  const [sellers, setSellers] = useState<SellerUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary>({ total: 0, totalCurrentUsdtBalance: 0 });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // 검색 조건 (입력 값)
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | keyof typeof toneStyles>('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [minBalance, setMinBalance] = useState('');

  // 검색 적용 값
  const [appliedQuery, setAppliedQuery] = useState('');
  const [appliedStatus, setAppliedStatus] = useState<'all' | keyof typeof toneStyles>('all');
  const [appliedActiveOnly, setAppliedActiveOnly] = useState(false);
  const [appliedMinBalance, setAppliedMinBalance] = useState<number | null>(null);

  // 판매내역 패널 상태
  type SaleEntry = {
    _id: string;
    tradeId?: string;
    status?: string;
    createdAt?: string;
    seller?: { nickname?: string };
    buyer?: { nickname?: string; depositName?: string };
    krwAmount?: number;
    usdtAmount?: number;
  };
  const [showSalesPanel, setShowSalesPanel] = useState(false);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesPage, setSalesPage] = useState(1);
  const [salesHasMore, setSalesHasMore] = useState(true);
  const [salesReadyForPaging, setSalesReadyForPaging] = useState(false);
  const [salesSearch, setSalesSearch] = useState('');
  const [salesPrivateSaleMode, setSalesPrivateSaleMode] = useState<'all' | 'normal' | 'private'>('all');
  const salesLoadingRef = useRef(false);
  const salesPanelScrollRef = useRef<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchSales = async (page = 1, append = false, search = '') => {
    if (append && (!salesHasMore || !salesReadyForPaging)) return;
    if (salesLoadingRef.current) return;
    salesLoadingRef.current = true;
    setSalesLoading(true);
    try {
      const res = await fetch('/api/order/getAllBuyOrders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: '',
          limit: 20,
          page,
          searchStoreName: search || undefined,
          privateSaleMode: salesPrivateSaleMode,
        }),
      });
      const data = await res.json();
      const list: SaleEntry[] = data?.result?.orders || [];
      setSales((prev) => (append ? [...prev, ...list] : list));
      setSalesHasMore(list.length === 20);
      setSalesPage(page);
      if (!append) {
        setSalesReadyForPaging(true);
      }
    } catch (e) {
      console.error('fetchSales error', e);
    } finally {
      salesLoadingRef.current = false;
      setSalesLoading(false);
    }
  };

  useEffect(() => {
    if (showSalesPanel) {
      setSalesHasMore(true);
      setSalesPage(1);
      setSalesReadyForPaging(false);
      fetchSales(1, false, salesSearch);
    }
  }, [showSalesPanel]);

  useEffect(() => {
    if (!showSalesPanel) return;
    setSalesHasMore(true);
    setSalesPage(1);
    setSalesReadyForPaging(false);
    fetchSales(1, false, salesSearch);
  }, [salesPrivateSaleMode]);

  useEffect(() => {
    if (!showSalesPanel) return;
    if (!salesReadyForPaging) return;
    const root = salesPanelScrollRef.current;
    const el = sentinelRef.current;
    if (!root || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && salesHasMore && !salesLoading) {
          fetchSales(salesPage + 1, true, salesSearch);
        }
      },
      { root, rootMargin: '200px 0px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [showSalesPanel, salesReadyForPaging, salesHasMore, salesLoading, salesPage, salesSearch, salesPrivateSaleMode]);

  useEffect(() => {
    if (!showSalesPanel) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSalesPanel(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showSalesPanel]);

  const fetchSellers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/user/getAllSellersForBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: '',
          limit: 400,
          page: 1,
        }),
      });

      const data = await response.json();
      const users: SellerUser[] = data?.result?.users || [];
      setSellers(users);
      setSummary({
        total: data?.result?.totalCount || users.length || 0,
        totalCurrentUsdtBalance: data?.result?.totalCurrentUsdtBalance || 0,
      });
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching seller sales status', error);
      setSellers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  const displayedSellers = useMemo(() => {
    return sellers.filter((seller) => {
      const text = (appliedQuery || '').trim().toLowerCase();
      if (text) {
        const hit =
          (seller.nickname || '').toLowerCase().includes(text) ||
          (seller.walletAddress || '').toLowerCase().includes(text) ||
          (seller?.seller?.escrowWalletAddress || '').toLowerCase().includes(text) ||
          (seller?.seller?.buyOrder?.tradeId || '').toLowerCase().includes(text);
        if (!hit) return false;
      }

      const state = getSaleState(seller);
      if (appliedStatus !== 'all' && state.key !== appliedStatus) return false;

      if (appliedActiveOnly) {
        const order = seller?.seller?.buyOrder;
        const isActive =
          order &&
          ['ordered', 'accepted', 'paymentRequested', 'paymentConfirmed'].includes(order.status || '');
        if (!isActive) return false;
      }

      if (appliedMinBalance !== null) {
        const bal = seller.currentUsdtBalance || 0;
        if (bal < appliedMinBalance) return false;
      }

      return true;
    });
  }, [sellers, appliedQuery, appliedStatus, appliedActiveOnly, appliedMinBalance]);

  const totalActive = useMemo(() => {
    return sellers.filter((seller) => {
      const order = seller?.seller?.buyOrder;
      return order && ['ordered', 'accepted', 'paymentRequested', 'paymentConfirmed'].includes(order.status || '');
    }).length;
  }, [sellers]);

  const totalCompleted = useMemo(() => {
    return sellers.filter((seller) => getSaleState(seller).key === 'done').length;
  }, [sellers]);

  const totalCancelled = useMemo(() => {
    return sellers.filter((seller) => getSaleState(seller).key === 'cancelled').length;
  }, [sellers]);

  const completionRate = useMemo(() => {
    const resolved = totalCompleted + totalCancelled;
    if (resolved === 0) return 0;
    return Number(((totalCompleted / resolved) * 100).toFixed(1));
  }, [totalCompleted, totalCancelled]);

  return (
    <>
      <main className="relative min-h-[100vh] overflow-x-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-cyan-50 px-4 py-6 text-slate-800">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-200/35 blur-3xl" />
        <div className="pointer-events-none absolute right-8 top-24 h-56 w-56 rounded-full bg-emerald-200/30 blur-3xl" />

        <div className="relative mx-auto w-full max-w-screen-2xl space-y-4">
          <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_55px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-700">
                  Seller Control Room
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">판매자 판매현황</h1>
                <p className="text-sm text-slate-600">실시간 거래 흐름, 에스크로 잔고, 완료 성과를 한 화면에서 확인합니다.</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    전체 {summary.total.toLocaleString()}명
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    활성 {totalActive.toLocaleString()}건
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    완료율 {completionRate.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSalesPanel(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    <path d="M4 6h12M4 10h12M4 14h6" strokeLinecap="round" />
                  </svg>
                  판매내역보기
                </button>
                <button
                  type="button"
                  onClick={fetchSellers}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    <path d="M16 10a6 6 0 1 1-1.757-4.243M16 4v3.5h-3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  새로고침
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/${lang}/administration`)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                >
                  <Image src="/icon-home.png" alt="Home" width={16} height={16} className="h-4 w-4" />
                  홈으로
                </button>
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">총 판매자</p>
              <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">{summary.total.toLocaleString()} 명</p>
              <p className="mt-1 text-xs text-slate-500">판매 권한이 활성화된 사용자</p>
            </div>
            <div className="rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50 to-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-600">활성 거래</p>
              <p className="mt-1 text-3xl font-black tracking-tight text-cyan-900">{totalActive.toLocaleString()} 건</p>
              <p className="mt-1 text-xs text-cyan-700/80">매칭~전송중 상태 기준</p>
            </div>
            <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">에스크로 총 잔고</p>
              <p className="mt-1 text-3xl font-black tracking-tight text-emerald-900">
                {(summary.totalCurrentUsdtBalance || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                USDT
              </p>
              <p className="mt-1 text-xs text-emerald-700/80">전체 판매자 보관 잔고 합계</p>
            </div>
            <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-600">완료율</p>
              <p className="mt-1 text-3xl font-black tracking-tight text-violet-900">{completionRate.toFixed(1)}%</p>
              <p className="mt-1 text-xs text-violet-700/80">
                완료 {totalCompleted.toLocaleString()} / 취소 {totalCancelled.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="w-full rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.5)] sm:p-5">
            <div className="mb-4 flex flex-col gap-2 border-b border-slate-200/70 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Image src="/icon-seller.png" alt="Seller" width={22} height={22} className="h-5 w-5" />
                <h2 className="text-base font-bold text-slate-900">판매자 판매 진행상태</h2>
              </div>
              <div className="min-h-[20px] text-xs font-medium text-slate-500">
                {loading ? (
                  <div className="flex items-center gap-1">
                    <Image
                      src="/icon-loading.png"
                      alt="Loading"
                      width={16}
                      height={16}
                      className="h-4 w-4 animate-spin"
                    />
                    불러오는 중입니다...
                  </div>
                ) : lastUpdated ? (
                  <span>업데이트: {formatDateTime(lastUpdated.toISOString())}</span>
                ) : (
                  <span>최신 데이터 준비됨</span>
                )}
              </div>
            </div>

          {sellers.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-sm text-slate-500">
              <Image src="/icon-info.png" alt="Empty" width={36} height={36} className="h-9 w-9 opacity-70" />
              판매 진행 정보를 표시할 판매자가 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 shadow-inner">
                <div className="flex flex-wrap items-center gap-2 lg:gap-3">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="닉네임 / 지갑주소 / 에스크로주소 / TID"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none md:w-64"
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="all">전체 상태</option>
                    <option value="accepted">매칭됨</option>
                    <option value="paymentRequested">입금요청</option>
                    <option value="paymentConfirmed">전송중</option>
                    <option value="done">판매완료</option>
                    <option value="cancelled">취소됨</option>
                    <option value="idle">대기중</option>
                  </select>
                  <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm">
                    <input
                      type="checkbox"
                      checked={activeOnly}
                      onChange={(e) => setActiveOnly(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    />
                    진행중만
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={minBalance}
                      onChange={(e) => setMinBalance(e.target.value)}
                      placeholder="최소 에스크로 USDT"
                      className="w-48 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
                    />
                    <span className="text-xs text-slate-500">USDT 이상</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedQuery(query);
                        setAppliedStatus(statusFilter);
                        setAppliedActiveOnly(activeOnly);
                        setAppliedMinBalance(minBalance === '' ? null : Number(minBalance));
                      }}
                      className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
                    >
                      검색하기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setStatusFilter('all');
                        setActiveOnly(false);
                        setMinBalance('');
                        setAppliedQuery('');
                        setAppliedStatus('all');
                        setAppliedActiveOnly(false);
                        setAppliedMinBalance(null);
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                    >
                      초기화
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-medium text-slate-500">
                  검색 결과: {displayedSellers.length.toLocaleString()} / {sellers.length.toLocaleString()} 명
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <table className="min-w-[1180px] w-full border-collapse">
                  <thead className="bg-slate-100/95 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">판매자</th>
                      <th className="px-4 py-3 text-left">진행상태</th>
                      <th className="px-4 py-3 text-left">진행중 거래</th>
                      <th className="px-4 py-3 text-left">누적 완료</th>
                      <th className="px-4 py-3 text-left">에스크로 잔고</th>
                      <th className="px-4 py-3 text-left">액션</th>
                    </tr>
                  </thead>
                <tbody>
                  {displayedSellers.map((seller) => {
                    const state = getSaleState(seller);
                    const tone = toneStyles[state.key] || toneStyles.idle;
                    const order = seller?.seller?.buyOrder;
                    const totalCount = seller?.seller?.totalPaymentConfirmedCount || 0;
                    const totalUsdt = seller?.seller?.totalPaymentConfirmedUsdtAmount || 0;
                    const totalKrw = seller?.seller?.totalPaymentConfirmedKrwAmount || 0;

                    return (
                      <tr key={seller.walletAddress} className="border-b border-slate-100 transition hover:bg-cyan-50/40">
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-white">
                              {seller?.avatar ? (
                                <Image src={seller.avatar} alt="Profile" fill sizes="40px" className="object-cover" />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-xs font-semibold tracking-[0.12em]">
                                  {(seller?.nickname || seller.walletAddress || 'NA')
                                    .replace(/^0x/i, '')
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-semibold text-slate-900">
                                {seller?.nickname || '미등록 닉네임'}
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono">
                                {truncate(seller.walletAddress)}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${tone.badge}`}
                            >
                              {state.label}
                            </span>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-full rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${tone.bar}`}
                                  style={{ width: `${Math.min(Math.max(state.progress, 0), 100)}%` }}
                                />
                              </div>
                              <span className="tabular-nums text-[11px] text-slate-500">
                                {Math.min(Math.max(state.progress, 0), 100)}%
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">{state.note}</p>
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          {order ? (
                            <div className="flex flex-col gap-1 text-xs text-slate-700">
                              <span className="font-mono text-[11px] text-slate-500">
                                TID: {truncate(order.tradeId, 8, 6)}
                              </span>
                              <span>금액: {order.krwAmount?.toLocaleString() || 0} KRW</span>
                              <span>수량: {order.usdtAmount?.toLocaleString() || 0} USDT</span>
                              <span className="text-[11px] text-slate-500">
                                요청: {formatDateTime(order.paymentRequestedAt || order.createdAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">진행중 거래 없음</span>
                          )}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col gap-2 text-xs text-slate-700">
                            <span className="inline-flex w-fit items-center rounded-md bg-blue-50 px-2.5 py-1 text-base font-extrabold tabular-nums text-blue-700">
                              {totalCount.toLocaleString()}건
                            </span>
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex w-fit items-center rounded-md bg-indigo-50 px-2 py-1 text-[13px] font-bold tabular-nums text-indigo-700">
                                거래량 {totalUsdt.toLocaleString()} USDT
                              </span>
                              <span className="inline-flex w-fit items-center rounded-md bg-slate-100 px-2 py-1 text-[13px] font-bold tabular-nums text-slate-700">
                                거래금액 {totalKrw.toLocaleString()} KRW
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col gap-1.5 text-xs text-slate-700">
                            <span className="inline-flex w-fit items-center rounded-md bg-emerald-50 px-2.5 py-1 text-base font-extrabold tabular-nums text-emerald-700">
                              {(seller.currentUsdtBalance || 0).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              USDT
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              지갑: {truncate(seller?.seller?.escrowWalletAddress)}
                            </span>
                            <span className="text-[11px] text-slate-500">실시간 에스크로 잔액</span>
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() =>
                                router.push(`/${lang}/administration/seller-sales-status/${seller.walletAddress}`)
                              }
                              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
                            >
                              상세보기
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>
        </div>
      </main>

      {/* 판매내역 패널 */}
      {showSalesPanel && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
            onClick={() => setShowSalesPanel(false)}
          />
          <aside
            ref={salesPanelScrollRef}
            className="absolute inset-y-0 right-0 h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-2xl animate-[slideLeft_0.25s_ease-out]"
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-cyan-50 p-4">
              <div className="flex items-center gap-2">
                <Image src="/icon-trade.png" alt="history" width={20} height={20} className="h-5 w-5" />
                <h3 className="text-sm font-semibold text-slate-900">판매내역 (최신순)</h3>
              </div>
              <button
                onClick={() => setShowSalesPanel(false)}
                className="text-xl leading-none text-slate-400 transition hover:text-slate-600"
                aria-label="close"
              >
                ×
              </button>
            </div>

            <div className="border-b border-slate-200 bg-white p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSalesHasMore(true);
                  setSalesPage(1);
                  setSalesReadyForPaging(false);
                  fetchSales(1, false, salesSearch);
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  placeholder="거래ID / 닉네임 / 매장명"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
                />
                <select
                  value={salesPrivateSaleMode}
                  onChange={(e) => setSalesPrivateSaleMode(e.target.value as 'all' | 'normal' | 'private')}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 focus:border-cyan-400 focus:outline-none"
                >
                  <option value="all">전체</option>
                  <option value="normal">일반</option>
                  <option value="private">프라이빗</option>
                </select>
                <button
                  type="submit"
                  className="whitespace-nowrap rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  검색
                </button>
              </form>
            </div>

            <div className="divide-y divide-slate-100">
              {sales.map((sale: SaleEntry) => (
                <div key={sale._id} className="flex flex-col gap-1 bg-white p-3 text-sm text-slate-800 transition hover:bg-slate-50/60">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-slate-500">#{sale.tradeId || sale._id}</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {sale.status || '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">{sale.seller?.nickname || '판매자'}</span>
                    <span className="text-slate-600">{sale.buyer?.nickname || sale.buyer?.depositName || '구매자'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[13px] text-slate-700">
                    <span>{(sale.krwAmount || 0).toLocaleString()} KRW</span>
                    <span className="font-mono text-[12px]">{(sale.usdtAmount || 0).toLocaleString()} USDT</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {sale.createdAt ? formatDateTime(sale.createdAt) : ''}
                  </span>
                </div>
              ))}
              {salesLoading && (
                <div className="p-3 flex items-center gap-2 text-xs text-slate-500">
                  <Image
                    src="/icon-loading.png"
                    alt="Loading"
                    width={16}
                    height={16}
                    className="h-4 w-4 animate-spin"
                  />
                  불러오는 중...
                </div>
              )}
              {!salesLoading && salesHasMore && sales.length > 0 && (
                <div className="p-3">
                  <button
                    type="button"
                    onClick={() => fetchSales(salesPage + 1, true, salesSearch)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    더 불러오기
                  </button>
                </div>
              )}
              <div ref={sentinelRef} />
              {!salesLoading && sales.length === 0 && (
                <div className="p-4 text-sm text-slate-500">판매 내역이 없습니다.</div>
              )}
            </div>
          </aside>
        </div>
      )}

      <style jsx global>{`
        @keyframes slideLeft {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}
