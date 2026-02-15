'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';

type StoreItem = {
  _id: string;
  createdAt: string;
  storecode: string;
  storeName: string;
  agentcode: string;
  agentName: string;
  backgroundColor: string;
  totalPaymentConfirmedCount: number;
  totalKrwAmount: number;
  totalUsdtAmount: number;
  totalSettlementCount: number;
  totalSettlementAmountKRW: number;
  settlementFeePercent: number;
  escrowAmountUSDT: number;
  adminWalletAddress: string;
  sellerWalletAddress: string;
  settlementWalletAddress: string;
};

type StoreCreateForm = {
  storeName: string;
  storeDescription: string;
  storeLogo: string;
  storeBanner: string;
};

type FetchMode = 'initial' | 'query' | 'polling';

type RiskLevel = 'stable' | 'watch' | 'alert';

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];
const POLLING_INTERVAL_MS = 15000;

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toText = (value: unknown) => (typeof value === 'string' ? value : '');
const createInitialStoreForm = (): StoreCreateForm => ({
  storeName: '',
  storeDescription: '',
  storeLogo: '',
  storeBanner: '',
});

const normalizeStore = (value: unknown): StoreItem => {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    _id: toText(source._id),
    createdAt: toText(source.createdAt),
    storecode: toText(source.storecode),
    storeName: toText(source.storeName),
    agentcode: toText(source.agentcode),
    agentName: toText(source.agentName),
    backgroundColor: toText(source.backgroundColor),
    totalPaymentConfirmedCount: toFiniteNumber(source.totalPaymentConfirmedCount),
    totalKrwAmount: toFiniteNumber(source.totalKrwAmount),
    totalUsdtAmount: toFiniteNumber(source.totalUsdtAmount),
    totalSettlementCount: toFiniteNumber(source.totalSettlementCount),
    totalSettlementAmountKRW: toFiniteNumber(source.totalSettlementAmountKRW),
    settlementFeePercent: toFiniteNumber(source.settlementFeePercent),
    escrowAmountUSDT: toFiniteNumber(source.escrowAmountUSDT),
    adminWalletAddress: toText(source.adminWalletAddress),
    sellerWalletAddress: toText(source.sellerWalletAddress),
    settlementWalletAddress: toText(source.settlementWalletAddress),
  };
};

const formatKrw = (value: number) =>
  new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(toFiniteNumber(value));

const formatUsdt = (value: number) =>
  new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(toFiniteNumber(value));

const formatDateTime = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const shortWallet = (value: string) => {
  if (!value) return '-';
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const getRiskLevel = (store: StoreItem): RiskLevel => {
  const hasCriticalWalletGap =
    !store.adminWalletAddress.trim() ||
    !store.sellerWalletAddress.trim() ||
    !store.settlementWalletAddress.trim();
  if (hasCriticalWalletGap || store.settlementFeePercent >= 4.5) {
    return 'alert';
  }

  if (store.totalPaymentConfirmedCount === 0 || store.totalSettlementCount === 0 || store.totalKrwAmount === 0) {
    return 'watch';
  }

  return 'stable';
};

const getRiskBadge = (level: RiskLevel) => {
  if (level === 'alert') {
    return {
      label: 'Alert',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }
  if (level === 'watch') {
    return {
      label: 'Watch',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }
  return {
    label: 'Stable',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
};

export default function StoreManagementPage() {
  const params = useParams<{ lang?: string | string[] }>();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? (langParam[0] || 'ko') : (langParam || 'ko');

  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creatingStore, setCreatingStore] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [createModalError, setCreateModalError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<StoreCreateForm>(() => createInitialStoreForm());
  const [draftFilters, setDraftFilters] = useState({
    searchStore: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    searchStore: '',
  });

  const mountedRef = useRef(true);
  const requestInFlightRef = useRef(false);
  const initializedRef = useRef(false);

  const fetchStoreDashboard = useCallback(async (mode: FetchMode = 'query') => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    if (mode === 'polling') {
      setPolling(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/store/getAllStores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: pageSize,
          page: pageNumber,
          searchStore: appliedFilters.searchStore,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : '가맹점 대시보드 데이터를 불러오지 못했습니다.',
        );
      }

      const rawStores = Array.isArray(payload?.result?.stores) ? payload.result.stores : [];
      const normalizedStores = rawStores.map(normalizeStore);
      const normalizedTotalCount = toFiniteNumber(payload?.result?.totalCount);

      if (!mountedRef.current) return;
      setStores(normalizedStores);
      setTotalCount(normalizedTotalCount);
      setLastUpdatedAt(new Date().toISOString());
      setError(null);
    } catch (fetchError: unknown) {
      if (!mountedRef.current) return;
      setError(fetchError instanceof Error ? fetchError.message : '가맹점 데이터를 조회하는 중 오류가 발생했습니다.');
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setPolling(false);
      }
    }
  }, [appliedFilters.searchStore, pageNumber, pageSize]);

  useEffect(() => {
    mountedRef.current = true;
    fetchStoreDashboard(initializedRef.current ? 'query' : 'initial');
    initializedRef.current = true;

    const intervalId = window.setInterval(() => {
      fetchStoreDashboard('polling');
    }, POLLING_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [fetchStoreDashboard]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount, pageSize]);

  useEffect(() => {
    if (pageNumber > totalPages) {
      setPageNumber(totalPages);
    }
  }, [pageNumber, totalPages]);

  const stats = useMemo(() => {
    const totalKrwAmount = stores.reduce((sum, store) => sum + store.totalKrwAmount, 0);
    const totalUsdtAmount = stores.reduce((sum, store) => sum + store.totalUsdtAmount, 0);
    const totalSettlementAmountKRW = stores.reduce((sum, store) => sum + store.totalSettlementAmountKRW, 0);
    const activeStores = stores.filter((store) => store.totalPaymentConfirmedCount > 0).length;
    const avgFeePercent =
      stores.length > 0
        ? stores.reduce((sum, store) => sum + store.settlementFeePercent, 0) / stores.length
        : 0;
    const settlementCoverage =
      totalKrwAmount > 0 ? (totalSettlementAmountKRW / totalKrwAmount) * 100 : 0;

    return {
      totalKrwAmount,
      totalUsdtAmount,
      totalSettlementAmountKRW,
      activeStores,
      avgFeePercent,
      settlementCoverage,
    };
  }, [stores]);

  const topStores = useMemo(() => (
    [...stores]
      .sort((a, b) => b.totalKrwAmount - a.totalKrwAmount)
      .slice(0, 5)
  ), [stores]);

  const riskWatchlist = useMemo(() => {
    const rank: Record<RiskLevel, number> = {
      stable: 1,
      watch: 2,
      alert: 3,
    };

    return stores
      .map((store) => ({ store, risk: getRiskLevel(store) }))
      .sort((a, b) => {
        if (rank[b.risk] !== rank[a.risk]) {
          return rank[b.risk] - rank[a.risk];
        }
        return b.store.totalKrwAmount - a.store.totalKrwAmount;
      })
      .slice(0, 6);
  }, [stores]);

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageNumber(1);
    setAppliedFilters({
      searchStore: draftFilters.searchStore.trim(),
    });
  };

  const handleFilterReset = () => {
    setDraftFilters({ searchStore: '' });
    setAppliedFilters({ searchStore: '' });
    setPageNumber(1);
  };

  const openCreateModal = () => {
    setCreateModalError(null);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = useCallback(() => {
    if (creatingStore) return;
    setIsCreateModalOpen(false);
    setCreateModalError(null);
    setCreateForm(createInitialStoreForm());
  }, [creatingStore]);

  const submitCreateStore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creatingStore) return;

    const storeName = createForm.storeName.trim();
    const storeType = 'store';
    const storeUrl = '';
    const storeDescription = createForm.storeDescription.trim();
    const storeLogo = createForm.storeLogo.trim();
    const storeBanner = createForm.storeBanner.trim();

    if (storeName.length < 2) {
      setCreateModalError('가맹점 이름은 2자 이상이어야 합니다.');
      return;
    }
    if (storeName.length > 24) {
      setCreateModalError('가맹점 이름은 24자 이하여야 합니다.');
      return;
    }
    if (!storeLogo) {
      setCreateModalError('가맹점 로고를 업로드해주세요.');
      return;
    }
    if (!storeBanner) {
      setCreateModalError('가맹점 배너를 업로드해주세요.');
      return;
    }

    setCreatingStore(true);
    setCreateModalError(null);

    try {
      const response = await fetch('/api/store/setStore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName,
          storeType,
          storeUrl,
          storeDescription,
          storeLogo,
          storeBanner,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error('가맹점 생성 요청에 실패했습니다.');
      }
      if (!payload?.result) {
        throw new Error('동일한 가맹점 코드 또는 이름이 이미 존재합니다.');
      }

      const createdStoreCode = toText(payload?.result?.storecode) || '-';
      toast.success(`가맹점이 생성되었습니다 (${createdStoreCode})`);
      setIsCreateModalOpen(false);
      setCreateForm(createInitialStoreForm());
      setPageNumber(1);
      await fetchStoreDashboard('query');
    } catch (createError: unknown) {
      const message = createError instanceof Error ? createError.message : '가맹점 생성 중 오류가 발생했습니다.';
      setCreateModalError(message);
      toast.error(message);
    } finally {
      setCreatingStore(false);
    }
  };

  const uploadImageToBlob = useCallback(async (file: File, kind: 'logo' | 'banner') => {
    if (!file.type.startsWith('image/')) {
      setCreateModalError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    if (kind === 'logo') {
      setUploadingLogo(true);
    } else {
      setUploadingBanner(true);
    }
    setCreateModalError(null);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || '이미지 업로드에 실패했습니다.');
      }

      const payload = await response.json().catch(() => ({}));
      const uploadedUrl = toText(payload?.url);
      if (!uploadedUrl) {
        throw new Error('업로드 URL을 받지 못했습니다.');
      }

      setCreateForm((prev) => (
        kind === 'logo'
          ? { ...prev, storeLogo: uploadedUrl }
          : { ...prev, storeBanner: uploadedUrl }
      ));
      toast.success(kind === 'logo' ? '로고 업로드 완료' : '배너 업로드 완료');
    } catch (uploadError: unknown) {
      const message = uploadError instanceof Error ? uploadError.message : '이미지 업로드 중 오류가 발생했습니다.';
      setCreateModalError(message);
      toast.error(message);
    } finally {
      if (kind === 'logo') {
        setUploadingLogo(false);
      } else {
        setUploadingBanner(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isCreateModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creatingStore) {
        closeCreateModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeCreateModal, creatingStore, isCreateModalOpen]);

  return (
    <main className="store-management-shell relative min-h-screen overflow-hidden px-4 pb-20 pt-6 lg:px-6 lg:pt-8">
      <div className="decor-orb decor-orb-a" />
      <div className="decor-orb decor-orb-b" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
        <section className="reveal-up rounded-3xl border border-teal-100/80 bg-white/85 p-5 shadow-[0_34px_84px_-60px_rgba(13,148,136,0.72)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="frosted-mark inline-flex h-12 w-12 items-center justify-center rounded-2xl">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-teal-900" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 12h16" />
                  <path d="M6 7h12" />
                  <path d="M8 17h8" />
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-teal-700">Merchant Finance Desk</p>
                <h1 className="text-xl font-bold text-slate-900">가맹점 관리 대시보드</h1>
                <p className="text-sm text-slate-600">
                  금융앱 스타일 모니터링 화면으로 가맹점 흐름, 정산 비중, 위험 신호를 한 번에 확인합니다.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center rounded-full bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-600"
              >
                가맹점 추가
              </button>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className={`h-2.5 w-2.5 rounded-full ${polling ? 'animate-pulse bg-emerald-500' : 'bg-emerald-400'}`} />
                {polling ? '동기화 중' : '15초 자동 동기화'}
              </span>
              <button
                type="button"
                onClick={() => fetchStoreDashboard('query')}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                수동 새로고침
              </button>
            </div>
          </div>
        </section>

        <section className="reveal-up rounded-2xl border border-slate-200/80 bg-white/88 p-4 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.35)] backdrop-blur" style={{ animationDelay: '90ms' }}>
          <form className="grid grid-cols-1 gap-3 lg:grid-cols-12" onSubmit={handleFilterSubmit}>
            <div className="lg:col-span-7">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                가맹점명 / 코드
              </label>
              <input
                type="text"
                value={draftFilters.searchStore}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchStore: event.target.value }))}
                placeholder="예: 서울센터 또는 STORE001"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                페이지 크기
              </label>
              <select
                value={pageSize}
                onChange={(event) => {
                  const nextSize = toFiniteNumber(event.target.value) || DEFAULT_PAGE_SIZE;
                  setPageSize(nextSize);
                  setPageNumber(1);
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}개
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-3 flex items-end justify-end gap-2">
              <button
                type="button"
                onClick={handleFilterReset}
                className="inline-flex h-11 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                초기화
              </button>
              <button
                type="submit"
                className="inline-flex h-11 items-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-600"
              >
                조회
              </button>
            </div>
          </form>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="reveal-up rounded-2xl border border-teal-100 bg-[linear-gradient(145deg,#f0fdfa_0%,#ccfbf1_100%)] p-4 shadow-[0_20px_40px_-30px_rgba(15,118,110,0.5)]" style={{ animationDelay: '160ms' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">등록 가맹점</p>
            <p className="mt-2 text-3xl font-bold text-teal-950">{totalCount.toLocaleString()}</p>
            <p className="mt-1 text-xs text-teal-700/90">필터 기준 전체 건수</p>
          </article>
          <article className="reveal-up rounded-2xl border border-emerald-100 bg-[linear-gradient(145deg,#f0fdf4_0%,#dcfce7_100%)] p-4 shadow-[0_20px_40px_-30px_rgba(22,163,74,0.45)]" style={{ animationDelay: '220ms' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">활성 가맹점</p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">{stats.activeStores.toLocaleString()}</p>
            <p className="mt-1 text-xs text-emerald-700/90">결제확정 거래가 있는 가맹점</p>
          </article>
          <article className="reveal-up rounded-2xl border border-sky-100 bg-[linear-gradient(145deg,#f0f9ff_0%,#dbeafe_100%)] p-4 shadow-[0_20px_40px_-30px_rgba(14,116,144,0.45)]" style={{ animationDelay: '280ms' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">페이지 거래금액</p>
            <p className="mt-2 text-3xl font-bold text-sky-900">{formatKrw(stats.totalKrwAmount)}</p>
            <p className="mt-1 text-xs text-sky-700/90">{formatUsdt(stats.totalUsdtAmount)} USDT</p>
          </article>
          <article className="reveal-up rounded-2xl border border-amber-100 bg-[linear-gradient(145deg,#fffbeb_0%,#fef3c7_100%)] p-4 shadow-[0_20px_40px_-30px_rgba(217,119,6,0.5)]" style={{ animationDelay: '340ms' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">정산 커버리지</p>
            <p className="mt-2 text-3xl font-bold text-amber-900">{stats.settlementCoverage.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-amber-700/90">평균 수수료 {stats.avgFeePercent.toFixed(2)}%</p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <article className="reveal-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_22px_52px_-34px_rgba(15,23,42,0.42)] xl:col-span-7" style={{ animationDelay: '420ms' }}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Top 5 거래 가맹점</p>
                <p className="text-xs text-slate-500">현재 조회 페이지 기준 KRW 거래금액 순</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                정산합계 {formatKrw(stats.totalSettlementAmountKRW)}원
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {topStores.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">표시할 가맹점이 없습니다.</div>
              ) : (
                topStores.map((store, index) => (
                  <div key={`${store.storecode || store._id || 'store'}-${index}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                          {index + 1}
                        </span>
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {store.storeName || '-'}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        코드 {store.storecode || '-'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{formatKrw(store.totalKrwAmount)}원</p>
                      <p className="text-xs text-slate-500">{formatUsdt(store.totalUsdtAmount)} USDT</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="reveal-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_22px_52px_-34px_rgba(15,23,42,0.42)] xl:col-span-5" style={{ animationDelay: '500ms' }}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">리스크 워치리스트</p>
                <p className="text-xs text-slate-500">지갑 누락/낮은 활동/높은 수수료 감시</p>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {riskWatchlist.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">감시 대상이 없습니다.</div>
              ) : (
                riskWatchlist.map(({ store, risk }, index) => {
                  const badge = getRiskBadge(risk);
                  return (
                    <div key={`${store.storecode || store._id || 'risk'}-${index}`} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{store.storeName || '-'}</p>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        수수료 {store.settlementFeePercent.toFixed(2)}% · 결제확정 {store.totalPaymentConfirmedCount.toLocaleString()}건
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        정산지갑 {shortWallet(store.settlementWalletAddress)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </section>

        <section className="reveal-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_28px_60px_-42px_rgba(15,23,42,0.45)]" style={{ animationDelay: '560ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">가맹점 거래/정산 현황</p>
              <p className="text-xs text-slate-500">
                마지막 갱신 {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : '-'} · {polling ? '자동 동기화 중' : '대기 중'}
              </p>
            </div>
            {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          </div>

          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={`loading-skeleton-${index}`} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : stores.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">조회 조건에 맞는 가맹점이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-4 py-3">가맹점</th>
                    <th className="px-4 py-3 text-right">결제확정</th>
                    <th className="px-4 py-3 text-right">거래금액</th>
                    <th className="px-4 py-3 text-right">정산금액</th>
                    <th className="px-4 py-3 text-right">수수료율</th>
                    <th className="px-4 py-3">지갑상태</th>
                    <th className="w-[170px] px-4 py-3 text-right whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stores.map((store, index) => {
                    const risk = getRiskLevel(store);
                    const badge = getRiskBadge(risk);
                    const hasStoreCode = !!store.storecode.trim();
                    const hasAllWallets =
                      !!store.adminWalletAddress.trim() &&
                      !!store.sellerWalletAddress.trim() &&
                      !!store.settlementWalletAddress.trim();

                    return (
                      <tr key={`${store.storecode || store._id || 'table-store'}-${index}`} className="bg-white text-sm text-slate-700">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
                              style={{ backgroundColor: store.backgroundColor || '#f1f5f9' }}
                            >
                              {(store.storeName || store.storecode || 'S').slice(0, 1)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{store.storeName || '-'}</p>
                              <p className="truncate text-xs text-slate-500">
                                코드 {store.storecode || '-'} · 등록 {formatDateTime(store.createdAt)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-slate-900">{store.totalPaymentConfirmedCount.toLocaleString()}건</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-semibold text-slate-900">{formatKrw(store.totalKrwAmount)}원</span>
                            <span className="text-xs text-slate-500">{formatUsdt(store.totalUsdtAmount)} USDT</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-semibold text-slate-900">{formatKrw(store.totalSettlementAmountKRW)}원</span>
                            <span className="text-xs text-slate-500">{store.totalSettlementCount.toLocaleString()}건</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-slate-900">{store.settlementFeePercent.toFixed(2)}%</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                            <span className={`text-xs font-medium ${hasAllWallets ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {hasAllWallets ? '핵심 지갑 정상' : '지갑 정보 점검 필요'}
                            </span>
                          </div>
                        </td>
                        <td className="w-[170px] px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            {hasStoreCode ? (
                              <>
                                <Link
                                  href={`/${lang}/administration/store/${store.storecode}`}
                                  className="inline-flex shrink-0 items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                >
                                  상세
                                </Link>
                                <Link
                                  href={`/${lang}/administration/store/${store.storecode}/settings`}
                                  className="inline-flex shrink-0 items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                                >
                                  설정
                                </Link>
                              </>
                            ) : (
                              <span className="inline-flex shrink-0 items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
                                코드 없음
                              </span>
                            )}
                          </div>
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
              페이지 {pageNumber.toLocaleString()} / {totalPages.toLocaleString()} · 총 {totalCount.toLocaleString()}건
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
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="가맹점 추가 모달 닫기"
            onClick={closeCreateModal}
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label="가맹점 추가"
            className="modal-pop relative z-[121] max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-teal-100 bg-white shadow-[0_40px_90px_-42px_rgba(15,23,42,0.7)]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-teal-700">Merchant Onboarding</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">가맹점 추가</h2>
                <p className="mt-1 text-sm text-slate-500">로고/배너 업로드 후 즉시 가맹점 코드를 발급합니다.</p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creatingStore}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="닫기"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </header>

            <form className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2" onSubmit={submitCreateStore}>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  가맹점 이름 *
                </label>
                <input
                  type="text"
                  maxLength={24}
                  value={createForm.storeName}
                  disabled={creatingStore}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, storeName: event.target.value }))}
                  placeholder="예: 서울강남센터"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  설명
                </label>
                <textarea
                  rows={2}
                  value={createForm.storeDescription}
                  disabled={creatingStore}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, storeDescription: event.target.value }))}
                  placeholder="가맹점 소개"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  로고 *
                </label>
                <div className="space-y-2 rounded-xl border border-slate-300 bg-white p-2">
                  <div className="relative h-24 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {createForm.storeLogo ? (
                      <Image
                        src={createForm.storeLogo}
                        alt="Store logo"
                        fill
                        unoptimized
                        className="object-contain"
                        sizes="300px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-400">
                        로고 미리보기
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={creatingStore || uploadingLogo || uploadingBanner}
                    onChange={async (event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0];
                      if (!file) return;
                      await uploadImageToBlob(file, 'logo');
                      input.value = '';
                    }}
                    className="w-full text-xs text-slate-700 file:mr-2 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
                  />
                  <p className="text-[11px] text-slate-500">
                    {uploadingLogo ? '로고 업로드 중...' : '이미지 선택 시 Vercel Blob으로 업로드됩니다.'}
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  배너 *
                </label>
                <div className="space-y-2 rounded-xl border border-slate-300 bg-white p-2">
                  <div className="relative h-24 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {createForm.storeBanner ? (
                      <Image
                        src={createForm.storeBanner}
                        alt="Store banner"
                        fill
                        unoptimized
                        className="object-cover"
                        sizes="300px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-400">
                        배너 미리보기
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={creatingStore || uploadingLogo || uploadingBanner}
                    onChange={async (event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0];
                      if (!file) return;
                      await uploadImageToBlob(file, 'banner');
                      input.value = '';
                    }}
                    className="w-full text-xs text-slate-700 file:mr-2 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
                  />
                  <p className="text-[11px] text-slate-500">
                    {uploadingBanner ? '배너 업로드 중...' : '이미지 선택 시 Vercel Blob으로 업로드됩니다.'}
                  </p>
                </div>
              </div>

              {createModalError && (
                <p className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {createModalError}
                </p>
              )}

              <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creatingStore}
                  className="inline-flex h-11 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creatingStore || uploadingLogo || uploadingBanner}
                  className="inline-flex h-11 items-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingStore ? '생성 중...' : uploadingLogo || uploadingBanner ? '업로드 중...' : '가맹점 생성'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <style jsx>{`
        .store-management-shell {
          background:
            radial-gradient(circle at 12% 18%, rgba(20, 184, 166, 0.2), transparent 42%),
            radial-gradient(circle at 88% 14%, rgba(251, 191, 36, 0.18), transparent 36%),
            linear-gradient(180deg, #f0fdfa 0%, #f8fafc 48%, #eef2ff 100%);
          font-family: "Space Grotesk", "IBM Plex Sans KR", "Noto Sans KR", sans-serif;
        }

        .decor-orb {
          pointer-events: none;
          position: absolute;
          border-radius: 9999px;
          filter: blur(40px);
          opacity: 0.45;
          animation: float-drift 8s ease-in-out infinite;
        }

        .decor-orb-a {
          left: -90px;
          top: 120px;
          height: 260px;
          width: 260px;
          background: linear-gradient(145deg, rgba(20, 184, 166, 0.5), rgba(16, 185, 129, 0.25));
        }

        .decor-orb-b {
          right: -110px;
          top: 300px;
          height: 300px;
          width: 300px;
          background: linear-gradient(145deg, rgba(251, 191, 36, 0.45), rgba(245, 158, 11, 0.2));
          animation-delay: 0.9s;
        }

        .frosted-mark {
          background: linear-gradient(160deg, rgba(204, 251, 241, 0.9), rgba(153, 246, 228, 0.72));
          border: 1px solid rgba(20, 184, 166, 0.25);
        }

        .reveal-up {
          opacity: 0;
          transform: translateY(14px);
          animation: reveal-up 560ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        }

        .modal-pop {
          animation: modal-pop 180ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        @keyframes reveal-up {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes modal-pop {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes float-drift {
          0%,
          100% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(0, -14px, 0);
          }
        }
      `}</style>
    </main>
  );
}
