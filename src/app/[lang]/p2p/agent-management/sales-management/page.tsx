'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useActiveAccount } from 'thirdweb/react';

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
  privateSale: boolean;
  canceller: string;
  cancelledByRole: string;
  cancelledByWalletAddress: string;
  cancelledByNickname: string;
  cancelledByIpAddress: string;
  storecode: string;
  storeName: string;
  buyerNickname: string;
  buyerWalletAddress: string;
  sellerNickname: string;
  sellerWalletAddress: string;
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
    privateSale: source.privateSale === true,
    canceller: toText(source.canceller),
    cancelledByRole: toText(source.cancelledByRole),
    cancelledByWalletAddress: toText(source.cancelledByWalletAddress),
    cancelledByNickname: toText(source.cancelledByNickname),
    cancelledByIpAddress: toText(source.cancelledByIpAddress),
    storecode: toText(source.storecode),
    storeName: toText(store.storeName) || toText(source.storeName) || toText(source.storecode),
    buyerNickname: toText(source.nickname) || toText(buyer.nickname),
    buyerWalletAddress: toText(buyer.walletAddress) || toText(source.walletAddress),
    sellerNickname: toText(seller.nickname),
    sellerWalletAddress: toText(seller.walletAddress),
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

const shortWallet = (value: string) => {
  const source = String(value || '').trim();
  if (!source) return '-';
  if (source.length <= 12) return source;
  return `${source.slice(0, 6)}...${source.slice(-4)}`;
};

const resolveCancellerRole = (order: AgentSalesOrderItem): 'buyer' | 'seller' | 'admin' | 'agent' | 'unknown' => {
  const role = String(order.cancelledByRole || order.canceller || '').trim().toLowerCase();
  if (role === 'buyer' || role.includes('구매')) return 'buyer';
  if (role === 'seller' || role.includes('판매')) return 'seller';
  if (role === 'admin' || role.includes('관리')) return 'admin';
  if (role === 'agent' || role.includes('에이전트')) return 'agent';
  return 'unknown';
};

const getCancellerRoleLabel = (order: AgentSalesOrderItem) => {
  const role = resolveCancellerRole(order);
  if (role === 'buyer') return '구매자';
  if (role === 'seller') return '판매자';
  if (role === 'admin') return '관리자';
  if (role === 'agent') return '에이전트';
  return '미확인';
};

const getCancellerLabel = (order: AgentSalesOrderItem) => {
  const nickname = String(order.cancelledByNickname || '').trim();
  const walletAddress = String(order.cancelledByWalletAddress || '').trim();
  const role = resolveCancellerRole(order);

  if (nickname && walletAddress) return `${nickname} (${shortWallet(walletAddress)})`;
  if (nickname) return nickname;
  if (walletAddress) return shortWallet(walletAddress);
  if (role === 'buyer') return '구매자';
  if (role === 'seller') return '판매자';
  if (role === 'admin') return '관리자';
  if (role === 'agent') return '에이전트';
  return '-';
};

export default function P2PAgentSalesManagementPage() {
  const searchParams = useSearchParams();
  const activeAccount = useActiveAccount();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [orders, setOrders] = useState<AgentSalesOrderItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalKrwAmount, setTotalKrwAmount] = useState(0);
  const [totalUsdtAmount, setTotalUsdtAmount] = useState(0);
  const [cancelTargetOrder, setCancelTargetOrder] = useState<AgentSalesOrderItem | null>(null);
  const [cancelingOrder, setCancelingOrder] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

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

  const closeCancelModal = () => {
    if (cancelingOrder) return;
    setCancelTargetOrder(null);
    setCancelError(null);
  };

  const cancelPrivateOrderByAgent = useCallback(async () => {
    const targetOrderId = String(cancelTargetOrder?.id || '').trim();
    if (!targetOrderId) {
      setCancelError('취소할 주문 식별자를 찾을 수 없습니다.');
      return;
    }
    if (cancelingOrder) return;

    const actorWalletAddress = String(activeAccount?.address || agent?.adminWalletAddress || '').trim();
    const actorNickname = String(agent?.agentName || '').trim() || '에이전트';

    setCancelingOrder(true);
    setCancelError(null);
    try {
      const response = await fetch('/api/order/cancelPrivateBuyOrderByAdminToBuyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: targetOrderId,
          adminWalletAddress: actorWalletAddress,
          cancelledByRole: 'agent',
          cancelledByNickname: actorNickname,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.result?.success) {
        throw new Error(String(payload?.error || '주문 취소 처리에 실패했습니다.'));
      }

      const txHash = String(payload?.result?.transactionHash || '').trim();
      toast.success(txHash ? `주문 취소 완료 (TX: ${shortWallet(txHash)})` : '주문 취소 완료');
      setCancelTargetOrder(null);
      await loadData();
    } catch (cancelErrorValue) {
      const message = cancelErrorValue instanceof Error ? cancelErrorValue.message : '주문 취소 처리 중 오류가 발생했습니다.';
      setCancelError(message);
      toast.error(message);
    } finally {
      setCancelingOrder(false);
    }
  }, [activeAccount?.address, agent?.adminWalletAddress, agent?.agentName, cancelTargetOrder?.id, cancelingOrder, loadData]);

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
              <table className="min-w-[1080px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">거래</th>
                    <th className="px-4 py-3">가맹점</th>
                    <th className="px-4 py-3">구매자/판매자</th>
                    <th className="px-4 py-3 text-right">수량</th>
                    <th className="px-4 py-3 text-right">금액</th>
                    <th className="px-4 py-3">생성/확정</th>
                    <th className="px-4 py-3 text-center">액션</th>
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
                    filteredOrders.map((order) => {
                      const canCancelOrder = order.privateSale === true && order.status === 'paymentRequested';

                      return (
                      <tr key={order.id || order.tradeId} className="text-slate-700">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">#{order.tradeId || '-'}</p>
                          <p className="text-xs text-slate-500">{statusLabelMap[order.status] || order.status || '-'}</p>
                          {order.status === 'cancelled' && (
                            <>
                              <p className="mt-0.5 text-[11px] font-semibold text-slate-600">
                                취소주체 {getCancellerRoleLabel(order)}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                취소자 {getCancellerLabel(order)}
                              </p>
                            </>
                          )}
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
                        <td className="px-4 py-3 text-center">
                          {canCancelOrder ? (
                            <button
                              type="button"
                              onClick={() => {
                                setCancelTargetOrder(order);
                                setCancelError(null);
                              }}
                              className="inline-flex items-center justify-center rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 transition hover:border-rose-400 hover:bg-rose-100"
                            >
                              취소
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {cancelTargetOrder && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/45 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={closeCancelModal}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-[0_42px_90px_-52px_rgba(15,23,42,0.9)]"
            role="dialog"
            aria-modal="true"
            aria-label="주문 취소 확인"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-xl font-bold text-slate-900">주문 취소 확인</p>
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium leading-relaxed text-amber-900">
                취소를 확정하면 에스크로에 보관된 USDT가 판매자 지갑으로 반환되고, 주문 상태는
                <span className="mx-1 font-bold">주문취소</span>
                로 기록됩니다.
              </p>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="grid grid-cols-[126px_1fr] gap-x-3 gap-y-3">
                <p className="text-sm font-semibold text-slate-500">주문 ID</p>
                <p className="break-all text-base font-medium text-slate-900">{cancelTargetOrder.id || '-'}</p>
                <p className="text-sm font-semibold text-slate-500">거래번호(TID)</p>
                <p className="break-all text-base font-medium text-slate-900">{cancelTargetOrder.tradeId || '-'}</p>
                <p className="text-sm font-semibold text-slate-500">구매자</p>
                <p className="break-all text-base font-semibold text-slate-900">
                  {cancelTargetOrder.buyerNickname || '-'} ({shortWallet(cancelTargetOrder.buyerWalletAddress)})
                </p>
                <p className="text-sm font-semibold text-slate-500">판매자</p>
                <p className="break-all text-base font-semibold text-slate-900">
                  {cancelTargetOrder.sellerNickname || '-'} ({shortWallet(cancelTargetOrder.sellerWalletAddress)})
                </p>
                <p className="text-sm font-semibold text-slate-500">반환 수량</p>
                <p className="text-base font-bold text-slate-900">{formatUsdt(cancelTargetOrder.usdtAmount)} USDT</p>
                <p className="text-sm font-semibold text-slate-500">현재 상태</p>
                <p className="text-base font-medium text-slate-900">{statusLabelMap[cancelTargetOrder.status] || cancelTargetOrder.status || '-'}</p>
              </div>

              {cancelError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {cancelError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeCancelModal}
                disabled={cancelingOrder}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => {
                  void cancelPrivateOrderByAgent();
                }}
                disabled={cancelingOrder || !(cancelTargetOrder.privateSale === true && cancelTargetOrder.status === 'paymentRequested')}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-rose-600 bg-rose-600 px-4 text-sm font-semibold text-white transition hover:border-rose-700 hover:bg-rose-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {cancelingOrder ? '취소 처리 중...' : 'USDT 반환 후 주문 취소'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
