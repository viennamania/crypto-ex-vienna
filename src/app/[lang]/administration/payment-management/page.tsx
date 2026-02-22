'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';

type WalletPaymentItem = {
  id: string;
  paymentId: string;
  tradeId: string;
  status: string;
  orderProcessing: string;
  orderProcessingUpdatedAt: string;
  orderProcessingUpdatedBy: {
    walletAddress: string;
    nickname: string;
    role: string;
  } | null;
  orderProcessingUpdatedByIp: string;
  agentcode: string;
  storecode: string;
  storeName: string;
  storeLogo: string;
  buyerNickname: string;
  buyerAccountHolder: string;
  sellerWalletAddress: string;
  usdtAmount: number;
  krwAmount: number;
  rate: number;
  createdAt: string;
  paymentConfirmedAt: string;
};

type StoreFilterItem = {
  storecode: string;
  storeName: string;
  storeLogo: string;
};

const PAGE_SIZE = 20;
const PAYMENT_LIST_POLLING_MS = 10000;
const ALL_STORE_FILTER = '__ALL__';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown) => String(value || '').trim();
const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const shortAddress = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

const toDateTime = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR');
};

const formatKrw = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(toNumber(value))}원`;

const formatUsdt = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(toNumber(value))} USDT`;

const formatUsdtQuantity = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(toNumber(value))} USDT`;

const isOrderProcessingCompleted = (value: string | undefined) =>
  String(value || '').trim().toUpperCase() === 'COMPLETED';

const resolveOrderProcessingLabel = (value: string | undefined) =>
  isOrderProcessingCompleted(value) ? '결제처리완료' : '결제처리중';

const resolveTransactionExplorerUrl = (transactionValue: string) => {
  const normalized = toText(transactionValue);
  if (!normalized || normalized === '-') return '';

  if (/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    return `https://polygonscan.com/tx/${normalized}`;
  }

  return `https://polygonscan.com/search?query=${encodeURIComponent(normalized)}`;
};

const normalizeStoreFilterItem = (value: unknown): StoreFilterItem | null => {
  const source = isRecord(value) ? value : {};
  const storecode = toText(source.storecode);
  if (!storecode || storecode === 'admin' || storecode === 'agent') {
    return null;
  }

  return {
    storecode,
    storeName: toText(source.storeName) || storecode,
    storeLogo: toText(source.storeLogo),
  };
};

const normalizeWalletPayment = (value: unknown): WalletPaymentItem => {
  const source = isRecord(value) ? value : {};
  const store = isRecord(source.store) ? source.store : {};
  const member = isRecord(source.member) ? source.member : {};
  const buyer = isRecord(member.buyer) ? member.buyer : {};
  const bankInfo = isRecord(buyer.bankInfo) ? buyer.bankInfo : {};
  const rawUpdatedBy = isRecord(source.orderProcessingUpdatedBy)
    ? source.orderProcessingUpdatedBy
    : (isRecord(source.order_processing_updated_by) ? source.order_processing_updated_by : null);

  return {
    id: toText(source.id) || toText(source._id),
    paymentId: toText(source.paymentId),
    tradeId: toText(source.transactionHash) || toText(source.id) || toText(source._id),
    status: toText(source.status),
    orderProcessing: toText(source.orderProcessing) || toText(source.order_processing) || 'PROCESSING',
    orderProcessingUpdatedAt: toText(source.orderProcessingUpdatedAt) || toText(source.order_processing_updated_at),
    orderProcessingUpdatedBy: rawUpdatedBy
      ? {
          walletAddress: toText(rawUpdatedBy.walletAddress),
          nickname: toText(rawUpdatedBy.nickname),
          role: toText(rawUpdatedBy.role),
        }
      : null,
    orderProcessingUpdatedByIp: toText(source.orderProcessingUpdatedByIp || source.order_processing_updated_by_ip),
    agentcode: toText(source.agentcode),
    storecode: toText(source.storecode),
    storeName: toText(store.storeName) || toText(source.storeName) || toText(source.storecode),
    storeLogo: toText(store.storeLogo) || toText(source.storeLogo),
    buyerNickname: toText(source.memberNickname),
    buyerAccountHolder:
      toText(source.memberAccountHolder) ||
      toText(bankInfo.accountHolder) ||
      toText(bankInfo.depositName) ||
      toText(buyer.depositName),
    sellerWalletAddress: toText(source.toWalletAddress),
    usdtAmount: toNumber(source.usdtAmount),
    krwAmount: toNumber(source.krwAmount),
    rate: toNumber(source.exchangeRate),
    createdAt: toText(source.createdAt),
    paymentConfirmedAt: toText(source.confirmedAt),
  };
};

export default function AdministrationPaymentManagementPage() {
  const activeAccount = useActiveAccount();
  const processingWalletAddress = toText(activeAccount?.address);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [storeFilters, setStoreFilters] = useState<StoreFilterItem[]>([]);
  const [loadingStoreFilters, setLoadingStoreFilters] = useState(false);
  const [storeFilterError, setStoreFilterError] = useState<string | null>(null);
  const [selectedStorecode, setSelectedStorecode] = useState<string>(ALL_STORE_FILTER);
  const [payments, setPayments] = useState<WalletPaymentItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalKrwAmount, setTotalKrwAmount] = useState(0);
  const [totalUsdtAmount, setTotalUsdtAmount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<WalletPaymentItem | null>(null);
  const [updatingOrderProcessing, setUpdatingOrderProcessing] = useState(false);
  const [orderProcessingError, setOrderProcessingError] = useState<string | null>(null);
  const [orderProcessingActorNickname, setOrderProcessingActorNickname] = useState('');

  const loadStoreFilters = useCallback(async () => {
    setLoadingStoreFilters(true);
    setStoreFilterError(null);

    try {
      const response = await fetch('/api/store/getAllStores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 1000,
          page: 1,
          searchStore: '',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const source = isRecord(payload) ? payload : {};
        throw new Error(toText(source.error) || '가맹점 목록을 불러오지 못했습니다.');
      }

      const source = isRecord(payload) ? payload : {};
      const result = isRecord(source.result) ? source.result : {};
      const storesRaw = Array.isArray(result.stores) ? result.stores : [];

      const dedupedStoreMap = new Map<string, StoreFilterItem>();
      storesRaw.forEach((store) => {
        const normalizedStore = normalizeStoreFilterItem(store);
        if (!normalizedStore) return;
        if (dedupedStoreMap.has(normalizedStore.storecode)) return;
        dedupedStoreMap.set(normalizedStore.storecode, normalizedStore);
      });

      const nextStores = [...dedupedStoreMap.values()].sort((a, b) =>
        a.storeName.localeCompare(b.storeName, 'ko-KR'),
      );
      setStoreFilters(nextStores);
    } catch (loadStoreError) {
      setStoreFilterError(
        loadStoreError instanceof Error ? loadStoreError.message : '가맹점 목록을 불러오지 못했습니다.',
      );
      setStoreFilters([]);
    } finally {
      setLoadingStoreFilters(false);
    }
  }, []);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;

    if (!silent) {
      setLoading(true);
      setError(null);
    } else {
      setPolling(true);
    }

    try {
      const response = await fetch('/api/payment/getAllWalletUsdtPayments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: PAGE_SIZE,
          page: currentPage,
          searchTerm: keyword.trim(),
          storecode: selectedStorecode === ALL_STORE_FILTER ? '' : selectedStorecode,
          status: 'confirmed',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const source = isRecord(payload) ? payload : {};
        throw new Error(toText(source.error) || '결제 목록을 불러오지 못했습니다.');
      }

      const source = isRecord(payload) ? payload : {};
      const result = isRecord(source.result) ? source.result : {};
      const paymentsRaw = Array.isArray(result.payments) ? result.payments : [];

      setPayments(paymentsRaw.map((payment) => normalizeWalletPayment(payment)));
      setTotalCount(toNumber(result.totalCount));
      setTotalKrwAmount(toNumber(result.totalKrwAmount));
      setTotalUsdtAmount(toNumber(result.totalUsdtAmount));
      setLastUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      if (silent) {
        console.warn('administration payment list polling failed', loadError);
        return;
      }

      setPayments([]);
      setTotalCount(0);
      setTotalKrwAmount(0);
      setTotalUsdtAmount(0);
      setError(loadError instanceof Error ? loadError.message : '결제 목록을 불러오지 못했습니다.');
    } finally {
      if (!silent) {
        setLoading(false);
      } else {
        setPolling(false);
      }
    }
  }, [currentPage, keyword, selectedStorecode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadStoreFilters();
  }, [loadStoreFilters]);

  useEffect(() => {
    let isActive = true;
    let inFlight = false;

    const run = async () => {
      if (!isActive || inFlight) return;
      inFlight = true;
      await loadData({ silent: true });
      inFlight = false;
    };

    const intervalId = window.setInterval(run, PAYMENT_LIST_POLLING_MS);
    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [loadData]);

  useEffect(() => {
    if (!processingWalletAddress) {
      setOrderProcessingActorNickname('');
      return;
    }

    let mounted = true;

    const loadActorNickname = async () => {
      try {
        const response = await fetch('/api/user/getUserByWalletAddress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storecode: 'admin',
            walletAddress: processingWalletAddress,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        const source = isRecord(payload) ? payload : {};
        const result = isRecord(source.result) ? source.result : {};
        const admin = isRecord(result.admin) ? result.admin : {};
        const seller = isRecord(result.seller) ? result.seller : {};
        const buyer = isRecord(result.buyer) ? result.buyer : {};
        const nickname =
          toText(result.nickname)
          || toText(admin.nickname)
          || toText(seller.nickname)
          || toText(buyer.nickname);

        if (!mounted) return;
        setOrderProcessingActorNickname(nickname);
      } catch (error) {
        if (!mounted) return;
        setOrderProcessingActorNickname('');
      }
    };

    void loadActorNickname();

    return () => {
      mounted = false;
    };
  }, [processingWalletAddress]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (selectedStorecode === ALL_STORE_FILTER) return;
    const hasStore = storeFilters.some((store) => store.storecode === selectedStorecode);
    if (!hasStore) {
      setSelectedStorecode(ALL_STORE_FILTER);
    }
  }, [selectedStorecode, storeFilters]);

  const visiblePageNumbers = useMemo(() => {
    const windowSize = 5;
    const start = Math.max(1, currentPage - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    const adjustedStart = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [currentPage, totalPages]);

  const isPreviousDisabled = currentPage <= 1 || loading;
  const isNextDisabled = currentPage >= totalPages || loading;

  const openOrderProcessingModal = useCallback((payment: WalletPaymentItem) => {
    setSelectedPayment(payment);
    setOrderProcessingError(null);
  }, []);

  const closeOrderProcessingModal = useCallback(() => {
    if (updatingOrderProcessing) return;
    setSelectedPayment(null);
    setOrderProcessingError(null);
  }, [updatingOrderProcessing]);

  const handleOrderProcessingComplete = useCallback(async () => {
    if (!selectedPayment?.id) {
      setOrderProcessingError('결제 식별자를 찾을 수 없습니다.');
      return;
    }

    if (isOrderProcessingCompleted(selectedPayment.orderProcessing)) {
      setSelectedPayment(null);
      return;
    }

    setUpdatingOrderProcessing(true);
    setOrderProcessingError(null);
    try {
      const actorNickname = orderProcessingActorNickname || '관리자';
      const response = await fetch('/api/payment/setWalletUsdtPaymentOrderProcessing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: selectedPayment.id,
          orderProcessing: 'COMPLETED',
          orderProcessingUpdatedBy: {
            walletAddress: processingWalletAddress,
            nickname: actorNickname,
            role: 'admin',
          },
          orderProcessingUpdatedByUserAgent: typeof window !== 'undefined' ? window.navigator.userAgent : '',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const source = isRecord(payload) ? payload : {};
        throw new Error(toText(source.error) || '결제처리 상태 변경에 실패했습니다.');
      }

      const source = isRecord(payload) ? payload : {};
      const result = isRecord(source.result) ? source.result : {};
      const nextStatus = toText(result.orderProcessing || 'COMPLETED').toUpperCase();
      const nextUpdatedAt = toText(result.orderProcessingUpdatedAt || new Date().toISOString());
      const nextUpdatedBySource = isRecord(result.orderProcessingUpdatedBy)
        ? result.orderProcessingUpdatedBy
        : (isRecord(result.order_processing_updated_by) ? result.order_processing_updated_by : null);
      const nextUpdatedBy = nextUpdatedBySource
        ? {
            walletAddress: toText(nextUpdatedBySource.walletAddress),
            nickname: toText(nextUpdatedBySource.nickname),
            role: toText(nextUpdatedBySource.role),
          }
        : {
            walletAddress: processingWalletAddress,
            nickname: actorNickname,
            role: 'admin',
          };
      const nextUpdatedByIp = toText(result.orderProcessingUpdatedByIp || result.order_processing_updated_by_ip);

      setPayments((prev) =>
        prev.map((payment) =>
          payment.id === selectedPayment.id
            ? {
                ...payment,
                orderProcessing: nextStatus,
                orderProcessingUpdatedAt: nextUpdatedAt,
                orderProcessingUpdatedBy: nextUpdatedBy,
                orderProcessingUpdatedByIp: nextUpdatedByIp || payment.orderProcessingUpdatedByIp,
              }
            : payment,
        ),
      );

      setSelectedPayment(null);
    } catch (updateError) {
      setOrderProcessingError(updateError instanceof Error ? updateError.message : '결제처리 상태 변경에 실패했습니다.');
    } finally {
      setUpdatingOrderProcessing(false);
    }
  }, [orderProcessingActorNickname, processingWalletAddress, selectedPayment]);

  return (
    <main className="min-h-screen bg-transparent">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pb-20 pt-6 lg:px-6 lg:pt-8">
        <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_28px_60px_-42px_rgba(15,23,42,0.38)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Payment Dashboard</p>
              <h1 className="text-xl font-bold text-slate-900">가맹점 결제 관리</h1>
              <p className="text-sm text-slate-500">결제 확정 거래를 조회하고 결제처리 상태를 관리합니다.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className={`h-2.5 w-2.5 rounded-full ${polling ? 'animate-pulse bg-emerald-500' : 'bg-emerald-400'}`} />
                {polling ? '갱신 중' : '10초 자동 갱신'}
              </span>
              <button
                type="button"
                onClick={() => {
                  void loadData();
                }}
                disabled={loading}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? '조회 중...' : '새로고침'}
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold text-slate-500">결제 확정 건수</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{totalCount.toLocaleString()}건</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold text-slate-500">결제 확정 KRW</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{formatKrw(totalKrwAmount)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-semibold text-slate-500">결제 확정 USDT</p>
            <p className="mt-1 text-2xl font-bold text-cyan-700">{formatUsdt(totalUsdtAmount)}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.42)]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">결제 목록 ({totalCount.toLocaleString()}건)</p>
                <p className="text-xs text-slate-500">마지막 갱신 {toDateTime(lastUpdatedAt)}</p>
              </div>
              <input
                type="text"
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="결제번호(PID)/트랜잭션/회원/지갑 검색"
                className="h-9 w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedStorecode(ALL_STORE_FILTER);
                  setCurrentPage(1);
                }}
                className={`inline-flex h-8 items-center justify-center rounded-full border px-3 text-xs font-semibold transition ${
                  selectedStorecode === ALL_STORE_FILTER
                    ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
                }`}
              >
                전체
              </button>
              {storeFilters.map((store) => {
                const selected = selectedStorecode === store.storecode;
                return (
                  <button
                    key={store.storecode}
                    type="button"
                    onClick={() => {
                      setSelectedStorecode(store.storecode);
                      setCurrentPage(1);
                    }}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition ${
                      selected
                        ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
                    }`}
                    title={store.storeName}
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white text-[9px] font-bold text-slate-500">
                      {store.storeLogo ? (
                        <span
                          className="h-full w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${encodeURI(store.storeLogo)})` }}
                          aria-label={store.storeName}
                        />
                      ) : (
                        store.storeName.slice(0, 1)
                      )}
                    </span>
                    <span className="max-w-[110px] truncate">{store.storeName}</span>
                  </button>
                );
              })}
            </div>

            {(loadingStoreFilters || storeFilterError) && (
              <p className="text-xs text-slate-500">
                {loadingStoreFilters ? '가맹점 목록을 불러오는 중...' : storeFilterError}
              </p>
            )}
          </div>
        </section>

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            결제 목록을 불러오는 중입니다...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_26px_56px_-46px_rgba(15,23,42,0.45)]">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">결제번호(PID)</th>
                  <th className="px-4 py-3">트랜잭션</th>
                  <th className="px-4 py-3">가맹점</th>
                  <th className="px-4 py-3">회원/결제지갑/이름</th>
                  <th className="px-4 py-3 text-right">수량</th>
                  <th className="px-4 py-3 text-right">금액</th>
                  <th className="px-4 py-3">결제시각</th>
                  <th className="px-4 py-3 text-center">결제처리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                      표시할 결제가 없습니다.
                    </td>
                  </tr>
                ) : (
                  payments.map((payment) => {
                    const completed = isOrderProcessingCompleted(payment.orderProcessing);
                    const transactionUrl = resolveTransactionExplorerUrl(payment.tradeId);

                    return (
                      <tr key={payment.id || payment.tradeId} className="text-slate-700">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{payment.paymentId || '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          {payment.tradeId && transactionUrl ? (
                            <a
                              href={transactionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex font-semibold text-cyan-700 underline-offset-2 transition hover:text-cyan-800 hover:underline"
                              title="새 창에서 스캔 페이지 열기"
                            >
                              {shortAddress(payment.tradeId)}
                            </a>
                          ) : (
                            <p className="font-semibold text-slate-900">{payment.tradeId ? shortAddress(payment.tradeId) : '#-'}</p>
                          )}
                          <p className="text-xs text-slate-500">{payment.status || '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600">
                              {payment.storeLogo ? (
                                <span
                                  className="h-full w-full bg-cover bg-center"
                                  style={{ backgroundImage: `url(${encodeURI(payment.storeLogo)})` }}
                                  aria-label={payment.storeName || payment.storecode || 'store logo'}
                                />
                              ) : (
                                (payment.storeName || payment.storecode || 'S').slice(0, 1)
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-700">
                                {payment.storeName || payment.storecode || '-'}
                              </p>
                              <p className="truncate text-xs text-slate-500">코드 {payment.storecode || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <p className="break-all text-base font-extrabold leading-tight text-slate-900 sm:text-lg">
                            {payment.buyerNickname || '-'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">결제지갑 {shortAddress(payment.sellerWalletAddress || '')}</p>
                          <p className="mt-1 text-xs text-slate-500">이름 {payment.buyerAccountHolder || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-extrabold tabular-nums text-slate-900 sm:text-base">
                          {formatUsdtQuantity(payment.usdtAmount)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-extrabold tabular-nums text-slate-900 sm:text-base">
                          {formatKrw(payment.krwAmount)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {toDateTime(payment.paymentConfirmedAt || payment.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <p
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                              completed
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}
                          >
                            {resolveOrderProcessingLabel(payment.orderProcessing)}
                          </p>
                          {completed && (
                            <>
                              <p className="mt-1 text-[11px] text-slate-500">
                                완료시각 {toDateTime(payment.orderProcessingUpdatedAt || '')}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                처리자 {toText(payment.orderProcessingUpdatedBy?.nickname) || '-'}
                                {toText(payment.orderProcessingUpdatedBy?.walletAddress)
                                  ? ` (${shortAddress(toText(payment.orderProcessingUpdatedBy?.walletAddress))})`
                                  : ''}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                퍼블릭IP {toText(payment.orderProcessingUpdatedByIp) || '-'}
                              </p>
                            </>
                          )}
                          {!completed && (
                            <button
                              type="button"
                              onClick={() => openOrderProcessingModal(payment)}
                              className="mt-2 inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                            >
                              결제처리완료
                            </button>
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

        {!loading && !error && totalCount > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">
                페이지 {currentPage} / {totalPages} · 총 {totalCount.toLocaleString()}건
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
      </div>

      {selectedPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4 py-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeOrderProcessingModal();
            }
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">결제처리 확인</p>
              <p className="mt-1 text-xs text-slate-500">결제 내역을 확인하고 결제처리완료로 변경합니다.</p>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="grid grid-cols-[108px_1fr] gap-x-3 gap-y-2 text-sm">
                <p className="text-xs font-semibold text-slate-500">결제번호(PID)</p>
                <p className="break-all font-semibold text-slate-900">{selectedPayment.paymentId || '-'}</p>
                <p className="text-xs font-semibold text-slate-500">트랜잭션</p>
                <p className="break-all font-semibold text-slate-900">{selectedPayment.tradeId || '-'}</p>
                <p className="text-xs font-semibold text-slate-500">가맹점</p>
                <p className="text-slate-700">{selectedPayment.storeName || selectedPayment.storecode || '-'}</p>
                <p className="text-xs font-semibold text-slate-500">결제 회원 아이디</p>
                <p className="break-all text-slate-700">{selectedPayment.buyerNickname || '-'}</p>
                <p className="text-xs font-semibold text-slate-500">결제지갑</p>
                <p className="break-all text-slate-700">{selectedPayment.sellerWalletAddress || '-'}</p>
                <p className="text-xs font-semibold text-slate-500">수량 / 금액</p>
                <p className="text-slate-700">{formatUsdtQuantity(selectedPayment.usdtAmount)} / {formatKrw(selectedPayment.krwAmount)}</p>
                <p className="text-xs font-semibold text-slate-500">결제시각</p>
                <p className="text-slate-700">{toDateTime(selectedPayment.paymentConfirmedAt || selectedPayment.createdAt)}</p>
                <p className="text-xs font-semibold text-slate-500">결제처리 상태</p>
                <p className="font-semibold text-slate-800">{resolveOrderProcessingLabel(selectedPayment.orderProcessing)}</p>
                <p className="text-xs font-semibold text-slate-500">결제처리 완료시각</p>
                <p className="text-slate-700">{toDateTime(selectedPayment.orderProcessingUpdatedAt || '')}</p>
              </div>

              {orderProcessingError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {orderProcessingError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={closeOrderProcessingModal}
                disabled={updatingOrderProcessing}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={handleOrderProcessingComplete}
                disabled={updatingOrderProcessing || isOrderProcessingCompleted(selectedPayment.orderProcessing)}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-cyan-600 bg-cyan-600 px-3 text-xs font-semibold text-white transition hover:border-cyan-700 hover:bg-cyan-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {isOrderProcessingCompleted(selectedPayment.orderProcessing)
                  ? '처리완료됨'
                  : updatingOrderProcessing
                  ? '처리 중...'
                  : '결제처리완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
