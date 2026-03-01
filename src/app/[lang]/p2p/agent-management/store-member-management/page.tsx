'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AgentInfoCard from '../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  fetchStoresByAgent,
  fetchUsersByAgent,
  shortAddress,
  toDateTime,
  type AgentStoreItem,
  type AgentSummary,
  type AgentUserItem,
} from '../_shared';

export default function P2PAgentStoreMemberManagementPage() {
  const PAGE_SIZE = 20;
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [stores, setStores] = useState<AgentStoreItem[]>([]);
  const [selectedStorecode, setSelectedStorecode] = useState('');
  const [members, setMembers] = useState<AgentUserItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedWalletAddress, setCopiedWalletAddress] = useState('');
  const [resettingConsentMemberId, setResettingConsentMemberId] = useState<string | null>(null);
  const [resetConsentError, setResetConsentError] = useState<string | null>(null);
  const [resetConsentSuccess, setResetConsentSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!agentcode) {
      setAgent(null);
      setStores([]);
      setSelectedStorecode('');
      setMembers([]);
      setTotalCount(0);
      setCurrentPage(1);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [agentData, storesResult, membersResult] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetchStoresByAgent(agentcode, 1000, 1),
        fetchUsersByAgent(agentcode, {
          storecode: selectedStorecode,
          userType: 'all',
          requireProfile: false,
          includeWalletless: true,
          searchTerm: keyword.trim(),
          sortField: 'createdAt',
          limit: PAGE_SIZE,
          page: currentPage,
        }),
      ]);

      setAgent(agentData);
      setStores(storesResult.stores);
      setMembers(membersResult.users);
      setTotalCount(membersResult.totalCount);

      if (
        selectedStorecode
        && !storesResult.stores.some((store) => store.storecode === selectedStorecode)
      ) {
        setSelectedStorecode('');
        setCurrentPage(1);
      }
    } catch (loadError) {
      setAgent(null);
      setStores([]);
      setMembers([]);
      setTotalCount(0);
      setError(loadError instanceof Error ? loadError.message : '가맹점 회원 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode, currentPage, keyword, selectedStorecode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopyWalletAddress = useCallback(async (walletAddress: string) => {
    const normalizedWalletAddress = String(walletAddress || '').trim();
    if (!normalizedWalletAddress) return;

    try {
      await navigator.clipboard.writeText(normalizedWalletAddress);
      setCopiedWalletAddress(normalizedWalletAddress);
      window.setTimeout(() => {
        setCopiedWalletAddress((prev) => (prev === normalizedWalletAddress ? '' : prev));
      }, 1500);
    } catch (error) {
      console.error('Failed to copy wallet address', error);
    }
  }, []);

  const resetMemberConsent = useCallback(async (member: AgentUserItem) => {
    const memberWalletAddress = String(member.walletAddress || '').trim();
    if (!memberWalletAddress) {
      setResetConsentError('지갑주소가 없어 이용동의를 초기화할 수 없습니다.');
      return;
    }
    if (resettingConsentMemberId) {
      return;
    }

    const confirmed = window.confirm(
      `[${member.nickname || '-'}] 회원의 이용동의 상태를 초기화할까요?\n초기화하면 다음 거래에서 다시 동의가 필요합니다.`,
    );
    if (!confirmed) return;

    const memberResetKey = member.id || memberWalletAddress.toLowerCase();
    setResetConsentError(null);
    setResetConsentSuccess(null);
    setResettingConsentMemberId(memberResetKey);
    try {
      const response = await fetch('/api/user/resetPrivateSaleConsent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: member.storecode || selectedStorecode,
          walletAddress: memberWalletAddress,
          memberId: member.id,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.result) {
        throw new Error(String(payload?.error || payload?.message || '이용동의 초기화에 실패했습니다.'));
      }

      setResetConsentSuccess('이용동의가 초기화되었습니다.');
      await loadData();
    } catch (resetError) {
      setResetConsentError(
        resetError instanceof Error ? resetError.message : '이용동의 초기화에 실패했습니다.',
      );
    } finally {
      setResettingConsentMemberId(null);
    }
  }, [loadData, resettingConsentMemberId, selectedStorecode]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [PAGE_SIZE, totalCount],
  );

  const visiblePageNumbers = useMemo(() => {
    const windowSize = 5;
    const start = Math.max(1, currentPage - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    const adjustedStart = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [currentPage, totalPages]);

  const isPreviousDisabled = currentPage <= 1 || loading;
  const isNextDisabled = currentPage >= totalPages || loading;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Store Members</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">가맹점 회원 관리</h1>
        <p className="mt-1 text-sm text-slate-600">에이전트 소속 가맹점 전체 회원을 조회합니다.</p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 가맹점 회원 관리 페이지를 사용할 수 있습니다.
        </div>
      )}

      {agentcode && (
        <>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '조회 중...' : '새로고침'}
            </button>
          </div>

          <AgentInfoCard agent={agent} fallbackAgentcode={agentcode} />

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">회원 목록 ({totalCount.toLocaleString()}명)</p>
              <input
                type="text"
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="닉네임/입금자명/가맹점/지갑/role 검색"
                className="h-9 w-full max-w-md rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
              />
            </div>

            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">가맹점 선택</p>
              <div className="mt-2 max-h-[280px] overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStorecode('');
                      setCurrentPage(1);
                    }}
                    className={`flex min-h-[66px] items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                      selectedStorecode
                        ? 'border-slate-200 bg-white hover:border-slate-300'
                        : 'border-cyan-300 bg-cyan-50 shadow-[0_14px_30px_-22px_rgba(6,182,212,0.9)]'
                    }`}
                  >
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                        selectedStorecode ? 'bg-slate-100 text-slate-600' : 'bg-cyan-100 text-cyan-700'
                      }`}
                    >
                      ALL
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">전체 가맹점</span>
                      <span className="block truncate text-xs text-slate-500">agentcode 소속 전체 회원 조회</span>
                    </span>
                  </button>

                  {stores.map((store) => {
                    const isActive = selectedStorecode === store.storecode;
                    const storeTitle = store.storeName || store.storecode || '-';
                    const storeCode = store.storecode || '-';

                    return (
                      <button
                        key={store.id || store.storecode}
                        type="button"
                        onClick={() => {
                          setSelectedStorecode(store.storecode || '');
                          setCurrentPage(1);
                        }}
                        className={`flex min-h-[66px] items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                          isActive
                            ? 'border-cyan-300 bg-cyan-50 shadow-[0_14px_30px_-22px_rgba(6,182,212,0.9)]'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600">
                          {store.storeLogo ? (
                            <div
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${encodeURI(store.storeLogo)})` }}
                              aria-label={storeTitle}
                            />
                          ) : (
                            storeTitle.slice(0, 1)
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900">{storeTitle}</span>
                          <span className="block truncate text-xs text-slate-500">코드 {storeCode}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              회원 목록을 불러오는 중입니다...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div>
          )}

          {resetConsentSuccess && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {resetConsentSuccess}
            </div>
          )}

          {resetConsentError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {resetConsentError}
            </div>
          )}

          {!loading && !error && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">회원</th>
                    <th className="px-4 py-3">지갑주소</th>
                    <th className="px-4 py-3">가맹점</th>
                    <th className="px-4 py-3">역할</th>
                    <th className="px-4 py-3">검증</th>
                    <th className="px-4 py-3">이용동의</th>
                    <th className="px-4 py-3">등록일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                        표시할 회원이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    members.map((member) => {
                      const memberWalletAddress = String(member.walletAddress || '').trim();
                      const memberResetKey = member.id || memberWalletAddress.toLowerCase();

                      return (
                      <tr key={member.id || `${member.storecode}-${member.nickname}`} className="text-slate-700">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{member.nickname || '-'}</p>
                          <p className="text-xs text-slate-500">입금자명 {member.buyerDepositName || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {memberWalletAddress ? (
                            <button
                              type="button"
                              onClick={() => {
                                void handleCopyWalletAddress(memberWalletAddress);
                              }}
                              className="inline-flex items-center gap-1 font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 transition hover:text-cyan-700 hover:decoration-cyan-300"
                              title={memberWalletAddress}
                            >
                              {shortAddress(memberWalletAddress)}
                              {copiedWalletAddress === memberWalletAddress && (
                                <span className="text-[10px] font-semibold text-cyan-700">복사됨</span>
                              )}
                            </button>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600">
                              {member.storeLogo ? (
                                <div
                                  className="h-full w-full bg-cover bg-center"
                                  style={{ backgroundImage: `url(${encodeURI(member.storeLogo)})` }}
                                  aria-label={member.storeName || member.storecode || 'store logo'}
                                />
                              ) : (
                                (member.storeName || member.storecode || 'S').slice(0, 1)
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-700">
                                {member.storeName || member.storecode || '-'}
                              </p>
                              <p className="truncate text-xs text-slate-500">코드 {member.storecode || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{member.role || '-'}</td>
                        <td className="px-4 py-3 text-xs">
                          <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${member.verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {member.verified ? 'verified' : 'pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <div className="inline-flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${
                                member.privateSaleConsentAccepted
                                  ? 'bg-cyan-100 text-cyan-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {member.privateSaleConsentAccepted ? '동의완료' : '미동의'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {member.privateSaleConsentAcceptedAt
                                ? toDateTime(member.privateSaleConsentAcceptedAt)
                                : '-'}
                            </span>
                            {member.privateSaleConsentAccepted && (
                              <button
                                type="button"
                                onClick={() => {
                                  void resetMemberConsent(member);
                                }}
                                disabled={Boolean(resettingConsentMemberId) || !memberWalletAddress}
                                className="inline-flex h-5 items-center rounded-md border border-rose-300 bg-rose-50 px-1.5 text-[10px] font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {resettingConsentMemberId === memberResetKey ? '리셋 중...' : '리셋'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{toDateTime(member.createdAt)}</td>
                      </tr>
                    )})
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && totalCount > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600">
                  페이지 {currentPage} / {totalPages} · 총 {totalCount.toLocaleString()}명
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={isPreviousDisabled}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    이전
                  </button>

                  {visiblePageNumbers.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setCurrentPage(pageNumber)}
                      disabled={loading}
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition ${
                        pageNumber === currentPage
                          ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      {pageNumber}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={isNextDisabled}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    다음
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
