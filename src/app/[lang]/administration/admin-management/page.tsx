'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
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

export default function AdminManagementPage() {
  const params = useParams<{ lang?: string }>();
  const router = useRouter();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';

  const [admins, setAdmins] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalCount, setTotalCount] = useState(0);

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
          <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center justify-center rounded-full border border-slate-200/70 bg-white/90 p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <Image src="/icon-back.png" alt="Back" width={20} height={20} className="rounded-full" />
            </button>
            <span className="font-semibold">관리자 관리</span>
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
                          <td className="px-4 py-2 text-slate-700 text-xs">
                            {admin?.walletAddress
                              ? `${admin.walletAddress.substring(0, 6)}...${admin.walletAddress.substring(admin.walletAddress.length - 4)}`
                              : '-'}
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
