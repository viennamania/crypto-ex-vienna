'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AgentInfoCard from '../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  fetchWalletUsdtPaymentsByAgent,
  formatKrw,
  formatUsdt,
  shortAddress,
  toDateTime,
  type AgentBuyOrderItem,
  type AgentSummary,
} from '../_shared';

export default function P2PAgentPaymentManagementPage() {
  const PAGE_SIZE = 20;
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [payments, setPayments] = useState<AgentBuyOrderItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalKrwAmount, setTotalKrwAmount] = useState(0);
  const [totalUsdtAmount, setTotalUsdtAmount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const loadData = useCallback(async () => {
    if (!agentcode) {
      setAgent(null);
      setPayments([]);
      setTotalCount(0);
      setTotalKrwAmount(0);
      setTotalUsdtAmount(0);
      setCurrentPage(1);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [agentData, paymentsResult] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetchWalletUsdtPaymentsByAgent(agentcode, {
          limit: PAGE_SIZE,
          page: currentPage,
          searchTerm: keyword.trim(),
          status: 'confirmed',
        }),
      ]);

      setAgent(agentData);
      setPayments(paymentsResult.orders);
      setTotalCount(paymentsResult.totalCount);
      setTotalKrwAmount(paymentsResult.totalKrwAmount);
      setTotalUsdtAmount(paymentsResult.totalUsdtAmount);
    } catch (loadError) {
      setAgent(null);
      setPayments([]);
      setTotalCount(0);
      setTotalKrwAmount(0);
      setTotalUsdtAmount(0);
      setError(loadError instanceof Error ? loadError.message : '결제 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [PAGE_SIZE, agentcode, currentPage, keyword]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [PAGE_SIZE, totalCount],
  );

  const visiblePageNumbers = useMemo(() => {
    const windowSize = 5;
    const start = Math.max(1, currentPage - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    const adjustedStart = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [currentPage, totalPages]);

  const isPreviousDisabled = currentPage <= 1 || loading;
  const isNextDisabled = currentPage >= totalPages || loading;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Payments</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">가맹점 결제 관리</h1>
        <p className="mt-1 text-sm text-slate-600">에이전트 기준 결제 확정 거래를 조회합니다.</p>
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

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">결제 확정 건수</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{totalCount.toLocaleString()}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">결제 확정 KRW</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatKrw(totalKrwAmount)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">결제 확정 USDT</p>
              <p className="mt-1 text-2xl font-bold text-cyan-700">{formatUsdt(totalUsdtAmount)}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">결제 목록 ({totalCount.toLocaleString()}건)</p>
              <input
                type="text"
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="트랜잭션/가맹점/회원/지갑 검색"
                className="h-9 w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
              />
            </div>
          </section>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              결제 목록을 불러오는 중입니다...
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
                    <th className="px-4 py-3">트랜잭션</th>
                    <th className="px-4 py-3">가맹점</th>
                    <th className="px-4 py-3">회원/결제지갑</th>
                    <th className="px-4 py-3 text-right">수량</th>
                    <th className="px-4 py-3 text-right">금액</th>
                    <th className="px-4 py-3">확정시각</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        표시할 결제가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment) => (
                      <tr key={payment.id || payment.tradeId} className="text-slate-700">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">
                            {payment.tradeId ? shortAddress(payment.tradeId) : '#-'}
                          </p>
                          <p className="text-xs text-slate-500">{payment.status || '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600">
                              {payment.storeLogo ? (
                                <div
                                  className="h-full w-full bg-cover bg-center"
                                  style={{ backgroundImage: `url(${encodeURI(payment.storeLogo)})` }}
                                  aria-label={payment.storeName || payment.storecode || 'store logo'}
                                />
                              ) : (
                                (payment.storeName || payment.storecode || 'S').slice(0, 1)
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-700">
                                {payment.storeName || payment.storecode || '-'}
                              </p>
                              <p className="truncate text-xs text-slate-500">코드 {payment.storecode || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p>회원 {payment.buyerNickname || '-'}</p>
                          <p>결제지갑 {shortAddress(payment.sellerNickname || '')}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">{formatUsdt(payment.usdtAmount)}</td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">{formatKrw(payment.krwAmount)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{toDateTime(payment.paymentConfirmedAt || payment.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && totalCount > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600">
                  페이지 {currentPage} / {totalPages} · 총 {totalCount.toLocaleString()}건
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={isPreviousDisabled}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    이전
                  </button>

                  {visiblePageNumbers.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setCurrentPage(pageNumber)}
                      disabled={loading}
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition ${
                        pageNumber === currentPage
                          ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      {pageNumber}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={isNextDisabled}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    다음
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
