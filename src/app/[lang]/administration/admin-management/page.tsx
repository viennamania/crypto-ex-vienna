'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { toast } from 'react-hot-toast';

type UserItem = {
  _id?: string;
  nickname?: string;
  walletAddress?: string;
  avatar?: string;
  email?: string;
  createdAt?: string;
  verified?: boolean;
  role?: string;
  storecode?: string;
};

type AdminWalletBalanceState = {
  loading: boolean;
  displayValue: string;
  error: string;
  lastCheckedAt: string;
  cooldownUntilMs: number;
};

const BALANCE_CHECK_COOLDOWN_MS = 10_000;

export default function AdminManagementPage() {
  const params = useParams<{ lang?: string }>();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';

  const [admins, setAdmins] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalCount, setTotalCount] = useState(0);
  const [walletBalanceByAddress, setWalletBalanceByAddress] = useState<
    Record<string, AdminWalletBalanceState>
  >({});
  const [walletCopyFeedback, setWalletCopyFeedback] = useState('');
  const [walletBalanceTickMs, setWalletBalanceTickMs] = useState(() => Date.now());

  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<UserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [modalPage, setModalPage] = useState(1);
  const modalPageSize = 10;
  const [modalTotal, setModalTotal] = useState(0);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/getAllUsersByStorecode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: '',
          limit: pageSize,
          page,
          includeUnverified: true,
          searchTerm,
          sortField: 'createdAt',
          role: 'admin',
          requireProfile: false,
        }),
      });
      const data = await res.json();
      const users: UserItem[] = data?.result?.users || [];
      setTotalCount(data?.result?.totalCount ?? users.length);
      users.sort((a, b) => {
        const aTime = new Date(a?.createdAt || 0).getTime();
        const bTime = new Date(b?.createdAt || 0).getTime();
        return bTime - aTime;
      });
      setAdmins(users);
    } catch (err) {
      console.error('Failed to fetch admins', err);
      setAdmins([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm]);

  const fetchCandidates = async () => {
    setModalLoading(true);
    try {
      const res = await fetch('/api/user/getAllUsersByStorecode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: '',
          limit: modalPageSize,
          page: modalPage,
          includeUnverified: true,
          searchTerm: modalSearch,
          sortField: 'createdAt',
          requireProfile: false,
        }),
      });
      const data = await res.json();
      const users: UserItem[] = data?.result?.users || [];
      setCandidateUsers(users);
      setModalTotal(data?.result?.totalCount ?? users.length);
    } catch (err) {
      console.error('Failed to fetch candidates', err);
      setCandidateUsers([]);
      setModalTotal(0);
    }
    setModalLoading(false);
  };

  useEffect(() => {
    if (modalOpen) {
      fetchCandidates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, modalSearch, modalPage]);

  const hasActiveWalletBalanceCooldown = useMemo(
    () =>
      Object.values(walletBalanceByAddress).some(
        (item) => Number(item?.cooldownUntilMs || 0) > walletBalanceTickMs,
      ),
    [walletBalanceByAddress, walletBalanceTickMs],
  );

  useEffect(() => {
    if (!hasActiveWalletBalanceCooldown) return;
    const interval = window.setInterval(() => {
      setWalletBalanceTickMs(Date.now());
    }, 200);
    return () => window.clearInterval(interval);
  }, [hasActiveWalletBalanceCooldown]);

  const normalizeWalletKey = (walletAddress: string) => walletAddress.trim().toLowerCase();

  const formatUsdtDisplayValue = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return value;
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    }).format(parsed);
  };

  const handleCopyWalletAddress = async (walletAddress: string) => {
    const normalizedWallet = String(walletAddress || '').trim();
    if (!normalizedWallet) return;
    const walletKey = normalizeWalletKey(normalizedWallet);
    try {
      await navigator.clipboard.writeText(normalizedWallet);
      setWalletCopyFeedback(walletKey);
      window.setTimeout(() => {
        setWalletCopyFeedback((prev) => (prev === walletKey ? '' : prev));
      }, 1500);
    } catch (error) {
      console.error('Failed to copy wallet address', error);
    }
  };

  const handleCheckAdminUsdtBalance = async (walletAddress: string) => {
    const normalizedWallet = String(walletAddress || '').trim();
    if (!normalizedWallet) return;

    const walletKey = normalizeWalletKey(normalizedWallet);
    const nowMs = Date.now();
    const currentState = walletBalanceByAddress[walletKey];
    if (currentState?.loading) return;
    if (Number(currentState?.cooldownUntilMs || 0) > nowMs) return;

    const nextCooldownUntil = nowMs + BALANCE_CHECK_COOLDOWN_MS;
    setWalletBalanceByAddress((prev) => {
      const existing = prev[walletKey];
      return {
        ...prev,
        [walletKey]: {
          loading: true,
          displayValue: existing?.displayValue || '',
          error: '',
          lastCheckedAt: existing?.lastCheckedAt || '',
          cooldownUntilMs: nextCooldownUntil,
        },
      };
    });

    try {
      const response = await fetch('/api/user/getUSDTBalanceByWalletAddress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: normalizedWallet,
        }),
      });
      const data = await response.json().catch(() => ({}));
      const rawDisplayValue = String(data?.result?.displayValue || data?.result?.balance || '0');
      const displayValue = formatUsdtDisplayValue(rawDisplayValue);
      const errorMessage = !response.ok
        ? String(data?.error || '잔고 조회에 실패했습니다.')
        : String(data?.error || '');

      setWalletBalanceByAddress((prev) => {
        const existing = prev[walletKey];
        return {
          ...prev,
          [walletKey]: {
            loading: false,
            displayValue,
            error: errorMessage,
            lastCheckedAt: new Date().toISOString(),
            cooldownUntilMs: existing?.cooldownUntilMs || nextCooldownUntil,
          },
        };
      });
    } catch (error) {
      console.error('Failed to fetch admin USDT balance', error);
      setWalletBalanceByAddress((prev) => {
        const existing = prev[walletKey];
        return {
          ...prev,
          [walletKey]: {
            loading: false,
            displayValue: existing?.displayValue || '',
            error: '잔고 조회 중 오류가 발생했습니다.',
            lastCheckedAt: existing?.lastCheckedAt || '',
            cooldownUntilMs: existing?.cooldownUntilMs || nextCooldownUntil,
          },
        };
      });
    }
  };

  const handleRoleChange = async () => {
    if (!selectedUser?.walletAddress) {
      toast.error('관리자로 지정할 회원을 선택하세요.');
      return;
    }
    const willDemote = (selectedUser.role || '').toLowerCase() === 'admin';
    const nextRole = willDemote ? 'user' : 'admin';
    setPromoting(true);
    try {
      const res = await fetch('/api/user/updateUserRole', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: selectedUser.storecode || 'admin',
          walletAddress: selectedUser.walletAddress,
          role: nextRole,
        }),
      });
      if (!res.ok) {
        const msg = (await res.json())?.error || '관리자 지정에 실패했습니다.';
        toast.error(msg);
        setPromoting(false);
        return;
      }
      toast.success(willDemote ? '관리자 해제되었습니다.' : '관리자로 추가되었습니다.');
      setModalOpen(false);
      setSelectedUser(null);
      setModalSearch('');
      setModalPage(1);
      await fetchAdmins();
      await fetchCandidates();
    } catch (err) {
      console.error('Promote admin failed', err);
      toast.error('관리자 지정/해제에 실패했습니다.');
    }
    setPromoting(false);
  };

  return (
    <>
      <main className="p-6 min-h-[100vh] flex items-start justify-center container max-w-screen-2xl mx-auto bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
        <div className="w-full">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-900">관리자 관리</span>
            <button
              type="button"
              onClick={fetchAdmins}
              disabled={loading}
              className={`ml-auto inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition ${
                loading ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 hover:shadow-md'
              }`}
            >
              {loading ? (
                <svg
                  className="h-3.5 w-3.5 animate-spin text-slate-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" className="opacity-25" />
                  <path d="M12 2a10 10 0 0 1 10 10" className="opacity-75" />
                </svg>
              ) : (
                <svg
                  className="h-3.5 w-3.5 text-slate-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 2v6h-6" />
                  <path d="M3 22v-6h6" />
                  <path d="M21 8a9 9 0 0 0-15-6.7L3 5" />
                  <path d="M3 16a9 9 0 0 0 15 6.7L21 19" />
                </svg>
              )}
              새로고침
            </button>
          </div>

          <div className="w-full rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Image src="/icon-user.png" alt="Admin" width={24} height={24} className="h-6 w-6" />
                <h2 className="text-lg font-bold text-slate-900">관리자 목록</h2>
              </div>
              <span className="text-sm font-semibold text-slate-600">
                {admins.length} / {totalCount} 명
              </span>
              <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm sm:min-w-[260px]">
                  <Image src="/icon-search.png" alt="Search" width={16} height={16} className="h-4 w-4 opacity-70" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    placeholder="닉네임, 지갑주소 검색"
                    className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  관리자 추가/해제하기
                </button>
              </div>
            </div>

            <div className="mt-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Image src="/icon-loading.png" alt="Loading" width={18} height={18} className="h-4 w-4 animate-spin" />
                  관리자 목록을 불러오는 중입니다.
                </div>
              ) : admins.length === 0 ? (
                <div className="text-sm text-slate-500">등록된 관리자가 없습니다.</div>
              ) : (
                <table className="min-w-full border-collapse border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                  <thead className="bg-slate-50 text-slate-700 text-xs font-bold uppercase border-b">
                    <tr>
                      <th className="px-4 py-2 text-left">회원</th>
                      <th className="px-4 py-2 text-left">지갑주소</th>
                      <th className="px-4 py-2 text-left">상태</th>
                      <th className="px-4 py-2 text-left">등록일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((admin, idx) => {
                      const createdAt = admin?.createdAt ? new Date(admin.createdAt).toLocaleString() : '-';
                      const avatar = admin?.avatar || '/profile-default.png';
                      const initials = (admin?.nickname || admin?.walletAddress || 'NA').replace(/^0x/i, '').slice(0, 2).toUpperCase();
                      const walletAddress = admin?.walletAddress || '';
                      const walletKey = walletAddress ? normalizeWalletKey(walletAddress) : '';
                      const walletBalanceState = walletKey ? walletBalanceByAddress[walletKey] : undefined;
                      const cooldownRemainingMs = Math.max(
                        0,
                        Number(walletBalanceState?.cooldownUntilMs || 0) - walletBalanceTickMs,
                      );
                      const cooldownRemainingSeconds =
                        cooldownRemainingMs > 0 ? Math.ceil(cooldownRemainingMs / 1000) : 0;
                      const cooldownProgressPercent = Math.max(
                        0,
                        Math.min(100, (cooldownRemainingMs / BALANCE_CHECK_COOLDOWN_MS) * 100),
                      );
                      const walletPreview = walletAddress
                        ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`
                        : '-';
                      return (
                        <tr key={idx} className="border-b hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-white">
                                {admin?.avatar ? (
                                  <Image src={avatar} alt="Profile" fill sizes="40px" className="object-cover" />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-xs font-semibold tracking-[0.12em]">
                                    {initials}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-slate-900">{admin?.nickname || '-'}</span>
                                <span className="text-[11px] text-slate-500">관리자</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-700">
                            <div className="flex min-w-[220px] flex-col gap-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs text-slate-700">{walletPreview}</span>
                                {walletAddress ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleCopyWalletAddress(walletAddress);
                                    }}
                                    className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                                  >
                                    복사
                                  </button>
                                ) : null}
                                {walletKey && walletCopyFeedback === walletKey && (
                                  <span className="text-[10px] font-semibold text-emerald-600">복사됨</span>
                                )}
                              </div>
                              {walletAddress ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    {cooldownRemainingMs <= 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void handleCheckAdminUsdtBalance(walletAddress);
                                        }}
                                        disabled={Boolean(walletBalanceState?.loading)}
                                        className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                                          walletBalanceState?.loading
                                            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                            : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100'
                                        }`}
                                      >
                                        {walletBalanceState?.loading ? '조회중...' : '잔고확인'}
                                      </button>
                                    ) : (
                                      <div className="w-[130px] rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1">
                                        <div className="flex items-center justify-between text-[10px] font-semibold text-indigo-700">
                                          <span>재조회 대기</span>
                                          <span>{cooldownRemainingSeconds}s</span>
                                        </div>
                                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/90">
                                          <div
                                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-[width] duration-200 ease-linear"
                                            style={{ width: `${cooldownProgressPercent.toFixed(2)}%` }}
                                          />
                                        </div>
                                      </div>
                                    )}
                                    <span
                                      className={`text-[11px] font-semibold ${
                                        walletBalanceState?.error ? 'text-rose-600' : 'text-slate-700'
                                      }`}
                                    >
                                      {walletBalanceState?.error
                                        ? '조회실패'
                                        : walletBalanceState?.displayValue
                                        ? `${walletBalanceState.displayValue} USDT`
                                        : '잔고 미조회'}
                                    </span>
                                  </div>
                                  {walletBalanceState?.lastCheckedAt && (
                                    <span className="text-[10px] text-slate-500">
                                      조회시각 {new Date(walletBalanceState.lastCheckedAt).toLocaleTimeString()}
                                    </span>
                                  )}
                                  {walletBalanceState?.error && (
                                    <span className="text-[10px] text-rose-500">{walletBalanceState.error}</span>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                admin?.verified
                                  ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200/80 bg-slate-50 text-slate-600'
                              }`}
                            >
                              {admin?.verified ? '인증됨' : '미인증'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-600">{createdAt}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {!loading && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                <span>
                  {totalCount === 0
                    ? '0건'
                    : `${(page - 1) * pageSize + 1} - ${Math.min(page * pageSize, totalCount)} / ${totalCount}건`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      page <= 1 || loading
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                    }`}
                  >
                    ← 이전
                  </button>
                  <span className="px-2 text-xs font-semibold text-slate-500">페이지 {page}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const maxPage = Math.max(1, Math.ceil(totalCount / pageSize));
                      setPage((p) => Math.min(maxPage, p + 1));
                    }}
                    disabled={page >= Math.ceil(totalCount / pageSize) || loading}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      page >= Math.ceil(totalCount / pageSize) || loading
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                    }`}
                  >
                    다음 →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Admin</p>
                <h3 className="text-lg font-bold text-slate-900">관리자 추가/해제</h3>
              </div>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setSelectedUser(null);
                  setModalSearch('');
                  setModalPage(1);
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-hidden px-5 pb-5 pt-3 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Image src="/icon-search.png" alt="Search" width={16} height={16} className="h-4 w-4 opacity-70" />
                <input
                  value={modalSearch}
                  onChange={(e) => {
                    setModalSearch(e.target.value);
                    setModalPage(1);
                  }}
                  placeholder="닉네임, 지갑주소로 검색"
                  className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
                {modalSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setModalSearch('');
                      setModalPage(1);
                    }}
                    className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                {modalLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                    <svg
                      className="h-4 w-4 animate-spin text-slate-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" className="opacity-25" />
                      <path d="M12 2a10 10 0 0 1 10 10" className="opacity-75" />
                    </svg>
                    검색 중...
                  </div>
                ) : candidateUsers.length === 0 ? (
                  <div className="text-sm text-slate-500 py-4">검색 결과가 없습니다.</div>
                ) : (
                  candidateUsers.map((user) => {
                    const avatar = user?.avatar || '/profile-default.png';
                    const initials = (user?.nickname || user?.walletAddress || 'NA').replace(/^0x/i, '').slice(0, 2).toUpperCase();
                    return (
                      <button
                        key={user.walletAddress}
                        onClick={() => setSelectedUser(user)}
                        className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-left shadow-sm transition ${
                          selectedUser?.walletAddress === user.walletAddress
                            ? 'border-emerald-300 bg-emerald-50 shadow-md'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                        }`}
                      >
                        <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-white">
                          {user?.avatar ? (
                            <Image src={avatar} alt="Profile" fill sizes="40px" className="object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-xs font-semibold tracking-[0.12em]">
                              {initials}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {user?.nickname || '닉네임 없음'}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 truncate">
                            {user?.walletAddress}
                          </p>
                          <div className="flex items-center gap-1">
                            <p className="text-[11px] text-slate-500 truncate">
                              현재 권한: {user?.role || '일반'}
                            </p>
                            {(user?.role || '').toLowerCase() === 'admin' && (
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                관리자
                              </span>
                            )}
                          </div>
                        </div>
                        {selectedUser?.walletAddress === user.walletAddress && (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                            선택됨
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>
                  {modalTotal === 0
                    ? '0건'
                    : `${(modalPage - 1) * modalPageSize + 1} - ${Math.min(modalPage * modalPageSize, modalTotal)} / ${modalTotal}건`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalPage((p) => Math.max(1, p - 1))}
                    disabled={modalPage <= 1 || modalLoading}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      modalPage <= 1 || modalLoading
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                    }`}
                  >
                    이전
                  </button>
                  <span className="text-xs font-semibold text-slate-500">페이지 {modalPage}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const maxPage = Math.max(1, Math.ceil(modalTotal / modalPageSize));
                      setModalPage((p) => Math.min(maxPage, p + 1));
                    }}
                    disabled={modalPage >= Math.ceil(modalTotal / modalPageSize) || modalLoading}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      modalPage >= Math.ceil(modalTotal / modalPageSize) || modalLoading
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                    }`}
                  >
                    다음
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setSelectedUser(null);
                    setModalSearch('');
                    setModalPage(1);
                  }}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={promoting || !selectedUser}
                  onClick={handleRoleChange}
                  className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                    promoting || !selectedUser
                      ? 'cursor-not-allowed bg-emerald-100 text-emerald-300'
                      : (selectedUser?.role || '').toLowerCase() === 'admin'
                      ? 'bg-rose-600 text-white hover:bg-rose-500'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  {promoting
                    ? '저장 중...'
                    : (selectedUser?.role || '').toLowerCase() === 'admin'
                    ? '관리자 해제'
                    : '관리자로 지정'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
