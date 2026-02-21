'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AgentInfoCard from '../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  fetchUsersByAgent,
  formatKrw,
  formatUsdt,
  shortAddress,
  toDateTime,
  type AgentSummary,
  type AgentUserItem,
} from '../_shared';

type BuyorderDashboardItem = {
  id: string;
  tradeId: string;
  status: string;
  storecode: string;
  storeName: string;
  buyerNickname: string;
  sellerNickname: string;
  usdtAmount: number;
  krwAmount: number;
  platformFeeAmount: number;
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

const normalizeOrder = (value: unknown): BuyorderDashboardItem => {
  const source = isRecord(value) ? value : {};
  const buyer = isRecord(source.buyer) ? source.buyer : {};
  const seller = isRecord(source.seller) ? source.seller : {};
  const store = isRecord(source.store) ? source.store : {};
  const settlement = isRecord(source.settlement) ? source.settlement : {};

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
    platformFeeAmount: toNumber(source.platformFeeAmount || source.platform_fee_amount || settlement.platformFeeAmount),
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

export default function P2PAgentBuyorderDashboardPage() {
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [sellersCount, setSellersCount] = useState(0);
  const [recentSellers, setRecentSellers] = useState<AgentUserItem[]>([]);
  const [orders, setOrders] = useState<BuyorderDashboardItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalKrwAmount, setTotalKrwAmount] = useState(0);
  const [totalUsdtAmount, setTotalUsdtAmount] = useState(0);
  const [totalPlatformFeeAmount, setTotalPlatformFeeAmount] = useState(0);

  const loadData = useCallback(async () => {
    if (!agentcode) {
      setAgent(null);
      setSellersCount(0);
      setRecentSellers([]);
      setOrders([]);
      setTotalCount(0);
      setTotalKrwAmount(0);
      setTotalUsdtAmount(0);
      setTotalPlatformFeeAmount(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [agentData, sellersResult, response] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetchUsersByAgent(agentcode, {
          userType: 'seller',
          requireProfile: true,
          includeWalletless: true,
          limit: 5,
          page: 1,
        }),
        fetch('/api/agent/get-buyorders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentcode,
            page: 1,
            limit: 5,
            searchTerm: '',
            status: 'all',
            hasBankInfo: 'all',
          }),
        }),
      ]);

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '구매주문 대시보드를 불러오지 못했습니다.'));
      }

      const payloadRecord = isRecord(payload) ? payload : {};
      const payloadResult = isRecord(payloadRecord.result) ? payloadRecord.result : {};
      const rawItems = Array.isArray(payloadRecord.items)
        ? (payloadRecord.items as unknown[])
        : Array.isArray(payloadResult.orders)
        ? (payloadResult.orders as unknown[])
        : [];
      const normalizedOrders = rawItems.map((item) => normalizeOrder(item));

      const resolvedTotalKrwAmount = toNumber(payloadRecord.totalKrwAmount || payloadResult.totalKrwAmount);
      const resolvedTotalUsdtAmount = toNumber(payloadRecord.totalUsdtAmount || payloadResult.totalUsdtAmount);
      const resolvedTotalPlatformFeeAmount = toNumber(
        payloadRecord.totalPlatformFeeAmount || payloadResult.totalPlatformFeeAmount,
      );

      setAgent(agentData);
      setSellersCount(sellersResult.totalCount);
      setRecentSellers(sellersResult.users);
      setOrders(normalizedOrders);
      setTotalCount(toNumber(payloadRecord.totalCount || payloadResult.totalCount || normalizedOrders.length));
      setTotalKrwAmount(resolvedTotalKrwAmount);
      setTotalUsdtAmount(resolvedTotalUsdtAmount);
      setTotalPlatformFeeAmount(resolvedTotalPlatformFeeAmount);
    } catch (loadError) {
      setAgent(null);
      setSellersCount(0);
      setRecentSellers([]);
      setOrders([]);
      setTotalCount(0);
      setTotalKrwAmount(0);
      setTotalUsdtAmount(0);
      setTotalPlatformFeeAmount(0);
      setError(loadError instanceof Error ? loadError.message : '구매주문 대시보드를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);
  const recentSellerItems = useMemo(() => recentSellers.slice(0, 5), [recentSellers]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Buyorder Dashboard</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">판매 관리</h1>
        <p className="mt-1 text-sm text-slate-600">판매자/구매주문 운영 현황을 한 번에 확인하는 대시보드입니다.</p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 판매 관리 페이지를 사용할 수 있습니다.
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

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">총 판매자</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{sellersCount.toLocaleString()}명</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">전체 구매주문</p>
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
              <p className="text-xs font-semibold text-slate-500">플랫폼 수수료</p>
              <p className="mt-1 text-xl font-bold text-indigo-700">{formatUsdt(totalPlatformFeeAmount)}</p>
            </div>
          </section>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              구매주문 대시보드를 불러오는 중입니다...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div>
          )}

          {!loading && !error && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">최근 구매주문 5건</p>
                  <p className="text-xs text-slate-500">최신순</p>
                </div>
                <div className="mt-2 space-y-2">
                  {recentOrders.length === 0 ? (
                    <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                      표시할 구매주문 데이터가 없습니다.
                    </p>
                  ) : (
                    recentOrders.map((order) => (
                      <div key={order.id || order.tradeId} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">#{order.tradeId || '-'}</p>
                          <span className="text-xs font-semibold text-slate-600">{statusLabelMap[order.status] || order.status || '-'}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">판매자 {order.sellerNickname || '-'} · 구매자 {order.buyerNickname || '-'}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{formatUsdt(order.usdtAmount)} / {formatKrw(order.krwAmount)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{toDateTime(order.createdAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">최근 판매자 5명</p>
                  <p className="text-xs text-slate-500">최신순</p>
                </div>
                <div className="mt-2 space-y-2">
                  {recentSellerItems.length === 0 ? (
                    <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                      표시할 판매자 데이터가 없습니다.
                    </p>
                  ) : (
                    recentSellerItems.map((seller) => (
                      <div
                        key={seller.id || `${seller.storecode}-${seller.walletAddress}-${seller.nickname}`}
                        className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2.5">
                          {seller.avatar ? (
                            <span
                              className="h-8 w-8 rounded-full border border-slate-200 bg-cover bg-center bg-no-repeat"
                              style={{ backgroundImage: `url(${encodeURI(seller.avatar)})` }}
                            />
                          ) : (
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500">
                              {(seller.nickname || 'S').slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{seller.nickname || '-'}</p>
                            <p className="truncate text-xs text-slate-500">{shortAddress(seller.walletAddress)}</p>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{toDateTime(seller.createdAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
