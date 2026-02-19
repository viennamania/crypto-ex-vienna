'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useActiveAccount } from 'thirdweb/react';

import AgentInfoCard from '../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  fetchStoresByAgent,
  formatKrw,
  formatUsdt,
  shortAddress,
  toDateTime,
  type AgentStoreItem,
  type AgentSummary,
} from '../_shared';

const formatAppliedRate = (value: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '-';
  }
  return `1 USDT = ${new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric)} KRW`;
};

type StoreUsdtToKrwRateHistoryItem = {
  id: string;
  prevUsdtToKrwRate: number;
  nextUsdtToKrwRate: number;
  changedByWalletAddress: string;
  changedByName: string;
  changedAt: string;
};

export default function P2PAgentStoreManagementPage() {
  const params = useParams<{ lang: string }>();
  const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko';
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();
  const activeAccount = useActiveAccount();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [stores, setStores] = useState<AgentStoreItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [rateNotice, setRateNotice] = useState<string | null>(null);
  const [rateModalStore, setRateModalStore] = useState<AgentStoreItem | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [rateSubmitting, setRateSubmitting] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateHistory, setRateHistory] = useState<StoreUsdtToKrwRateHistoryItem[]>([]);
  const [loadingRateHistory, setLoadingRateHistory] = useState(false);
  const [rateHistoryError, setRateHistoryError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!agentcode) {
      setAgent(null);
      setStores([]);
      setTotalCount(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [agentData, storesResult] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetchStoresByAgent(agentcode, 300, 1),
      ]);

      setAgent(agentData);
      setStores(storesResult.stores);
      setTotalCount(storesResult.totalCount);
    } catch (loadError) {
      setAgent(null);
      setStores([]);
      setTotalCount(0);
      setError(loadError instanceof Error ? loadError.message : '가맹점 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredStores = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return stores;
    }
    return stores.filter((store) => {
      return (
        store.storeName.toLowerCase().includes(normalizedKeyword)
        || store.storecode.toLowerCase().includes(normalizedKeyword)
        || store.adminWalletAddress.toLowerCase().includes(normalizedKeyword)
        || store.paymentWalletAddress.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [stores, keyword]);

  const loadStoreRateHistory = useCallback(async (storecode: string) => {
    const normalizedStorecode = String(storecode || '').trim();
    if (!normalizedStorecode) {
      setRateHistory([]);
      return;
    }

    setLoadingRateHistory(true);
    setRateHistoryError(null);
    try {
      const response = await fetch('/api/store/getStoreUsdtToKrwRateHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: normalizedStorecode,
          limit: 20,
          page: 1,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || '환율 변경이력을 불러오지 못했습니다.'));
      }

      const items = Array.isArray(payload?.result?.items) ? payload.result.items : [];
      const nextHistory = items.map((item: any, index: number) => {
        const prevRate = Number(item?.prevUsdtToKrwRate);
        const nextRate = Number(item?.nextUsdtToKrwRate);
        const idRaw = item?._id;
        const id = typeof idRaw?.toString === 'function'
          ? String(idRaw.toString())
          : `${normalizedStorecode}-${index}-${String(item?.changedAt || '')}`;

        return {
          id,
          prevUsdtToKrwRate: Number.isFinite(prevRate) ? prevRate : 0,
          nextUsdtToKrwRate: Number.isFinite(nextRate) ? nextRate : 0,
          changedByWalletAddress: String(item?.changedByWalletAddress || ''),
          changedByName: String(item?.changedByName || ''),
          changedAt: String(item?.changedAt || ''),
        };
      });

      setRateHistory(nextHistory);
    } catch (historyError) {
      setRateHistory([]);
      setRateHistoryError(
        historyError instanceof Error
          ? historyError.message
          : '환율 변경이력을 불러오지 못했습니다.',
      );
    } finally {
      setLoadingRateHistory(false);
    }
  }, []);

  const openRateModal = useCallback((store: AgentStoreItem) => {
    setRateModalStore(store);
    setRateInput(store.usdtToKrwRate > 0 ? String(store.usdtToKrwRate) : '');
    setRateError(null);
    setRateHistory([]);
    setRateHistoryError(null);

    void loadStoreRateHistory(store.storecode);
  }, [loadStoreRateHistory]);

  const closeRateModal = useCallback(() => {
    if (rateSubmitting) {
      return;
    }
    setRateModalStore(null);
    setRateInput('');
    setRateError(null);
    setRateHistory([]);
    setRateHistoryError(null);
  }, [rateSubmitting]);

  const submitStoreRate = useCallback(async () => {
    if (!rateModalStore || rateSubmitting) {
      return;
    }

    const nextRateRaw = Number(String(rateInput || '').replace(/,/g, '').trim());
    if (!Number.isFinite(nextRateRaw) || nextRateRaw <= 0) {
      setRateError('적용 환율은 0보다 큰 숫자로 입력해 주세요.');
      return;
    }
    const nextRate = Number(nextRateRaw.toFixed(2));

    setRateSubmitting(true);
    setRateError(null);
    setRateNotice(null);
    try {
      const response = await fetch('/api/store/updateStoreUsdtToKrwRate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: rateModalStore.storecode,
          usdtToKrwRate: nextRate,
          changedByWalletAddress: String(
            activeAccount?.address || agent?.adminWalletAddress || '',
          ).trim(),
          changedByName: String(agent?.agentName || agent?.agentcode || '').trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.result !== true) {
        throw new Error(String(payload?.error || '적용 환율을 업데이트하지 못했습니다.'));
      }

      const payloadRate = Number(payload?.nextUsdtToKrwRate);
      const resolvedRate = Number.isFinite(payloadRate) && payloadRate > 0
        ? payloadRate
        : nextRate;

      setStores((prev) =>
        prev.map((store) =>
          store.storecode === rateModalStore.storecode
            ? { ...store, usdtToKrwRate: resolvedRate }
            : store,
        ),
      );
      setRateNotice(
        `${rateModalStore.storeName || rateModalStore.storecode} 적용 환율을 ${formatAppliedRate(resolvedRate)}로 변경했습니다.`,
      );
      await loadStoreRateHistory(rateModalStore.storecode);
      setRateModalStore(null);
      setRateInput('');
    } catch (submitError) {
      setRateError(
        submitError instanceof Error
          ? submitError.message
          : '적용 환율을 업데이트하지 못했습니다.',
      );
    } finally {
      setRateSubmitting(false);
    }
  }, [
    activeAccount?.address,
    agent?.adminWalletAddress,
    agent?.agentName,
    agent?.agentcode,
    rateInput,
    loadStoreRateHistory,
    rateModalStore,
    rateSubmitting,
  ]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Stores</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">가맹점 관리</h1>
        <p className="mt-1 text-sm text-slate-600">에이전트 소속 가맹점과 결제 지표를 조회합니다.</p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 가맹점 관리 페이지를 사용할 수 있습니다.
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

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">가맹점 수</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{totalCount.toLocaleString()}개</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">표시 목록</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{filteredStores.length.toLocaleString()}개</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">가맹점 목록</p>
              <input
                type="text"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="가맹점명/코드/지갑 검색"
                className="h-9 w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
              />
            </div>
          </section>

          {rateNotice && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {rateNotice}
            </div>
          )}

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              가맹점 목록을 불러오는 중입니다...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div>
          )}

          {!loading && !error && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">가맹점</th>
                    <th className="px-4 py-3">관리 지갑</th>
                    <th className="px-4 py-3">결제 지갑</th>
                    <th className="px-4 py-3 text-right">결제확정</th>
                    <th className="px-4 py-3 text-right">거래금액</th>
                    <th className="px-4 py-3">적용 환율</th>
                    <th className="px-4 py-3">등록일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStores.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                        표시할 가맹점이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredStores.map((store) => (
                      <tr key={store.id || store.storecode} className="text-slate-700">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600">
                              {store.storeLogo ? (
                                <div
                                  className="h-full w-full bg-cover bg-center"
                                  style={{ backgroundImage: `url(${encodeURI(store.storeLogo)})` }}
                                  aria-label={store.storeName || store.storecode || 'store logo'}
                                />
                              ) : (
                                (store.storeName || store.storecode || 'S').slice(0, 1)
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{store.storeName || '-'}</p>
                              <p className="truncate text-xs text-slate-500">코드 {store.storecode || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{shortAddress(store.adminWalletAddress)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p>{shortAddress(store.paymentWalletAddress)}</p>
                          {store.storecode && (
                            <Link
                              href={`/${lang}/p2p/agent-management/store-management/${encodeURIComponent(
                                store.storecode,
                              )}/payment-wallet-collect${agentcode ? `?agentcode=${encodeURIComponent(agentcode)}` : ''}`}
                              className="mt-1 inline-flex h-7 items-center justify-center rounded-md border border-cyan-300 bg-cyan-50 px-2 text-[11px] font-semibold text-cyan-800 transition hover:border-cyan-400 hover:text-cyan-900"
                            >
                              회수하기
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">
                          {store.totalPaymentConfirmedCount.toLocaleString()}건
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          <p className="font-semibold text-slate-700">{formatKrw(store.totalKrwAmount)}</p>
                          <p className="text-slate-500">{formatUsdt(store.totalUsdtAmount)}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p className="font-semibold text-slate-700">{formatAppliedRate(store.usdtToKrwRate)}</p>
                          <button
                            type="button"
                            onClick={() => openRateModal(store)}
                            className="mt-1 inline-flex h-7 items-center justify-center rounded-md border border-cyan-300 bg-cyan-50 px-2 text-[11px] font-semibold text-cyan-800 transition hover:border-cyan-400 hover:text-cyan-900"
                          >
                            수정
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{toDateTime(store.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {rateModalStore && (
        <div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={closeRateModal}
        >
          <div
            className="w-full max-w-3xl rounded-3xl border border-white/80 bg-white p-5 shadow-[0_34px_70px_-40px_rgba(15,23,42,0.8)]"
            role="dialog"
            aria-modal="true"
            aria-label="가맹점 적용 환율 변경"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">Store Rate</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">가맹점 적용 환율 변경</h3>
            <p className="mt-1 text-sm text-slate-600">{rateModalStore.storeName || '-'} ({rateModalStore.storecode || '-'})</p>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 lg:col-span-5">
                <p className="text-xs text-slate-600">
                  현재 환율: <span className="font-semibold text-slate-800">{formatAppliedRate(rateModalStore.usdtToKrwRate)}</span>
                </p>

                <label className="mt-4 block">
                  <span className="text-xs font-semibold text-slate-600">새 적용 환율 (KRW)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={rateInput}
                    onChange={(event) => {
                      setRateInput(event.target.value);
                      if (rateError) {
                        setRateError(null);
                      }
                    }}
                    placeholder="예: 1400"
                    className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
                  />
                </label>

                {rateError && (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    {rateError}
                  </p>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={closeRateModal}
                    disabled={rateSubmitting}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={submitStoreRate}
                    disabled={rateSubmitting}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-cyan-600 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {rateSubmitting ? '저장 중...' : '저장'}
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white px-3 py-3 lg:col-span-7">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">환율 변경이력</p>
                  <button
                    type="button"
                    onClick={() => loadStoreRateHistory(rateModalStore.storecode)}
                    disabled={loadingRateHistory}
                    className="inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingRateHistory ? '조회 중...' : '새로고침'}
                  </button>
                </div>

                <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50">
                  {loadingRateHistory ? (
                    <div className="space-y-2 p-3">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <div key={`rate-history-loading-${index}`} className="h-10 animate-pulse rounded-lg bg-slate-200/80" />
                      ))}
                    </div>
                  ) : rateHistoryError ? (
                    <p className="px-3 py-6 text-center text-xs font-semibold text-rose-700">{rateHistoryError}</p>
                  ) : rateHistory.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-slate-500">변경이력이 없습니다.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {rateHistory.map((item) => (
                        <div key={item.id} className="px-3 py-2 text-xs text-slate-600">
                          <p className="font-semibold text-slate-800">
                            {formatAppliedRate(item.prevUsdtToKrwRate)} → {formatAppliedRate(item.nextUsdtToKrwRate)}
                          </p>
                          <p className="mt-0.5">
                            {item.changedByName || 'agent'}
                            {item.changedByWalletAddress ? ` (${shortAddress(item.changedByWalletAddress)})` : ''}
                          </p>
                          <p className="mt-0.5 text-slate-500">{toDateTime(item.changedAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
