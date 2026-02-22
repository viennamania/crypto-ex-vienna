'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';

type AgentFeeWalletItem = {
  _id?: string;
  agentcode?: string;
  agentName?: string;
  agentLogo?: string;
  platformFeePercent?: number | null;
  agentFeePercent?: number | null;
  creditWallet?: {
    smartAccountAddress?: string;
  };
  updatedAt?: string;
};

type FeeWalletBalanceItem = {
  agentcode: string;
  walletAddress: string;
  rawValue: string;
  displayValue: string;
  error?: string;
};

type PlatformFeeRateHistoryItem = {
  id: string;
  agentcode: string;
  agentName: string;
  agentLogo: string;
  previousFeePercent: number;
  nextFeePercent: number;
  changedByWalletAddress: string;
  changedByName: string;
  changedBy: string;
  changedAt: string;
};

const BALANCE_POLLING_MS = 15000;
const HISTORY_PAGE_SIZE = 20;
const HISTORY_PAGE_WINDOW = 5;

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR');
};

const formatUsdt = (value?: string) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0';
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(numeric);
};

const toFeePercentOrNull = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0 || numeric > 100) return null;
  return Math.round(numeric * 100) / 100;
};

const formatFeePercent = (value: unknown) => {
  const normalized = toFeePercentOrNull(value);
  return normalized === null ? '-' : `${normalized.toFixed(2)}%`;
};

const shortWallet = (value?: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

const buildChangedByLabel = (name: string, walletAddress: string) => {
  const normalizedName = String(name || '').trim();
  const normalizedWalletAddress = String(walletAddress || '').trim();

  if (normalizedName && normalizedWalletAddress) {
    return `${normalizedName} (${normalizedWalletAddress})`;
  }
  if (normalizedName) return normalizedName;
  if (normalizedWalletAddress) return normalizedWalletAddress;
  return 'admin';
};

const parseHistory = (item: unknown): PlatformFeeRateHistoryItem => {
  const source = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
  return {
    id: String(source.id || source._id || ''),
    agentcode: String(source.agentcode || '').trim(),
    agentName: String(source.agentName || '').trim(),
    agentLogo: String(source.agentLogo || '').trim(),
    previousFeePercent: Number(source.previousFeePercent || 0),
    nextFeePercent: Number(source.nextFeePercent || 0),
    changedByWalletAddress: String(source.changedByWalletAddress || '').trim(),
    changedByName: String(source.changedByName || '').trim(),
    changedBy: String(source.changedBy || '').trim(),
    changedAt: String(source.changedAt || ''),
  };
};

const normalizeAgent = (item: unknown): AgentFeeWalletItem => {
  const source = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
  const creditWalletSource =
    typeof source.creditWallet === 'object' && source.creditWallet !== null
      ? (source.creditWallet as Record<string, unknown>)
      : {};
  const platformFeePercent = toFeePercentOrNull(source.platformFeePercent ?? source.agentFeePercent ?? null);
  const agentFeePercent = toFeePercentOrNull(source.agentFeePercent ?? source.platformFeePercent ?? null);
  // Fallback legacy top-level fields while old documents are migrating.
  const legacySmartAccountAddress = String(source.smartAccountAddress || '').trim();
  return {
    _id: String(source._id || ''),
    agentcode: String(source.agentcode || ''),
    agentName: String(source.agentName || ''),
    agentLogo: String(source.agentLogo || ''),
    platformFeePercent,
    agentFeePercent,
    creditWallet: {
      smartAccountAddress: String(creditWalletSource.smartAccountAddress || legacySmartAccountAddress || ''),
    },
    updatedAt: String(source.updatedAt || ''),
  };
};

const resolveSmartAccountAddress = (agent: AgentFeeWalletItem) => {
  const smartAccountAddress = String(agent.creditWallet?.smartAccountAddress || '').trim();
  return isWalletAddress(smartAccountAddress) ? smartAccountAddress : '';
};

export default function AgentFeeWalletManagementPage() {
  const activeAccount = useActiveAccount();
  const connectedWalletAddress = String(activeAccount?.address || '').trim();

  const [agents, setAgents] = useState<AgentFeeWalletItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [creatingAgentCode, setCreatingAgentCode] = useState('');
  const [copiedWalletAddress, setCopiedWalletAddress] = useState('');
  const [editingAgent, setEditingAgent] = useState<AgentFeeWalletItem | null>(null);
  const [feePercentInput, setFeePercentInput] = useState('0.00');
  const [initialFeePercent, setInitialFeePercent] = useState<number>(0);
  const [savingFeePercent, setSavingFeePercent] = useState(false);
  const [feeModalError, setFeeModalError] = useState<string | null>(null);

  const [balancesByAgentcode, setBalancesByAgentcode] = useState<Record<string, FeeWalletBalanceItem>>({});
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [lastBalanceUpdatedAt, setLastBalanceUpdatedAt] = useState('');
  const [feeRateHistories, setFeeRateHistories] = useState<PlatformFeeRateHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [connectedAdminNickname, setConnectedAdminNickname] = useState('');

  const loadAgents = useCallback(async (searchText: string) => {
    const normalizedSearch = searchText.trim();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', '300');
      if (normalizedSearch) {
        params.set('search', normalizedSearch);
      }

      const response = await fetch(`/api/agents?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '에이전트 목록을 불러오지 못했습니다.'));
      }

      const source = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      const items = Array.isArray(source.items) ? source.items.map(normalizeAgent) : [];

      setAgents(items);
      setAppliedSearch(normalizedSearch);

      return items;
    } catch (loadError) {
      setAgents([]);
      setError(loadError instanceof Error ? loadError.message : '에이전트 목록을 불러오지 못했습니다.');
      return [] as AgentFeeWalletItem[];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBalances = useCallback(async (sourceAgents: AgentFeeWalletItem[]) => {
    const targets = sourceAgents
      .map((agent) => {
        const agentcode = String(agent.agentcode || '').trim();
        const walletAddress = resolveSmartAccountAddress(agent);
        return {
          agentcode,
          walletAddress,
        };
      })
      .filter((item) => item.agentcode && isWalletAddress(item.walletAddress));

    if (targets.length === 0) {
      setBalancesByAgentcode({});
      setBalanceError(null);
      setLastBalanceUpdatedAt('');
      return;
    }

    setBalanceLoading(true);

    try {
      const response = await fetch('/api/agent/getFeeWalletBalances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: targets,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '수수료지갑 잔고를 불러오지 못했습니다.'));
      }

      const source = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      const result =
        typeof source.result === 'object' && source.result !== null
          ? (source.result as Record<string, unknown>)
          : {};
      const items = Array.isArray(result.items) ? result.items : [];

      const nextBalancesByAgentcode: Record<string, FeeWalletBalanceItem> = {};
      items.forEach((item) => {
        const entry = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
        const agentcode = String(entry.agentcode || '').trim();
        if (!agentcode) return;

        nextBalancesByAgentcode[agentcode] = {
          agentcode,
          walletAddress: String(entry.walletAddress || ''),
          rawValue: String(entry.rawValue || '0'),
          displayValue: String(entry.displayValue || '0'),
          error: entry.error ? String(entry.error) : undefined,
        };
      });

      setBalancesByAgentcode(nextBalancesByAgentcode);
      setBalanceError(null);
      setLastBalanceUpdatedAt(String(result.updatedAt || new Date().toISOString()));
    } catch (loadError) {
      setBalanceError(loadError instanceof Error ? loadError.message : '수수료지갑 잔고를 불러오지 못했습니다.');
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const loadFeeRateHistories = useCallback(async (searchText: string, pageNumber = 1) => {
    const normalizedSearch = String(searchText || '').trim();
    const normalizedPage = Math.max(1, Number(pageNumber) || 1);
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await fetch('/api/agent/platform-fee-rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'history',
          search: normalizedSearch,
          page: normalizedPage,
          limit: HISTORY_PAGE_SIZE,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '수수료율 변경 이력을 불러오지 못했습니다.'));
      }

      const result =
        typeof (payload as Record<string, unknown>)?.result === 'object'
        && (payload as Record<string, unknown>)?.result !== null
          ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
          : {};
      const items = Array.isArray(result.items) ? result.items : [];
      const resolvedTotalPages = Math.max(1, Number(result.totalPages || 1) || 1);
      const resolvedPage = Math.min(Math.max(1, Number(result.page || normalizedPage) || normalizedPage), resolvedTotalPages);
      const resolvedTotalCount = Math.max(0, Number(result.totalCount || 0) || 0);

      setFeeRateHistories(items.map((item) => parseHistory(item)));
      setHistoryPage(resolvedPage);
      setHistoryTotalPages(resolvedTotalPages);
      setHistoryTotalCount(resolvedTotalCount);
    } catch (loadError) {
      setFeeRateHistories([]);
      setHistoryError(loadError instanceof Error ? loadError.message : '수수료율 변경 이력을 불러오지 못했습니다.');
      setHistoryPage(1);
      setHistoryTotalPages(1);
      setHistoryTotalCount(0);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleCreateFeeWallet = useCallback(
    async (agentcode: string) => {
      const normalizedAgentcode = String(agentcode || '').trim();
      if (!normalizedAgentcode || creatingAgentCode) {
        return;
      }

      setCreatingAgentCode(normalizedAgentcode);
      setError(null);

      try {
        const response = await fetch('/api/agent/createFeeWalletAddress', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agentcode: normalizedAgentcode,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String((payload as Record<string, unknown>)?.error || '수수료지갑 생성에 실패했습니다.'));
        }

        const nextAgents = await loadAgents(appliedSearch);
        await loadBalances(nextAgents);
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : '수수료지갑 생성에 실패했습니다.');
      } finally {
        setCreatingAgentCode('');
      }
    },
    [appliedSearch, creatingAgentCode, loadAgents, loadBalances]
  );

  const handleCopyWalletAddress = useCallback(async (walletAddress: string) => {
    const normalizedWalletAddress = String(walletAddress || '').trim();
    if (!normalizedWalletAddress) {
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(normalizedWalletAddress);
      } else if (typeof document !== 'undefined') {
        const textArea = document.createElement('textarea');
        textArea.value = normalizedWalletAddress;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setCopiedWalletAddress(normalizedWalletAddress);
      window.setTimeout(() => {
        setCopiedWalletAddress((current) => (current === normalizedWalletAddress ? '' : current));
      }, 1500);
    } catch {
      setError('지갑주소 복사에 실패했습니다.');
    }
  }, []);

  const openFeeModal = useCallback((agent: AgentFeeWalletItem) => {
    const currentFee = toFeePercentOrNull(agent.platformFeePercent ?? agent.agentFeePercent ?? 0) || 0;
    setEditingAgent(agent);
    setFeePercentInput(currentFee.toFixed(2));
    setInitialFeePercent(currentFee);
    setFeeModalError(null);
  }, []);

  const closeFeeModal = useCallback(() => {
    if (savingFeePercent) return;
    setEditingAgent(null);
    setInitialFeePercent(0);
    setFeeModalError(null);
  }, [savingFeePercent]);

  const savePlatformFeePercent = useCallback(async () => {
    const agentcode = String(editingAgent?.agentcode || '').trim();
    if (!agentcode || savingFeePercent) {
      return;
    }

    const normalizedInput = feePercentInput.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalizedInput)) {
      setFeeModalError('수수료율은 소수점 2자리까지 입력해 주세요. 예: 0.35');
      return;
    }

    const feePercent = toFeePercentOrNull(normalizedInput);
    if (feePercent === null) {
      setFeeModalError('수수료율은 0.00 ~ 100.00 사이로 입력해 주세요.');
      return;
    }

    setSavingFeePercent(true);
    setFeeModalError(null);

    try {
      const response = await fetch('/api/agent/platform-fee-rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update',
          agentcode,
          feePercent,
          changedByWalletAddress: connectedWalletAddress,
          changedByName: connectedAdminNickname,
          changedBy: buildChangedByLabel(connectedAdminNickname, connectedWalletAddress),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '플랫폼 수수료율 저장에 실패했습니다.'));
      }

      setAgents((prev) =>
        prev.map((agent) => {
          if (String(agent.agentcode || '').trim() !== agentcode) {
            return agent;
          }
          return {
            ...agent,
            platformFeePercent: feePercent,
            agentFeePercent: feePercent,
          };
        }),
      );
      setEditingAgent(null);
      await loadFeeRateHistories(appliedSearch, 1);
    } catch (saveError) {
      setFeeModalError(saveError instanceof Error ? saveError.message : '플랫폼 수수료율 저장에 실패했습니다.');
    } finally {
      setSavingFeePercent(false);
    }
  }, [
    appliedSearch,
    connectedAdminNickname,
    connectedWalletAddress,
    editingAgent,
    feePercentInput,
    loadFeeRateHistories,
    savingFeePercent,
  ]);

  useEffect(() => {
    void loadAgents('');
  }, [loadAgents]);

  useEffect(() => {
    void loadFeeRateHistories(appliedSearch, 1);
  }, [appliedSearch, loadFeeRateHistories]);

  useEffect(() => {
    const walletAddress = String(connectedWalletAddress || '').trim();
    if (!walletAddress) {
      setConnectedAdminNickname('');
      return;
    }

    let active = true;
    const fetchConnectedAdminProfile = async () => {
      try {
        const response = await fetch('/api/user/getUser', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storecode: 'admin',
            walletAddress,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String((payload as Record<string, unknown>)?.error || 'ADMIN_PROFILE_NOT_FOUND'));
        }

        if (!active) return;
        const payloadObject =
          typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
        const resultObject =
          typeof payloadObject.result === 'object' && payloadObject.result !== null
            ? (payloadObject.result as Record<string, unknown>)
            : {};
        const nickname = String(resultObject.nickname || '').trim();
        setConnectedAdminNickname(nickname);
      } catch {
        if (!active) return;
        setConnectedAdminNickname('');
      }
    };

    void fetchConnectedAdminProfile();
    return () => {
      active = false;
    };
  }, [connectedWalletAddress]);

  useEffect(() => {
    if (agents.length === 0) {
      setBalancesByAgentcode({});
      setLastBalanceUpdatedAt('');
      return;
    }

    let active = true;

    const run = async () => {
      if (!active) return;
      await loadBalances(agents);
    };

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, BALANCE_POLLING_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [agents, loadBalances]);

  const stats = useMemo(() => {
    const total = agents.length;
    const connected = agents.filter((agent) => isWalletAddress(resolveSmartAccountAddress(agent))).length;
    const missing = Math.max(0, total - connected);

    return {
      total,
      connected,
      missing,
    };
  }, [agents]);

  const historyPageNumbers = useMemo(() => {
    const total = Math.max(1, historyTotalPages);
    const current = Math.min(Math.max(1, historyPage), total);
    const halfWindow = Math.floor(HISTORY_PAGE_WINDOW / 2);

    let start = Math.max(1, current - halfWindow);
    let end = Math.min(total, start + HISTORY_PAGE_WINDOW - 1);
    start = Math.max(1, end - HISTORY_PAGE_WINDOW + 1);

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [historyPage, historyTotalPages]);

  const parsedFeePercentInput = toFeePercentOrNull(feePercentInput.trim());
  const isFeePercentUnchanged =
    editingAgent !== null
    && parsedFeePercentInput !== null
    && Math.abs(parsedFeePercentInput - initialFeePercent) < 0.000001;

  return (
    <main className="container mx-auto min-h-[100vh] max-w-screen-2xl bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 pb-10 text-slate-800">
      <div className="w-full py-0">
        <div className="mb-4 flex w-full items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Image src="/icon-agent.png" alt="Agent" width={35} height={35} className="h-6 w-6" />
            <div>
              <p className="text-lg font-semibold text-slate-900">수수료 지급용 지갑 관리</p>
              <p className="text-xs text-slate-500">
                P2P 거래 시 셀러 판매수량 기준 플랫폼 수수료율(%)을 적용해, 에이전트 수수료 지급용 지갑에서 플랫폼 수수료 수납지갑으로 전송하기 위한 설정/운영 화면입니다.
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Last Balance Sync</p>
            <p className="text-xs font-semibold text-slate-700">{lastBalanceUpdatedAt ? formatDateTime(lastBalanceUpdatedAt) : '-'}</p>
          </div>
        </div>

        <header className="mb-4 flex w-full flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
          <p className="text-sm text-slate-600">
            에이전트별 플랫폼 수수료율을 소수점 2자리까지 설정할 수 있습니다. 수수료 지급용 지갑 잔고가 부족한 에이전트의 소속 셀러는 P2P 판매가 중지됩니다.
          </p>
          <div className="flex w-full flex-wrap items-center justify-start gap-2 xl:w-auto xl:justify-end">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void loadAgents(search);
                }
              }}
              placeholder="에이전트명 / 코드 검색"
              className="w-64 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                void loadAgents(search);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              검색
            </button>
            <button
              type="button"
              onClick={() => {
                void loadAgents(appliedSearch);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              새로고침
            </button>
          </div>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">전체 에이전트</p>
            <p className="mt-2 text-2xl font-bold leading-tight text-slate-900">{stats.total.toLocaleString()} 개</p>
            <p className="mt-1 text-xs text-slate-500">현재 검색 조건 기준</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">수수료지갑 연결</p>
            <p className="mt-2 text-2xl font-bold leading-tight text-emerald-700">{stats.connected.toLocaleString()} 개</p>
            <p className="mt-1 text-xs text-slate-500">smartAccountAddress 설정 완료</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">생성 필요</p>
            <p className="mt-2 text-2xl font-bold leading-tight text-rose-700">{stats.missing.toLocaleString()} 개</p>
            <p className="mt-1 text-xs text-slate-500">수수료지갑 미설정 에이전트</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_26px_56px_-46px_rgba(15,23,42,0.45)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">에이전트 수수료 지급용 지갑 목록</p>
              <p className="text-xs text-slate-500">
                잔고 조회 주기 {Math.floor(BALANCE_POLLING_MS / 1000)}초 {balanceLoading ? '· 갱신 중...' : ''}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{agents.length.toLocaleString()}개</span>
          </div>

          {(error || balanceError) && (
            <div className="space-y-1 border-b border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {error && <p>{error}</p>}
              {balanceError && <p>{balanceError}</p>}
            </div>
          )}

          <div className="overflow-x-auto pb-8">
            <table className="min-w-[1220px] w-full table-fixed">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="w-[220px] px-3 py-3">에이전트</th>
                  <th className="w-[320px] px-3 py-3">지갑주소</th>
                  <th className="w-[120px] px-3 py-3 text-right">USDT 잔고</th>
                  <th className="w-[210px] px-3 py-3 text-center">플랫폼 수수료율(%)</th>
                  <th className="w-[170px] px-3 py-3 text-center">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-700">
                {loading ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-500" colSpan={5}>
                      에이전트 목록을 불러오는 중입니다...
                    </td>
                  </tr>
                ) : agents.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-500" colSpan={5}>
                      표시할 에이전트가 없습니다.
                    </td>
                  </tr>
                ) : (
                  agents.map((agent, index) => {
                    const agentcode = String(agent.agentcode || '').trim();
                    const smartAccountAddress = resolveSmartAccountAddress(agent);
                    const hasSmartAccountAddress = isWalletAddress(smartAccountAddress);
                    const balance = agentcode ? balancesByAgentcode[agentcode] : undefined;
                    const creating = creatingAgentCode === agentcode;

                    return (
                      <tr key={`${agent._id || agentcode || 'agent'}-${index}`} className="hover:bg-slate-50/70">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                              {agent.agentLogo ? (
                                <Image
                                  src={agent.agentLogo}
                                  alt={agent.agentName || 'agent'}
                                  fill
                                  className="object-contain"
                                  sizes="40px"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
                                  {(agent.agentName || 'AG').slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{agent.agentName || '-'}</p>
                              <p className="truncate text-xs text-slate-500">{agentcode || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {hasSmartAccountAddress ? (
                            <div className="flex items-start justify-between gap-2">
                              <span className="break-all font-mono text-xs font-semibold text-slate-800" title={smartAccountAddress}>
                                {smartAccountAddress}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  void handleCopyWalletAddress(smartAccountAddress);
                                }}
                                className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                              >
                                {copiedWalletAddress === smartAccountAddress ? '복사됨' : '복사'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {hasSmartAccountAddress ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span className="text-sm font-extrabold text-slate-900">
                                {formatUsdt(balance?.displayValue)} USDT
                              </span>
                              {balance?.error && <span className="text-[10px] font-semibold text-rose-600">조회 오류</span>}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm font-extrabold text-slate-900">
                              {formatFeePercent(agent.platformFeePercent ?? agent.agentFeePercent)}
                            </span>
                            <button
                              type="button"
                              onClick={() => openFeeModal(agent)}
                              disabled={!agentcode}
                              className="inline-flex items-center justify-center rounded-md border border-cyan-300 bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-700 transition hover:border-cyan-400 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              설정하기
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {hasSmartAccountAddress ? (
                            <span className="inline-flex items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                              생성완료
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                void handleCreateFeeWallet(agentcode);
                              }}
                              disabled={!agentcode || creating}
                              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              {creating ? '생성 중...' : '지갑 생성하기'}
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
        </section>

        <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_18px_42px_-34px_rgba(15,23,42,0.4)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">플랫폼 수수료율 변경 이력</p>
              <p className="text-xs text-slate-500">
                에이전트별 수수료율 변경 내역을 컬렉션(`agentPlatformFeeRateHistories`)으로 관리합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void loadFeeRateHistories(appliedSearch, historyPage);
              }}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              {historyLoading ? '조회 중...' : '이력 새로고침'}
            </button>
          </div>

          {historyError && (
            <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {historyError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full table-fixed">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="w-[180px] px-3 py-3">변경시각</th>
                  <th className="w-[260px] px-3 py-3">에이전트</th>
                  <th className="w-[220px] px-3 py-3">수수료율 변경</th>
                  <th className="w-[200px] px-3 py-3">변경자</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-700">
                {historyLoading ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                      변경 이력을 불러오는 중입니다...
                    </td>
                  </tr>
                ) : feeRateHistories.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                      표시할 변경 이력이 없습니다.
                    </td>
                  </tr>
                ) : (
                  feeRateHistories.map((item) => (
                    <tr key={item.id || `${item.agentcode}-${item.changedAt}`} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 text-xs text-slate-500">{formatDateTime(item.changedAt)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            {item.agentLogo ? (
                              <Image
                                src={item.agentLogo}
                                alt={item.agentName || item.agentcode || 'agent'}
                                fill
                                className="object-contain"
                                sizes="32px"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500">
                                {(item.agentName || item.agentcode || 'AG').slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{item.agentName || '-'}</p>
                            <p className="truncate text-xs text-slate-500">{item.agentcode || '-'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="inline-flex items-center gap-2 text-xs font-semibold">
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
                            {formatFeePercent(item.previousFeePercent)}
                          </span>
                          <span className="text-slate-400">→</span>
                          <span className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-cyan-700">
                            {formatFeePercent(item.nextFeePercent)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {item.changedByName || item.changedBy || item.changedByWalletAddress ? (
                          <div className="leading-tight">
                            <p className="font-semibold text-slate-700">
                              {item.changedByName || item.changedBy || '-'}
                            </p>
                            {item.changedByWalletAddress ? (
                              <p className="font-mono text-[11px] text-slate-500" title={item.changedByWalletAddress}>
                                {shortWallet(item.changedByWalletAddress)}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          '-'
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
              전체 {historyTotalCount.toLocaleString()}건 · {historyPage.toLocaleString()} / {historyTotalPages.toLocaleString()} 페이지
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (historyPage <= 1 || historyLoading) return;
                  void loadFeeRateHistories(appliedSearch, historyPage - 1);
                }}
                disabled={historyLoading || historyPage <= 1}
                className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                이전
              </button>

              {historyPageNumbers.map((page) => (
                <button
                  key={`history-page-${page}`}
                  type="button"
                  onClick={() => {
                    if (historyLoading || page === historyPage) return;
                    void loadFeeRateHistories(appliedSearch, page);
                  }}
                  disabled={historyLoading || page === historyPage}
                  className={`inline-flex h-8 min-w-[32px] items-center justify-center rounded-md border px-2 text-xs font-semibold transition ${
                    page === historyPage
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                  } disabled:cursor-not-allowed disabled:opacity-80`}
                >
                  {page}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  if (historyLoading || historyPage >= historyTotalPages) return;
                  void loadFeeRateHistories(appliedSearch, historyPage + 1);
                }}
                disabled={historyLoading || historyPage >= historyTotalPages}
                className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                다음
              </button>
            </div>
          </div>
        </section>
      </div>

      {editingAgent && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-[2px] sm:items-center">
          <button
            type="button"
            aria-label="수수료율 설정 닫기"
            onClick={closeFeeModal}
            className="absolute inset-0"
          />

          <div className="relative w-full max-w-md rounded-2xl border border-cyan-200 bg-white p-5 shadow-[0_35px_80px_-40px_rgba(6,182,212,0.75)]">
            <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold text-cyan-700">
              플랫폼 수수료율 설정
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {editingAgent.agentLogo ? (
                  <Image
                    src={editingAgent.agentLogo}
                    alt={editingAgent.agentName || editingAgent.agentcode || 'agent'}
                    fill
                    className="object-contain"
                    sizes="40px"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
                    {(editingAgent.agentName || editingAgent.agentcode || 'AG').slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {editingAgent.agentName || '-'} ({editingAgent.agentcode || '-'})
              </h3>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              수수료율은 소수점 2자리까지 입력할 수 있습니다. 이 값은 P2P 거래 시 셀러 판매수량 기준 플랫폼 수수료 전송 비율로 사용됩니다.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              현재 설정값: {initialFeePercent.toFixed(2)}%
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <label htmlFor="platform-fee-percent-input" className="text-xs font-semibold text-slate-600">
                플랫폼 수수료율(%)
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="platform-fee-percent-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  value={feePercentInput}
                  onChange={(event) => setFeePercentInput(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500"
                />
                <span className="text-sm font-bold text-slate-600">%</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">허용 범위: 0.00 ~ 100.00 (소수점 2자리)</p>
            </div>

            {feeModalError && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {feeModalError}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeFeeModal}
                disabled={savingFeePercent}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  void savePlatformFeePercent();
                }}
                disabled={savingFeePercent || isFeePercentUnchanged}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-cyan-700 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingFeePercent ? '저장 중...' : isFeePercentUnchanged ? '변경사항 없음' : '저장하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
