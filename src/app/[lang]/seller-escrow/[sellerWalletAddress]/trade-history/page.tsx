'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AutoConnect, useActiveAccount, useActiveWallet, useConnectedWallets } from 'thirdweb/react';
import { ConnectButton } from '@/components/WalletConnectButton';
import { client } from '@/app/client';
import { useClientWallets } from '@/lib/useClientWallets';
import { createWalletSignatureAuthPayload, isWalletAddress } from '@/lib/security/walletSignature';

const WALLET_AUTH_OPTIONS = ['google', 'email', 'phone'];
const OWNER_ONLY_API_PATH = '/api/order/getAllBuyOrdersBySellerEscrowWallet';
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

type PageProps = {
  params: {
    lang: string;
    sellerWalletAddress: string;
  };
};

type BuyerConsentSnapshot = {
  accepted: boolean;
  acceptedAt: string;
  requestedAt: string;
  channelUrl: string;
};

type SellerTradeHistoryOrder = {
  id: string;
  tradeId: string;
  status: string;
  createdAt: string;
  paymentRequestedAt: string;
  paymentConfirmedAt: string;
  buyerNickname: string;
  buyerDepositName: string;
  buyerWalletAddress: string;
  usdtAmount: number;
  krwAmount: number;
  rate: number;
  paymentMethod: string;
  buyerConsent: BuyerConsentSnapshot;
};

type SearchFilters = {
  startDate: string;
  endDate: string;
  searchTradeId: string;
  searchBuyer: string;
  searchDepositName: string;
  searchBuyerWalletAddress: string;
  status: string;
};

type AccessState = 'idle' | 'granted' | 'denied';

type WalletAuthPayload = {
  walletAddress: string;
  timestamp: number;
  nonce: string;
  signature: string;
  chainId?: number;
};

type WalletAuthCache = {
  walletAddress: string;
  expiresAt: number;
  payload: WalletAuthPayload;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isRecord(value) && typeof value.$oid === 'string') return value.$oid;
  return '';
};

const toNumber = (value: unknown): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const getTodayDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateKeyByOffset = (offset: number) => {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createDefaultFilters = (): SearchFilters => ({
  startDate: getDateKeyByOffset(-30),
  endDate: getTodayDateKey(),
  searchTradeId: '',
  searchBuyer: '',
  searchDepositName: '',
  searchBuyerWalletAddress: '',
  status: '',
});

const normalizeOrder = (sourceValue: unknown): SellerTradeHistoryOrder => {
  const source = isRecord(sourceValue) ? sourceValue : {};
  const buyer = isRecord(source.buyer) ? source.buyer : {};
  const buyerBankInfo = isRecord(buyer.bankInfo) ? buyer.bankInfo : {};
  const buyerConsent = isRecord(source.buyerConsent) ? source.buyerConsent : {};

  const buyerConsentStatus = toText(buyerConsent.status).toLowerCase();
  const buyerConsentSnapshot: BuyerConsentSnapshot = {
    accepted: buyerConsent.accepted === true || buyerConsentStatus === 'accepted',
    acceptedAt: toText(buyerConsent.acceptedAt),
    requestedAt: toText(buyerConsent.requestedAt) || toText(buyerConsent.requestMessageSentAt),
    channelUrl: toText(buyerConsent.channelUrl),
  };

  return {
    id: toText(source._id) || toText(source.id),
    tradeId: toText(source.tradeId),
    status: toText(source.status),
    createdAt: toText(source.createdAt),
    paymentRequestedAt: toText(source.paymentRequestedAt),
    paymentConfirmedAt: toText(source.paymentConfirmedAt),
    buyerNickname: toText(source.nickname) || toText(buyer.nickname),
    buyerDepositName:
      toText(buyer.depositName)
      || toText(buyerBankInfo.depositName)
      || toText(buyerBankInfo.accountHolder),
    buyerWalletAddress: toText(buyer.walletAddress) || toText(source.walletAddress),
    usdtAmount: toNumber(source.usdtAmount),
    krwAmount: toNumber(source.krwAmount),
    rate: toNumber(source.rate),
    paymentMethod: toText(source.paymentMethod),
    buyerConsent: buyerConsentSnapshot,
  };
};

const toDateTimeLabel = (value: string) => {
  const normalized = toText(value);
  if (!normalized) return '-';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
};

const toDateForInput = (value: string) => {
  const normalized = toText(value);
  if (!normalized) return '';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatUsdt = (value: number) =>
  toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });

const formatKrw = (value: number) => Math.round(toNumber(value)).toLocaleString('ko-KR');

const shortWallet = (value: string) => {
  const normalized = toText(value);
  if (!normalized) return '-';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 8)}...${normalized.slice(-6)}`;
};

const normalizeStatus = (status: string) => toText(status).toLowerCase();

const getStatusLabel = (status: string) => {
  const normalized = normalizeStatus(status);
  if (normalized === 'ordered') return '주문접수';
  if (normalized === 'accepted') return '접수완료';
  if (normalized === 'paymentrequested') return '입금요청';
  if (normalized === 'paymentconfirmed') return '입금확인';
  if (normalized === 'cancelled') return '취소';
  return status || '-';
};

const getStatusClassName = (status: string) => {
  const normalized = normalizeStatus(status);
  if (normalized === 'paymentconfirmed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized === 'paymentrequested') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  if (normalized === 'accepted' || normalized === 'ordered') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (normalized === 'cancelled') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
};

const getPaymentMethodLabel = (paymentMethod: string) => {
  const normalized = toText(paymentMethod).toLowerCase();
  if (!normalized) return '-';
  if (normalized === 'bank') return '계좌이체';
  if (normalized === 'contact') return '연락처 송금';
  if (normalized === 'remittance') return '송금';
  return paymentMethod;
};

export default function SellerEscrowTradeHistoryPage({ params }: PageProps) {
  const { wallet, wallets } = useClientWallets({ authOptions: WALLET_AUTH_OPTIONS });
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const connectedWallets = useConnectedWallets();

  const sellerWalletAddress = toText(params.sellerWalletAddress);
  const lang = toText(params.lang) || 'ko';

  const [draftFilters, setDraftFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);

  const [orders, setOrders] = useState<SellerTradeHistoryOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [accessState, setAccessState] = useState<AccessState>('idle');
  const [accessError, setAccessError] = useState<string | null>(null);

  const [ownerWalletAddress, setOwnerWalletAddress] = useState('');
  const [ownerWalletAddressCandidates, setOwnerWalletAddressCandidates] = useState<string[]>([]);

  const requestInFlightRef = useRef(false);
  const authCacheRef = useRef<WalletAuthCache | null>(null);

  const activeWalletAddress = toText(activeAccount?.address);
  const connectedWalletAddressCandidates = useMemo(() => {
    const byLowerAddress = new Map<string, string>();
    const appendCandidate = (value: unknown) => {
      const normalized = toText(value);
      if (!isWalletAddress(normalized)) return;
      const key = normalized.toLowerCase();
      if (!byLowerAddress.has(key)) {
        byLowerAddress.set(key, normalized);
      }
    };

    appendCandidate(activeWalletAddress);
    appendCandidate(activeWallet?.getAccount?.()?.address);
    appendCandidate(activeWallet?.getAdminAccount?.()?.address);

    for (const walletItem of connectedWallets) {
      appendCandidate(walletItem?.getAccount?.()?.address);
      appendCandidate(walletItem?.getAdminAccount?.()?.address);
    }

    return Array.from(byLowerAddress.values());
  }, [activeWallet, activeWalletAddress, connectedWallets]);

  const connectedWalletAddress = connectedWalletAddressCandidates[0] || '';
  const ownerCandidateSet = useMemo(() => {
    const candidates = ownerWalletAddressCandidates.length > 0
      ? ownerWalletAddressCandidates
      : ownerWalletAddress
      ? [ownerWalletAddress.toLowerCase()]
      : [];
    return new Set(candidates.map((value) => value.toLowerCase()));
  }, [ownerWalletAddress, ownerWalletAddressCandidates]);

  const matchedOwnerWallet = useMemo(
    () => connectedWalletAddressCandidates.find((value) => ownerCandidateSet.has(value.toLowerCase())) || '',
    [connectedWalletAddressCandidates, ownerCandidateSet],
  );

  const isOwnerWalletConnected = Boolean(matchedOwnerWallet);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize))),
    [pageSize, totalCount],
  );

  const visiblePageNumbers = useMemo(() => {
    const pageNumbers: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      pageNumbers.push(pageNumber);
    }

    return pageNumbers;
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    authCacheRef.current = null;
  }, [activeWalletAddress]);

  const getOwnerAuthPayload = useCallback(async () => {
    const account = activeAccount as unknown as {
      address?: string;
      signMessage?: (options: {
        message: string;
        originalMessage?: string;
        chainId?: number;
      }) => Promise<string>;
    };

    const walletAddress = toText(account?.address);
    if (!isWalletAddress(walletAddress) || typeof account?.signMessage !== 'function') {
      throw new Error('판매자 지갑을 연결하고 서명을 완료해 주세요.');
    }

    const now = Date.now();
    const cached = authCacheRef.current;
    if (
      cached
      && cached.walletAddress.toLowerCase() === walletAddress.toLowerCase()
      && cached.expiresAt > now + 5_000
    ) {
      return cached.payload;
    }

    const payload = await createWalletSignatureAuthPayload({
      account,
      storecode: 'admin',
      path: OWNER_ONLY_API_PATH,
      method: 'POST',
    });

    authCacheRef.current = {
      walletAddress,
      payload,
      expiresAt: Number(payload.timestamp || now) + 110_000,
    };

    return payload;
  }, [activeAccount]);

  const loadOrders = useCallback(async () => {
    if (!isWalletAddress(sellerWalletAddress)) {
      setAccessState('denied');
      setAccessError('유효한 판매자 지갑 주소가 아닙니다.');
      setOrders([]);
      setTotalCount(0);
      return;
    }

    if (!connectedWalletAddress) {
      setAccessState('idle');
      setAccessError(null);
      setOrders([]);
      setTotalCount(0);
      return;
    }

    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const auth = await getOwnerAuthPayload();

      const statusFilter = toText(appliedFilters.status);
      const response = await fetch(OWNER_ONLY_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          ownerOnly: true,
          auth,
          walletAddress: sellerWalletAddress,
          requesterWalletAddress: connectedWalletAddress,
          page: currentPage,
          limit: pageSize,
          status: statusFilter || undefined,
          searchTradeId: toText(appliedFilters.searchTradeId) || undefined,
          searchBuyer: toText(appliedFilters.searchBuyer) || undefined,
          searchDepositName: toText(appliedFilters.searchDepositName) || undefined,
          searchBuyerWalletAddress: toText(appliedFilters.searchBuyerWalletAddress) || undefined,
          startDate: appliedFilters.startDate || undefined,
          endDate: appliedFilters.endDate || undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const errorMessage =
        toText(payload.error)
        || toText(payload.message)
        || '판매자 거래내역을 불러오지 못했습니다.';

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setAccessState('denied');
          setAccessError(errorMessage);
          setOrders([]);
          setTotalCount(0);
          return;
        }
        throw new Error(errorMessage);
      }

      const result = isRecord(payload.result) ? payload.result : {};
      const items = Array.isArray(result.orders) ? result.orders : [];

      const resolvedOwnerWalletAddress = toText(result.ownerWalletAddress);
      const ownerCandidates = Array.isArray(result.ownerWalletAddressCandidates)
        ? result.ownerWalletAddressCandidates
            .map((item) => toText(item).toLowerCase())
            .filter((item) => isWalletAddress(item))
        : [];

      setOwnerWalletAddress(resolvedOwnerWalletAddress || sellerWalletAddress);
      setOwnerWalletAddressCandidates(ownerCandidates);
      setOrders(items.map((item) => normalizeOrder(item)));
      setTotalCount(Math.max(0, Math.floor(toNumber(result.totalCount))));
      setLastUpdatedAt(new Date().toISOString());
      setAccessState('granted');
      setAccessError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '판매자 거래내역을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      requestInFlightRef.current = false;
    }
  }, [
    appliedFilters.endDate,
    appliedFilters.searchBuyer,
    appliedFilters.searchBuyerWalletAddress,
    appliedFilters.searchDepositName,
    appliedFilters.searchTradeId,
    appliedFilters.startDate,
    appliedFilters.status,
    connectedWalletAddress,
    currentPage,
    getOwnerAuthPayload,
    pageSize,
    sellerWalletAddress,
  ]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const handleApplyFilters = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters({
      startDate: toDateForInput(draftFilters.startDate) || draftFilters.startDate,
      endDate: toDateForInput(draftFilters.endDate) || draftFilters.endDate,
      searchTradeId: toText(draftFilters.searchTradeId),
      searchBuyer: toText(draftFilters.searchBuyer),
      searchDepositName: toText(draftFilters.searchDepositName),
      searchBuyerWalletAddress: toText(draftFilters.searchBuyerWalletAddress),
      status: toText(draftFilters.status),
    });
    setCurrentPage(1);
  }, [draftFilters]);

  const handleResetFilters = useCallback(() => {
    const defaultFilters = createDefaultFilters();
    setDraftFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setCurrentPage(1);
  }, []);

  return (
    <>
      <AutoConnect
        client={client}
        wallets={wallet ? [wallet] : []}
      />
      <div className="min-h-dvh bg-slate-100">
        <div className="mx-auto w-full max-w-[1700px] px-3 py-4 sm:px-5 lg:px-7">
          <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 p-4 text-white shadow-[0_20px_50px_-35px_rgba(8,145,178,0.8)] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Seller Escrow</p>
                <h1 className="text-lg font-black sm:text-2xl">판매자 거래내역 전용 페이지</h1>
                <p className="text-xs text-cyan-100 sm:text-sm">
                  판매자 권한(지갑 서명) 확인 후 주문별 거래내역을 조회합니다.
                </p>
                <p className="text-xs text-cyan-100">
                  페이지 지갑 {shortWallet(sellerWalletAddress)}
                </p>
                <p className="text-xs text-cyan-100">
                  연결 지갑 {connectedWalletAddress ? shortWallet(connectedWalletAddress) : '미연결'}
                </p>
                {ownerWalletAddress && (
                  <p className="text-xs text-cyan-100">
                    판매자 소유 지갑 {shortWallet(ownerWalletAddress)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/${lang}/seller-escrow/${sellerWalletAddress}`}
                  className="inline-flex items-center justify-center rounded-lg border border-cyan-300/70 bg-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-50 transition hover:bg-white/20"
                >
                  기존 페이지로 이동
                </Link>
                <Link
                  href={`/${lang}/seller-escrow/${sellerWalletAddress}/today-orders-chat`}
                  className="inline-flex items-center justify-center rounded-lg border border-emerald-300/70 bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/30"
                >
                  오늘 주문 채팅 화면
                </Link>
                <button
                  type="button"
                  onClick={() => void loadOrders()}
                  disabled={loading}
                  className="inline-flex items-center justify-center rounded-lg border border-amber-300/80 bg-amber-400/20 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? '조회중...' : '새로고침'}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] text-cyan-100">총 거래건수</p>
                <p className="text-lg font-extrabold text-white">{totalCount.toLocaleString()}건</p>
              </div>
              <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] text-cyan-100">현재 페이지</p>
                <p className="text-lg font-extrabold text-white">{currentPage} / {totalPages}</p>
              </div>
              <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] text-cyan-100">페이지 크기</p>
                <p className="text-lg font-extrabold text-white">{pageSize.toLocaleString()}건</p>
              </div>
              <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] text-cyan-100">마지막 갱신</p>
                <p className="text-sm font-bold text-white">{toDateTimeLabel(lastUpdatedAt)}</p>
              </div>
            </div>
          </section>

          {!connectedWalletAddress && (
            <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-800">
              <p className="text-sm font-semibold">판매자 지갑을 연결하면 거래내역 페이지에 접근할 수 있습니다.</p>
              <div className="mt-3">
                <ConnectButton
                  client={client}
                  wallets={wallets.length > 0 ? wallets : wallet ? [wallet] : []}
                  theme="light"
                  connectButton={{
                    label: '판매자 지갑 연결',
                    className:
                      'inline-flex h-10 items-center justify-center rounded-lg border border-slate-700 !bg-slate-900 px-4 text-sm font-semibold !text-white transition hover:border-slate-600 hover:!bg-slate-800 hover:!text-white',
                  }}
                  connectModal={{
                    size: 'wide',
                    showThirdwebBranding: false,
                  }}
                  locale="ko_KR"
                />
              </div>
            </section>
          )}

          {accessState === 'denied' && accessError && (
            <section className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-rose-700">
              <p className="text-sm font-semibold">{accessError}</p>
              <p className="mt-1 text-xs text-rose-600">
                현재 연결된 지갑이 판매자 소유 지갑으로 확인되어야 조회할 수 있습니다.
              </p>
            </section>
          )}

          {error && (
            <section className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </section>
          )}

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Filters</p>
                <h2 className="text-base font-extrabold text-slate-900">검색 조건</h2>
              </div>
            </div>

            <form className="mt-3 space-y-3" onSubmit={handleApplyFilters}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">시작일</span>
                  <input
                    type="date"
                    value={draftFilters.startDate}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">종료일</span>
                  <input
                    type="date"
                    value={draftFilters.endDate}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">상태</span>
                  <select
                    value={draftFilters.status}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, status: event.target.value }))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                  >
                    <option value="">전체</option>
                    <option value="ordered">주문접수</option>
                    <option value="accepted">접수완료</option>
                    <option value="paymentRequested">입금요청</option>
                    <option value="paymentConfirmed">입금확인</option>
                    <option value="cancelled">취소</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">거래번호(TID)</span>
                  <input
                    type="text"
                    value={draftFilters.searchTradeId}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchTradeId: event.target.value }))}
                    placeholder="예: 123456"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">구매자 닉네임</span>
                  <input
                    type="text"
                    value={draftFilters.searchBuyer}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchBuyer: event.target.value }))}
                    placeholder="예: buyer01"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">입금자명</span>
                  <input
                    type="text"
                    value={draftFilters.searchDepositName}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchDepositName: event.target.value }))}
                    placeholder="예: 홍길동"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">구매자 지갑주소</span>
                  <input
                    type="text"
                    value={draftFilters.searchBuyerWalletAddress}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchBuyerWalletAddress: event.target.value }))}
                    placeholder="예: 0x..."
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100"
                >
                  검색
                </button>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  초기화
                </button>
              </div>
            </form>
          </section>

          <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-900">판매자 거래내역</h3>
              <p className="text-xs text-slate-500">총 {totalCount.toLocaleString()}건</p>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="min-w-[1120px] w-full table-auto border-collapse text-sm text-slate-700">
                <thead className="bg-slate-100/95 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">상태</th>
                    <th className="px-4 py-3 text-left font-semibold">거래번호</th>
                    <th className="px-4 py-3 text-left font-semibold">거래시간</th>
                    <th className="px-4 py-3 text-left font-semibold">구매자</th>
                    <th className="px-4 py-3 text-right font-semibold">USDT</th>
                    <th className="px-4 py-3 text-right font-semibold">KRW</th>
                    <th className="px-4 py-3 text-right font-semibold">환율</th>
                    <th className="px-4 py-3 text-left font-semibold">결제수단</th>
                    <th className="px-4 py-3 text-left font-semibold">이용동의</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {loading && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                        거래내역을 불러오는 중입니다...
                      </td>
                    </tr>
                  )}

                  {!loading && orders.length <= 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                        조건에 맞는 거래내역이 없습니다.
                      </td>
                    </tr>
                  )}

                  {!loading && orders.map((order) => (
                    <tr key={`${order.id || order.tradeId || order.createdAt}`} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClassName(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">#{order.tradeId || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{toDateTimeLabel(order.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">{order.buyerNickname || '-'}</span>
                          <span className="text-[11px] text-slate-600">입금자명: {order.buyerDepositName || '-'}</span>
                          <span className="text-[11px] text-slate-600" title={order.buyerWalletAddress || undefined}>
                            지갑: {shortWallet(order.buyerWalletAddress)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatUsdt(order.usdtAmount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatKrw(order.krwAmount)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatKrw(order.rate)} 원</td>
                      <td className="px-4 py-3 text-slate-700">{getPaymentMethodLabel(order.paymentMethod)}</td>
                      <td className="px-4 py-3">
                        {order.buyerConsent.accepted ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex w-fit rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              동의완료
                            </span>
                            <span className="text-[11px] text-slate-500">{toDateTimeLabel(order.buyerConsent.acceptedAt)}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex w-fit rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              동의대기
                            </span>
                            <span className="text-[11px] text-slate-500">{toDateTimeLabel(order.buyerConsent.requestedAt)}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>페이지 크기</span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    const nextPageSize = Number(event.target.value);
                    setPageSize(nextPageSize);
                    setCurrentPage(1);
                  }}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  처음
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  이전
                </button>

                {visiblePageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setCurrentPage(pageNumber)}
                    className={`inline-flex min-w-[34px] items-center justify-center rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                      pageNumber === currentPage
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  다음
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  마지막
                </button>
              </div>
            </div>

            {accessState === 'granted' && !isOwnerWalletConnected && ownerWalletAddress && (
              <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
                판매자 본인 지갑({shortWallet(ownerWalletAddress)})과 연결된 계정으로 접근하면 더 안정적으로 사용할 수 있습니다.
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
