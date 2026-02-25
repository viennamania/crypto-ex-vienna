'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { useActiveAccount } from 'thirdweb/react';

type AttemptItem = {
  id: string;
  orderId: string;
  agentcode: string;
  tradeId: string;
  status: string;
  previousStatus: string;
  chain: string;
  fromAddress: string;
  toAddress: string;
  usdtAmount: number;
  feePercent: number;
  feeAmountUsdt: number;
  transactionId: string;
  transactionHash: string;
  onchainStatus: string;
  error: string;
  requestedByWalletAddress: string;
  requestIdempotencyKey: string;
  batchKey: string;
  mode: 'single' | 'batch' | string;
  source: string;
  requestedAt: string;
  updatedAt: string;
};

type AttemptPagination = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
};

type AttemptSummary = {
  totalFeeAmountUsdt: number;
  confirmedCount: number;
  failedCount: number;
  pendingCount: number;
};

type SearchFilters = {
  periodDays: 1 | 7 | 30;
  status: 'ALL' | 'REQUESTING' | 'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'BLOCKED_LOW_BALANCE';
  batchKey: string;
};

type AgentCollectionItem = {
  key: string;
  agentcode: string;
  agentName: string;
  agentLogo: string;
};

const DEFAULT_LIMIT = 30;
const PERIOD_OPTIONS: Array<{ value: 1 | 7 | 30; label: string }> = [
  { value: 1, label: '오늘' },
  { value: 7, label: '7일' },
  { value: 30, label: '30일' },
];
const STATUS_OPTIONS: Array<{ value: SearchFilters['status']; label: string }> = [
  { value: 'ALL', label: '전체' },
  { value: 'REQUESTING', label: '요청중' },
  { value: 'QUEUED', label: '큐대기' },
  { value: 'SUBMITTED', label: '전송중' },
  { value: 'CONFIRMED', label: '수납완료' },
  { value: 'FAILED', label: '실패' },
  { value: 'BLOCKED_LOW_BALANCE', label: '잔고부족' },
];

const createDefaultFilters = (): SearchFilters => ({
  periodDays: 7,
  status: 'ALL',
  batchKey: '',
});

const getAgentCellKey = (item: { agentcode?: string; agentName?: string }) => {
  const agentcode = String(item.agentcode || '').trim();
  if (agentcode) return `code:${agentcode.toLowerCase()}`;
  const agentName = String(item.agentName || '').trim();
  if (agentName) return `name:${agentName.toLowerCase()}`;
  return 'unknown';
};

const getAgentDisplayName = (item: Pick<AgentCollectionItem, 'agentName' | 'agentcode'>) => {
  const name = String(item.agentName || '').trim();
  if (name) return name;
  const code = String(item.agentcode || '').trim();
  if (code) return code;
  return '미지정 에이전트';
};

const getAgentAvatarFallback = (name: string) => {
  const normalizedName = String(name || '').replace(/\s+/g, '').trim();
  if (!normalizedName) return 'AG';
  return normalizedName.slice(0, 2).toUpperCase();
};

const normalizeAgentCollectionItem = (value: unknown): AgentCollectionItem | null => {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  if (!source) return null;
  const agentcode = String(source.agentcode || '').trim();
  const agentName = String(source.agentName || '').trim();
  if (!agentcode && !agentName) return null;
  return {
    key: getAgentCellKey({ agentcode, agentName }),
    agentcode,
    agentName,
    agentLogo: String(source.agentLogo || '').trim(),
  };
};

const shortWallet = (value?: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

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
    second: '2-digit',
  });
};

const roundDownUsdtAmount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor((value + Number.EPSILON) * 1_000_000) / 1_000_000;
};

const formatUsdt = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(roundDownUsdtAmount(Number(value || 0)));

const formatPercent = (value: number) => {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return '0%';
  return `${(Math.round(normalized * 100) / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
};

const getStatusLabel = (status: string) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'REQUESTING') return '요청중';
  if (normalized === 'QUEUED') return '큐대기';
  if (normalized === 'SUBMITTED') return '전송중';
  if (normalized === 'CONFIRMED') return '수납완료';
  if (normalized === 'FAILED') return '실패';
  if (normalized === 'BLOCKED_LOW_BALANCE') return '잔고부족';
  return normalized || '-';
};

const getStatusBadgeClassName = (status: string) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'CONFIRMED') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (normalized === 'SUBMITTED' || normalized === 'QUEUED' || normalized === 'REQUESTING') return 'border-cyan-300 bg-cyan-50 text-cyan-700';
  if (normalized === 'BLOCKED_LOW_BALANCE') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (normalized === 'FAILED') return 'border-rose-300 bg-rose-50 text-rose-700';
  return 'border-slate-300 bg-slate-50 text-slate-700';
};

export default function PlatformFeeCollectionHistoryPage() {
  const activeAccount = useActiveAccount();
  const requesterWalletAddress = String(activeAccount?.address || '').trim();

  const [items, setItems] = useState<AttemptItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<AttemptPagination>({
    page: 1,
    limit: DEFAULT_LIMIT,
    totalCount: 0,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<AttemptSummary>({
    totalFeeAmountUsdt: 0,
    confirmedCount: 0,
    failedCount: 0,
    pendingCount: 0,
  });
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [agentCatalog, setAgentCatalog] = useState<AgentCollectionItem[]>([]);
  const [loadingAgentCatalog, setLoadingAgentCatalog] = useState(false);
  const [agentCatalogError, setAgentCatalogError] = useState<string | null>(null);
  const [selectedAgentKey, setSelectedAgentKey] = useState('');
  const [copiedValue, setCopiedValue] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');

  const selectedAgentInfo = useMemo(
    () => agentCatalog.find((agent) => agent.key === selectedAgentKey) || null,
    [agentCatalog, selectedAgentKey],
  );
  const selectedAgentcodeFilter = String(selectedAgentInfo?.agentcode || '').trim();

  const loadAgentCatalog = useCallback(async () => {
    setLoadingAgentCatalog(true);
    setAgentCatalogError(null);
    try {
      const limit = 100;
      let skip = 0;
      let total = 0;
      const allAgents: AgentCollectionItem[] = [];

      while (skip < total || skip === 0) {
        const params = new URLSearchParams({
          limit: String(limit),
          skip: String(skip),
        });
        const response = await fetch(`/api/agents?${params.toString()}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof (payload as Record<string, unknown>)?.error === 'string'
              ? String((payload as Record<string, unknown>).error)
              : '에이전트 목록 조회에 실패했습니다.',
          );
        }

        const rawItems = Array.isArray((payload as Record<string, unknown>)?.items)
          ? ((payload as Record<string, unknown>).items as unknown[])
          : [];
        const normalizedItems = rawItems
          .map((item) => normalizeAgentCollectionItem(item))
          .filter((item: AgentCollectionItem | null): item is AgentCollectionItem => item !== null);
        allAgents.push(...normalizedItems);

        total = Math.max(0, Number((payload as Record<string, unknown>)?.total || 0) || 0);
        if (rawItems.length < limit) break;
        skip += limit;
      }

      const uniqueAgents = new Map<string, AgentCollectionItem>();
      allAgents.forEach((agent) => {
        if (uniqueAgents.has(agent.key)) return;
        uniqueAgents.set(agent.key, agent);
      });
      setAgentCatalog(Array.from(uniqueAgents.values()));
    } catch (agentError) {
      setAgentCatalog([]);
      setAgentCatalogError(agentError instanceof Error ? agentError.message : '에이전트 목록 조회에 실패했습니다.');
    } finally {
      setLoadingAgentCatalog(false);
    }
  }, []);

  useEffect(() => {
    void loadAgentCatalog();
  }, [loadAgentCatalog]);

  useEffect(() => {
    if (agentCatalog.length === 0) {
      setSelectedAgentKey('');
      return;
    }
    setSelectedAgentKey((prev) => (agentCatalog.some((agent) => agent.key === prev) ? prev : agentCatalog[0].key));
  }, [agentCatalog]);

  const loadList = useCallback(async () => {
    if (!requesterWalletAddress) {
      setItems([]);
      setError('관리자 지갑을 연결해 주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/order/getAgentPlatformFeeCollectionAttempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterWalletAddress,
          page: pagination.page,
          limit: pagination.limit,
          periodDays: appliedFilters.periodDays,
          status: appliedFilters.status,
          batchKey: appliedFilters.batchKey.trim(),
          agentcode: selectedAgentcodeFilter,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '수납 이력을 불러오지 못했습니다.'));
      }

      const result = (
        typeof (payload as Record<string, unknown>)?.result === 'object'
          && (payload as Record<string, unknown>)?.result !== null
      ) ? ((payload as Record<string, unknown>).result as Record<string, unknown>) : {};

      const nextItemsRaw = Array.isArray(result.items) ? result.items : [];
      const nextItems = nextItemsRaw.map((item) => {
        const source = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
        return {
          id: String(source.id || ''),
          orderId: String(source.orderId || ''),
          agentcode: String(source.agentcode || ''),
          tradeId: String(source.tradeId || ''),
          status: String(source.status || ''),
          previousStatus: String(source.previousStatus || ''),
          chain: String(source.chain || ''),
          fromAddress: String(source.fromAddress || ''),
          toAddress: String(source.toAddress || ''),
          usdtAmount: Number(source.usdtAmount || 0),
          feePercent: Number(source.feePercent || 0),
          feeAmountUsdt: roundDownUsdtAmount(Number(source.feeAmountUsdt || 0)),
          transactionId: String(source.transactionId || ''),
          transactionHash: String(source.transactionHash || ''),
          onchainStatus: String(source.onchainStatus || ''),
          error: String(source.error || ''),
          requestedByWalletAddress: String(source.requestedByWalletAddress || ''),
          requestIdempotencyKey: String(source.requestIdempotencyKey || ''),
          batchKey: String(source.batchKey || ''),
          mode: String(source.mode || ''),
          source: String(source.source || ''),
          requestedAt: String(source.requestedAt || ''),
          updatedAt: String(source.updatedAt || ''),
        } satisfies AttemptItem;
      });

      const paginationSource =
        typeof result.pagination === 'object' && result.pagination !== null
          ? (result.pagination as Record<string, unknown>)
          : {};
      const nextPagination: AttemptPagination = {
        page: Math.max(1, Number(paginationSource.page || pagination.page) || 1),
        limit: Math.max(1, Number(paginationSource.limit || pagination.limit) || DEFAULT_LIMIT),
        totalCount: Math.max(0, Number(paginationSource.totalCount || 0) || 0),
        totalPages: Math.max(1, Number(paginationSource.totalPages || 1) || 1),
      };

      const summarySource =
        typeof result.summary === 'object' && result.summary !== null
          ? (result.summary as Record<string, unknown>)
          : {};
      const nextSummary: AttemptSummary = {
        totalFeeAmountUsdt: roundDownUsdtAmount(Number(summarySource.totalFeeAmountUsdt || 0)),
        confirmedCount: Math.max(0, Number(summarySource.confirmedCount || 0) || 0),
        failedCount: Math.max(0, Number(summarySource.failedCount || 0) || 0),
        pendingCount: Math.max(0, Number(summarySource.pendingCount || 0) || 0),
      };

      setItems(nextItems);
      setPagination(nextPagination);
      setSummary(nextSummary);
      setLastUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : '수납 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, pagination.limit, pagination.page, requesterWalletAddress, selectedAgentcodeFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const hasActiveFilters = useMemo(
    () => appliedFilters.status !== 'ALL' || appliedFilters.batchKey.trim().length > 0 || appliedFilters.periodDays !== 7,
    [appliedFilters],
  );

  const handleSubmitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    setAppliedFilters({
      periodDays: draftFilters.periodDays,
      status: draftFilters.status,
      batchKey: draftFilters.batchKey.trim(),
    });
  };

  const handleResetSearch = () => {
    const defaults = createDefaultFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const copyText = async (value: string) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(normalized);
      }
      setCopiedValue(normalized);
      window.setTimeout(() => {
        setCopiedValue((current) => (current === normalized ? '' : current));
      }, 1200);
    } catch {
      toast.error('복사에 실패했습니다.');
    }
  };

  return (
    <main className="min-h-screen bg-transparent">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pb-20 pt-6 lg:px-6 lg:pt-8">
        <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_28px_60px_-42px_rgba(15,23,42,0.38)] backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/95 shadow-sm">
                <Image src="/icon-buyorder.png" alt="Collection History" width={22} height={22} className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">AG Fee History</p>
                <h1 className="text-xl font-bold text-slate-900">플랫폼 수수료 수납 이력</h1>
                <p className="text-sm text-slate-500">수납 요청/전송/완료 상태를 `platformFeeCollectionAttempts` 기준으로 조회합니다.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="../"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                수납 대상
              </Link>
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Last Updated</p>
                <p className="text-xs font-semibold text-slate-700">{lastUpdatedAt ? formatDateTime(lastUpdatedAt) : '-'}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_26px_56px_-46px_rgba(15,23,42,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">에이전트 목록</p>
            <p className="text-xs text-slate-500">
              선택 에이전트: {selectedAgentInfo ? getAgentDisplayName(selectedAgentInfo) : '-'} · 전체 {agentCatalog.length.toLocaleString()}명
            </p>
          </div>

          {agentCatalogError && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              {agentCatalogError}
            </div>
          )}

          {loadingAgentCatalog && agentCatalog.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500">
              에이전트 목록을 불러오는 중입니다...
            </div>
          ) : agentCatalog.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500">
              표시할 에이전트가 없습니다.
            </div>
          ) : (
            <div className="px-4 py-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {agentCatalog.map((agent) => {
                  const displayName = getAgentDisplayName(agent);
                  const isSelected = selectedAgentKey === agent.key;
                  return (
                    <button
                      key={agent.key}
                      type="button"
                      onClick={() => {
                        setSelectedAgentKey(agent.key);
                        setPagination((prev) => ({ ...prev, page: 1 }));
                      }}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
                        isSelected
                          ? 'border-cyan-300 bg-cyan-50 shadow-[0_10px_24px_-18px_rgba(8,145,178,0.7)]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                        {agent.agentLogo ? (
                          <span
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${encodeURI(agent.agentLogo)})` }}
                            aria-label={displayName}
                          />
                        ) : (
                          <span className="text-[10px] font-extrabold text-slate-600">{getAgentAvatarFallback(displayName)}</span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">{displayName}</span>
                        <span className="block truncate text-[11px] text-slate-500">{agent.agentcode || '-'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.42)]">
          <form className="grid grid-cols-1 gap-3 lg:grid-cols-12" onSubmit={handleSubmitSearch}>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">기간</label>
              <div className="flex h-10 overflow-hidden rounded-xl border border-slate-300 bg-white p-1">
                {PERIOD_OPTIONS.map((period) => {
                  const active = draftFilters.periodDays === period.value;
                  return (
                    <button
                      type="button"
                      key={period.value}
                      onClick={() => setDraftFilters((prev) => ({ ...prev, periodDays: period.value }))}
                      className={`flex-1 rounded-lg text-xs font-semibold transition ${
                        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {period.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">상태</label>
              <select
                value={draftFilters.status}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, status: event.target.value as SearchFilters['status'] }))}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">배치키</label>
              <input
                type="text"
                value={draftFilters.batchKey}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, batchKey: event.target.value }))}
                placeholder="배치키 일부 검색"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>

            <div className="lg:col-span-2 flex items-end gap-2">
              <button
                type="button"
                onClick={handleResetSearch}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                초기화
              </button>
              <button
                type="submit"
                className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                검색
              </button>
            </div>

            <div className="lg:col-span-12 text-xs text-slate-500">
              총 {pagination.totalCount.toLocaleString()}건 · {pagination.page.toLocaleString()} / {pagination.totalPages.toLocaleString()} 페이지
              {hasActiveFilters ? ' · 필터 적용중' : ''}
            </div>
          </form>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">총 수납 이력</p>
            <p className="mt-2 text-2xl font-bold leading-tight text-slate-900">{pagination.totalCount.toLocaleString()} 건</p>
            <p className="mt-1 text-xs text-slate-500">선택한 기간/필터 기준</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">수납 합계</p>
            <p className="mt-2 text-2xl font-bold leading-tight text-cyan-700">{formatUsdt(summary.totalFeeAmountUsdt)} USDT</p>
            <p className="mt-1 text-xs text-slate-500">feeAmountUsdt 기준</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">완료</p>
            <p className="mt-2 text-2xl font-bold leading-tight text-emerald-700">{summary.confirmedCount.toLocaleString()} 건</p>
            <p className="mt-1 text-xs text-slate-500">CONFIRMED</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">진행/실패</p>
            <p className="mt-2 text-2xl font-bold leading-tight text-rose-700">
              {(summary.pendingCount + summary.failedCount).toLocaleString()} 건
            </p>
            <p className="mt-1 text-xs text-slate-500">진행 {summary.pendingCount.toLocaleString()} · 실패 {summary.failedCount.toLocaleString()}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_26px_56px_-46px_rgba(15,23,42,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">수납 이력 목록</p>
              <p className="text-xs text-slate-500">기간/상태/배치키 필터 + 페이지네이션</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void loadAgentCatalog();
                void loadList();
              }}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              새로고침
            </button>
          </div>

          {error && (
            <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div className="overflow-x-auto lg:overflow-x-visible">
            <table className="w-full table-fixed">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-slate-500">
                  <th className="w-[15%] px-2 py-3">요청시각</th>
                  <th className="w-[8%] px-2 py-3">상태</th>
                  <th className="w-[10%] px-2 py-3">거래번호</th>
                  <th className="w-[10%] px-2 py-3 text-right">AG 수수료</th>
                  <th className="w-[10%] px-2 py-3 text-right">수수료율</th>
                  <th className="w-[12%] px-2 py-3">지급 주소</th>
                  <th className="w-[12%] px-2 py-3">수납 주소</th>
                  <th className="w-[10%] px-2 py-3">트랜잭션</th>
                  <th className="w-[13%] px-2 py-3">배치키</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-700">
                {loading ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-500" colSpan={9}>
                      수납 이력을 불러오는 중입니다...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-500" colSpan={9}>
                      표시할 수납 이력이 없습니다.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="px-2 py-3">
                        <div className="flex min-w-0 flex-col leading-tight">
                          <span className="text-xs text-slate-700">{formatDateTime(item.requestedAt)}</span>
                          <span className="mt-0.5 text-[11px] text-slate-500">갱신 {formatDateTime(item.updatedAt)}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClassName(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate text-sm font-semibold text-slate-900">{item.tradeId || '-'}</span>
                          <span className="truncate text-[11px] text-slate-500">{shortWallet(item.orderId)}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right font-extrabold text-cyan-700">
                        {formatUsdt(item.feeAmountUsdt)} USDT
                      </td>
                      <td className="px-2 py-3 text-right font-semibold text-slate-800">
                        {formatPercent(item.feePercent)}
                      </td>
                      <td className="px-2 py-3">
                        {item.fromAddress ? (
                          <button
                            type="button"
                            onClick={() => {
                              void copyText(item.fromAddress);
                            }}
                            title={item.fromAddress}
                            className="inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                          >
                            {shortWallet(item.fromAddress)}
                            {copiedValue === item.fromAddress && <span className="text-[10px] text-cyan-700">복사됨</span>}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {item.toAddress ? (
                          <button
                            type="button"
                            onClick={() => {
                              void copyText(item.toAddress);
                            }}
                            title={item.toAddress}
                            className="inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                          >
                            {shortWallet(item.toAddress)}
                            {copiedValue === item.toAddress && <span className="text-[10px] text-cyan-700">복사됨</span>}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {item.transactionHash ? (
                          <button
                            type="button"
                            onClick={() => {
                              void copyText(item.transactionHash);
                            }}
                            title={item.transactionHash}
                            className="inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                          >
                            {shortWallet(item.transactionHash)}
                            {copiedValue === item.transactionHash && <span className="text-[10px] text-cyan-700">복사됨</span>}
                          </button>
                        ) : item.transactionId ? (
                          <span className="truncate text-xs text-slate-500">{shortWallet(item.transactionId)}</span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {item.batchKey ? (
                          <button
                            type="button"
                            onClick={() => {
                              void copyText(item.batchKey);
                            }}
                            title={item.batchKey}
                            className="inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                          >
                            <span className="truncate">{item.batchKey}</span>
                            {copiedValue === item.batchKey && <span className="text-[10px] text-cyan-700">복사됨</span>}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              총 {pagination.totalCount.toLocaleString()}건
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={pagination.page <= 1 || loading}
                className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                이전
              </button>
              <span className="text-xs font-semibold text-slate-600">
                {pagination.page.toLocaleString()} / {pagination.totalPages.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                disabled={pagination.page >= pagination.totalPages || loading}
                className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                다음
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
