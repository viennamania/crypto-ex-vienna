'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type DashboardStore = {
  storecode: string;
  storeName: string;
  storeLogo: string;
  paymentWalletAddress: string;
  adminWalletAddress: string;
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

type DashboardPayment = {
  id: string;
  usdtAmount: number;
  krwAmount: number;
  exchangeRate: number;
  transactionHash: string;
  createdAt: string;
  confirmedAt: string;
  fromWalletAddress: string;
  member?: {
    nickname?: string;
    storecode?: string;
  } | null;
};

type DashboardPayload = {
  store: DashboardStore;
  summary: DashboardSummary;
  daily: DashboardDaily[];
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

export default function P2PStorePaymentManagementPage() {
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
          limit: 50,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(data?.result)) {
        throw new Error(String(data?.error || '결제 대시보드를 불러오지 못했습니다.'));
      }

      const result = data.result as Record<string, unknown>;
      const storeData = isRecord(result.store) ? result.store : {};
      const summaryData = isRecord(result.summary) ? result.summary : {};
      const paymentsData = Array.isArray(result.payments) ? result.payments : [];
      const dailyData = Array.isArray(result.daily) ? result.daily : [];

      setDashboard({
        store: {
          storecode: String(storeData.storecode || storecode),
          storeName: String(storeData.storeName || storecode),
          storeLogo: String(storeData.storeLogo || ''),
          paymentWalletAddress: String(storeData.paymentWalletAddress || ''),
          adminWalletAddress: String(storeData.adminWalletAddress || ''),
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
        payments: paymentsData.map((item) => {
          const payment = isRecord(item) ? item : {};
          const member = isRecord(payment.member) ? payment.member : null;
          return {
            id: String(payment.id || ''),
            usdtAmount: Number(payment.usdtAmount || 0),
            krwAmount: Number(payment.krwAmount || 0),
            exchangeRate: Number(payment.exchangeRate || 0),
            transactionHash: String(payment.transactionHash || ''),
            createdAt: String(payment.createdAt || ''),
            confirmedAt: String(payment.confirmedAt || ''),
            fromWalletAddress: String(payment.fromWalletAddress || ''),
            member: member
              ? {
                  nickname: String(member.nickname || ''),
                  storecode: String(member.storecode || ''),
                }
              : null,
          };
        }),
      });
    } catch (loadError) {
      setDashboard(null);
      setError(loadError instanceof Error ? loadError.message : '결제 대시보드를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [storecode]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const recentPayments = useMemo(() => dashboard?.payments.slice(0, 20) || [], [dashboard?.payments]);
  const dailyStats = useMemo(() => dashboard?.daily.slice(-7) || [], [dashboard?.daily]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Payment Management</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">결제관리</h1>
        <p className="mt-1 text-sm text-slate-600">가맹점 결제 흐름과 최근 결제 내역을 확인합니다.</p>
      </div>

      {!storecode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?storecode=...` 파라미터를 추가해야 결제관리를 사용할 수 있습니다.
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
              결제 대시보드를 불러오는 중입니다...
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
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-cyan-200">
                    {dashboard.store.storeLogo ? (
                      <div
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${encodeURI(dashboard.store.storeLogo)})` }}
                        aria-label={dashboard.store.storeName}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-cyan-700">
                        SHOP
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-900">{dashboard.store.storeName}</p>
                    <p className="truncate text-xs text-slate-600">
                      결제지갑: {shortAddress(dashboard.store.paymentWalletAddress)}
                    </p>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">결제 건수</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {Number(dashboard.summary.totalCount || 0).toLocaleString()}
                  </p>
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
                  <p className="mt-1 text-[11px] text-slate-500">{toDateTime(dashboard.summary.latestConfirmedAt)}</p>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <h2 className="text-base font-semibold text-slate-900">최근 7일 결제 현황</h2>
                {dailyStats.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">집계 데이터가 없습니다.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {dailyStats.map((row) => (
                      <div key={row.day} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm">
                        <span className="font-semibold text-slate-700">{row.day || '-'}</span>
                        <span className="text-slate-600">{row.count.toLocaleString()}건</span>
                        <span className="font-semibold text-slate-900">{formatUsdt(row.totalUsdtAmount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <h2 className="text-base font-semibold text-slate-900">최근 결제 내역</h2>
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
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span>
                            회원: {String(payment.member?.nickname || '').trim() || shortAddress(payment.fromWalletAddress)}
                          </span>
                          <span>{toDateTime(payment.confirmedAt || payment.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          환율 1 USDT = {formatRate(payment.exchangeRate)} · TX {shortAddress(payment.transactionHash)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
