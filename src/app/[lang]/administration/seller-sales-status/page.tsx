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
  const [salesSearch, setSalesSearch] = useState('');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchSales = async (page = 1, append = false, search = '') => {
    if (salesLoading) return;
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
        }),
      });
      const data = await res.json();
      const list: SaleEntry[] = data?.result?.orders || [];
      setSales((prev) => (append ? [...prev, ...list] : list));
      setSalesHasMore(list.length === 20);
      setSalesPage(page);
    } catch (e) {
      console.error('fetchSales error', e);
    } finally {
      setSalesLoading(false);
    }
  };

  useEffect(() => {
    if (showSalesPanel) {
      fetchSales(1, false, salesSearch);
    }
  }, [showSalesPanel]);

  useEffect(() => {
    if (!showSalesPanel) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && salesHasMore && !salesLoading) {
          fetchSales(salesPage + 1, true, salesSearch);
        }
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [showSalesPanel, salesHasMore, salesLoading, salesPage, salesSearch]);

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

  return (
    <>
      <main className="p-4 min-h-[100vh] flex items-start justify-center container max-w-screen-xl mx-auto bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
        <div className="w-full space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center justify-center rounded-full border border-slate-200/70 bg-white/95 p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <Image src="/icon-back.png" alt="Back" width={20} height={20} className="rounded-full" />
            </button>
            <span className="font-semibold">판매자 판매현황</span>
            <span className="text-slate-400">/</span>
            <span className="text-slate-500">전체 {summary.total}명</span>
          </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">총 판매자</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{summary.total.toLocaleString()} 명</p>
            <p className="mt-1 text-xs text-slate-500">판매 권한이 활성화된 모든 판매자 수</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">활성 거래</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{totalActive.toLocaleString()} 건</p>
            <p className="mt-1 text-xs text-slate-500">진행중(매칭~전송중) 상태의 판매자</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">에스크로 USDT</p>
              <button
                type="button"
                onClick={fetchSellers}
                className="text-[11px] font-semibold text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
              >
                새로고침
              </button>
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {(summary.totalCurrentUsdtBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
              USDT
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {lastUpdated ? `업데이트: ${formatDateTime(lastUpdated.toISOString())}` : '업데이트 대기중'}
            </p>
          </div>
        </div>

        <div className="w-full rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 pb-3">
            <div className="flex items-center gap-2">
              <Image src="/icon-seller.png" alt="Seller" width={22} height={22} className="h-5 w-5" />
              <h2 className="text-base font-bold text-slate-900">판매자 판매 진행상태</h2>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500 min-h-[20px]">
              <Image
                src="/icon-loading.png"
                alt="Loading"
                width={16}
                height={16}
                className="h-4 w-4 animate-spin"
              />
              불러오는 중입니다... (정보는 아래에서 계속 볼 수 있어요)
            </div>
          </div>
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={() => setShowSalesPanel(true)}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              판매내역보기
            </button>
          </div>

          {sellers.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-500">
              <Image src="/icon-info.png" alt="Empty" width={36} height={36} className="h-9 w-9 opacity-70" />
              판매 진행 정보를 표시할 판매자가 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="닉네임 / 지갑주소 / 에스크로주소 / TID"
                    className="w-full md:w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                  >
                    <option value="all">전체 상태</option>
                    <option value="accepted">매칭됨</option>
                    <option value="paymentRequested">입금요청</option>
                    <option value="paymentConfirmed">전송중</option>
                    <option value="done">판매완료</option>
                    <option value="cancelled">취소됨</option>
                    <option value="idle">대기중</option>
                  </select>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
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
                      className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
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
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
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
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      초기화
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  검색 결과: {displayedSellers.length.toLocaleString()} / {sellers.length.toLocaleString()} 명
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">판매자</th>
                      <th className="px-4 py-2 text-left">진행상태</th>
                      <th className="px-4 py-2 text-left">진행중 거래</th>
                      <th className="px-4 py-2 text-left">누적 완료</th>
                      <th className="px-4 py-2 text-left">에스크로 잔고</th>
                      <th className="px-4 py-2 text-left">액션</th>
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
                      <tr key={seller.walletAddress} className="border-b border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 align-top">
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
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-slate-900">
                                {seller?.nickname || '미등록 닉네임'}
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono">
                                {truncate(seller.walletAddress)}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                에스크로: {truncate(seller?.seller?.escrowWalletAddress)}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 align-top">
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

                        <td className="px-4 py-3 align-top">
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

                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-1 text-xs text-slate-700">
                            <span className="font-semibold text-slate-900">
                              {totalCount.toLocaleString()}건 완료
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {totalUsdt.toLocaleString()} USDT / {totalKrw.toLocaleString()} KRW
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-1 text-xs text-slate-700">
                            <span className="font-semibold text-slate-900">
                              {(seller.currentUsdtBalance || 0).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              USDT
                            </span>
                            <span className="text-[11px] text-slate-500">실시간 에스크로 잔액</span>
                          </div>
                        </td>

                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() =>
                                router.push(`/${lang}/administration/seller-sales-status/${seller.walletAddress}`)
                              }
                              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
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

      {/* 항상 보이는 판매내역 열기 버튼 (플로팅) */}
      {!showSalesPanel && (
        <button
          type="button"
          onClick={() => setShowSalesPanel(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_rgba(15,23,42,0.5)] hover:bg-slate-800"
        >
          <Image src="/icon-history.png" alt="history" width={18} height={18} className="h-4 w-4" />
          판매내역보기
        </button>
      )}

      {/* 판매내역 패널 */}
      {showSalesPanel && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="w-full max-w-sm bg-white shadow-2xl h-full overflow-y-auto border-r border-slate-200 animate-[slideRight_0.25s_ease-out]"
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Image src="/icon-history.png" alt="history" width={20} height={20} className="h-5 w-5" />
                <h3 className="text-sm font-semibold text-slate-900">판매내역 (최신순)</h3>
              </div>
              <button
                onClick={() => setShowSalesPanel(false)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                aria-label="close"
              >
                ×
              </button>
            </div>

            <div className="p-3 border-b border-slate-200">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchSales(1, false, salesSearch);
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  placeholder="거래ID / 닉네임 / 매장명"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 whitespace-nowrap"
                >
                  검색
                </button>
              </form>
            </div>

            <div className="divide-y divide-slate-100">
              {sales.map((sale: SaleEntry) => (
                <div key={sale._id} className="p-3 flex flex-col gap-1 text-sm text-slate-800">
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
              <div ref={sentinelRef} />
              {!salesLoading && sales.length === 0 && (
                <div className="p-4 text-sm text-slate-500">판매 내역이 없습니다.</div>
              )}
            </div>
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setShowSalesPanel(false)} />
        </div>
      )}

      <style jsx global>{`
        @keyframes slideRight {
          from {
            transform: translateX(-100%);
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
