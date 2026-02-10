'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';

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

const emptyForm: Agent = {
  agentName: '',
  agentDescription: '',
  agentLogo: '',
  adminWalletAddress: '',
};

export default function AgentManagementPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<Agent>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [adminUsers, setAdminUsers] = useState<{ walletAddress: string; nickname?: string; avatar?: string }[]>([]);
  const [adminUserLoading, setAdminUserLoading] = useState(false);
  const [adminUserQuery, setAdminUserQuery] = useState('');
  const [showAdminModal, setShowAdminModal] = useState(false);

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

  const loadAgents = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/agents?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('에이전트 목록을 불러오지 못했습니다.');
      const data = await res.json();
      setAgents(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
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
    fetchAdminUsers();
  }, []);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id?: string, agentcode?: string) => {
    if (!id && !agentcode) return;
    if (!confirm('이 에이전트를 삭제할까요?')) return;
    setSaving(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (id) params.set('id', id);
      if (agentcode) params.set('agentcode', agentcode);
      const res = await fetch(`/api/agents?${params.toString()}`, { method: 'DELETE' });
      if (!res.ok) {
        const msg = (await res.json())?.error || '삭제에 실패했습니다.';
        throw new Error(msg);
      }
      await loadAgents();
      if (editingId === id) {
        setForm(emptyForm);
        setEditingId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (agent: Agent) => {
    setForm({
      agentcode: agent.agentcode,
      agentName: agent.agentName,
      agentDescription: agent.agentDescription ?? '',
      agentLogo: agent.agentLogo ?? '',
      adminWalletAddress: agent.adminWalletAddress ?? '',
    });
    setEditingId(agent._id ?? null);
  };

  const filteredAdminUsers = useMemo(() => {
    const q = adminUserQuery.trim().toLowerCase();
    if (!q) return adminUsers;
    return adminUsers.filter((u) => {
      const text = `${u.nickname || ''} ${u.walletAddress}`.toLowerCase();
      return text.includes(q);
    });
  }, [adminUsers, adminUserQuery]);

  const selectedAdminLabel = useMemo(() => {
    if (!form.adminWalletAddress) return '선택 안 됨';
    const match = adminUsers.find((u) => u.walletAddress === form.adminWalletAddress);
    if (match?.nickname) return `${match.nickname} · ${form.adminWalletAddress}`;
    return form.adminWalletAddress;
  }, [form.adminWalletAddress, adminUsers]);

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
      amber: 'from-amber-400/80 to-orange-500/80 shadow-orange-200/70 text-white',
      emerald: 'from-emerald-400/80 to-emerald-600/80 shadow-emerald-200/70 text-white',
      indigo: 'from-indigo-400/80 to-indigo-600/80 shadow-indigo-200/70 text-white',
    } as const;
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-slate-900 text-white shadow-[0_25px_70px_-40px_rgba(15,23,42,0.8)]">
        <div className={`absolute inset-0 bg-gradient-to-br ${toneMap[tone]} opacity-90`} />
        <div className="relative p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/80">{label}</p>
          <p className="mt-3 text-3xl font-bold leading-tight">{value}</p>
          <p className="mt-2 text-sm text-white/80">{hint}</p>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.08),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(251,146,60,0.08),transparent_32%),linear-gradient(180deg,#f8fafc,#fff)] px-4 pb-14 pt-10 sm:px-6 lg:px-12">
        <div className="mx-auto max-w-6xl space-y-8">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
                Administration
              </p>
              <h1 className="mt-1 text-3xl font-bold text-slate-900 sm:text-4xl">Agent Management</h1>
              <p className="mt-2 text-sm text-slate-600">
                에이전트 온보딩 · 수정 · 삭제를 한 곳에서 관리합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => window.history.back()}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
              >
                ← 뒤로가기
              </button>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadAgents()}
                placeholder="에이전트명 / 코드 검색"
                className="w-64 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
              />
              <button
                onClick={loadAgents}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                새로고침
              </button>
            </div>
          </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.55)] backdrop-blur">
            <div className="flex items-center justify-between px-2 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
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
                        {agent.adminWalletAddress
                          ? (
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
                          )
                          : '-'}
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
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(agent)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            편집
                          </button>
                          <button
                            onClick={() => handleDelete(agent._id, agent.agentcode)}
                            className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4 rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.55)] backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
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
              <div className="flex items-center gap-3">
                <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {form.agentLogo ? (
                      <Image
                        src={form.agentLogo}
                        alt="Agent logo"
                        fill
                        className="object-contain"
                        sizes="64px"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                        없음
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
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
                      className="text-sm"
                    />
                    <p className="text-[11px] text-slate-500">이미지 선택 시 Vercel Blob으로 자동 업로드됩니다.</p>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">관리 지갑 선택</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
                >
                  목록에서 선택
                </button>
                <span className="truncate text-xs font-semibold text-slate-600">{selectedAdminLabel}</span>
              </div>
              <p className="text-[11px] text-slate-500">
                storecode=admin 회원 목록에서 관리 지갑을 선택합니다.
              </p>
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
              disabled={saving || uploadingLogo}
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
      </div>
    </div>

    {showAdminModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Admin Wallets</p>
              <h3 className="text-lg font-bold text-slate-900">관리 지갑 선택</h3>
            </div>
            <button
              onClick={() => setShowAdminModal(false)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
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
                    setForm((prev) => ({ ...prev, adminWalletAddress: user.walletAddress }));
                    setShowAdminModal(false);
                  }}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
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
                      {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
                    </p>
                  </div>
                  {form.adminWalletAddress === user.walletAddress && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      선택됨
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
