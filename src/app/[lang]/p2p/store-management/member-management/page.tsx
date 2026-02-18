'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

type StoreMember = {
  id: string;
  nickname: string;
  walletAddress: string;
  password: string;
  verified: boolean;
  role: string;
  createdAt: string;
  hasBuyer: boolean;
  hasSeller: boolean;
};

type DashboardStore = {
  storecode: string;
  storeName: string;
  storeLogo: string;
  paymentWalletAddress: string;
  adminWalletAddress: string;
};

type MemberFilter = 'all' | 'verified' | 'pending';

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

const resolveMemberType = (member: StoreMember) => {
  if (member.hasBuyer && member.hasSeller) return 'Buyer+Seller';
  if (member.hasBuyer) return 'Buyer';
  if (member.hasSeller) return 'Seller';
  return 'Profile';
};

export default function P2PStoreMemberManagementPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const storecode = String(searchParams?.get('storecode') || '').trim();
  const lang = String(Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko').trim() || 'ko';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<MemberFilter>('all');
  const [store, setStore] = useState<DashboardStore | null>(null);
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [newMemberNickname, setNewMemberNickname] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberDepositName, setNewMemberDepositName] = useState('');
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [addMemberSuccess, setAddMemberSuccess] = useState<string | null>(null);
  const [passwordModalMember, setPasswordModalMember] = useState<StoreMember | null>(null);
  const [siteOrigin, setSiteOrigin] = useState('');
  const [homeUrlCopyFeedback, setHomeUrlCopyFeedback] = useState('');

  const loadMembers = useCallback(async () => {
    if (!storecode) {
      setStore(null);
      setMembers([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [storeResponse, usersResponse] = await Promise.all([
        fetch('/api/wallet/payment-usdt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'store-dashboard',
            storecode,
            limit: 1,
          }),
        }),
        fetch('/api/user/getAllUsersByStorecode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storecode,
            limit: 1000,
            page: 1,
            includeUnverified: true,
            includeWalletless: true,
            sortField: 'createdAt',
            requireProfile: false,
            userType: 'all',
          }),
        }),
      ]);

      const storeData = await storeResponse.json().catch(() => ({}));
      if (!storeResponse.ok || !isRecord(storeData?.result)) {
        throw new Error(String(storeData?.error || '가맹점 정보를 불러오지 못했습니다.'));
      }

      const storeInfo = isRecord(storeData.result.store) ? storeData.result.store : {};
      setStore({
        storecode: String(storeInfo.storecode || storecode),
        storeName: String(storeInfo.storeName || storecode),
        storeLogo: String(storeInfo.storeLogo || ''),
        paymentWalletAddress: String(storeInfo.paymentWalletAddress || ''),
        adminWalletAddress: String(storeInfo.adminWalletAddress || ''),
      });

      const usersData = await usersResponse.json().catch(() => ({}));
      if (!usersResponse.ok || !isRecord(usersData?.result)) {
        throw new Error(String(usersData?.error || '회원 목록을 불러오지 못했습니다.'));
      }

      const users = Array.isArray(usersData.result.users) ? usersData.result.users : [];
      setMembers(
        users.map((user: unknown) => {
          const member = isRecord(user) ? user : {};
          return {
            id: String(member.id || member._id || ''),
            nickname: String(member.nickname || '').trim() || '-',
            walletAddress: String(member.walletAddress || ''),
            password: String(member.password ?? '').trim(),
            verified: member.verified === true,
            role: String(member.role || 'member').trim() || 'member',
            createdAt: String(member.createdAt || ''),
            hasBuyer: isRecord(member.buyer),
            hasSeller: isRecord(member.seller),
          };
        }),
      );
    } catch (loadError) {
      setStore(null);
      setMembers([]);
      setError(loadError instanceof Error ? loadError.message : '회원 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [storecode]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSiteOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!homeUrlCopyFeedback) return;
    const timer = window.setTimeout(() => {
      setHomeUrlCopyFeedback('');
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [homeUrlCopyFeedback]);

  const openAddMemberModal = useCallback(() => {
    if (!storecode) return;
    setNewMemberNickname('');
    setNewMemberPassword('');
    setNewMemberDepositName('');
    setAddMemberError(null);
    setIsAddMemberModalOpen(true);
  }, [storecode]);

  const closeAddMemberModal = useCallback(() => {
    if (addingMember) return;
    setAddMemberError(null);
    setIsAddMemberModalOpen(false);
  }, [addingMember]);

  const submitAddMember = useCallback(async () => {
    if (!storecode || addingMember) return;

    const nickname = String(newMemberNickname || '').trim();
    const password = String(newMemberPassword || '').trim();
    const depositName = String(newMemberDepositName || '').trim();

    setAddMemberError(null);
    setAddMemberSuccess(null);

    if (!nickname) {
      setAddMemberError('회원 아이디를 입력해 주세요.');
      return;
    }
    if (!password) {
      setAddMemberError('비밀번호를 입력해 주세요.');
      return;
    }
    if (!depositName) {
      setAddMemberError('입금자명을 입력해 주세요.');
      return;
    }

    setAddingMember(true);
    try {
      const response = await fetch('/api/user/setStoreMemberWithoutWalletAddress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode,
          nickname,
          password,
          buyer: {
            bankInfo: {
              depositName,
            },
          },
        }),
      });

      const data = await response.json().catch(() => ({}));
      const resultError = isRecord(data?.result) ? String(data.result.error || '') : '';
      const rawError = String(data?.error || resultError || '').trim().toLowerCase();

      if (!response.ok || rawError) {
        if (response.status === 409 || rawError.includes('already exists') || rawError.includes('duplicate')) {
          throw new Error('이미 등록된 회원 아이디입니다.');
        }
        throw new Error(String(data?.error || resultError || '회원 추가에 실패했습니다.'));
      }

      setIsAddMemberModalOpen(false);
      setAddMemberSuccess('회원이 추가되었습니다.');
      await loadMembers();
    } catch (submitError) {
      setAddMemberError(
        submitError instanceof Error ? submitError.message : '회원 추가 처리 중 오류가 발생했습니다.',
      );
    } finally {
      setAddingMember(false);
    }
  }, [
    addingMember,
    loadMembers,
    newMemberDepositName,
    newMemberNickname,
    newMemberPassword,
    storecode,
  ]);

  const filteredMembers = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return members.filter((member) => {
      if (filter === 'verified' && !member.verified) return false;
      if (filter === 'pending' && member.verified) return false;

      if (!normalizedKeyword) return true;
      return (
        member.nickname.toLowerCase().includes(normalizedKeyword) ||
        member.walletAddress.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [members, keyword, filter]);

  const verifiedCount = useMemo(
    () => members.filter((member) => member.verified).length,
    [members],
  );

  const memberHomepagePath = useMemo(() => {
    if (!storecode) return '';
    return `/${lang}/wallet-management?storecode=${encodeURIComponent(storecode)}`;
  }, [lang, storecode]);

  const memberHomepageUrl = useMemo(() => {
    if (!memberHomepagePath) return '';
    return siteOrigin ? `${siteOrigin}${memberHomepagePath}` : memberHomepagePath;
  }, [memberHomepagePath, siteOrigin]);

  const copyMemberHomepageUrl = useCallback(async () => {
    if (!memberHomepageUrl) return;
    try {
      await navigator.clipboard.writeText(memberHomepageUrl);
      setHomeUrlCopyFeedback('주소를 복사했습니다.');
    } catch (copyError) {
      console.error('Failed to copy member homepage url', copyError);
      setHomeUrlCopyFeedback('주소 복사에 실패했습니다.');
    }
  }, [memberHomepageUrl]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Member Management</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">회원관리</h1>
        <p className="mt-1 text-sm text-slate-600">가맹점 회원 목록을 확인하고 상태별로 필터링할 수 있습니다.</p>
      </div>

      {!storecode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?storecode=...` 파라미터를 추가해야 회원관리를 사용할 수 있습니다.
        </div>
      )}

      {storecode && (
        <>
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700">Member Homepage</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">회원 홈페이지 주소</p>
            <p className="mt-1 break-all rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs text-slate-700">
              {memberHomepageUrl}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void copyMemberHomepageUrl();
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-indigo-300 bg-white px-3 text-xs font-semibold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
              >
                주소 복사
              </button>
              <a
                href={memberHomepagePath}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-indigo-300 bg-white px-3 text-xs font-semibold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
              >
                홈페이지로 가기
              </a>
            </div>
            {homeUrlCopyFeedback && (
              <p className="mt-2 text-xs font-semibold text-indigo-700">{homeUrlCopyFeedback}</p>
            )}
          </section>

          {addMemberSuccess && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {addMemberSuccess}
            </div>
          )}

          {store && (
            <section className="rounded-2xl border border-cyan-200 bg-cyan-50/60 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-cyan-200">
                  {store.storeLogo ? (
                    <div
                      className="h-full w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${encodeURI(store.storeLogo)})` }}
                      aria-label={store.storeName}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-cyan-700">
                      SHOP
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-900">{store.storeName}</p>
                  <p className="truncate text-xs text-slate-600">
                    코드: {store.storecode} · 결제지갑: {shortAddress(store.paymentWalletAddress)}
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">전체 회원</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{members.length.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">인증 회원</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{verifiedCount.toLocaleString()}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                미인증 {(members.length - verifiedCount).toLocaleString()}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <div className="flex items-center gap-2">
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="회원 아이디 또는 지갑주소 검색"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={loadMembers}
                disabled={loading}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? '조회 중...' : '새로고침'}
              </button>
              <button
                type="button"
                onClick={openAddMemberModal}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 px-3 text-xs font-semibold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-100"
              >
                회원 추가
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              {([
                ['all', '전체'],
                ['verified', '인증'],
                ['pending', '미인증'],
              ] as [MemberFilter, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`h-8 rounded-lg border px-3 text-xs font-semibold transition ${
                    filter === value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="mt-4 text-sm text-slate-500">회원 목록을 불러오는 중입니다...</p>
            ) : error ? (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : filteredMembers.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">조건에 맞는 회원이 없습니다.</p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="max-h-[560px] overflow-auto">
                  <table className="min-w-[860px] w-full table-auto">
                    <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur">
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                        <th className="px-3 py-2">회원 아이디</th>
                        <th className="px-3 py-2">지갑주소</th>
                        <th className="px-3 py-2">유형</th>
                        <th className="px-3 py-2">상태</th>
                        <th className="px-3 py-2">권한</th>
                        <th className="px-3 py-2">등록일</th>
                        <th className="px-3 py-2 text-right">비밀번호 확인</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-700">
                      {filteredMembers.map((member) => (
                        <tr key={`${member.id}-${member.walletAddress}`} className="transition hover:bg-slate-50/70">
                          <td className="px-3 py-2.5 font-semibold text-slate-900">{member.nickname}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-500">{shortAddress(member.walletAddress)}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-600">{resolveMemberType(member)}</td>
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
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => setPasswordModalMember(member)}
                              className="inline-flex h-7 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 text-[11px] font-semibold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-100"
                            >
                              확인
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
        </>
      )}

      {isAddMemberModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="회원 추가 모달 닫기"
            onClick={closeAddMemberModal}
            className="absolute inset-0"
          />
          <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_36px_80px_-40px_rgba(15,23,42,0.45)]">
            <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold text-cyan-700">
              신규 회원 추가
            </p>
            <h2 className="mt-2 text-lg font-bold text-slate-900">가맹점 회원 등록</h2>

            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submitAddMember();
              }}
            >
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">회원 아이디</span>
                <input
                  value={newMemberNickname}
                  onChange={(event) => {
                    setNewMemberNickname(event.target.value);
                    setAddMemberError(null);
                  }}
                  placeholder="아이디"
                  disabled={addingMember}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">비밀번호</span>
                <input
                  value={newMemberPassword}
                  onChange={(event) => {
                    setNewMemberPassword(event.target.value);
                    setAddMemberError(null);
                  }}
                  placeholder="비밀번호"
                  disabled={addingMember}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">입금자명</span>
                <input
                  value={newMemberDepositName}
                  onChange={(event) => {
                    setNewMemberDepositName(event.target.value);
                    setAddMemberError(null);
                  }}
                  placeholder="입금자명"
                  disabled={addingMember}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </label>

              {addMemberError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  {addMemberError}
                </p>
              )}

              {addingMember && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                  회원 정보를 저장 중입니다.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeAddMemberModal}
                  disabled={addingMember}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  닫기
                </button>
                <button
                  type="submit"
                  disabled={addingMember}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {addingMember ? '추가 중...' : '회원 추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {passwordModalMember && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="비밀번호 확인 모달 닫기"
            onClick={() => setPasswordModalMember(null)}
            className="absolute inset-0"
          />
          <div className="relative w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_36px_80px_-40px_rgba(15,23,42,0.45)]">
            <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold text-cyan-700">
              비밀번호 확인
            </p>
            <h2 className="mt-2 text-lg font-bold text-slate-900">{passwordModalMember.nickname}</h2>
            <p className="mt-1 text-xs text-slate-500">storecode: {storecode}</p>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">회원 비밀번호</p>
              <p className="mt-1 break-all font-mono text-base font-bold text-slate-900">
                {passwordModalMember.password || '-'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setPasswordModalMember(null)}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
