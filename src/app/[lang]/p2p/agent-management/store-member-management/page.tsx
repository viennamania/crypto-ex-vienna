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

type MemberWalletBalanceItem = {
  loading: boolean;
  displayValue: string;
  error: string;
  lastCheckedAt: string;
  cooldownUntilMs: number;
};

const normalizeWalletAddress = (walletAddress: string) =>
  String(walletAddress || '').trim().toLowerCase();

export default function P2PAgentStoreMemberManagementPage() {
  const PAGE_SIZE = 20;
  const MEMBER_BALANCE_FETCH_LIMIT = 1000;
  const MEMBER_BALANCE_FETCH_MAX_PAGES = 100;
  const MEMBER_BALANCE_WALLET_BATCH_SIZE = 500;
  const MEMBER_BALANCE_READ_COOLDOWN_MS = 10_000;
  const MEMBER_WALLET_BALANCE_COOLDOWN_MS = 10_000;
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
  const [readingMemberBalances, setReadingMemberBalances] = useState(false);
  const [memberBalanceError, setMemberBalanceError] = useState<string | null>(null);
  const [memberBalanceCooldownUntilMs, setMemberBalanceCooldownUntilMs] = useState(0);
  const [memberBalanceNowMs, setMemberBalanceNowMs] = useState(Date.now());
  const [memberWalletBalanceTickMs, setMemberWalletBalanceTickMs] = useState(() => Date.now());
  const [memberBalanceSummary, setMemberBalanceSummary] = useState<{
    totalMembers: number;
    walletMembers: number;
    uniqueWalletCount: number;
    totalUsdtAmount: number;
    checkedAt: string;
  } | null>(null);
  const [memberWalletBalancesByAddress, setMemberWalletBalancesByAddress] =
    useState<Record<string, MemberWalletBalanceItem>>({});
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
      const [agentData, storesResult] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetchStoresByAgent(agentcode, 1000, 1),
      ]);

      const storesWithStorecode = storesResult.stores.filter(
        (store) => String(store.storecode || '').trim().length > 0,
      );
      const hasSelectedStorecode = selectedStorecode
        && storesWithStorecode.some((store) => store.storecode === selectedStorecode);
      const fallbackStorecode = storesWithStorecode[0]?.storecode || '';
      const effectiveStorecode = hasSelectedStorecode ? selectedStorecode : fallbackStorecode;

      setAgent(agentData);
      setStores(storesResult.stores);

      if (!effectiveStorecode) {
        if (selectedStorecode) {
          setSelectedStorecode('');
        }
        setMembers([]);
        setTotalCount(0);
        return;
      }

      if (effectiveStorecode !== selectedStorecode) {
        setSelectedStorecode(effectiveStorecode);
        setCurrentPage(1);
        setMembers([]);
        setTotalCount(0);
        return;
      }

      const membersResult = await fetchUsersByAgent(agentcode, {
        storecode: effectiveStorecode,
        userType: 'all',
        requireProfile: false,
        includeWalletless: true,
        searchTerm: keyword.trim(),
        sortField: 'createdAt',
        limit: PAGE_SIZE,
        page: currentPage,
      });

      setMembers(membersResult.users);
      setTotalCount(membersResult.totalCount);
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

  const formatUsdtFixed6 = useCallback((value: number) => {
    const numericValue = Number(value || 0);
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    }).format(Number.isFinite(numericValue) ? numericValue : 0);
  }, []);

  const formatUsdtDisplayValue = useCallback((value: string) => {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) return value;
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    }).format(parsedValue);
  }, []);

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

  const readSelectedStoreMemberBalances = useCallback(async () => {
    if (!agentcode || !selectedStorecode || readingMemberBalances) {
      return;
    }

    if (memberBalanceCooldownUntilMs > Date.now()) {
      return;
    }

    setReadingMemberBalances(true);
    setMemberBalanceError(null);

    try {
      let page = 1;
      let totalMembers = 0;
      const allMembers: AgentUserItem[] = [];

      while (page <= MEMBER_BALANCE_FETCH_MAX_PAGES) {
        const result = await fetchUsersByAgent(agentcode, {
          storecode: selectedStorecode,
          userType: 'all',
          requireProfile: false,
          includeWalletless: true,
          searchTerm: '',
          sortField: 'createdAt',
          limit: MEMBER_BALANCE_FETCH_LIMIT,
          page,
        });

        if (page === 1) {
          totalMembers = result.totalCount;
        }

        if (result.users.length === 0) {
          break;
        }

        allMembers.push(...result.users);

        if (allMembers.length >= totalMembers) {
          break;
        }

        page += 1;
      }

      const memberWalletAddressMap = new Map<string, string>();
      let walletMembers = 0;

      allMembers.forEach((member) => {
        const memberWalletAddress = String(member.walletAddress || '').trim();
        if (!memberWalletAddress) return;

        walletMembers += 1;
        const normalizedWalletAddress = memberWalletAddress.toLowerCase();
        if (!memberWalletAddressMap.has(normalizedWalletAddress)) {
          memberWalletAddressMap.set(normalizedWalletAddress, memberWalletAddress);
        }
      });

      const uniqueWalletAddresses = Array.from(memberWalletAddressMap.values());

      let totalUsdtAmount = 0;
      for (let index = 0; index < uniqueWalletAddresses.length; index += MEMBER_BALANCE_WALLET_BATCH_SIZE) {
        const walletAddressBatch = uniqueWalletAddresses.slice(index, index + MEMBER_BALANCE_WALLET_BATCH_SIZE);

        const response = await fetch('/api/user/getUSDTBalancesByWalletAddresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddresses: walletAddressBatch,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error || '회원 지갑 잔고를 읽어오지 못했습니다.'));
        }

        const balances = Array.isArray(payload?.result?.balances) ? payload.result.balances : [];
        balances.forEach((balanceItem: unknown) => {
          const source =
            typeof balanceItem === 'object' && balanceItem !== null
              ? (balanceItem as Record<string, unknown>)
              : {};
          const amount = Number(source.displayValue ?? source.balance ?? 0);
          if (Number.isFinite(amount)) {
            totalUsdtAmount += amount;
          }
        });
      }

      setMemberBalanceSummary({
        totalMembers: Math.max(totalMembers, allMembers.length),
        walletMembers,
        uniqueWalletCount: uniqueWalletAddresses.length,
        totalUsdtAmount,
        checkedAt: new Date().toISOString(),
      });
      setMemberBalanceCooldownUntilMs(Date.now() + MEMBER_BALANCE_READ_COOLDOWN_MS);
      setMemberBalanceNowMs(Date.now());
    } catch (fetchError) {
      setMemberBalanceError(
        fetchError instanceof Error ? fetchError.message : '회원 지갑 잔고 합산 중 오류가 발생했습니다.',
      );
    } finally {
      setReadingMemberBalances(false);
    }
  }, [
    MEMBER_BALANCE_FETCH_LIMIT,
    MEMBER_BALANCE_FETCH_MAX_PAGES,
    MEMBER_BALANCE_READ_COOLDOWN_MS,
    MEMBER_BALANCE_WALLET_BATCH_SIZE,
    agentcode,
    memberBalanceCooldownUntilMs,
    readingMemberBalances,
    selectedStorecode,
  ]);

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

  const readMemberWalletBalance = useCallback(async (walletAddress: string) => {
    const normalizedWalletAddress = String(walletAddress || '').trim();
    if (!normalizedWalletAddress) {
      return;
    }

    const walletAddressKey = normalizeWalletAddress(normalizedWalletAddress);
    const nowMs = Date.now();
    let shouldFetch = false;
    let nextCooldownUntil = nowMs + MEMBER_WALLET_BALANCE_COOLDOWN_MS;

    setMemberWalletBalancesByAddress((prev) => {
      const current = prev[walletAddressKey];
      if (current?.loading) {
        return prev;
      }
      if (Number(current?.cooldownUntilMs || 0) > nowMs) {
        return prev;
      }
      shouldFetch = true;
      nextCooldownUntil = nowMs + MEMBER_WALLET_BALANCE_COOLDOWN_MS;
      return {
        ...prev,
        [walletAddressKey]: {
          loading: true,
          displayValue: current?.displayValue || '',
          error: '',
          lastCheckedAt: current?.lastCheckedAt || '',
          cooldownUntilMs: nextCooldownUntil,
        },
      };
    });

    if (!shouldFetch) {
      return;
    }

    try {
      const response = await fetch('/api/user/getUSDTBalanceByWalletAddress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: normalizedWalletAddress,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      const rawDisplayValue = String(payload?.result?.displayValue || payload?.result?.balance || '0');
      const displayValue = formatUsdtDisplayValue(rawDisplayValue);
      const errorMessage = !response.ok
        ? String(payload?.error || '회원 지갑 잔고 조회에 실패했습니다.')
        : String(payload?.error || '');

      setMemberWalletBalancesByAddress((prev) => {
        const existing = prev[walletAddressKey];
        return {
          ...prev,
          [walletAddressKey]: {
            loading: false,
            displayValue,
            error: errorMessage,
            lastCheckedAt: new Date().toISOString(),
            cooldownUntilMs: existing?.cooldownUntilMs || nextCooldownUntil,
          },
        };
      });
    } catch (readError) {
      console.error('Failed to fetch member USDT balance', readError);
      setMemberWalletBalancesByAddress((prev) => {
        const existing = prev[walletAddressKey];
        return {
          ...prev,
          [walletAddressKey]: {
            loading: false,
            displayValue: existing?.displayValue || '',
            error: '잔고 조회 중 오류가 발생했습니다.',
            lastCheckedAt: existing?.lastCheckedAt || '',
            cooldownUntilMs: existing?.cooldownUntilMs || nextCooldownUntil,
          },
        };
      });
    }
  }, [MEMBER_WALLET_BALANCE_COOLDOWN_MS, formatUsdtDisplayValue]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [PAGE_SIZE, totalCount],
  );
  const selectableStores = useMemo(
    () => stores.filter((store) => String(store.storecode || '').trim().length > 0),
    [stores],
  );
  const selectedStore = useMemo(
    () => selectableStores.find((store) => store.storecode === selectedStorecode) || null,
    [selectableStores, selectedStorecode],
  );
  const memberBalanceCooldownSeconds = Math.max(
    0,
    Math.ceil((memberBalanceCooldownUntilMs - memberBalanceNowMs) / 1000),
  );
  const memberBalanceReadBlocked = readingMemberBalances || memberBalanceCooldownSeconds > 0 || !selectedStorecode;
  const hasActiveMemberWalletBalanceCooldown = useMemo(
    () =>
      Object.values(memberWalletBalancesByAddress).some(
        (item) => Number(item?.cooldownUntilMs || 0) > memberWalletBalanceTickMs,
      ),
    [memberWalletBalanceTickMs, memberWalletBalancesByAddress],
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

  useEffect(() => {
    if (memberBalanceCooldownUntilMs <= Date.now()) {
      return;
    }

    const timerId = window.setInterval(() => {
      setMemberBalanceNowMs(Date.now());
    }, 500);

    return () => {
      window.clearInterval(timerId);
    };
  }, [memberBalanceCooldownUntilMs]);

  useEffect(() => {
    if (!hasActiveMemberWalletBalanceCooldown) return;
    const intervalId = window.setInterval(() => {
      setMemberWalletBalanceTickMs(Date.now());
    }, 200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasActiveMemberWalletBalanceCooldown]);

  useEffect(() => {
    setMemberWalletBalancesByAddress({});
    setMemberBalanceSummary(null);
    setMemberBalanceError(null);
    setMemberBalanceCooldownUntilMs(0);
    setMemberBalanceNowMs(Date.now());
    setMemberWalletBalanceTickMs(Date.now());
  }, [selectedStorecode]);

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
                placeholder="아이디/입금자명/지갑 검색"
                className="h-9 w-full max-w-md rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
              />
            </div>

            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">가맹점 선택</p>
              <div className="mt-2 max-h-[280px] overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {selectableStores.map((store) => {
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
                {selectableStores.length === 0 && (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    선택할 수 있는 가맹점이 없습니다.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">USDT 잔고 합산</p>
                  <p className="mt-1 text-xs text-slate-600">
                    선택된 가맹점 회원 중 지갑주소가 있는 회원의 USDT 잔고를 합산합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void readSelectedStoreMemberBalances();
                  }}
                  disabled={memberBalanceReadBlocked}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-cyan-300 bg-cyan-50 px-3 text-xs font-semibold text-cyan-800 transition hover:border-cyan-400 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {readingMemberBalances
                    ? '읽어오는 중...'
                    : memberBalanceCooldownSeconds > 0
                      ? `${memberBalanceCooldownSeconds}초 후 재조회`
                      : '잔고 읽어오기'}
                </button>
              </div>

              {!selectedStorecode && (
                <p className="mt-2 text-xs text-amber-700">가맹점을 먼저 선택해 주세요.</p>
              )}

              {memberBalanceError && (
                <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                  {memberBalanceError}
                </p>
              )}

              {memberBalanceSummary && (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] text-slate-500">가맹점</p>
                    <p className="truncate text-sm font-semibold text-slate-900">{selectedStore?.storeName || selectedStorecode}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] text-slate-500">전체 회원</p>
                    <p className="text-sm font-semibold text-slate-900">{memberBalanceSummary.totalMembers.toLocaleString()}명</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] text-slate-500">지갑 보유 회원</p>
                    <p className="text-sm font-semibold text-slate-900">{memberBalanceSummary.walletMembers.toLocaleString()}명</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] text-slate-500">고유 지갑 수</p>
                    <p className="text-sm font-semibold text-slate-900">{memberBalanceSummary.uniqueWalletCount.toLocaleString()}개</p>
                  </div>
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2">
                    <p className="text-[11px] text-cyan-700">USDT 합산</p>
                    <p className="text-sm font-extrabold text-cyan-900">{formatUsdtFixed6(memberBalanceSummary.totalUsdtAmount)} USDT</p>
                    <p className="text-[10px] text-cyan-700">조회 {toDateTime(memberBalanceSummary.checkedAt)}</p>
                  </div>
                </div>
              )}
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
                    <th className="px-4 py-3">아이디</th>
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
                      const normalizedMemberWalletAddress = normalizeWalletAddress(memberWalletAddress);
                      const memberWalletBalanceState = normalizedMemberWalletAddress
                        ? memberWalletBalancesByAddress[normalizedMemberWalletAddress]
                        : undefined;
                      const memberWalletCooldownRemainingMs = Math.max(
                        0,
                        Number(memberWalletBalanceState?.cooldownUntilMs || 0) - memberWalletBalanceTickMs,
                      );
                      const memberWalletCooldownRemainingSeconds =
                        memberWalletCooldownRemainingMs > 0 ? Math.ceil(memberWalletCooldownRemainingMs / 1000) : 0;
                      const memberWalletCooldownProgressPercent = Math.max(
                        0,
                        Math.min(100, (memberWalletCooldownRemainingMs / MEMBER_WALLET_BALANCE_COOLDOWN_MS) * 100),
                      );
                      const memberResetKey = member.id || memberWalletAddress.toLowerCase();

                      return (
                      <tr key={member.id || `${member.storecode}-${member.nickname}`} className="text-slate-700">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{member.nickname || '-'}</p>
                          <p className="text-xs text-slate-500">입금자명 {member.buyerDepositName || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {memberWalletAddress ? (
                            <div className="space-y-1.5">
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
                              <p
                                className={`text-[11px] font-semibold ${
                                  memberWalletBalanceState?.error
                                    ? 'text-rose-600'
                                    : memberWalletBalanceState
                                      ? 'text-cyan-700'
                                      : 'text-slate-500'
                                }`}
                                title={memberWalletBalanceState?.error || ''}
                              >
                                {memberWalletBalanceState?.loading
                                  ? 'USDT 잔고 조회 중...'
                                  : memberWalletBalanceState?.error
                                    ? 'USDT 잔고 조회 실패'
                                    : memberWalletBalanceState?.displayValue
                                      ? `${memberWalletBalanceState.displayValue} USDT`
                                      : 'USDT 잔고 미조회'}
                              </p>
                              {memberWalletCooldownRemainingMs <= 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void readMemberWalletBalance(memberWalletAddress);
                                  }}
                                  disabled={Boolean(memberWalletBalanceState?.loading)}
                                  className={`inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-semibold transition ${
                                    memberWalletBalanceState?.loading
                                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                      : 'border-cyan-300 bg-cyan-50 text-cyan-700 hover:border-cyan-400 hover:bg-cyan-100'
                                  }`}
                                >
                                  {memberWalletBalanceState?.loading
                                    ? '조회 중...'
                                    : memberWalletBalanceState
                                      ? '다시 조회'
                                      : '잔고 읽어오기'}
                                </button>
                              ) : (
                                <div className="w-[108px] rounded-md border border-cyan-200 bg-cyan-50 px-1.5 py-1">
                                  <div className="flex items-center justify-between text-[10px] font-semibold text-cyan-700">
                                    <span>재조회 대기</span>
                                    <span>{memberWalletCooldownRemainingSeconds}s</span>
                                  </div>
                                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/90">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 transition-[width] duration-200 ease-linear"
                                      style={{ width: `${memberWalletCooldownProgressPercent.toFixed(2)}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                              {memberWalletBalanceState?.lastCheckedAt && (
                                <p className="text-[10px] text-slate-500">
                                  조회시각 {new Date(memberWalletBalanceState.lastCheckedAt).toLocaleTimeString()}
                                </p>
                              )}
                              {memberWalletBalanceState?.error && (
                                <p className="text-[10px] text-rose-500">{memberWalletBalanceState.error}</p>
                              )}
                            </div>
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
