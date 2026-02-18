'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type DashboardStore = {
  storecode: string;
  storeName: string;
  storeLogo: string;
  paymentWalletAddress: string;
};

type DashboardSummary = {
  totalCount: number;
  totalUsdtAmount: number;
  totalKrwAmount: number;
  avgExchangeRate: number;
  latestConfirmedAt: string;
};

type DashboardDaily = {
  day: string;
  count: number;
  totalUsdtAmount: number;
  totalKrwAmount: number;
};

type DashboardTopMember = {
  walletAddress: string;
  nickname: string;
  memberStorecode: string;
  totalUsdtAmount: number;
  totalKrwAmount: number;
  count: number;
};

type DashboardPayment = {
  id: string;
  usdtAmount: number;
  krwAmount: number;
  exchangeRate: number;
  confirmedAt: string;
  createdAt: string;
  fromWalletAddress: string;
  member?: {
    nickname?: string;
  } | null;
};

type DashboardPayload = {
  store: DashboardStore;
  summary: DashboardSummary;
  daily: DashboardDaily[];
  topMembers: DashboardTopMember[];
  payments: DashboardPayment[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const shortAddress = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

const toDateTime = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR');
};

const formatKrw = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number(value) || 0)}원`;

const formatUsdt = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(Number(value) || 0)} USDT`;

const formatRate = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0)} KRW`;

export default function P2PStoreStatsManagementPage() {
  const searchParams = useSearchParams();
  const storecode = String(searchParams?.get('storecode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!storecode) {
      setDashboard(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/wallet/payment-usdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'store-dashboard',
          storecode,
          limit: 100,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(data?.result)) {
        throw new Error(String(data?.error || '결제 통계를 불러오지 못했습니다.'));
      }

      const result = data.result as Record<string, unknown>;
      const storeData = isRecord(result.store) ? result.store : {};
      const summaryData = isRecord(result.summary) ? result.summary : {};
      const dailyData = Array.isArray(result.daily) ? result.daily : [];
      const topMembersData = Array.isArray(result.topMembers) ? result.topMembers : [];
      const paymentsData = Array.isArray(result.payments) ? result.payments : [];

      setDashboard({
        store: {
          storecode: String(storeData.storecode || storecode),
          storeName: String(storeData.storeName || storecode),
          storeLogo: String(storeData.storeLogo || ''),
          paymentWalletAddress: String(storeData.paymentWalletAddress || ''),
        },
        summary: {
          totalCount: Number(summaryData.totalCount || 0),
          totalUsdtAmount: Number(summaryData.totalUsdtAmount || 0),
          totalKrwAmount: Number(summaryData.totalKrwAmount || 0),
          avgExchangeRate: Number(summaryData.avgExchangeRate || 0),
          latestConfirmedAt: String(summaryData.latestConfirmedAt || ''),
        },
        daily: dailyData.map((item) => {
          const row = isRecord(item) ? item : {};
          return {
            day: String(row.day || ''),
            count: Number(row.count || 0),
            totalUsdtAmount: Number(row.totalUsdtAmount || 0),
            totalKrwAmount: Number(row.totalKrwAmount || 0),
          };
        }),
        topMembers: topMembersData.map((item) => {
          const row = isRecord(item) ? item : {};
          return {
            walletAddress: String(row.walletAddress || ''),
            nickname: String(row.nickname || ''),
            memberStorecode: String(row.memberStorecode || ''),
            totalUsdtAmount: Number(row.totalUsdtAmount || 0),
            totalKrwAmount: Number(row.totalKrwAmount || 0),
            count: Number(row.count || 0),
          };
        }),
        payments: paymentsData.map((item) => {
          const row = isRecord(item) ? item : {};
          const member = isRecord(row.member) ? row.member : null;
          return {
            id: String(row.id || ''),
            usdtAmount: Number(row.usdtAmount || 0),
            krwAmount: Number(row.krwAmount || 0),
            exchangeRate: Number(row.exchangeRate || 0),
            confirmedAt: String(row.confirmedAt || ''),
            createdAt: String(row.createdAt || ''),
            fromWalletAddress: String(row.fromWalletAddress || ''),
            member: member
              ? {
                  nickname: String(member.nickname || ''),
                }
              : null,
          };
        }),
      });
    } catch (loadError) {
      setDashboard(null);
      setError(loadError instanceof Error ? loadError.message : '결제 통계를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [storecode]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const dailySeries = useMemo(() => dashboard?.daily.slice(-14) || [], [dashboard?.daily]);
  const maxDailyUsdt = useMemo(
    () => Math.max(1, ...dailySeries.map((item) => Number(item.totalUsdtAmount || 0))),
    [dailySeries],
  );

  const recent7Summary = useMemo(() => {
    const series = dailySeries.slice(-7);
    return series.reduce(
      (acc, item) => {
        acc.count += Number(item.count || 0);
        acc.usdt += Number(item.totalUsdtAmount || 0);
        acc.krw += Number(item.totalKrwAmount || 0);
        return acc;
      },
      { count: 0, usdt: 0, krw: 0 },
    );
  }, [dailySeries]);

  const todaySummary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return dailySeries.find((item) => String(item.day || '').trim() === today) || null;
  }, [dailySeries]);

  const peakDay = useMemo(() => {
    if (dailySeries.length === 0) return null;
    return [...dailySeries].sort((a, b) => b.totalUsdtAmount - a.totalUsdtAmount)[0];
  }, [dailySeries]);

  const averageTicketKrw = useMemo(() => {
    const count = Number(dashboard?.summary.totalCount || 0);
    if (count <= 0) return 0;
    return Number(dashboard?.summary.totalKrwAmount || 0) / count;
  }, [dashboard?.summary.totalCount, dashboard?.summary.totalKrwAmount]);

  const averageTicketUsdt = useMemo(() => {
    const count = Number(dashboard?.summary.totalCount || 0);
    if (count <= 0) return 0;
    return Number(dashboard?.summary.totalUsdtAmount || 0) / count;
  }, [dashboard?.summary.totalCount, dashboard?.summary.totalUsdtAmount]);

  const topMembers = useMemo(() => dashboard?.topMembers.slice(0, 8) || [], [dashboard?.topMembers]);
  const recentPayments = useMemo(() => dashboard?.payments.slice(0, 10) || [], [dashboard?.payments]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Payment Statistics</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">결제통계</h1>
        <p className="mt-1 text-sm text-slate-600">가맹점 결제 데이터를 지표 중심으로 분석합니다.</p>
      </div>

      {!storecode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?storecode=...` 파라미터를 추가해야 결제통계를 사용할 수 있습니다.
        </div>
      )}

      {storecode && (
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
              결제 통계를 불러오는 중입니다...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              {error}
            </div>
          )}

          {!loading && !error && dashboard && (
            <>
              <section className="rounded-2xl border border-cyan-200 bg-cyan-50/60 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-cyan-200">
                    {dashboard.store.storeLogo ? (
                      <div
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${encodeURI(dashboard.store.storeLogo)})` }}
                        aria-label={dashboard.store.storeName}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-cyan-700">
                        SHOP
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-slate-900">{dashboard.store.storeName}</p>
                    <p className="truncate text-xs text-slate-600">
                      코드: {dashboard.store.storecode} · 결제지갑: {shortAddress(dashboard.store.paymentWalletAddress)}
                    </p>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">누적 결제 건수</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{dashboard.summary.totalCount.toLocaleString()}건</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">누적 결제량</p>
                  <p className="mt-1 text-2xl font-bold text-cyan-700">{formatUsdt(dashboard.summary.totalUsdtAmount)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">누적 결제금액</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{formatKrw(dashboard.summary.totalKrwAmount)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">평균 환율</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">1 USDT = {formatRate(dashboard.summary.avgExchangeRate)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">최근 승인: {toDateTime(dashboard.summary.latestConfirmedAt)}</p>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">최근 7일 결제</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{recent7Summary.count.toLocaleString()}건</p>
                  <p className="mt-1 text-sm font-semibold text-cyan-700">{formatUsdt(recent7Summary.usdt)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{formatKrw(recent7Summary.krw)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">오늘 결제</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{Number(todaySummary?.count || 0).toLocaleString()}건</p>
                  <p className="mt-1 text-sm font-semibold text-cyan-700">{formatUsdt(Number(todaySummary?.totalUsdtAmount || 0))}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{formatKrw(Number(todaySummary?.totalKrwAmount || 0))}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">객단가</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatKrw(averageTicketKrw)}</p>
                  <p className="mt-1 text-sm font-semibold text-cyan-700">{formatUsdt(averageTicketUsdt)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    최대 결제일: {peakDay ? `${peakDay.day} (${formatUsdt(peakDay.totalUsdtAmount)})` : '-'}
                  </p>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <h2 className="text-base font-semibold text-slate-900">일자별 결제 추이 (최근 14일)</h2>
                {dailySeries.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">집계 데이터가 없습니다.</p>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    {dailySeries.map((item) => {
                      const ratio = Math.max(
                        4,
                        Math.min(100, Math.round((Number(item.totalUsdtAmount || 0) / maxDailyUsdt) * 100)),
                      );
                      return (
                        <div key={item.day} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-700">{item.day || '-'}</span>
                            <span className="text-slate-500">{item.count.toLocaleString()}건</span>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#06b6d4_0%,#0891b2_60%,#0e7490_100%)]"
                              style={{ width: `${ratio}%` }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                            <span className="font-semibold text-cyan-700">{formatUsdt(item.totalUsdtAmount)}</span>
                            <span className="text-slate-500">{formatKrw(item.totalKrwAmount)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <h2 className="text-base font-semibold text-slate-900">상위 결제 회원</h2>
                  {topMembers.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">회원 집계 데이터가 없습니다.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {topMembers.map((member, index) => (
                        <div key={`${member.walletAddress}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-500">#{index + 1}</span>
                            <span className="text-[11px] text-slate-500">{member.count.toLocaleString()}건</span>
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                            {member.nickname || shortAddress(member.walletAddress)}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">{shortAddress(member.walletAddress)}</p>
                          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                            <span className="font-semibold text-cyan-700">{formatUsdt(member.totalUsdtAmount)}</span>
                            <span className="text-slate-500">{formatKrw(member.totalKrwAmount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <h2 className="text-base font-semibold text-slate-900">최근 승인 결제</h2>
                  {recentPayments.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">결제 내역이 없습니다.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {recentPayments.map((payment) => (
                        <div key={payment.id} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">{formatUsdt(payment.usdtAmount)}</span>
                            <span className="text-sm font-semibold text-slate-700">{formatKrw(payment.krwAmount)}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            회원: {String(payment.member?.nickname || '').trim() || shortAddress(payment.fromWalletAddress)}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            환율 1 USDT = {formatRate(payment.exchangeRate)} · {toDateTime(payment.confirmedAt || payment.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
