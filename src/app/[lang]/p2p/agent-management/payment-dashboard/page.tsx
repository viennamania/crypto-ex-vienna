'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AgentInfoCard from '../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  fetchStoresByAgent,
  fetchUsersByAgent,
  fetchWalletUsdtPaymentsByAgent,
  formatKrw,
  formatUsdt,
  shortAddress,
  toDateTime,
  type AgentBuyOrderItem,
  type AgentStoreItem,
  type AgentSummary,
} from '../_shared';

export default function P2PAgentPaymentDashboardPage() {
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [stores, setStores] = useState<AgentStoreItem[]>([]);
  const [recentPayments, setRecentPayments] = useState<AgentBuyOrderItem[]>([]);
  const [storesCount, setStoresCount] = useState(0);
  const [storeMembersCount, setStoreMembersCount] = useState(0);
  const [paymentsCount, setPaymentsCount] = useState(0);
  const [totalKrwAmount, setTotalKrwAmount] = useState(0);
  const [totalUsdtAmount, setTotalUsdtAmount] = useState(0);

  const loadData = useCallback(async () => {
    if (!agentcode) {
      setAgent(null);
      setStores([]);
      setRecentPayments([]);
      setStoresCount(0);
      setStoreMembersCount(0);
      setPaymentsCount(0);
      setTotalKrwAmount(0);
      setTotalUsdtAmount(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [agentData, storesResult, membersResult, paymentsResult] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetchStoresByAgent(agentcode, 300, 1),
        fetchUsersByAgent(agentcode, {
          userType: 'all',
          requireProfile: false,
          includeWalletless: true,
          limit: 1,
          page: 1,
        }),
        fetchWalletUsdtPaymentsByAgent(agentcode, {
          limit: 80,
          page: 1,
          status: 'confirmed',
        }),
      ]);

      setAgent(agentData);
      setStores(storesResult.stores);
      setStoresCount(storesResult.totalCount);
      setStoreMembersCount(membersResult.totalCount);
      setRecentPayments(paymentsResult.orders);
      setPaymentsCount(paymentsResult.totalCount);
      setTotalKrwAmount(paymentsResult.totalKrwAmount);
      setTotalUsdtAmount(paymentsResult.totalUsdtAmount);
    } catch (loadError) {
      setAgent(null);
      setStores([]);
      setRecentPayments([]);
      setStoresCount(0);
      setStoreMembersCount(0);
      setPaymentsCount(0);
      setTotalKrwAmount(0);
      setTotalUsdtAmount(0);
      setError(loadError instanceof Error ? loadError.message : '결제 대시보드를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const topStores = useMemo(() => {
    return [...stores]
      .sort((a, b) => b.totalKrwAmount - a.totalKrwAmount)
      .slice(0, 8);
  }, [stores]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Payment Dashboard</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">결제 관리</h1>
        <p className="mt-1 text-sm text-slate-600">가맹점/가맹점 회원/결제 확정 거래를 통합으로 모니터링합니다.</p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 결제 관리 페이지를 사용할 수 있습니다.
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

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">가맹점</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{storesCount.toLocaleString()}개</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">가맹점 회원</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{storeMembersCount.toLocaleString()}명</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">가맹점 결제</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{paymentsCount.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">결제 총액</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{formatUsdt(totalUsdtAmount)}</p>
              <p className="text-xs text-slate-500">{formatKrw(totalKrwAmount)}</p>
            </div>
          </section>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              결제 대시보드를 불러오는 중입니다...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div>
          )}

          {!loading && !error && (
            <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">가맹점 결제 상위 현황</p>
                  <p className="text-xs text-slate-500">KRW 결제 금액 기준 상위 8개 가맹점</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {topStores.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-500">가맹점 결제 집계 데이터가 없습니다.</div>
                  ) : (
                    topStores.map((store) => (
                      <div key={store.id || store.storecode} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{store.storeName || store.storecode}</p>
                          <p className="truncate text-xs text-slate-500">{store.storecode || '-'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-slate-700">{formatUsdt(store.totalUsdtAmount)}</p>
                          <p className="text-xs text-slate-500">{formatKrw(store.totalKrwAmount)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">최근 결제 확정 거래</p>
                  <p className="text-xs text-slate-500">walletUsdtPayments 최신 80건 기준</p>
                </div>
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">트랜잭션</th>
                      <th className="px-4 py-3">가맹점</th>
                      <th className="px-4 py-3">회원/결제지갑</th>
                      <th className="px-4 py-3 text-right">수량</th>
                      <th className="px-4 py-3 text-right">금액</th>
                      <th className="px-4 py-3">확정 시각</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentPayments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                          결제 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      recentPayments.slice(0, 12).map((order) => (
                        <tr key={order.id || order.tradeId} className="text-slate-700">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{shortAddress(order.tradeId || '')}</p>
                            <p className="text-xs text-slate-500">{order.status || '-'}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            <p className="font-semibold text-slate-700">{order.storeName || order.storecode || '-'}</p>
                            <p>{order.storecode || '-'}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            <p>회원 {order.buyerNickname || '-'}</p>
                            <p>결제지갑 {shortAddress(order.sellerNickname || '')}</p>
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">{formatUsdt(order.usdtAmount)}</td>
                          <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">{formatKrw(order.krwAmount)}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{toDateTime(order.paymentConfirmedAt || order.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
