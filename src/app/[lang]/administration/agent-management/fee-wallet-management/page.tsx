'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';

type AgentFeeWalletItem = {
  _id?: string;
  agentcode?: string;
  agentName?: string;
  agentLogo?: string;
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

const BALANCE_POLLING_MS = 15000;

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

const normalizeAgent = (item: unknown): AgentFeeWalletItem => {
  const source = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
  const creditWalletSource =
    typeof source.creditWallet === 'object' && source.creditWallet !== null
      ? (source.creditWallet as Record<string, unknown>)
      : {};
  // Fallback legacy top-level fields while old documents are migrating.
  const legacySmartAccountAddress = String(source.smartAccountAddress || '').trim();
  return {
    _id: String(source._id || ''),
    agentcode: String(source.agentcode || ''),
    agentName: String(source.agentName || ''),
    agentLogo: String(source.agentLogo || ''),
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
  const [agents, setAgents] = useState<AgentFeeWalletItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [creatingAgentCode, setCreatingAgentCode] = useState('');
  const [copiedWalletAddress, setCopiedWalletAddress] = useState('');

  const [balancesByAgentcode, setBalancesByAgentcode] = useState<Record<string, FeeWalletBalanceItem>>({});
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [lastBalanceUpdatedAt, setLastBalanceUpdatedAt] = useState('');

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

  useEffect(() => {
    void loadAgents('');
  }, [loadAgents]);

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

  return (
    <main className="container mx-auto min-h-[100vh] max-w-screen-2xl bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 pb-10 text-slate-800">
      <div className="w-full py-0">
        <div className="mb-4 flex w-full items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Image src="/icon-agent.png" alt="Agent" width={35} height={35} className="h-6 w-6" />
            <div>
              <p className="text-lg font-semibold text-slate-900">수수료 지급용 지갑 관리</p>
              <p className="text-xs text-slate-500">에이전트별로 플랫폼 수수료를 지급하기 위해 필요한 지갑 생성 및 실시간 USDT 잔고 조회</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Last Balance Sync</p>
            <p className="text-xs font-semibold text-slate-700">{lastBalanceUpdatedAt ? formatDateTime(lastBalanceUpdatedAt) : '-'}</p>
          </div>
        </div>

        <header className="mb-4 flex w-full flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
          <p className="text-sm text-slate-600">플랫폼 수수료 지급용 smartAccountAddress가 없는 에이전트는 즉시 수수료지갑을 생성할 수 있습니다.</p>
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
            <table className="min-w-[1040px] w-full table-fixed">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="w-[220px] px-3 py-3">에이전트</th>
                  <th className="w-[320px] px-3 py-3">지갑주소</th>
                  <th className="w-[170px] px-3 py-3 text-right">USDT 잔고</th>
                  <th className="w-[160px] px-3 py-3 text-center">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-700">
                {loading ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-500" colSpan={4}>
                      에이전트 목록을 불러오는 중입니다...
                    </td>
                  </tr>
                ) : agents.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-500" colSpan={4}>
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
      </div>
    </main>
  );
}
