'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AgentInfoCard from '../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  fetchBuyOrdersByAgent,
  formatKrw,
  formatUsdt,
  toDateTime,
  type AgentBuyOrderItem,
  type AgentSummary,
} from '../_shared';

const formatPercent = (value: number) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0';
  return (Math.round(numeric * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
};

export default function P2PAgentBuyOrderManagementPage() {
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [orders, setOrders] = useState<AgentBuyOrderItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const loadData = useCallback(async () => {
    if (!agentcode) {
      setAgent(null);
      setOrders([]);
      setTotalCount(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [agentData, ordersResult] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetchBuyOrdersByAgent(agentcode, 200, 1),
      ]);

      setAgent(agentData);
      setOrders(ordersResult.orders);
      setTotalCount(ordersResult.totalCount);
    } catch (loadError) {
      setAgent(null);
      setOrders([]);
      setTotalCount(0);
      setError(loadError instanceof Error ? loadError.message : '거래 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredOrders = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return orders;
    }
    return orders.filter((order) => {
      return (
        order.tradeId.toLowerCase().includes(normalizedKeyword)
        || order.status.toLowerCase().includes(normalizedKeyword)
        || order.storecode.toLowerCase().includes(normalizedKeyword)
        || order.storeName.toLowerCase().includes(normalizedKeyword)
        || order.buyerNickname.toLowerCase().includes(normalizedKeyword)
        || order.sellerNickname.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [orders, keyword]);

  const statusSummary = useMemo(() => {
    const initial = {
      paymentRequested: 0,
      paymentConfirmed: 0,
      cancelled: 0,
      other: 0,
    };

    return filteredOrders.reduce((acc, order) => {
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
  }, [filteredOrders]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">P2P Buy Orders</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">P2P 거래 관리</h1>
        <p className="mt-1 text-sm text-slate-600">에이전트 기준 P2P buyorder 거래를 조회합니다.</p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 거래 관리 페이지를 사용할 수 있습니다.
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
              <p className="text-xs font-semibold text-slate-500">전체</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{totalCount.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">입금요청</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{statusSummary.paymentRequested.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">결제확정</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{statusSummary.paymentConfirmed.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">취소/기타</p>
              <p className="mt-1 text-2xl font-bold text-rose-700">{(statusSummary.cancelled + statusSummary.other).toLocaleString()}건</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">거래 목록 ({filteredOrders.length.toLocaleString()}건)</p>
              <input
                type="text"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="거래ID/상태/가맹점/구매자/판매자 검색"
                className="h-9 w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
              />
            </div>
          </section>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              거래 목록을 불러오는 중입니다...
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
                    <th className="px-4 py-3">가맹점</th>
                    <th className="px-4 py-3">구매자/판매자</th>
                    <th className="px-4 py-3 text-right">수량</th>
                    <th className="px-4 py-3 text-right">금액</th>
                    <th className="px-4 py-3">플랫폼 수수료</th>
                    <th className="px-4 py-3">생성/확정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                        표시할 거래가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr key={order.id || order.tradeId} className="text-slate-700">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">#{order.tradeId || '-'}</p>
                          <p className="text-xs text-slate-500">{order.status || '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-slate-700">{order.storeName || order.storecode || '-'}</p>
                          <p className="text-xs text-slate-500">{order.storecode || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p>구매자 {order.buyerNickname || '-'}</p>
                          <p>판매자 {order.sellerNickname || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">{formatUsdt(order.usdtAmount)}</td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">{formatKrw(order.krwAmount)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {order.platformFeeRate > 0 || order.platformFeeAmount > 0 || order.platformFeeWalletAddress ? (
                            <div className="space-y-0.5">
                              <p className="font-semibold text-indigo-700">{formatPercent(order.platformFeeRate)}%</p>
                              <p className="font-semibold text-indigo-800">{formatUsdt(order.platformFeeAmount)}</p>
                              <p className="truncate text-slate-500">{order.platformFeeWalletAddress || '-'}</p>
                            </div>
                          ) : (
                            <p>-</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p>생성 {toDateTime(order.createdAt)}</p>
                          <p>확정 {toDateTime(order.paymentConfirmedAt)}</p>
                        </td>
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
