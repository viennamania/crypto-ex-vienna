'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AgentInfoCard from '../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  fetchBuyOrdersByAgent,
  fetchUsersByAgent,
  formatKrw,
  formatUsdt,
  toDateTime,
  type AgentBuyOrderItem,
  type AgentSummary,
} from '../_shared';

export default function P2PAgentP2PManagementPage() {
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [buyersCount, setBuyersCount] = useState(0);
  const [sellersCount, setSellersCount] = useState(0);
  const [orders, setOrders] = useState<AgentBuyOrderItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const loadData = useCallback(async () => {
    if (!agentcode) {
      setAgent(null);
      setBuyersCount(0);
      setSellersCount(0);
      setOrders([]);
      setTotalCount(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [agentData, buyersResult, sellersResult, ordersResult] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetchUsersByAgent(agentcode, {
          userType: 'buyer',
          requireProfile: true,
          includeWalletless: true,
          limit: 1,
          page: 1,
        }),
        fetchUsersByAgent(agentcode, {
          userType: 'seller',
          requireProfile: true,
          includeWalletless: true,
          limit: 1,
          page: 1,
        }),
        fetchBuyOrdersByAgent(agentcode, 200, 1),
      ]);

      setAgent(agentData);
      setBuyersCount(buyersResult.totalCount);
      setSellersCount(sellersResult.totalCount);
      setOrders(ordersResult.orders);
      setTotalCount(ordersResult.totalCount);
    } catch (loadError) {
      setAgent(null);
      setBuyersCount(0);
      setSellersCount(0);
      setOrders([]);
      setTotalCount(0);
      setError(loadError instanceof Error ? loadError.message : 'P2P 대시보드를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const statusSummary = useMemo(() => {
    const initial = {
      paymentRequested: 0,
      paymentConfirmed: 0,
      cancelled: 0,
      other: 0,
    };

    return orders.reduce((acc, order) => {
      const status = String(order.status || '').trim();
      if (status === 'paymentRequested') {
        acc.paymentRequested += 1;
      } else if (status === 'paymentConfirmed') {
        acc.paymentConfirmed += 1;
      } else if (status === 'cancelled') {
        acc.cancelled += 1;
      } else {
        acc.other += 1;
      }
      return acc;
    }, initial);
  }, [orders]);

  const tradeTotals = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        acc.usdt += Number(order.usdtAmount) || 0;
        acc.krw += Number(order.krwAmount) || 0;
        return acc;
      },
      { usdt: 0, krw: 0 },
    );
  }, [orders]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">P2P Management</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">P2P 관리</h1>
        <p className="mt-1 text-sm text-slate-600">구매자/판매자/거래 상태를 한 번에 확인하는 P2P 운영 대시보드입니다.</p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 P2P 관리 페이지를 사용할 수 있습니다.
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
              <p className="text-xs font-semibold text-slate-500">P2P 구매자</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{buyersCount.toLocaleString()}명</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">P2P 판매자</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{sellersCount.toLocaleString()}명</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">P2P 거래</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{totalCount.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">최근 집계 합계</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{formatUsdt(tradeTotals.usdt)}</p>
              <p className="text-xs text-slate-500">{formatKrw(tradeTotals.krw)} (최근 200건)</p>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">입금요청</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{statusSummary.paymentRequested.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">결제확정</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{statusSummary.paymentConfirmed.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">취소</p>
              <p className="mt-1 text-2xl font-bold text-rose-700">{statusSummary.cancelled.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">기타 상태</p>
              <p className="mt-1 text-2xl font-bold text-slate-700">{statusSummary.other.toLocaleString()}건</p>
            </div>
          </section>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              P2P 데이터를 불러오는 중입니다...
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
                    <th className="px-4 py-3">거래</th>
                    <th className="px-4 py-3">구매자/판매자</th>
                    <th className="px-4 py-3">가맹점</th>
                    <th className="px-4 py-3 text-right">수량</th>
                    <th className="px-4 py-3 text-right">금액</th>
                    <th className="px-4 py-3">생성 시각</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        표시할 P2P 거래 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.id || order.tradeId} className="text-slate-700">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">#{order.tradeId || '-'}</p>
                          <p className="text-xs text-slate-500">{order.status || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p>구매자 {order.buyerNickname || '-'}</p>
                          <p>판매자 {order.sellerNickname || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p className="font-semibold text-slate-700">{order.storeName || order.storecode || '-'}</p>
                          <p>{order.storecode || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">{formatUsdt(order.usdtAmount)}</td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">{formatKrw(order.krwAmount)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{toDateTime(order.createdAt)}</td>
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
