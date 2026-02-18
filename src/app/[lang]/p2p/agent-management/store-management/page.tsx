'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

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

export default function P2PAgentStoreManagementPage() {
  const params = useParams<{ lang: string }>();
  const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko';
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [stores, setStores] = useState<AgentStoreItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);

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
                    <th className="px-4 py-3">등록일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStores.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
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
    </div>
  );
}
