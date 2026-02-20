'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AgentInfoCard from '../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  formatKrw,
  formatUsdt,
  toDateTime,
  type AgentSummary,
} from '../_shared';

type AgentSalesOrderItem = {
  id: string;
  tradeId: string;
  status: string;
  storecode: string;
  storeName: string;
  buyerNickname: string;
  sellerNickname: string;
  usdtAmount: number;
  krwAmount: number;
  createdAt: string;
  paymentConfirmedAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isRecord(value) && typeof value.$oid === 'string') return value.$oid;
  return '';
};
const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeSalesOrder = (value: unknown): AgentSalesOrderItem => {
  const source = isRecord(value) ? value : {};
  const store = isRecord(source.store) ? source.store : {};
  const buyer = isRecord(source.buyer) ? source.buyer : {};
  const seller = isRecord(source.seller) ? source.seller : {};

  return {
    id: toText(source._id) || toText(source.id),
    tradeId: toText(source.tradeId),
    status: toText(source.status),
    storecode: toText(source.storecode),
    storeName: toText(store.storeName) || toText(source.storeName) || toText(source.storecode),
    buyerNickname: toText(source.nickname) || toText(buyer.nickname),
    sellerNickname: toText(seller.nickname),
    usdtAmount: toNumber(source.usdtAmount),
    krwAmount: toNumber(source.krwAmount),
    createdAt: toText(source.createdAt),
    paymentConfirmedAt: toText(source.paymentConfirmedAt),
  };
};

const statusLabelMap: Record<string, string> = {
  ordered: '주문대기',
  accepted: '주문수락',
  paymentRequested: '입금요청',
  paymentConfirmed: '결제확정',
  cancelled: '취소',
};

export default function P2PAgentSalesManagementPage() {
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [orders, setOrders] = useState<AgentSalesOrderItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalKrwAmount, setTotalKrwAmount] = useState(0);
  const [totalUsdtAmount, setTotalUsdtAmount] = useState(0);

  const loadData = useCallback(async () => {
    if (!agentcode) {
      setAgent(null);
      setOrders([]);
      setTotalCount(0);
      setTotalKrwAmount(0);
      setTotalUsdtAmount(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [agentData, response] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetch('/api/agent/get-buyorders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentcode,
            page: 1,
            limit: 200,
            searchTerm: '',
            status: 'all',
            hasBankInfo: 'all',
          }),
        }),
      ]);

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '판매 거래내역을 불러오지 못했습니다.'));
      }

      const payloadRecord = isRecord(payload) ? payload : {};
      const payloadResult = isRecord(payloadRecord.result) ? payloadRecord.result : {};
      const items = Array.isArray(payloadRecord.items)
        ? (payloadRecord.items as unknown[])
        : Array.isArray(payloadResult.orders)
        ? (payloadResult.orders as unknown[])
        : [];
      const normalizedOrders = items.map((item) => normalizeSalesOrder(item));
      const resolvedTotalCount = toNumber(payloadRecord.totalCount || payloadResult.totalCount || normalizedOrders.length);
      const resolvedTotalKrwAmount = toNumber(payloadRecord.totalKrwAmount || payloadResult.totalKrwAmount);
      const resolvedTotalUsdtAmount = toNumber(payloadRecord.totalUsdtAmount || payloadResult.totalUsdtAmount);

      setAgent(agentData);
      setOrders(normalizedOrders);
      setTotalCount(resolvedTotalCount);
      setTotalKrwAmount(resolvedTotalKrwAmount);
      setTotalUsdtAmount(resolvedTotalUsdtAmount);
    } catch (loadError) {
      setAgent(null);
      setOrders([]);
      setTotalCount(0);
      setTotalKrwAmount(0);
      setTotalUsdtAmount(0);
      setError(loadError instanceof Error ? loadError.message : '판매 거래내역을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode]);

  useEffect(() => {
    void loadData();
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Sales Management</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">판매관리</h1>
        <p className="mt-1 text-sm text-slate-600">agentcode 기준 buyorders P2P 거래내역을 조회합니다.</p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 판매관리 페이지를 사용할 수 있습니다.
        </div>
      )}

      {agentcode && (
        <>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                void loadData();
              }}
              disabled={loading}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '조회 중...' : '새로고침'}
            </button>
          </div>

          <AgentInfoCard agent={agent} fallbackAgentcode={agentcode} />

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">전체 거래</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{totalCount.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">총 KRW</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatKrw(totalKrwAmount)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">총 USDT</p>
              <p className="mt-1 text-xl font-bold text-cyan-700">{formatUsdt(totalUsdtAmount)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">표시중</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{filteredOrders.length.toLocaleString()}건</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">P2P 거래내역</p>
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
              판매 거래내역을 불러오는 중입니다...
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
                    <th className="px-4 py-3">생성/확정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        표시할 거래가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr key={order.id || order.tradeId} className="text-slate-700">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">#{order.tradeId || '-'}</p>
                          <p className="text-xs text-slate-500">{statusLabelMap[order.status] || order.status || '-'}</p>
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
