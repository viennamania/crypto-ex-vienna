'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { normalizeHexColor, resolveStoreBrandColor, rgbaFromHex } from '@/lib/storeBranding';

type DashboardStore = {
  storecode: string;
  storeName: string;
  storeLogo: string;
  backgroundColor: string;
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
  paymentId: string;
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
  const params = useParams<{ lang: string }>();
  const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko';
  const searchParams = useSearchParams();
  const storecode = String(searchParams?.get('storecode') || '').trim();
  const p2pHomeHref = useMemo(() => {
    const query = new URLSearchParams();
    if (storecode) {
      query.set('storecode', storecode);
    }
    const queryString = query.toString();
    return `/${lang}/p2p${queryString ? `?${queryString}` : ''}`;
  }, [lang, storecode]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [brandingStoreName, setBrandingStoreName] = useState('');
  const [brandingStoreLogo, setBrandingStoreLogo] = useState('');
  const [brandingBackgroundColor, setBrandingBackgroundColor] = useState('#0ea5e9');
  const [uploadingBrandingLogo, setUploadingBrandingLogo] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [brandingSuccess, setBrandingSuccess] = useState<string | null>(null);

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
          backgroundColor: String(storeData.backgroundColor || '').trim(),
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
            paymentId: String(payment.paymentId || ''),
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

  useEffect(() => {
    if (!dashboard?.store) {
      setBrandingStoreName('');
      setBrandingStoreLogo('');
      setBrandingBackgroundColor('#0ea5e9');
      setBrandingError(null);
      setBrandingSuccess(null);
      return;
    }

    setBrandingStoreName(String(dashboard.store.storeName || '').trim());
    setBrandingStoreLogo(String(dashboard.store.storeLogo || '').trim());
    setBrandingBackgroundColor(resolveStoreBrandColor(
      String(dashboard.store.storecode || ''),
      dashboard.store.backgroundColor,
    ));
    setBrandingError(null);
    setBrandingSuccess(null);
  }, [
    dashboard?.store,
  ]);

  const resolvedBrandColor = useMemo(
    () => resolveStoreBrandColor(storecode, brandingBackgroundColor),
    [brandingBackgroundColor, storecode],
  );

  const isBrandingChanged = useMemo(() => {
    if (!dashboard?.store) return false;
    const currentStoreName = String(dashboard.store.storeName || '').trim();
    const currentStoreLogo = String(dashboard.store.storeLogo || '').trim();
    const currentBackgroundColor = resolveStoreBrandColor(
      String(dashboard.store.storecode || ''),
      dashboard.store.backgroundColor,
    );

    return (
      currentStoreName !== String(brandingStoreName || '').trim()
      || currentStoreLogo !== String(brandingStoreLogo || '').trim()
      || currentBackgroundColor !== resolveStoreBrandColor(storecode, brandingBackgroundColor)
    );
  }, [
    brandingBackgroundColor,
    brandingStoreLogo,
    brandingStoreName,
    dashboard?.store,
    storecode,
  ]);

  const resetBrandingInputs = useCallback(() => {
    if (!dashboard?.store) return;
    setBrandingStoreName(String(dashboard.store.storeName || '').trim());
    setBrandingStoreLogo(String(dashboard.store.storeLogo || '').trim());
    setBrandingBackgroundColor(resolveStoreBrandColor(
      String(dashboard.store.storecode || ''),
      dashboard.store.backgroundColor,
    ));
    setBrandingError(null);
    setBrandingSuccess(null);
  }, [dashboard?.store]);

  const saveBranding = useCallback(async () => {
    if (!storecode || !dashboard?.store || savingBranding) {
      return;
    }

    const nextStoreName = String(brandingStoreName || '').trim();
    const nextStoreLogo = String(brandingStoreLogo || '').trim();
    const nextBackgroundColor = normalizeHexColor(brandingBackgroundColor);

    if (!nextStoreName) {
      setBrandingError('가맹점 이름을 입력해 주세요.');
      setBrandingSuccess(null);
      return;
    }
    if (!nextBackgroundColor) {
      setBrandingError('브랜드 컬러는 6자리 HEX 형식으로 입력해 주세요.');
      setBrandingSuccess(null);
      return;
    }

    setSavingBranding(true);
    setBrandingError(null);
    setBrandingSuccess(null);
    try {
      const response = await fetch('/api/store/updateStoreBranding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode,
          storeName: nextStoreName,
          storeLogo: nextStoreLogo,
          backgroundColor: nextBackgroundColor,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.result !== true) {
        throw new Error(String(data?.error || '브랜딩 저장에 실패했습니다.'));
      }

      setBrandingSuccess('브랜딩 설정을 저장했습니다.');
      await loadData();
    } catch (saveError) {
      setBrandingError(saveError instanceof Error ? saveError.message : '브랜딩 저장에 실패했습니다.');
      setBrandingSuccess(null);
    } finally {
      setSavingBranding(false);
    }
  }, [
    brandingBackgroundColor,
    brandingStoreLogo,
    brandingStoreName,
    dashboard?.store,
    loadData,
    savingBranding,
    storecode,
  ]);

  const uploadBrandingLogoToBlob = useCallback(async (file: File) => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setBrandingError('이미지 파일만 업로드할 수 있습니다.');
      setBrandingSuccess(null);
      return;
    }

    setUploadingBrandingLogo(true);
    setBrandingError(null);
    setBrandingSuccess(null);
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || '로고 업로드에 실패했습니다.');
      }

      const payload = await response.json().catch(() => ({}));
      const uploadedUrl = String(payload?.url || '').trim();
      if (!uploadedUrl) {
        throw new Error('업로드 URL을 받지 못했습니다.');
      }

      setBrandingStoreLogo(uploadedUrl);
      setBrandingSuccess('로고 파일 업로드가 완료되었습니다. 저장 버튼으로 적용해 주세요.');
    } catch (uploadError) {
      setBrandingError(uploadError instanceof Error ? uploadError.message : '로고 업로드에 실패했습니다.');
      setBrandingSuccess(null);
    } finally {
      setUploadingBrandingLogo(false);
    }
  }, []);

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

      <div className="flex justify-end">
        <Link
          href={p2pHomeHref}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
        >
          P2P 홈으로 돌아가기
        </Link>
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

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">홈 브랜딩 설정</h2>
                <p className="mt-1 text-xs text-slate-500">
                  wallet-management 홈에서 `storecode` 기준으로 적용됩니다.
                </p>
              </div>
              <span
                className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold"
                style={{
                  color: resolvedBrandColor,
                  borderColor: rgbaFromHex(resolvedBrandColor, 0.36),
                  backgroundColor: rgbaFromHex(resolvedBrandColor, 0.12),
                }}
              >
                Live
              </span>
            </div>

            <div className="mt-3 grid gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">가맹점 이름</span>
                <input
                  value={brandingStoreName}
                  onChange={(event) => {
                    setBrandingStoreName(event.target.value);
                    setBrandingError(null);
                    setBrandingSuccess(null);
                  }}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  placeholder="가맹점 이름"
                />
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-600">로고 이미지 (Vercel Blob)</span>
                  <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900">
                    {uploadingBrandingLogo ? '업로드 중...' : '파일 선택'}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={uploadingBrandingLogo}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          uploadBrandingLogoToBlob(file);
                        }
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {brandingStoreLogo ? (
                      <span
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${encodeURI(brandingStoreLogo)})` }}
                        aria-label="업로드 로고 미리보기"
                      />
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-500">LOGO</span>
                    )}
                  </span>
                  <p className="min-w-0 truncate text-[11px] text-slate-500">
                    {brandingStoreLogo || '업로드된 로고가 없습니다.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-[60px_1fr] gap-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">컬러</span>
                  <input
                    type="color"
                    value={resolvedBrandColor}
                    onChange={(event) => {
                      setBrandingBackgroundColor(event.target.value);
                      setBrandingError(null);
                      setBrandingSuccess(null);
                    }}
                    className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-slate-200 bg-transparent p-1"
                    aria-label="브랜드 컬러"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">HEX 코드</span>
                  <input
                    value={brandingBackgroundColor}
                    onChange={(event) => {
                      setBrandingBackgroundColor(event.target.value);
                      setBrandingError(null);
                      setBrandingSuccess(null);
                    }}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    placeholder="#0ea5e9"
                  />
                </label>
              </div>
            </div>

            {brandingError && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {brandingError}
              </p>
            )}
            {brandingSuccess && (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                {brandingSuccess}
              </p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={saveBranding}
                disabled={!isBrandingChanged || savingBranding}
                className="inline-flex h-10 items-center justify-center rounded-xl text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  backgroundColor: resolvedBrandColor,
                }}
              >
                {savingBranding ? '저장 중...' : '브랜딩 저장'}
              </button>
              <button
                type="button"
                onClick={resetBrandingInputs}
                disabled={!isBrandingChanged || savingBranding}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                원래값 복원
              </button>
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
                    <p className="mt-1 text-[11px] text-slate-500">결제번호: {payment.paymentId || '-'}</p>
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
