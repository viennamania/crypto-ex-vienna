'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';

type SellerCandidate = {
  id: string;
  nickname: string;
  avatar: string;
  walletAddress: string;
  sellerStatus: string;
  sellerEnabled: boolean;
  bankName: string;
  accountNumber: string;
  userStorecode: string;
  createdAt: string;
};

type StoreSellerResult = {
  storecode: string;
  sellerWalletAddress: string;
  sellerWalletAddresses: string[];
};

const toText = (value: unknown) => (typeof value === 'string' ? value : '');
const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const getInitial = (value: string) => (String(value || '').trim().charAt(0) || 'U').toUpperCase();

const shortWallet = (value: string) => {
  if (!value) return '-';
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const formatDateTime = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeCandidate = (value: unknown): SellerCandidate | null => {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const walletAddress = String(source.walletAddress || '').trim();
  if (!isWalletAddress(walletAddress)) {
    return null;
  }

  const seller =
    source.seller && typeof source.seller === 'object'
      ? (source.seller as Record<string, unknown>)
      : {};
  const bankInfo =
    seller.bankInfo && typeof seller.bankInfo === 'object'
      ? (seller.bankInfo as Record<string, unknown>)
      : {};

  return {
    id: String(source._id || walletAddress),
    nickname: toText(source.nickname).trim() || toText(source.name).trim() || '이름없음',
    avatar: toText(source.avatar).trim() || toText(source.profileImage).trim() || '',
    walletAddress,
    sellerStatus: toText(seller.status).trim() || 'unknown',
    sellerEnabled: seller.enabled !== false,
    bankName: toText(bankInfo.bankName).trim(),
    accountNumber: toText(bankInfo.accountNumber).trim(),
    userStorecode: toText(source.storecode).trim(),
    createdAt: toText(source.createdAt).trim(),
  };
};

export default function StoreSellerSettingsPage() {
  const params = useParams<{ lang?: string | string[]; storecode?: string | string[] }>();
  const langParam = params?.lang;
  const storecodeParam = params?.storecode;
  const lang = Array.isArray(langParam) ? (langParam[0] || 'ko') : (langParam || 'ko');
  const storecode = Array.isArray(storecodeParam)
    ? (storecodeParam[0] || '').trim()
    : String(storecodeParam || '').trim();

  const [storeName, setStoreName] = useState('');
  const [storeLogo, setStoreLogo] = useState('');
  const [loadingStore, setLoadingStore] = useState(true);
  const [selectedSellerWallets, setSelectedSellerWallets] = useState<string[]>([]);
  const [loadingSelectedSellers, setLoadingSelectedSellers] = useState(true);
  const [selectedSellersError, setSelectedSellersError] = useState<string | null>(null);
  const [candidateSellers, setCandidateSellers] = useState<SellerCandidate[]>([]);
  const [loadingCandidateSellers, setLoadingCandidateSellers] = useState(true);
  const [candidateSellersError, setCandidateSellersError] = useState<string | null>(null);
  const [candidateSearchTerm, setCandidateSearchTerm] = useState('');
  const [selectedSearchTerm, setSelectedSearchTerm] = useState('');
  const [busyWalletMap, setBusyWalletMap] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const selectedWalletSet = useMemo(
    () => new Set(selectedSellerWallets.map((wallet) => wallet.toLowerCase())),
    [selectedSellerWallets],
  );

  const candidateByWallet = useMemo(() => {
    const map = new Map<string, SellerCandidate>();
    candidateSellers.forEach((candidate) => {
      const key = candidate.walletAddress.toLowerCase();
      if (!map.has(key)) {
        map.set(key, candidate);
      }
    });
    return map;
  }, [candidateSellers]);

  const filteredCandidateSellers = useMemo(() => {
    const keyword = candidateSearchTerm.trim().toLowerCase();
    if (!keyword) return candidateSellers;
    return candidateSellers.filter((candidate) => (
      candidate.nickname.toLowerCase().includes(keyword) ||
      candidate.walletAddress.toLowerCase().includes(keyword) ||
      candidate.bankName.toLowerCase().includes(keyword) ||
      candidate.accountNumber.toLowerCase().includes(keyword)
    ));
  }, [candidateSearchTerm, candidateSellers]);

  const filteredSelectedSellerWallets = useMemo(() => {
    const keyword = selectedSearchTerm.trim().toLowerCase();
    if (!keyword) return selectedSellerWallets;
    return selectedSellerWallets.filter((walletAddress) => {
      const candidate = candidateByWallet.get(walletAddress.toLowerCase());
      const nickname = String(candidate?.nickname || '').toLowerCase();
      return (
        walletAddress.toLowerCase().includes(keyword) ||
        nickname.includes(keyword)
      );
    });
  }, [candidateByWallet, selectedSearchTerm, selectedSellerWallets]);

  const loadStoreInfo = useCallback(async () => {
    if (!storecode) {
      setStoreName('');
      setStoreLogo('');
      setLoadingStore(false);
      return;
    }

    setLoadingStore(true);
    try {
      const response = await fetch('/api/store/getOneStore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storecode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.result) {
        throw new Error('가맹점 정보를 불러오지 못했습니다.');
      }
      setStoreName(toText(payload.result.storeName).trim());
      setStoreLogo(toText(payload.result.storeLogo).trim());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '가맹점 정보를 불러오지 못했습니다.';
      toast.error(message);
      setStoreName('');
      setStoreLogo('');
    } finally {
      setLoadingStore(false);
    }
  }, [storecode]);

  const loadStoreSellers = useCallback(async () => {
    if (!storecode) {
      setSelectedSellerWallets([]);
      setLoadingSelectedSellers(false);
      return;
    }

    setLoadingSelectedSellers(true);
    setSelectedSellersError(null);
    try {
      const response = await fetch('/api/store/manageStoreSellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get',
          storecode,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : '가맹점 판매자 목록을 불러오지 못했습니다.');
      }

      const result = (payload?.result || {}) as StoreSellerResult;
      const list = Array.isArray(result.sellerWalletAddresses)
        ? result.sellerWalletAddresses.filter((wallet) => isWalletAddress(String(wallet || '').trim())).map((wallet) => String(wallet).trim())
        : [];
      setSelectedSellerWallets(list);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '가맹점 판매자 목록 조회 중 오류가 발생했습니다.';
      setSelectedSellersError(message);
      setSelectedSellerWallets([]);
    } finally {
      setLoadingSelectedSellers(false);
    }
  }, [storecode]);

  const loadCandidateSellers = useCallback(async () => {
    setLoadingCandidateSellers(true);
    setCandidateSellersError(null);
    try {
      const response = await fetch('/api/user/getAllUsersByStorecode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: 'admin',
          limit: 500,
          page: 1,
          includeUnverified: true,
          requireProfile: true,
          userType: 'seller',
          searchTerm: '',
          sortField: 'nickname',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : '판매자 목록을 불러오지 못했습니다.');
      }

      const users: unknown[] = Array.isArray(payload?.result?.users) ? payload.result.users : [];
      const normalizedSellers = users
        .map((user) => normalizeCandidate(user))
        .filter((candidate: SellerCandidate | null): candidate is SellerCandidate => candidate !== null);

      const uniqueSellerMap = new Map<string, SellerCandidate>();
      normalizedSellers.forEach((seller) => {
        const key = seller.walletAddress.toLowerCase();
        if (!uniqueSellerMap.has(key)) {
          uniqueSellerMap.set(key, seller);
        }
      });

      const sortedSellers = Array.from(uniqueSellerMap.values()).sort((a, b) => {
        if (a.sellerEnabled !== b.sellerEnabled) {
          return a.sellerEnabled ? -1 : 1;
        }
        return a.nickname.localeCompare(b.nickname, 'ko');
      });

      setCandidateSellers(sortedSellers);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '판매자 목록 조회 중 오류가 발생했습니다.';
      setCandidateSellersError(message);
      setCandidateSellers([]);
    } finally {
      setLoadingCandidateSellers(false);
    }
  }, []);

  const addSellerToStore = useCallback(async (walletAddress: string) => {
    if (!storecode || !isWalletAddress(walletAddress)) return;
    const key = walletAddress.toLowerCase();
    setBusyWalletMap((prev) => ({ ...prev, [key]: true }));

    try {
      const response = await fetch('/api/store/manageStoreSellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          storecode,
          sellerWalletAddress: walletAddress,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : '판매자 추가에 실패했습니다.');
      }

      const result = (payload?.result || {}) as StoreSellerResult & { added?: boolean };
      const list = Array.isArray(result.sellerWalletAddresses)
        ? result.sellerWalletAddresses.filter((wallet) => isWalletAddress(String(wallet || '').trim())).map((wallet) => String(wallet).trim())
        : [];
      setSelectedSellerWallets(list);
      toast.success(result.added ? '가맹점 판매자로 추가했습니다.' : '이미 등록된 판매자입니다.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '판매자 추가 중 오류가 발생했습니다.';
      toast.error(message);
    } finally {
      setBusyWalletMap((prev) => ({ ...prev, [key]: false }));
    }
  }, [storecode]);

  const removeSellerFromStore = useCallback(async (walletAddress: string) => {
    if (!storecode || !isWalletAddress(walletAddress)) return;
    const key = walletAddress.toLowerCase();
    setBusyWalletMap((prev) => ({ ...prev, [key]: true }));

    try {
      const response = await fetch('/api/store/manageStoreSellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove',
          storecode,
          sellerWalletAddress: walletAddress,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : '판매자 제거에 실패했습니다.');
      }

      const result = (payload?.result || {}) as StoreSellerResult & { removed?: boolean };
      const list = Array.isArray(result.sellerWalletAddresses)
        ? result.sellerWalletAddresses.filter((wallet) => isWalletAddress(String(wallet || '').trim())).map((wallet) => String(wallet).trim())
        : [];
      setSelectedSellerWallets(list);
      toast.success(result.removed ? '가맹점 판매자에서 제거했습니다.' : '이미 제거된 판매자입니다.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '판매자 제거 중 오류가 발생했습니다.';
      toast.error(message);
    } finally {
      setBusyWalletMap((prev) => ({ ...prev, [key]: false }));
    }
  }, [storecode]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadStoreInfo(),
      loadStoreSellers(),
      loadCandidateSellers(),
    ]);
    setRefreshing(false);
  }, [loadCandidateSellers, loadStoreInfo, loadStoreSellers]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 pb-10 pt-6 lg:px-6 lg:pt-8">
      <div className="absolute left-0 top-0 h-72 w-72 -translate-x-24 -translate-y-24 rounded-full bg-teal-200/30 blur-3xl" />
      <div className="absolute right-0 top-16 h-80 w-80 translate-x-20 rounded-full bg-cyan-200/25 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
        <section className="rounded-3xl border border-teal-100/80 bg-white/90 p-5 shadow-[0_30px_70px_-48px_rgba(15,118,110,0.75)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-teal-100 bg-slate-100">
                {storeLogo ? (
                  <div
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${encodeURI(storeLogo)})` }}
                    aria-label={storeName || 'store logo'}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-teal-700">
                    SHOP
                  </div>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-teal-700">Store Seller Control</p>
                <h1 className="mt-1 text-xl font-bold text-slate-900">가맹점 판매자 설정</h1>
                <p className="mt-1 text-sm text-slate-600">
                  {loadingStore
                    ? '가맹점 정보를 불러오는 중입니다...'
                    : `${storeName || '-'} · 코드 ${storecode || '-'}`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/${lang}/administration/store-management`}
                className="inline-flex h-10 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                목록으로
              </Link>
              <button
                type="button"
                onClick={refreshAll}
                disabled={refreshing}
                className="inline-flex h-10 items-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? '새로고침 중...' : '새로고침'}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
          <p className="text-sm text-slate-600">
            판매자 목록에서 추가하면 해당 가맹점의 `store` 컬렉션 판매자 배열에 등록되고, 가맹점 판매자 목록에서 제거하면 즉시 해제됩니다.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            대표 판매자 지갑(기존 단일 필드 호환): {selectedSellerWallets[0] ? shortWallet(selectedSellerWallets[0]) : '미설정'}
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.45)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">판매자 목록</p>
                <p className="text-xs text-slate-500">추가 가능한 전체 판매자</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {candidateSellers.length.toLocaleString()}명
              </span>
            </div>

            <input
              type="text"
              value={candidateSearchTerm}
              onChange={(event) => setCandidateSearchTerm(event.target.value)}
              placeholder="닉네임/지갑/은행 검색"
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500"
            />

            {candidateSellersError && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                {candidateSellersError}
              </p>
            )}

            <div className="mt-3 max-h-[520px] overflow-y-auto rounded-xl border border-slate-200">
              {loadingCandidateSellers ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">판매자 목록을 불러오는 중입니다...</div>
              ) : filteredCandidateSellers.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">검색 결과가 없습니다.</div>
              ) : (
                filteredCandidateSellers.map((seller) => {
                  const key = seller.walletAddress.toLowerCase();
                  const busy = !!busyWalletMap[key];
                  const added = selectedWalletSet.has(key);
                  return (
                    <div
                      key={seller.id}
                      className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                          {seller.avatar ? (
                            <div
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${encodeURI(seller.avatar)})` }}
                              aria-label={seller.nickname}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-600">
                              {getInitial(seller.nickname)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{seller.nickname}</p>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                              seller.sellerEnabled
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-slate-200 bg-slate-100 text-slate-500'
                            }`}>
                              {seller.sellerEnabled ? '활성' : '비활성'}
                            </span>
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              {seller.sellerStatus || 'unknown'}
                            </span>
                          </div>
                          <p className="mt-1 break-all text-xs text-slate-600">{seller.walletAddress}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {seller.bankName || '-'} {seller.accountNumber || ''}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            등록 {formatDateTime(seller.createdAt)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy || added}
                        onClick={() => addSellerToStore(seller.walletAddress)}
                        className={`inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-semibold transition ${
                          added
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'bg-teal-700 text-white hover:bg-teal-600'
                        } disabled:cursor-not-allowed disabled:opacity-70`}
                      >
                        {added ? '추가됨' : busy ? '처리 중...' : '추가'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.45)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">가맹점 판매자 목록</p>
                <p className="text-xs text-slate-500">현재 가맹점에 등록된 판매자</p>
              </div>
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                {selectedSellerWallets.length.toLocaleString()}명
              </span>
            </div>

            <input
              type="text"
              value={selectedSearchTerm}
              onChange={(event) => setSelectedSearchTerm(event.target.value)}
              placeholder="닉네임/지갑 검색"
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500"
            />

            {selectedSellersError && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                {selectedSellersError}
              </p>
            )}

            <div className="mt-3 max-h-[520px] overflow-y-auto rounded-xl border border-slate-200">
              {loadingSelectedSellers ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">가맹점 판매자 목록을 불러오는 중입니다...</div>
              ) : filteredSelectedSellerWallets.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">등록된 판매자가 없습니다.</div>
              ) : (
                filteredSelectedSellerWallets.map((walletAddress, index) => {
                  const key = walletAddress.toLowerCase();
                  const busy = !!busyWalletMap[key];
                  const candidate = candidateByWallet.get(key);
                  const displayName = candidate?.nickname || shortWallet(walletAddress);
                  return (
                    <div
                      key={`${walletAddress}-${index}`}
                      className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                          {candidate?.avatar ? (
                            <div
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${encodeURI(candidate.avatar)})` }}
                              aria-label={displayName}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-600">
                              {getInitial(displayName)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {displayName}
                            </p>
                            {index === 0 && (
                              <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                                대표 판매자
                              </span>
                            )}
                          </div>
                          <p className="mt-1 break-all text-xs text-slate-600">{walletAddress}</p>
                          {candidate ? (
                            <p className="mt-1 text-xs text-slate-500">
                              {candidate.bankName || '-'} {candidate.accountNumber || ''}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-amber-700">판매자 상세정보를 찾지 못했습니다.</p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeSellerFromStore(walletAddress)}
                        className="inline-flex h-8 shrink-0 items-center rounded-full border border-rose-300 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? '처리 중...' : '제거'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
