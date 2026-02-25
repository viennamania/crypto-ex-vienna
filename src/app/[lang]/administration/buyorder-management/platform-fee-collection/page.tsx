'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { useActiveAccount } from 'thirdweb/react';

type FeeCollectionItem = {
  _id: string;
  tradeId: string;
  createdAt: string;
  status: string;
  usdtAmount: number;
  krwAmount: number;
  buyerNickname: string;
  sellerNickname: string;
  sellerWalletAddress: string;
  sellerEscrowWalletAddress: string;
  agentcode: string;
  agentName: string;
  agentLogo: string;
  agentPlatformFeePercentage: number;
  agentPlatformFeeFromAddress: string;
  agentPlatformFeeToAddress: string;
  agentPlatformFeeTransactionHash: string;
  agentPlatformFeeTransactionId: string;
  expectedAgentFeeAmount: number;
  isUncollected: boolean;
};

type FeeCollectionPagination = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
};

type FeeCollectionSummary = {
  totalExpectedFeeAmount: number;
  totalUncollectedExpectedFeeAmount: number;
  uncollectedCount: number;
  collectedCount: number;
};

type CollectResultGroup = {
  batchKey: string;
  fromAddress: string;
  toAddress: string;
  itemCount: number;
  totalFeeAmountUsdt: number;
  transactionId?: string;
  transactionHash?: string;
  status: 'REQUESTING' | 'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'BLOCKED_LOW_BALANCE';
  mode: 'single' | 'batch';
  error?: string;
};

type CollectApiResult = {
  chain: string;
  requestedOrderCount: number;
  collectableOrderCount: number;
  queuedOrderCount: number;
  queuedGroupCount: number;
  failedOrderCount: number;
  senderWalletCount: number;
  multiSenderBatchedSeparately: boolean;
  batchHandlingNote: string;
  groups: CollectResultGroup[];
  skipped: Array<{ orderId: string; tradeId: string; reason: string }>;
};

type SearchFilters = {
  searchTradeId: string;
  searchSeller: string;
  onlyUncollected: boolean;
};

type AgentCellItem = {
  key: string;
  agentcode: string;
  agentName: string;
  agentLogo: string;
  orderCount: number;
  collectableCount: number;
};

type AgentCollectionItem = {
  key: string;
  agentcode: string;
  agentName: string;
  agentLogo: string;
};

const DEFAULT_LIMIT = 30;
const COLLECTABLE_STATUSES = new Set(['paymentconfirmed', 'completed']);

const createDefaultFilters = (): SearchFilters => ({
  searchTradeId: '',
  searchSeller: '',
  onlyUncollected: true,
});

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

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
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number(value || 0));

const formatFeeUsdt = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(roundDownUsdtAmount(Number(value || 0)));

const formatKrw = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatPercent = (value: number) => {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return '0';
  return `${(Math.round(normalized * 100) / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
};

const getStatusLabel = (status: string) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'ordered') return '주문생성';
  if (normalized === 'accepted') return '주문접수';
  if (normalized === 'paymentrequested') return '입금요청';
  if (normalized === 'paymentconfirmed') return '입금확인';
  if (normalized === 'completed') return '거래완료';
  if (normalized === 'cancelled') return '주문취소';
  return status || '-';
};

const getStatusBadgeClassName = (status: string) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'paymentconfirmed') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (normalized === 'completed') return 'border-cyan-300 bg-cyan-50 text-cyan-700';
  if (normalized === 'paymentrequested') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (normalized === 'cancelled') return 'border-rose-300 bg-rose-50 text-rose-700';
  return 'border-slate-300 bg-slate-50 text-slate-700';
};

const isCollectableItem = (item: FeeCollectionItem) => {
  if (!item) return false;
  const normalizedStatus = String(item.status || '').trim().toLowerCase();
  if (!COLLECTABLE_STATUSES.has(normalizedStatus)) return false;
  if (!item.isUncollected) return false;
  if (!isWalletAddress(item.agentPlatformFeeFromAddress) || !isWalletAddress(item.agentPlatformFeeToAddress)) {
    return false;
  }
  return Number(item.expectedAgentFeeAmount || 0) > 0;
};

const getAgentCellKey = (item: { agentcode?: string; agentName?: string }) => {
  const agentcode = String(item.agentcode || '').trim();
  if (agentcode) return `code:${agentcode.toLowerCase()}`;
  const agentName = String(item.agentName || '').trim();
  if (agentName) return `name:${agentName.toLowerCase()}`;
  return 'unknown';
};

const getAgentDisplayName = (item: Pick<AgentCellItem, 'agentName' | 'agentcode'>) => {
  const agentName = String(item.agentName || '').trim();
  if (agentName) return agentName;
  const agentcode = String(item.agentcode || '').trim();
  if (agentcode) return agentcode;
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

export default function PlatformFeeCollectionPage() {
  const activeAccount = useActiveAccount();
  const requesterWalletAddress = String(activeAccount?.address || '').trim();

  const [items, setItems] = useState<FeeCollectionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<FeeCollectionPagination>({
    page: 1,
    limit: DEFAULT_LIMIT,
    totalCount: 0,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<FeeCollectionSummary>({
    totalExpectedFeeAmount: 0,
    totalUncollectedExpectedFeeAmount: 0,
    uncollectedCount: 0,
    collectedCount: 0,
  });
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(() => createDefaultFilters());
  const [agentCatalog, setAgentCatalog] = useState<AgentCollectionItem[]>([]);
  const [loadingAgentCatalog, setLoadingAgentCatalog] = useState(false);
  const [agentCatalogError, setAgentCatalogError] = useState<string | null>(null);
  const [selectedAgentKey, setSelectedAgentKey] = useState('');

  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [copiedAddress, setCopiedAddress] = useState('');
  const [collectModalOpen, setCollectModalOpen] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectResult, setCollectResult] = useState<CollectApiResult | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/order/getAgentPlatformFeeCollectionList', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: pagination.page,
          limit: pagination.limit,
          searchTradeId: appliedFilters.searchTradeId.trim(),
          searchSeller: appliedFilters.searchSeller.trim(),
          onlyUncollected: appliedFilters.onlyUncollected,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '수수료 수납 목록 조회에 실패했습니다.'));
      }

      const result =
        typeof (payload as Record<string, unknown>)?.result === 'object'
        && (payload as Record<string, unknown>)?.result !== null
          ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
          : {};
      const nextItemsRaw = Array.isArray(result.items) ? result.items : [];
      const nextItems = nextItemsRaw.map((item) => {
        const source = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
        const expectedAgentFeeAmount = roundDownUsdtAmount(Number(source.expectedAgentFeeAmount || 0));
        const transactionHash = String(source.agentPlatformFeeTransactionHash || '').trim();
        return {
          _id: String(source._id || ''),
          tradeId: String(source.tradeId || ''),
          createdAt: String(source.createdAt || ''),
          status: String(source.status || ''),
          usdtAmount: Number(source.usdtAmount || 0),
          krwAmount: Number(source.krwAmount || 0),
          buyerNickname: String(source.buyerNickname || ''),
          sellerNickname: String(source.sellerNickname || ''),
          sellerWalletAddress: String(source.sellerWalletAddress || ''),
          sellerEscrowWalletAddress: String(source.sellerEscrowWalletAddress || ''),
          agentcode: String(source.agentcode || ''),
          agentName: String(source.agentName || ''),
          agentLogo: String(source.agentLogo || ''),
          agentPlatformFeePercentage: Number(source.agentPlatformFeePercentage || 0),
          agentPlatformFeeFromAddress: String(source.agentPlatformFeeFromAddress || ''),
          agentPlatformFeeToAddress: String(source.agentPlatformFeeToAddress || ''),
          agentPlatformFeeTransactionHash: transactionHash,
          agentPlatformFeeTransactionId: String(source.agentPlatformFeeTransactionId || ''),
          expectedAgentFeeAmount,
          isUncollected: transactionHash.length === 0,
        } satisfies FeeCollectionItem;
      });

      const paginationSource =
        typeof result.pagination === 'object' && result.pagination !== null
          ? (result.pagination as Record<string, unknown>)
          : {};
      const nextPagination = {
        page: Math.max(1, Number(paginationSource.page || pagination.page) || 1),
        limit: Math.max(1, Number(paginationSource.limit || pagination.limit) || DEFAULT_LIMIT),
        totalCount: Math.max(0, Number(paginationSource.totalCount || 0) || 0),
        totalPages: Math.max(1, Number(paginationSource.totalPages || 1) || 1),
      };

      const summarySource =
        typeof result.summary === 'object' && result.summary !== null
          ? (result.summary as Record<string, unknown>)
          : {};
      const nextSummary: FeeCollectionSummary = {
        totalExpectedFeeAmount: roundDownUsdtAmount(Number(summarySource.totalExpectedFeeAmount || 0)),
        totalUncollectedExpectedFeeAmount: roundDownUsdtAmount(Number(summarySource.totalUncollectedExpectedFeeAmount || 0)),
        uncollectedCount: Math.max(0, Number(summarySource.uncollectedCount || 0) || 0),
        collectedCount: Math.max(0, Number(summarySource.collectedCount || 0) || 0),
      };

      setItems(nextItems);
      setPagination(nextPagination);
      setSummary(nextSummary);
      setLastUpdatedAt(new Date().toISOString());
      setSelectedOrderIds((prev) => prev.filter((orderId) => nextItems.some((item) => item._id === orderId)));
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : '수수료 수납 목록 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, pagination.limit, pagination.page]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

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

  const agentCells = useMemo(() => {
    const statsByKey = new Map<string, { orderCount: number; collectableCount: number }>();

    items.forEach((item) => {
      const key = getAgentCellKey(item);
      const existing = statsByKey.get(key);
      const nextCollectableCount = isCollectableItem(item) ? 1 : 0;
      if (existing) {
        existing.orderCount += 1;
        existing.collectableCount += nextCollectableCount;
      } else {
        statsByKey.set(key, {
          orderCount: 1,
          collectableCount: nextCollectableCount,
        });
      }
    });

    return agentCatalog.map((agent) => {
      const stats = statsByKey.get(agent.key);
      return {
        key: agent.key,
        agentcode: agent.agentcode,
        agentName: agent.agentName,
        agentLogo: agent.agentLogo,
        orderCount: stats?.orderCount || 0,
        collectableCount: stats?.collectableCount || 0,
      } satisfies AgentCellItem;
    });
  }, [agentCatalog, items]);

  useEffect(() => {
    if (agentCells.length === 0) {
      setSelectedAgentKey('');
      return;
    }
    setSelectedAgentKey((prev) => (agentCells.some((cell) => cell.key === prev) ? prev : agentCells[0].key));
  }, [agentCells]);

  const effectiveSelectedAgentKey = selectedAgentKey || agentCells[0]?.key || '';

  const selectedAgentInfo = useMemo(
    () => agentCells.find((cell) => cell.key === effectiveSelectedAgentKey) || null,
    [agentCells, effectiveSelectedAgentKey],
  );

  const visibleItems = useMemo(
    () => (
      effectiveSelectedAgentKey
        ? items.filter((item) => getAgentCellKey(item) === effectiveSelectedAgentKey)
        : []
    ),
    [items, effectiveSelectedAgentKey],
  );

  useEffect(() => {
    setSelectedOrderIds((prev) => prev.filter((orderId) => visibleItems.some((item) => item._id === orderId)));
  }, [visibleItems]);

  const collectableItems = useMemo(
    () => visibleItems.filter((item) => isCollectableItem(item)),
    [visibleItems],
  );

  const selectedItems = useMemo(
    () => visibleItems.filter((item) => selectedOrderIds.includes(item._id) && isCollectableItem(item)),
    [visibleItems, selectedOrderIds],
  );

  const selectedAgentSummary = useMemo(() => {
    const uncollectedItems = visibleItems.filter((item) => item.isUncollected);
    return {
      totalCount: visibleItems.length,
      uncollectedCount: uncollectedItems.length,
      totalUncollectedExpectedFeeAmount: roundDownUsdtAmount(
        uncollectedItems.reduce((sum, item) => sum + Number(item.expectedAgentFeeAmount || 0), 0),
      ),
    };
  }, [visibleItems]);

  const selectedTotalFeeAmount = useMemo(
    () => roundDownUsdtAmount(selectedItems.reduce((sum, item) => sum + Number(item.expectedAgentFeeAmount || 0), 0)),
    [selectedItems],
  );

  const selectedSenderCount = useMemo(() => {
    const unique = new Set(
      selectedItems.map((item) => String(item.agentPlatformFeeFromAddress || '').trim().toLowerCase()).filter(Boolean),
    );
    return unique.size;
  }, [selectedItems]);

  const isCurrentPageAllChecked = useMemo(
    () =>
      collectableItems.length > 0
      && collectableItems.every((item) => selectedOrderIds.includes(item._id)),
    [collectableItems, selectedOrderIds],
  );

  const toggleSelectAllCurrentPage = () => {
    if (isCurrentPageAllChecked) {
      setSelectedOrderIds((prev) => prev.filter((orderId) => !collectableItems.some((item) => item._id === orderId)));
      return;
    }
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      collectableItems.forEach((item) => next.add(item._id));
      return Array.from(next);
    });
  };

  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      if (prev.includes(orderId)) {
        return prev.filter((id) => id !== orderId);
      }
      return [...prev, orderId];
    });
  };

  const copyAddress = async (walletAddress: string) => {
    const normalizedWalletAddress = String(walletAddress || '').trim();
    if (!normalizedWalletAddress) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(normalizedWalletAddress);
      }
      setCopiedAddress(normalizedWalletAddress);
      window.setTimeout(() => {
        setCopiedAddress((current) => (current === normalizedWalletAddress ? '' : current));
      }, 1200);
    } catch {
      toast.error('지갑주소 복사에 실패했습니다.');
    }
  };

  const handleSubmitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    setSelectedAgentKey('');
    setAppliedFilters({
      searchTradeId: draftFilters.searchTradeId.trim(),
      searchSeller: draftFilters.searchSeller.trim(),
      onlyUncollected: draftFilters.onlyUncollected,
    });
  };

  const handleResetSearch = () => {
    const defaults = createDefaultFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setSelectedAgentKey('');
    setPagination((prev) => ({ ...prev, page: 1 }));
    setSelectedOrderIds([]);
  };

  const handleCollectSelected = async () => {
    if (collecting) return;
    if (!requesterWalletAddress) {
      toast.error('연결된 관리자 지갑을 확인해 주세요.');
      return;
    }
    if (selectedItems.length === 0) {
      toast.error('수납할 주문을 먼저 선택해 주세요.');
      return;
    }

    setCollecting(true);
    try {
      const response = await fetch('/api/order/collectAgentPlatformFeeBatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterWalletAddress,
          orderIds: selectedItems.map((item) => item._id),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '배치 수납 요청에 실패했습니다.'));
      }

      const result =
        typeof (payload as Record<string, unknown>)?.result === 'object'
        && (payload as Record<string, unknown>)?.result !== null
          ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
          : {};

      const groups = Array.isArray(result.groups)
        ? result.groups.map((group) => {
            const source = typeof group === 'object' && group !== null ? (group as Record<string, unknown>) : {};
            return {
              batchKey: String(source.batchKey || ''),
              fromAddress: String(source.fromAddress || ''),
              toAddress: String(source.toAddress || ''),
              itemCount: Math.max(0, Number(source.itemCount || 0) || 0),
              totalFeeAmountUsdt: roundDownUsdtAmount(Number(source.totalFeeAmountUsdt || 0)),
              transactionId: String(source.transactionId || ''),
              transactionHash: String(source.transactionHash || ''),
              status: String(source.status || 'QUEUED').toUpperCase() as CollectResultGroup['status'],
              mode: String(source.mode || 'single').toLowerCase() === 'batch' ? 'batch' : 'single',
              error: String(source.error || ''),
            } satisfies CollectResultGroup;
          })
        : [];

      const collectData: CollectApiResult = {
        chain: String(result.chain || ''),
        requestedOrderCount: Math.max(0, Number(result.requestedOrderCount || 0) || 0),
        collectableOrderCount: Math.max(0, Number(result.collectableOrderCount || 0) || 0),
        queuedOrderCount: Math.max(0, Number(result.queuedOrderCount || 0) || 0),
        queuedGroupCount: Math.max(0, Number(result.queuedGroupCount || 0) || 0),
        failedOrderCount: Math.max(0, Number(result.failedOrderCount || 0) || 0),
        senderWalletCount: Math.max(0, Number(result.senderWalletCount || 0) || 0),
        multiSenderBatchedSeparately: result.multiSenderBatchedSeparately === true,
        batchHandlingNote: String(result.batchHandlingNote || ''),
        groups,
        skipped: Array.isArray(result.skipped)
          ? result.skipped.map((item) => {
              const source = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
              return {
                orderId: String(source.orderId || ''),
                tradeId: String(source.tradeId || ''),
                reason: String(source.reason || ''),
              };
            })
          : [],
      };

      setCollectResult(collectData);
      setCollectModalOpen(false);
      setSelectedOrderIds([]);
      toast.success(
        collectData.failedOrderCount > 0
          ? `배치 수납 요청 완료 (실패 ${collectData.failedOrderCount}건)`
          : `배치 수납 요청 완료 (${collectData.queuedOrderCount}건)`,
      );
      await loadList();
    } catch (collectError) {
      toast.error(collectError instanceof Error ? collectError.message : '배치 수납 요청에 실패했습니다.');
    } finally {
      setCollecting(false);
    }
  };

  return (
    <main className="min-h-screen bg-transparent">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pb-20 pt-6 lg:px-6 lg:pt-8">
        <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_28px_60px_-42px_rgba(15,23,42,0.38)] backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/95 shadow-sm">
                <Image src="/icon-buyorder.png" alt="Platform Fee" width={22} height={22} className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">AG Fee Collection</p>
                <h1 className="text-xl font-bold text-slate-900">플랫폼 수수료 수납</h1>
                <p className="text-sm text-slate-500">
                  AG 수수료는 판매수량(USDT) x 수수료율(%)로 계산합니다.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="history"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                수납 이력
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
              선택 에이전트: {selectedAgentInfo ? getAgentDisplayName(selectedAgentInfo) : '-'} · 전체 {agentCells.length.toLocaleString()}명
            </p>
          </div>

          {agentCatalogError && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              {agentCatalogError}
            </div>
          )}

          {loadingAgentCatalog && agentCells.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500">
              에이전트 목록을 불러오는 중입니다...
            </div>
          ) : agentCells.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500">
              표시할 에이전트가 없습니다.
            </div>
          ) : (
            <div className="px-4 py-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {agentCells.map((cell) => {
                  const displayName = getAgentDisplayName(cell);
                  const isSelected = cell.key === effectiveSelectedAgentKey;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelectedAgentKey(cell.key)}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${
                        isSelected
                          ? 'border-cyan-300 bg-cyan-50 shadow-[0_10px_24px_-18px_rgba(8,145,178,0.7)]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                          {cell.agentLogo ? (
                            <span
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${encodeURI(cell.agentLogo)})` }}
                              aria-label={displayName}
                            />
                          ) : (
                            <span className="text-[10px] font-extrabold text-slate-600">{getAgentAvatarFallback(displayName)}</span>
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900">{displayName}</span>
                          <span className="block truncate text-[11px] text-slate-500">{cell.agentcode || '-'}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-xs font-bold text-slate-700">{cell.orderCount.toLocaleString()}건</span>
                        <span className="block text-[10px] text-cyan-700">수납가능 {cell.collectableCount.toLocaleString()}</span>
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
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">거래번호</label>
              <input
                type="text"
                value={draftFilters.searchTradeId}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchTradeId: event.target.value }))}
                placeholder="TID 검색"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">판매자</label>
              <input
                type="text"
                value={draftFilters.searchSeller}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchSeller: event.target.value }))}
                placeholder="판매자 검색"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div className="lg:col-span-8">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">옵션</label>
              <label className="inline-flex h-10 w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={draftFilters.onlyUncollected}
                  onChange={(event) => setDraftFilters((prev) => ({ ...prev, onlyUncollected: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                미수납만 보기
              </label>
            </div>

            <div className="lg:col-span-12 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                총 {pagination.totalCount.toLocaleString()}건 · {pagination.page.toLocaleString()} / {pagination.totalPages.toLocaleString()} 페이지
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetSearch}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  초기화
                </button>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  검색
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">AG 대상 주문</p>
            <p className="mt-2 text-2xl font-bold leading-tight text-slate-900">{selectedAgentSummary.totalCount.toLocaleString()} 건</p>
            <p className="mt-1 text-xs text-slate-500">선택 에이전트 기준</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">미수납 주문</p>
            <p className="mt-2 text-2xl font-bold leading-tight text-rose-700">{selectedAgentSummary.uncollectedCount.toLocaleString()} 건</p>
            <p className="mt-1 text-xs text-slate-500">선택 에이전트 · transactionHash 미기록</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">미수납 예상 수수료</p>
            <p className="mt-2 text-2xl font-bold leading-tight text-amber-700">{formatFeeUsdt(selectedAgentSummary.totalUncollectedExpectedFeeAmount)} USDT</p>
            <p className="mt-1 text-xs text-slate-500">선택 에이전트 · AG 수수료 기준</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">선택 수납 수량</p>
            <p className="mt-2 text-2xl font-bold leading-tight text-cyan-700">{formatFeeUsdt(selectedTotalFeeAmount)} USDT</p>
            <p className="mt-1 text-xs text-slate-500">선택 {selectedItems.length.toLocaleString()}건</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_26px_56px_-46px_rgba(15,23,42,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">플랫폼 수수료 수납 대상 목록</p>
              <p className="text-xs text-slate-500">
                AG 수수료 계산식: 판매수량 x 수수료율(%) · 수납 가능 상태: 거래완료(입금확인/완료)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              <button
                type="button"
                disabled={selectedItems.length === 0 || collecting || !requesterWalletAddress}
                onClick={() => setCollectModalOpen(true)}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                전체 수납하기
              </button>
            </div>
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
                  <th className="w-[4%] px-2 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isCurrentPageAllChecked}
                      onChange={toggleSelectAllCurrentPage}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                    />
                  </th>
                  <th className="w-[14%] px-2 py-3">주문시각/거래번호(TID)</th>
                  <th className="w-[8%] px-2 py-3">상태</th>
                  <th className="w-[9%] px-2 py-3">판매자</th>
                  <th className="w-[10%] px-2 py-3 text-right">판매수량</th>
                  <th className="w-[7%] px-2 py-3 text-right">AG 수수료율</th>
                  <th className="w-[10%] px-2 py-3 text-right">AG 수수료 수량</th>
                  <th className="w-[11%] px-2 py-3">지급 주소</th>
                  <th className="w-[11%] px-2 py-3">수납 주소</th>
                  <th className="w-[16%] px-2 py-3">수납 상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-700">
                {loading ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-500" colSpan={10}>
                      수납 대상 주문을 불러오는 중입니다...
                    </td>
                  </tr>
                ) : visibleItems.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-500" colSpan={10}>
                      표시할 수납 대상 주문이 없습니다.
                    </td>
                  </tr>
                ) : (
                  visibleItems.map((item) => {
                    const collectable = isCollectableItem(item);
                    return (
                      <tr key={item._id} className="hover:bg-slate-50/60">
                        <td className="px-2 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.includes(item._id)}
                            onChange={() => toggleSelectOrder(item._id)}
                            disabled={!collectable}
                            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex min-w-0 flex-col leading-tight">
                            <span className="text-xs text-slate-600">{formatDateTime(item.createdAt)}</span>
                            <span className="mt-0.5 truncate text-sm font-semibold text-slate-900">{item.tradeId || '-'}</span>
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClassName(item.status)}`}>
                            {getStatusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex min-w-0 flex-col leading-tight">
                            <span className="truncate font-semibold text-slate-900">{item.sellerNickname || '-'}</span>
                            <span className="truncate text-xs text-slate-500">{shortWallet(item.sellerEscrowWalletAddress || item.sellerWalletAddress)}</span>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-900">
                          {formatUsdt(item.usdtAmount)} USDT
                        </td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-800">
                          {formatPercent(item.agentPlatformFeePercentage)}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <span className="font-extrabold text-cyan-700">{formatFeeUsdt(item.expectedAgentFeeAmount)} USDT</span>
                        </td>
                        <td className="px-2 py-3">
                          {isWalletAddress(item.agentPlatformFeeFromAddress) ? (
                            <button
                              type="button"
                              onClick={() => {
                                void copyAddress(item.agentPlatformFeeFromAddress);
                              }}
                              className="inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                              title={item.agentPlatformFeeFromAddress}
                            >
                              {shortWallet(item.agentPlatformFeeFromAddress)}
                              {copiedAddress === item.agentPlatformFeeFromAddress && (
                                <span className="text-[10px] font-semibold text-cyan-700">복사됨</span>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-rose-600">주소오류</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          {isWalletAddress(item.agentPlatformFeeToAddress) ? (
                            <button
                              type="button"
                              onClick={() => {
                                void copyAddress(item.agentPlatformFeeToAddress);
                              }}
                              className="inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                              title={item.agentPlatformFeeToAddress}
                            >
                              {shortWallet(item.agentPlatformFeeToAddress)}
                              {copiedAddress === item.agentPlatformFeeToAddress && (
                                <span className="text-[10px] font-semibold text-cyan-700">복사됨</span>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-rose-600">주소오류</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          {item.isUncollected ? (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex w-fit rounded-md bg-rose-50 px-2 py-0.5 text-xs font-extrabold text-rose-700">
                                미수납
                              </span>
                              {!collectable && (
                                <span className="text-[11px] text-slate-500">수납 조건 미충족</span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex w-fit rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-700">
                                수납완료
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {shortWallet(item.agentPlatformFeeTransactionHash)}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              선택 {selectedItems.length.toLocaleString()}건 · 선택 수량 {formatFeeUsdt(selectedTotalFeeAmount)} USDT
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

        {collectResult && (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.4)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">최근 배치 수납 요청 결과</p>
                <p className="text-xs text-slate-500">{collectResult.batchHandlingNote || '-'}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                Chain: {collectResult.chain || '-'}
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">요청 주문</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{collectResult.requestedOrderCount.toLocaleString()}건</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">큐 접수</p>
                <p className="mt-1 text-lg font-bold text-cyan-700">{collectResult.queuedOrderCount.toLocaleString()}건</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">실패</p>
                <p className="mt-1 text-lg font-bold text-rose-700">{collectResult.failedOrderCount.toLocaleString()}건</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">송신 지갑</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{collectResult.senderWalletCount.toLocaleString()}개</p>
              </div>
            </div>
          </section>
        )}
      </div>

      {collectModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-[2px] sm:items-center">
          <button
            type="button"
            aria-label="수납 모달 닫기"
            className="absolute inset-0"
            onClick={() => {
              if (collecting) return;
              setCollectModalOpen(false);
            }}
          />

          <div className="relative w-full max-w-3xl rounded-2xl border border-cyan-200 bg-white p-5 shadow-[0_35px_80px_-40px_rgba(6,182,212,0.75)]">
            <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold text-cyan-700">
              전체 수납하기
            </p>
            <h3 className="mt-2 text-lg font-bold text-slate-900">선택한 AG 수수료를 배치 큐로 요청합니다.</h3>
            <p className="mt-1 text-sm text-slate-600">
              체크한 내역 합산을 확인한 뒤 수납 요청을 진행하세요.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">선택 건수</p>
                <p className="mt-1 text-base font-bold text-slate-900">{selectedItems.length.toLocaleString()}건</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">합산 수량</p>
                <p className="mt-1 text-base font-bold text-cyan-700">{formatFeeUsdt(selectedTotalFeeAmount)} USDT</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">송신 지갑 수</p>
                <p className="mt-1 text-base font-bold text-slate-900">{selectedSenderCount.toLocaleString()}개</p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {selectedSenderCount > 1
                ? '송신 서버지갑이 여러 개이면 단일 온체인 배치로는 처리되지 않으며, 송신 지갑별 배치 큐로 분리 처리됩니다.'
                : '송신 서버지갑이 1개이면 동일 지갑 배치 큐(enqueueBatchTransaction)로 처리됩니다.'}
            </div>

            <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full table-fixed">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                    <th className="w-[140px] px-3 py-2">거래번호</th>
                    <th className="w-[130px] px-3 py-2 text-right">AG 수수료</th>
                    <th className="w-[170px] px-3 py-2">지급 주소</th>
                    <th className="w-[170px] px-3 py-2">수납 주소</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {selectedItems.map((item) => (
                    <tr key={`modal-${item._id}`}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{item.tradeId || '-'}</td>
                      <td className="px-3 py-2 text-right font-extrabold text-cyan-700">
                        {formatFeeUsdt(item.expectedAgentFeeAmount)} USDT
                      </td>
                      <td className="px-3 py-2 text-slate-600">{shortWallet(item.agentPlatformFeeFromAddress)}</td>
                      <td className="px-3 py-2 text-slate-600">{shortWallet(item.agentPlatformFeeToAddress)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCollectModalOpen(false)}
                disabled={collecting}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleCollectSelected();
                }}
                disabled={collecting || selectedItems.length === 0}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-cyan-700 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {collecting ? '수납 요청 중...' : '수납 요청 실행'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
