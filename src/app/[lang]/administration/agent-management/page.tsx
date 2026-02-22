'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useActiveAccount } from 'thirdweb/react';

type Agent = {
  _id?: string;
  agentcode?: string;
  agentName: string;
  agentDescription?: string;
  agentLogo?: string;
  adminWalletAddress?: string;
  adminNickname?: string;
  adminAvatar?: string;
  createdAt?: string;
  updatedAt?: string;
};

type AdminWalletHistoryItem = {
  id: string;
  agentcode: string;
  agentName: string;
  agentLogo?: string;
  previousAdminWalletAddress: string;
  previousAdminNickname?: string;
  previousAdminAvatar?: string;
  nextAdminWalletAddress: string;
  nextAdminNickname?: string;
  nextAdminAvatar?: string;
  changedByWalletAddress?: string;
  changedByName?: string;
  changedAt: string;
};

type AgentEditSnapshot = {
  agentName: string;
  agentDescription: string;
  agentLogo: string;
};

const emptyForm: Agent = {
  agentName: '',
  agentDescription: '',
  agentLogo: '',
};

const shortWallet = (value?: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR');
};

const normalizeAgentFormForCompare = (value: Partial<Agent>): AgentEditSnapshot => ({
  agentName: String(value.agentName || '').trim(),
  agentDescription: String(value.agentDescription || '').trim(),
  agentLogo: String(value.agentLogo || '').trim(),
});

const HISTORY_PAGE_SIZE = 20;
const HISTORY_PAGE_WINDOW = 5;

export default function AgentManagementPage() {
  const activeAccount = useActiveAccount();
  const connectedWalletAddress = String(activeAccount?.address || '').trim();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<Agent>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSnapshot, setEditingSnapshot] = useState<AgentEditSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [adminUsers, setAdminUsers] = useState<{ walletAddress: string; nickname?: string; avatar?: string }[]>([]);
  const [adminUserLoading, setAdminUserLoading] = useState(false);
  const [adminUserQuery, setAdminUserQuery] = useState('');
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [walletModalAgent, setWalletModalAgent] = useState<Agent | null>(null);
  const [selectedAdminWalletAddress, setSelectedAdminWalletAddress] = useState('');
  const [walletChanging, setWalletChanging] = useState(false);
  const [walletChangeError, setWalletChangeError] = useState<string | null>(null);
  const [adminWalletHistories, setAdminWalletHistories] = useState<AdminWalletHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyAppliedSearch, setHistoryAppliedSearch] = useState('');
  const [connectedAdminNickname, setConnectedAdminNickname] = useState('');

  const stats = useMemo(() => {
    const total = agents.length;
    const latest24h = agents.filter((a) => {
      if (!a.createdAt) return false;
      return Date.now() - new Date(a.createdAt).getTime() < 24 * 60 * 60 * 1000;
    }).length;
    return {
      total,
      latest24h,
    };
  }, [agents]);

  const loadAdminWalletHistories = async (searchText = '', pageNumber = 1) => {
    const normalizedSearch = searchText.trim();
    const normalizedPage = Math.max(1, Number(pageNumber) || 1);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch('/api/agent/admin-wallet-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list',
          page: normalizedPage,
          limit: HISTORY_PAGE_SIZE,
          search: normalizedSearch,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(payload?.error || '관리 지갑 변경 이력을 불러오지 못했습니다.'));
      }
      const result =
        payload && typeof payload === 'object' && payload.result && typeof payload.result === 'object'
          ? payload.result
          : {};
      const items = Array.isArray((result as any).items) ? (result as any).items : [];
      const resolvedTotalPages = Math.max(1, Number((result as any).totalPages || 1) || 1);
      const resolvedPage = Math.min(Math.max(1, Number((result as any).page || normalizedPage) || normalizedPage), resolvedTotalPages);
      const resolvedTotalCount = Math.max(0, Number((result as any).totalCount || 0) || 0);
      const normalizedItems: AdminWalletHistoryItem[] = items.map((item: any) => ({
        id: String(item?.id || item?._id || ''),
        agentcode: String(item?.agentcode || ''),
        agentName: String(item?.agentName || ''),
        agentLogo: String(item?.agentLogo || ''),
        previousAdminWalletAddress: String(item?.previousAdminWalletAddress || ''),
        previousAdminNickname: String(item?.previousAdminNickname || ''),
        previousAdminAvatar: String(item?.previousAdminAvatar || ''),
        nextAdminWalletAddress: String(item?.nextAdminWalletAddress || ''),
        nextAdminNickname: String(item?.nextAdminNickname || ''),
        nextAdminAvatar: String(item?.nextAdminAvatar || ''),
        changedByWalletAddress: String(item?.changedByWalletAddress || ''),
        changedByName: String(item?.changedByName || ''),
        changedAt: String(item?.changedAt || ''),
      }));
      setAdminWalletHistories(normalizedItems);
      setHistoryPage(resolvedPage);
      setHistoryTotalPages(resolvedTotalPages);
      setHistoryTotalCount(resolvedTotalCount);
      setHistoryAppliedSearch(normalizedSearch);
    } catch (e) {
      setAdminWalletHistories([]);
      setHistoryError(e instanceof Error ? e.message : '관리 지갑 변경 이력을 불러오지 못했습니다.');
      setHistoryPage(1);
      setHistoryTotalPages(1);
      setHistoryTotalCount(0);
      setHistoryAppliedSearch(normalizedSearch);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadAgents = async (searchText?: string) => {
    const normalizedSearch = String(searchText ?? search).trim();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (normalizedSearch) params.set('search', normalizedSearch);
      const res = await fetch(`/api/agents?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('에이전트 목록을 불러오지 못했습니다.');
      const data = await res.json();
      setAgents(data.items ?? []);
      await loadAdminWalletHistories(normalizedSearch, 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAgents('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchAdminUsers = async () => {
      setAdminUserLoading(true);
      try {
        const res = await fetch('/api/user/getAllUsersByStorecode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storecode: 'admin',
            limit: 300,
            page: 1,
            includeUnverified: true,
          }),
        });
        if (!res.ok) {
          throw new Error('관리 지갑 목록을 불러오지 못했습니다.');
        }
        const data = await res.json();
        const items =
          Array.isArray(data?.result?.users) ? data.result.users : Array.isArray(data?.result) ? data.result : [];
        const normalized = items
          .map((u: any) => ({
            walletAddress: u?.walletAddress || '',
            nickname: u?.nickname || u?.user?.nickname || '',
            avatar: u?.avatar || u?.user?.avatar || '',
          }))
          .filter((u: any) => u.walletAddress);
        setAdminUsers(normalized);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setAdminUserLoading(false);
      }
    };
    void fetchAdminUsers();
  }, []);

  useEffect(() => {
    if (!connectedWalletAddress) {
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
            walletAddress: connectedWalletAddress,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String((payload as Record<string, unknown>)?.error || 'ADMIN_PROFILE_NOT_FOUND'));
        }
        if (!active) return;
        const result =
          payload && typeof payload === 'object' && payload.result && typeof payload.result === 'object'
            ? (payload.result as Record<string, unknown>)
            : {};
        setConnectedAdminNickname(String(result.nickname || '').trim());
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

  const handleSave = async () => {
    if (!form.agentName.trim()) {
      setError('에이전트 이름은 필수입니다.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { ...form, id: editingId } : form;
      const res = await fetch('/api/agents', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = (await res.json())?.error || '저장에 실패했습니다.';
        throw new Error(msg);
      }
      await loadAgents();
      setForm(emptyForm);
      setEditingId(null);
      setEditingSnapshot(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (agent: Agent) => {
    const nextForm: Agent = {
      agentcode: agent.agentcode,
      agentName: agent.agentName,
      agentDescription: agent.agentDescription ?? '',
      agentLogo: agent.agentLogo ?? '',
    };
    setForm(nextForm);
    setEditingId(agent._id ?? null);
    setEditingSnapshot(normalizeAgentFormForCompare(nextForm));
  };

  const filteredAdminUsers = useMemo(() => {
    const q = adminUserQuery.trim().toLowerCase();
    if (!q) return adminUsers;
    return adminUsers.filter((u) => {
      const text = `${u.nickname || ''} ${u.walletAddress}`.toLowerCase();
      return text.includes(q);
    });
  }, [adminUsers, adminUserQuery]);

  const selectedAdminForModal = useMemo(
    () => adminUsers.find((u) => u.walletAddress === selectedAdminWalletAddress),
    [adminUsers, selectedAdminWalletAddress],
  );

  const isEditUnchanged = useMemo(() => {
    if (!editingId || !editingSnapshot) {
      return false;
    }
    const current = normalizeAgentFormForCompare(form);
    return (
      current.agentName === editingSnapshot.agentName
      && current.agentDescription === editingSnapshot.agentDescription
      && current.agentLogo === editingSnapshot.agentLogo
    );
  }, [editingId, editingSnapshot, form]);

  const historyPageNumbers = useMemo(() => {
    const total = Math.max(1, historyTotalPages);
    const current = Math.min(Math.max(1, historyPage), total);
    const halfWindow = Math.floor(HISTORY_PAGE_WINDOW / 2);

    let start = Math.max(1, current - halfWindow);
    let end = Math.min(total, start + HISTORY_PAGE_WINDOW - 1);
    start = Math.max(1, end - HISTORY_PAGE_WINDOW + 1);

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [historyPage, historyTotalPages]);

  const openAdminWalletModal = (agent: Agent) => {
    setWalletModalAgent(agent);
    setSelectedAdminWalletAddress(String(agent.adminWalletAddress || '').trim());
    setAdminUserQuery('');
    setWalletChangeError(null);
    setShowAdminModal(true);
  };

  const closeAdminWalletModal = () => {
    if (walletChanging) return;
    setShowAdminModal(false);
    setWalletModalAgent(null);
    setSelectedAdminWalletAddress('');
    setWalletChangeError(null);
    setAdminUserQuery('');
  };

  const applyAdminWalletChange = async () => {
    const agentcode = String(walletModalAgent?.agentcode || '').trim();
    const nextAdminWalletAddress = String(selectedAdminWalletAddress || '').trim();
    const currentAdminWalletAddress = String(walletModalAgent?.adminWalletAddress || '').trim();

    if (!agentcode) {
      setWalletChangeError('에이전트 코드가 없어 변경할 수 없습니다.');
      return;
    }
    if (!nextAdminWalletAddress) {
      setWalletChangeError('변경할 관리 지갑을 선택해 주세요.');
      return;
    }
    if (currentAdminWalletAddress.toLowerCase() === nextAdminWalletAddress.toLowerCase()) {
      setWalletChangeError('기존 관리 지갑과 동일합니다.');
      return;
    }

    setWalletChanging(true);
    setWalletChangeError(null);

    try {
      const response = await fetch('/api/agent/admin-wallet-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update',
          agentcode,
          nextAdminWalletAddress,
          changedByWalletAddress: connectedWalletAddress,
          changedByName: connectedAdminNickname,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '관리 지갑 변경에 실패했습니다.'));
      }

      await loadAgents(search);
      closeAdminWalletModal();
    } catch (e) {
      setWalletChangeError(e instanceof Error ? e.message : '관리 지갑 변경에 실패했습니다.');
    } finally {
      setWalletChanging(false);
    }
  };

  const AccentCard = ({
    label,
    value,
    hint,
    tone,
  }: {
    label: string;
    value: string;
    hint: string;
    tone: 'amber' | 'emerald' | 'indigo';
  }) => {
    const toneMap = {
      amber: 'text-slate-900',
      emerald: 'text-slate-900',
      indigo: 'text-slate-900',
    } as const;
    return (
      <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
        <p className={`mt-2 text-2xl font-bold leading-tight ${toneMap[tone]}`}>{value}</p>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      </div>
    );
  };

  return (
    <>
      <main className="p-4 pb-10 min-h-[100vh] flex items-start justify-center container max-w-screen-2xl mx-auto bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
        <div className="py-0 w-full">
          <div className="w-full flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm mb-4">
            <div className="flex items-center gap-3">
              <Image
                src="/icon-agent.png"
                alt="Agent"
                width={35}
                height={35}
                className="w-6 h-6"
              />
              <div className="text-lg font-semibold text-slate-900">
                에이전트 관리
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total
              </span>
              <span className="text-2xl font-semibold text-slate-900 tabular-nums">
                {agents.length || 0}
              </span>
            </div>
          </div>

          <header className="w-full flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm mb-4 xl:flex-row xl:items-center xl:justify-between">
            <p className="text-sm text-slate-600">
              에이전트 온보딩과 수정을 한 곳에서 관리합니다.
            </p>
            <div className="flex w-full flex-wrap items-center justify-start gap-2 xl:w-auto xl:justify-end">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void loadAgents(search);
                  }
                }}
                placeholder="에이전트명 / 코드 검색"
                className="w-64 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
              />
              <button
                onClick={() => {
                  void loadAgents(search);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                새로고침
              </button>
            </div>
          </header>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <AccentCard
              label="전체 에이전트"
              value={`${stats.total.toLocaleString()} 개`}
              hint="등록된 모든 에이전트"
              tone="indigo"
            />
            <AccentCard
              label="신규 (24h)"
              value={`${stats.latest24h.toLocaleString()} 개`}
              hint="최근 24시간 신규"
              tone="emerald"
            />
            <AccentCard
              label="작업 상태"
              value={saving ? '저장 중...' : loading ? '불러오는 중' : '정상'}
              hint={error ? error : 'API 연결 상태'}
              tone="amber"
            />
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
            <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-sm">
            <div className="flex items-center justify-between px-2 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Agents
                </p>
                <h2 className="text-xl font-bold text-slate-900">에이전트 목록</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {agents.length}개
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-4 py-3">에이전트</th>
                    <th className="px-4 py-3">관리 지갑</th>
                    <th className="px-4 py-3">설명</th>
                    <th className="px-4 py-3">생성일</th>
                    <th className="px-4 py-3 text-right">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-sm">
                  {agents.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                        {loading ? '불러오는 중...' : '등록된 에이전트가 없습니다.'}
                      </td>
                    </tr>
                  )}
                  {agents.map((agent) => (
                    <tr key={agent._id ?? agent.agentcode} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                            {agent.agentLogo ? (
                              <Image
                                src={agent.agentLogo}
                                alt={agent.agentName}
                                fill
                                className="object-contain"
                                sizes="40px"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
                                {agent.agentName?.slice(0, 2) ?? 'AG'}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{agent.agentName}</p>
                            <p className="text-xs text-slate-500">{agent.agentcode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-mono text-xs">
                        <div className="space-y-2">
                          {agent.adminWalletAddress ? (
                            <div className="flex items-center gap-2">
                              <div className="relative h-8 w-8 overflow-hidden rounded-full bg-slate-100">
                                {agent.adminAvatar ? (
                                  <Image
                                    src={agent.adminAvatar}
                                    alt={agent.adminNickname || 'avatar'}
                                    fill
                                    sizes="32px"
                                    className="object-cover"
                                  />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-slate-600">
                                    {(agent.adminNickname || agent.adminWalletAddress).slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">
                                  {agent.adminNickname || '닉네임 없음'}
                                </p>
                                <p className="text-[11px] font-mono text-slate-500">
                                  {agent.adminWalletAddress.slice(0, 6)}...{agent.adminWalletAddress.slice(-4)}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">-</p>
                          )}
                          <button
                            onClick={() => openAdminWalletModal(agent)}
                            className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-100"
                          >
                            관리 지갑 변경
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 line-clamp-2">
                        {agent.agentDescription || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {agent.createdAt
                          ? new Date(agent.createdAt).toLocaleDateString('ko-KR')
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleEdit(agent)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            편집
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

            <div className="space-y-4 rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Editor
                </p>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingId ? '에이전트 수정' : '새 에이전트 등록'}
                </h3>
                {form.agentcode && (
                  <p className="mt-1 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                    코드 자동생성: <span className="font-mono text-slate-700">{form.agentcode}</span>
                  </p>
                )}
              </div>
              {editingId && (
                <button
                  className="text-xs font-semibold text-slate-600 underline"
                  onClick={() => {
                    setForm(emptyForm);
                    setEditingId(null);
                    setEditingSnapshot(null);
                  }}
                >
                  초기화
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">
                  에이전트 이름 <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.agentName}
                  placeholder="예: 오렌지X 파트너"
                  onChange={(e) => setForm((prev) => ({ ...prev, agentName: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
              </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600">로고 업로드</label>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-start gap-3">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-1">
                    {form.agentLogo ? (
                      <Image
                        src={form.agentLogo}
                        alt="Agent logo"
                        fill
                        className="object-contain p-1"
                        sizes="80px"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                        미리보기
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingLogo(true);
                        setError(null);
                        try {
                          const res = await fetch('/api/upload', {
                            method: 'POST',
                            headers: { 'content-type': file.type || 'application/octet-stream' },
                            body: file,
                          });
                          if (!res.ok) {
                            const msg = await res.text();
                            throw new Error(msg || '업로드 실패');
                          }
                          const { url } = await res.json();
                          setForm((prev) => ({ ...prev, agentLogo: url }));
                        } catch (e) {
                          setError(e instanceof Error ? e.message : '업로드 실패');
                        } finally {
                          setUploadingLogo(false);
                        }
                      }}
                      className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-800"
                    />
                    <p className="text-[11px] text-slate-500">이미지 선택 시 자동 업로드됩니다.</p>
                    {uploadingLogo && <p className="text-[11px] font-semibold text-cyan-700">업로드 중...</p>}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">설명</label>
              <textarea
                value={form.agentDescription ?? ''}
                placeholder="에이전트 역할, 지역, 연락 방법 등 간략 소개를 입력하세요."
                  onChange={(e) => setForm((prev) => ({ ...prev, agentDescription: e.target.value }))}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {error}
              </div>
            )}

            <button
              disabled={saving || uploadingLogo || (Boolean(editingId) && isEditUnchanged)}
              onClick={handleSave}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.65)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving || uploadingLogo
                ? '처리 중...'
                : editingId
                ? '수정 완료'
                : '에이전트 등록'}
            </button>
            <p className="text-[11px] text-slate-500">
              이름은 중복될 수 없으며, 등록 후에도 언제든 세부 정보를 수정할 수 있습니다.
            </p>
            </div>
          </section>

          <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_18px_42px_-34px_rgba(15,23,42,0.4)]">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">관리 지갑 변경 이력</p>
                <p className="text-xs text-slate-500">
                  에이전트별 관리 지갑 변경 내역을 기록하고 조회합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadAdminWalletHistories(historyAppliedSearch, historyPage);
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
              <table className="min-w-[980px] w-full table-fixed">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-[180px] px-3 py-3">변경시각</th>
                    <th className="w-[240px] px-3 py-3">에이전트</th>
                    <th className="w-[220px] px-3 py-3">이전 관리 지갑</th>
                    <th className="w-[220px] px-3 py-3">변경 관리 지갑</th>
                    <th className="w-[220px] px-3 py-3">변경자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-700">
                  {historyLoading ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                        변경 이력을 불러오는 중입니다...
                      </td>
                    </tr>
                  ) : adminWalletHistories.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                        표시할 변경 이력이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    adminWalletHistories.map((item) => (
                      <tr key={item.id || `${item.agentcode}-${item.changedAt}`} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {formatDateTime(item.changedAt)}
                        </td>
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
                          <div className="flex items-center gap-2">
                            <div className="relative h-7 w-7 overflow-hidden rounded-full bg-slate-100">
                              {item.previousAdminAvatar ? (
                                <Image
                                  src={item.previousAdminAvatar}
                                  alt={item.previousAdminNickname || 'admin'}
                                  fill
                                  className="object-cover"
                                  sizes="28px"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-600">
                                  {(item.previousAdminNickname || item.previousAdminWalletAddress || 'A').slice(0, 1).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-800">
                                {item.previousAdminNickname || '-'}
                              </p>
                              <p className="truncate text-[11px] font-mono text-slate-500">
                                {shortWallet(item.previousAdminWalletAddress)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="relative h-7 w-7 overflow-hidden rounded-full bg-slate-100">
                              {item.nextAdminAvatar ? (
                                <Image
                                  src={item.nextAdminAvatar}
                                  alt={item.nextAdminNickname || 'admin'}
                                  fill
                                  className="object-cover"
                                  sizes="28px"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-600">
                                  {(item.nextAdminNickname || item.nextAdminWalletAddress || 'A').slice(0, 1).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-800">
                                {item.nextAdminNickname || '-'}
                              </p>
                              <p className="truncate text-[11px] font-mono text-slate-500">
                                {shortWallet(item.nextAdminWalletAddress)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="truncate text-xs font-semibold text-slate-700">
                            {item.changedByName || '-'}
                          </p>
                          <p className="truncate text-[11px] font-mono text-slate-500">
                            {shortWallet(item.changedByWalletAddress)}
                          </p>
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
                    if (historyLoading || historyPage <= 1) return;
                    void loadAdminWalletHistories(historyAppliedSearch, historyPage - 1);
                  }}
                  disabled={historyLoading || historyPage <= 1}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  이전
                </button>

                {historyPageNumbers.map((page) => (
                  <button
                    key={`admin-wallet-history-page-${page}`}
                    type="button"
                    onClick={() => {
                      if (historyLoading || page === historyPage) return;
                      void loadAdminWalletHistories(historyAppliedSearch, page);
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
                    void loadAdminWalletHistories(historyAppliedSearch, historyPage + 1);
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
      </main>

    {showAdminModal && walletModalAgent && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Admin Wallets</p>
              <h3 className="text-lg font-bold text-slate-900">관리 지갑 변경</h3>
              <p className="mt-1 text-xs text-slate-500">
                {walletModalAgent.agentName || '-'} ({walletModalAgent.agentcode || '-'})
              </p>
            </div>
            <button
              onClick={closeAdminWalletModal}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
          <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3 text-xs text-slate-600">
            현재 관리 지갑: <span className="font-mono font-semibold text-slate-800">{shortWallet(walletModalAgent.adminWalletAddress)}</span>
            {connectedWalletAddress ? (
              <span className="ml-2 text-slate-500">
                변경자: {connectedAdminNickname || '관리자'} ({shortWallet(connectedWalletAddress)})
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 px-5 py-3">
            <input
              value={adminUserQuery}
              onChange={(e) => setAdminUserQuery(e.target.value)}
              placeholder="닉네임 또는 지갑 주소 검색"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none placeholder:text-slate-400"
            />
            <span className="text-xs font-semibold text-slate-500">
              {adminUserLoading ? '불러오는 중...' : `${filteredAdminUsers.length}개`}
            </span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto px-5 pb-4">
            {adminUserLoading && (
              <div className="py-6 text-center text-sm text-slate-500">관리자 지갑을 불러오는 중입니다.</div>
            )}
            {!adminUserLoading && filteredAdminUsers.length === 0 && (
              <div className="py-6 text-center text-sm text-slate-500">표시할 관리 지갑이 없습니다.</div>
            )}
            <div className="grid gap-2">
              {filteredAdminUsers.map((user) => (
                <button
                  key={user.walletAddress}
                  onClick={() => {
                    setSelectedAdminWalletAddress(user.walletAddress);
                    setWalletChangeError(null);
                  }}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                    selectedAdminWalletAddress === user.walletAddress
                      ? 'border-cyan-300 bg-cyan-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="relative h-10 w-10 overflow-hidden rounded-full bg-slate-100">
                    {user.avatar ? (
                      <Image
                        src={user.avatar}
                        alt={user.nickname || 'avatar'}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    ) : user.walletAddress ? (
                      <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">
                        {(user.nickname || user.walletAddress).slice(0, 2).toUpperCase()}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {user.nickname || '닉네임 없음'}
                    </p>
                    <p className="text-xs font-mono text-slate-500">
                      {shortWallet(user.walletAddress)}
                    </p>
                  </div>
                  {selectedAdminWalletAddress === user.walletAddress && (
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                      선택됨
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          {selectedAdminForModal && (
            <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-3 text-xs text-slate-600">
              변경 대상: <span className="font-semibold text-slate-800">{selectedAdminForModal.nickname || '닉네임 없음'}</span>{' '}
              <span className="font-mono text-slate-500">({shortWallet(selectedAdminForModal.walletAddress)})</span>
            </div>
          )}
          {walletChangeError && (
            <div className="border-t border-rose-200 bg-rose-50 px-5 py-2.5 text-xs font-semibold text-rose-700">
              {walletChangeError}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
            <button
              type="button"
              onClick={closeAdminWalletModal}
              disabled={walletChanging}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                void applyAdminWalletChange();
              }}
              disabled={
                walletChanging
                || !selectedAdminWalletAddress
                || String(walletModalAgent.adminWalletAddress || '').trim().toLowerCase() === selectedAdminWalletAddress.toLowerCase()
              }
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {walletChanging ? '변경 중...' : '관리 지갑 변경'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
