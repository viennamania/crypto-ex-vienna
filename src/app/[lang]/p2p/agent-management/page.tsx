'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AgentInfoCard from './_components/AgentInfoCard';
import {
  fetchAgentDashboard,
  formatKrw,
  formatUsdt,
  shortAddress,
  toDateTime,
  type AgentDashboardResult,
} from './_shared';

const initialDashboard: AgentDashboardResult = {
  agent: null,
  buyersCount: 0,
  sellersCount: 0,
  tradesCount: 0,
  storesCount: 0,
  storeMembersCount: 0,
  paymentsCount: 0,
  stores: [],
  recentTrades: [],
  recentPayments: [],
};

export default function P2PAgentManagementHomePage() {
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<AgentDashboardResult>(initialDashboard);

  const loadDashboard = useCallback(async () => {
    if (!agentcode) {
      setDashboard(initialDashboard);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await fetchAgentDashboard(agentcode);
      setDashboard(result);
    } catch (loadError) {
      setDashboard(initialDashboard);
      setError(loadError instanceof Error ? loadError.message : '에이전트 대시보드를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const topStores = useMemo(() => {
    return [...dashboard.stores]
      .sort((a, b) => b.totalKrwAmount - a.totalKrwAmount)
      .slice(0, 6);
  }, [dashboard.stores]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Agent Dashboard</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">에이전트 운영 홈</h1>
        <p className="mt-1 text-sm text-slate-600">agentcode 기준으로 가맹점/가맹점 회원/결제 현황을 통합 모니터링합니다.</p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가하면 에이전트 대시보드를 조회할 수 있습니다.
        </div>
      )}

      {agentcode && (
        <>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={loadDashboard}
              disabled={loading}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '조회 중...' : '새로고침'}
            </button>
          </div>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              에이전트 대시보드를 불러오는 중입니다...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              <AgentInfoCard
                agent={dashboard.agent}
                fallbackAgentcode={agentcode}
                editable
                onUpdated={loadDashboard}
              />

              <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">가맹점</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{dashboard.storesCount.toLocaleString()}개</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">가맹점 회원</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{dashboard.storeMembersCount.toLocaleString()}명</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">가맹점 결제</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{dashboard.paymentsCount.toLocaleString()}건</p>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">가맹점 상위 결제 현황</p>
                    <p className="text-xs text-slate-500">KRW 결제금액 상위 6개</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {topStores.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-slate-500">가맹점 데이터가 없습니다.</div>
                    ) : (
                      topStores.map((store) => (
                        <div key={store.id || store.storecode} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{store.storeName || store.storecode}</p>
                            <p className="truncate text-xs text-slate-500">코드 {store.storecode}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-slate-900">{formatKrw(store.totalKrwAmount)}</p>
                            <p className="text-xs text-slate-500">{formatUsdt(store.totalUsdtAmount)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">최근 결제 확정 거래</p>
                    <p className="text-xs text-slate-500">가맹점 결제 관리 최근 12건</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {dashboard.recentPayments.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-slate-500">결제 데이터가 없습니다.</div>
                    ) : (
                      dashboard.recentPayments.slice(0, 8).map((order) => (
                        <div key={order.id || order.tradeId} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {order.storeName || order.storecode || '-'}
                            </p>
                            <span className="text-xs text-slate-500">{order.status || '-'}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            회원 {order.buyerNickname || '-'} · 결제지갑 {shortAddress(order.sellerNickname || '')}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">결제번호 {order.paymentId || '-'}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            TX {shortAddress(order.tradeId || '')} · {formatUsdt(order.usdtAmount)} · {formatKrw(order.krwAmount)} · {toDateTime(order.paymentConfirmedAt || order.createdAt)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
