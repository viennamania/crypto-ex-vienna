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

type DashboardPayment = {
  id: string;
  fromWalletAddress: string;
  usdtAmount: number;
  krwAmount: number;
  exchangeRate: number;
  transactionHash: string;
  createdAt: string;
  confirmedAt: string;
  member?: {
    nickname?: string;
    storecode?: string;
  } | null;
};

type DashboardPayload = {
  store: DashboardStore;
  summary: DashboardSummary;
  payments: DashboardPayment[];
};

type StoreMember = {
  id: string;
  nickname: string;
  walletAddress: string;
  createdAt: string;
  verified: boolean;
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

export default function P2PStoreManagementHomePage() {
  const searchParams = useSearchParams();
  const storecode = String(searchParams?.get('storecode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [members, setMembers] = useState<StoreMember[]>([]);

  const loadData = useCallback(async () => {
    if (!storecode) {
      setDashboard(null);
      setMembers([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [dashboardResponse, membersResponse] = await Promise.all([
        fetch('/api/wallet/payment-usdt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'store-dashboard',
            storecode,
            limit: 20,
          }),
        }),
        fetch('/api/user/getAllUsersByStorecode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storecode,
            limit: 1000,
            page: 1,
            includeUnverified: true,
            includeWalletless: true,
            sortField: 'createdAt',
            requireProfile: false,
            userType: 'all',
          }),
        }),
      ]);

      const dashboardData = await dashboardResponse.json().catch(() => ({}));
      if (!dashboardResponse.ok || !isRecord(dashboardData?.result)) {
        throw new Error(
          String(dashboardData?.error || '가맹점 결제 대시보드 정보를 불러오지 못했습니다.'),
        );
      }

      const dashboardResult = dashboardData.result as Record<string, unknown>;
      const storeData = isRecord(dashboardResult.store) ? dashboardResult.store : {};
      const summaryData = isRecord(dashboardResult.summary) ? dashboardResult.summary : {};
      const paymentsData = Array.isArray(dashboardResult.payments) ? dashboardResult.payments : [];

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
        payments: paymentsData.map((item) => {
          const payment = isRecord(item) ? item : {};
          const member = isRecord(payment.member) ? payment.member : null;
          return {
            id: String(payment.id || ''),
            fromWalletAddress: String(payment.fromWalletAddress || ''),
            usdtAmount: Number(payment.usdtAmount || 0),
            krwAmount: Number(payment.krwAmount || 0),
            exchangeRate: Number(payment.exchangeRate || 0),
            transactionHash: String(payment.transactionHash || ''),
            createdAt: String(payment.createdAt || ''),
            confirmedAt: String(payment.confirmedAt || ''),
            member: member
              ? {
                  nickname: String(member.nickname || ''),
                  storecode: String(member.storecode || ''),
                }
              : null,
          };
        }),
      });

      const membersData = await membersResponse.json().catch(() => ({}));
      if (!membersResponse.ok || !isRecord(membersData?.result)) {
        throw new Error(String(membersData?.error || '가맹점 회원 정보를 불러오지 못했습니다.'));
      }

      const users = Array.isArray(membersData.result.users) ? membersData.result.users : [];
      setMembers(
        users.map((user: unknown) => {
          const member = isRecord(user) ? user : {};
          return {
            id: String(member.id || member._id || ''),
            nickname: String(member.nickname || '').trim() || '-',
            walletAddress: String(member.walletAddress || ''),
            createdAt: String(member.createdAt || ''),
            verified: member.verified === true,
          };
        }),
      );
    } catch (loadError) {
      setDashboard(null);
      setMembers([]);
      setError(loadError instanceof Error ? loadError.message : '대시보드 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [storecode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const verifiedCount = useMemo(
    () => members.filter((member) => member.verified).length,
    [members],
  );
  const pendingCount = members.length - verifiedCount;

  const latestMembers = useMemo(() => {
    return [...members]
      .sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      })
      .slice(0, 6);
  }, [members]);

  const recentPayments = useMemo(() => dashboard?.payments.slice(0, 6) || [], [dashboard?.payments]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Store Dashboard</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">가맹점 운영 홈</h1>
        <p className="mt-1 text-sm text-slate-600">storecode 기반 회원/결제 현황을 한 화면에서 확인합니다.</p>
      </div>

      {!storecode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?storecode=...` 파라미터를 추가하면 가맹점 대시보드를 조회할 수 있습니다.
        </div>
      )}

      {storecode && loading && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          가맹점 대시보드를 불러오는 중입니다...
        </div>
      )}

      {storecode && !loading && error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {storecode && !loading && !error && dashboard && (
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
              <p className="text-xs font-semibold text-slate-500">총 회원 수</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{members.length.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">인증 회원</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{verifiedCount.toLocaleString()}</p>
              <p className="mt-1 text-[11px] text-slate-500">미인증 {Math.max(0, pendingCount).toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">누적 결제 건수</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {Number(dashboard.summary.totalCount || 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">누적 결제량</p>
              <p className="mt-1 text-2xl font-bold text-cyan-700">{formatUsdt(dashboard.summary.totalUsdtAmount)}</p>
              <p className="mt-1 text-[11px] text-slate-500">{formatKrw(dashboard.summary.totalKrwAmount)}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">최근 회원 정보</h2>
              <span className="text-xs text-slate-500">최신 6명</span>
            </div>
            {latestMembers.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">회원 데이터가 없습니다.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {latestMembers.map((member) => (
                  <div
                    key={`${member.id}-${member.walletAddress}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{member.nickname}</p>
                      <p className="truncate text-[11px] text-slate-500">{shortAddress(member.walletAddress)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-[11px] font-semibold ${
                          member.verified ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {member.verified ? '인증됨' : '미인증'}
                      </p>
                      <p className="text-[11px] text-slate-500">{toDateTime(member.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">최근 결제 정보</h2>
              <span className="text-xs text-slate-500">최신 6건</span>
            </div>
            {recentPayments.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">결제 데이터가 없습니다.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {recentPayments.map((payment) => (
                  <div key={payment.id} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{formatUsdt(payment.usdtAmount)}</p>
                      <p className="text-sm font-semibold text-slate-700">{formatKrw(payment.krwAmount)}</p>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        회원: {String(payment.member?.nickname || '').trim() || shortAddress(payment.fromWalletAddress)}
                      </span>
                      <span>{toDateTime(payment.confirmedAt || payment.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">환율: 1 USDT = {formatRate(payment.exchangeRate)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
