'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';

type StoreSummaryItem = {
  id: string;
  storecode: string;
  storeName: string;
  storeLogo: string;
  paymentWalletAddress: string;
};

type StoreMemberItem = {
  id: string;
  nickname: string;
  walletAddress: string;
  verified: boolean;
  role: string;
  createdAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

export default function AdministrationStoreMemberManagementPage() {
  const params = useParams<{ lang?: string | string[] }>();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? (langParam[0] || 'ko') : (langParam || 'ko');
  const searchParams = useSearchParams();
  const storecodeFromQuery = String(searchParams?.get('storecode') || '').trim();

  const [loadingStores, setLoadingStores] = useState(false);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreSummaryItem[]>([]);
  const [selectedStorecode, setSelectedStorecode] = useState('');

  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [members, setMembers] = useState<StoreMemberItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const [deleteTargetMember, setDeleteTargetMember] = useState<StoreMemberItem | null>(null);
  const [deletingMember, setDeletingMember] = useState(false);

  const loadStores = useCallback(async () => {
    setLoadingStores(true);
    setStoresError(null);
    try {
      const response = await fetch('/api/store/getAllStores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 500,
          page: 1,
          searchStore: '',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : '가맹점 목록을 불러오지 못했습니다.',
        );
      }

      const rawStores = Array.isArray(payload?.result?.stores) ? payload.result.stores : [];
      const normalizedStores = rawStores
        .map((item: unknown) => {
          const row = isRecord(item) ? item : {};
          return {
            id: String(row._id || row.id || ''),
            storecode: String(row.storecode || '').trim(),
            storeName: String(row.storeName || row.storecode || '').trim(),
            storeLogo: String(row.storeLogo || '').trim(),
            paymentWalletAddress: String(row.paymentWalletAddress || '').trim(),
          };
        })
        .filter((store: StoreSummaryItem) => Boolean(store.storecode));

      setStores(normalizedStores);
      setSelectedStorecode((prev) => {
        if (prev && normalizedStores.some((store: StoreSummaryItem) => store.storecode === prev)) {
          return prev;
        }
        if (
          storecodeFromQuery &&
          normalizedStores.some((store: StoreSummaryItem) => store.storecode === storecodeFromQuery)
        ) {
          return storecodeFromQuery;
        }
        return normalizedStores[0]?.storecode || '';
      });
    } catch (fetchError) {
      setStores([]);
      setStoresError(fetchError instanceof Error ? fetchError.message : '가맹점 목록을 불러오지 못했습니다.');
    } finally {
      setLoadingStores(false);
    }
  }, [storecodeFromQuery]);

  const loadMembers = useCallback(async () => {
    if (!selectedStorecode) {
      setMembers([]);
      setMembersError(null);
      return;
    }

    setLoadingMembers(true);
    setMembersError(null);
    try {
      const response = await fetch('/api/user/getAllUsersByStorecode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: selectedStorecode,
          limit: 1000,
          page: 1,
          includeUnverified: true,
          includeWalletless: true,
          sortField: 'createdAt',
          requireProfile: false,
          userType: 'all',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload?.result)) {
        throw new Error(String(payload?.error || '회원 목록을 불러오지 못했습니다.'));
      }

      const rawUsers = Array.isArray(payload.result.users) ? payload.result.users : [];
      const normalizedMembers = rawUsers.map((item: unknown) => {
        const row = isRecord(item) ? item : {};
        return {
          id: String(row._id || row.id || ''),
          nickname: String(row.nickname || '').trim() || '-',
          walletAddress: String(row.walletAddress || '').trim(),
          verified: row.verified === true,
          role: String(row.role || 'member').trim() || 'member',
          createdAt: String(row.createdAt || ''),
        };
      });

      setMembers(normalizedMembers);
    } catch (fetchError) {
      setMembers([]);
      setMembersError(fetchError instanceof Error ? fetchError.message : '회원 목록을 불러오지 못했습니다.');
    } finally {
      setLoadingMembers(false);
    }
  }, [selectedStorecode]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const selectedStore = useMemo(
    () => stores.find((store) => store.storecode === selectedStorecode) || null,
    [stores, selectedStorecode],
  );

  const filteredMembers = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return members;
    return members.filter((member) => (
      member.nickname.toLowerCase().includes(normalizedKeyword) ||
      member.walletAddress.toLowerCase().includes(normalizedKeyword)
    ));
  }, [keyword, members]);

  const openDeleteModal = useCallback((member: StoreMemberItem) => {
    setDeleteTargetMember(member);
  }, []);

  const closeDeleteModal = useCallback(() => {
    if (deletingMember) return;
    setDeleteTargetMember(null);
  }, [deletingMember]);

  const deleteMember = useCallback(async () => {
    if (!selectedStorecode || !deleteTargetMember?.id || deletingMember) {
      return;
    }

    setDeletingMember(true);
    try {
      const response = await fetch('/api/user/deleteStoreMember', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: selectedStorecode,
          memberId: deleteTargetMember.id,
          walletAddress: deleteTargetMember.walletAddress,
          nickname: deleteTargetMember.nickname,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.result) {
        throw new Error(String(payload?.error || '회원 삭제에 실패했습니다.'));
      }

      setMembers((prev) => prev.filter((member) => member.id !== deleteTargetMember.id));
      setDeleteTargetMember(null);
      toast.success('회원이 삭제되었습니다.');
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : '회원 삭제에 실패했습니다.';
      setMembersError(message);
      toast.error(message);
    } finally {
      setDeletingMember(false);
    }
  }, [deleteTargetMember, deletingMember, selectedStorecode]);

  return (
    <main className="px-4 pb-10 pt-6 lg:px-6 lg:pt-8">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Store Member Management</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-bold text-slate-900">가맹점 회원 관리</h1>
            <Link
              href={`/${lang}/administration/store-management`}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            >
              가맹점 관리로 이동
            </Link>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            상단 가맹점 목록에서 하나를 선택하면 해당 가맹점의 회원 목록을 아래 표로 확인할 수 있습니다.
          </p>
        </section>

        <section className="rounded-2xl border border-cyan-200 bg-cyan-50/60 px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">가맹점 목록</h2>
            <button
              type="button"
              onClick={loadStores}
              disabled={loadingStores}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingStores ? '조회 중...' : '새로고침'}
            </button>
          </div>

          {storesError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {storesError}
            </p>
          )}

          {!storesError && stores.length === 0 && !loadingStores && (
            <p className="text-sm text-slate-600">표시할 가맹점이 없습니다.</p>
          )}

          {stores.length > 0 && (
            <div className="max-h-[230px] overflow-auto pr-1">
              <div className="flex flex-wrap gap-2">
                {stores.map((store) => {
                  const selected = store.storecode === selectedStorecode;
                  return (
                    <button
                      key={store.storecode}
                      type="button"
                      onClick={() => setSelectedStorecode(store.storecode)}
                      className={`w-[168px] rounded-lg border px-2.5 py-2 text-left transition ${
                        selected
                          ? 'border-cyan-300 bg-white shadow-[0_14px_26px_-20px_rgba(6,182,212,0.65)]'
                          : 'border-cyan-100 bg-cyan-50/30 hover:border-cyan-200 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-cyan-100 bg-white">
                          {store.storeLogo ? (
                            <span
                              className="block h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${encodeURI(store.storeLogo)})` }}
                              aria-label={store.storeName || store.storecode}
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-cyan-700">
                              SHOP
                            </span>
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-slate-900">
                            {store.storeName || store.storecode}
                          </span>
                          <span className="block truncate text-[11px] text-slate-500">
                            코드: {store.storecode}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">회원 목록</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {selectedStore
                  ? `${selectedStore.storeName || selectedStore.storecode} (${selectedStore.storecode})`
                  : '가맹점을 선택하세요.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="회원 아이디 또는 지갑주소 검색"
                className="h-9 w-60 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={loadMembers}
                disabled={loadingMembers || !selectedStorecode}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMembers ? '조회 중...' : '새로고침'}
              </button>
            </div>
          </div>

          {membersError && (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {membersError}
            </p>
          )}

          {!membersError && !selectedStorecode && (
            <p className="mt-3 text-sm text-slate-500">가맹점을 먼저 선택해 주세요.</p>
          )}

          {!membersError && selectedStorecode && !loadingMembers && filteredMembers.length === 0 && (
            <p className="mt-3 text-sm text-slate-500">조건에 맞는 회원이 없습니다.</p>
          )}

          {selectedStorecode && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-[620px] overflow-auto">
                <table className="w-full min-w-[940px] table-auto">
                  <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                      <th className="px-3 py-2">회원 아이디</th>
                      <th className="px-3 py-2">지갑주소</th>
                      <th className="px-3 py-2">상태</th>
                      <th className="px-3 py-2">권한</th>
                      <th className="px-3 py-2">등록일</th>
                      <th className="px-3 py-2">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-700">
                    {loadingMembers && (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-center text-sm text-slate-500">
                          회원 목록을 불러오는 중입니다...
                        </td>
                      </tr>
                    )}
                    {!loadingMembers && filteredMembers.map((member) => (
                      <tr key={`${member.id}-${member.walletAddress}`} className="transition hover:bg-slate-50/70">
                        <td className="px-3 py-2.5 font-semibold text-slate-900">{member.nickname}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          <div className="inline-flex items-center gap-1.5">
                            <span>{shortAddress(member.walletAddress)}</span>
                            {member.walletAddress.trim() && (
                              <span className="inline-flex h-5 items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700">
                                연동완료
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold ${
                              member.verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {member.verified ? '인증' : '미인증'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">{member.role}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{toDateTime(member.createdAt)}</td>
                        <td className="px-3 py-2.5 text-xs">
                          <button
                            type="button"
                            onClick={() => openDeleteModal(member)}
                            disabled={!member.id}
                            className="inline-flex h-7 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {deleteTargetMember && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-[2px] sm:items-center">
          <button
            type="button"
            aria-label="삭제 확인 닫기"
            onClick={closeDeleteModal}
            className="absolute inset-0"
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-rose-200 bg-white p-5 shadow-[0_35px_80px_-40px_rgba(225,29,72,0.75)]">
            <p className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700">
              회원 삭제 확인
            </p>
            <h3 className="mt-3 text-lg font-bold text-slate-900">선택한 회원을 삭제할까요?</h3>
            <p className="mt-1 text-sm text-slate-600">
              삭제 후에는 복구할 수 없습니다. 회원 정보는 삭제 이력에 기록됩니다.
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">회원 아이디</span>
                <span className="font-semibold text-slate-900">{deleteTargetMember.nickname}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-slate-500">지갑주소</span>
                <span className="font-semibold text-slate-900">{shortAddress(deleteTargetMember.walletAddress)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-slate-500">권한</span>
                <span className="font-semibold text-slate-900">{deleteTargetMember.role}</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deletingMember}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={deleteMember}
                disabled={deletingMember}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingMember ? '삭제 중...' : '삭제 확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
