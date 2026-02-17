'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { getContract } from 'thirdweb';
import { balanceOf } from 'thirdweb/extensions/erc20';
import { AutoConnect, useActiveAccount } from 'thirdweb/react';
import { arbitrum, bsc, ethereum, polygon } from 'thirdweb/chains';

import { client } from '@/app/client';
import { ConnectButton } from '@/components/OrangeXConnectButton';
import { useClientWallets } from '@/lib/useClientWallets';
import {
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from '@/app/config/contractAddresses';

type ChainKey = 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';

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

type DashboardTopPayer = {
  walletAddress: string;
  totalUsdtAmount: number;
  totalKrwAmount: number;
  count: number;
};

type DashboardDaily = {
  day: string;
  count: number;
  totalUsdtAmount: number;
  totalKrwAmount: number;
};

type PaymentRecord = {
  id: string;
  storecode: string;
  storeName: string;
  chain: ChainKey;
  fromWalletAddress: string;
  toWalletAddress: string;
  usdtAmount: number;
  krwAmount: number;
  exchangeRate: number;
  transactionHash: string;
  createdAt: string;
  confirmedAt: string;
  member?: {
    nickname?: string;
    storecode?: string;
    buyer?: {
      bankInfo?: Record<string, unknown> | null;
    } | null;
  } | null;
};

type DashboardPayload = {
  store: DashboardStore;
  summary: DashboardSummary;
  topPayers: DashboardTopPayer[];
  daily: DashboardDaily[];
  payments: PaymentRecord[];
};

const formatKrw = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number(value) || 0)}원`;

const formatUsdt = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(Number(value) || 0)} USDT`;

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

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

const formatMemberName = (member: PaymentRecord['member']) => {
  const nickname = String(member?.nickname || '').trim();
  const memberStorecode = String(member?.storecode || '').trim();

  if (nickname && memberStorecode) {
    return `${nickname} (${memberStorecode})`;
  }
  return nickname || memberStorecode || '-';
};

const formatMemberBankInfo = (member: PaymentRecord['member']) => {
  const bankInfo = member?.buyer?.bankInfo;
  if (!bankInfo || typeof bankInfo !== 'object' || Array.isArray(bankInfo)) {
    return '';
  }

  const bankName = String(
    bankInfo.bankName || bankInfo.depositBankName || '',
  ).trim();
  const accountNumber = String(
    bankInfo.accountNumber || bankInfo.depositBankAccountNumber || '',
  ).trim();
  const accountHolder = String(
    bankInfo.accountHolder || bankInfo.depositName || '',
  ).trim();

  return [bankName, accountNumber, accountHolder].filter(Boolean).join(' ');
};

const txExplorerMap: Record<ChainKey, string> = {
  ethereum: 'https://etherscan.io/tx/',
  polygon: 'https://polygonscan.com/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  bsc: 'https://bscscan.com/tx/',
};

const chainLabelMap: Record<ChainKey, string> = {
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  arbitrum: 'Arbitrum',
  bsc: 'BSC',
};

const usdtContractMap: Record<ChainKey, string> = {
  ethereum: ethereumContractAddressUSDT,
  polygon: polygonContractAddressUSDT,
  arbitrum: arbitrumContractAddressUSDT,
  bsc: bscContractAddressUSDT,
};

const usdtDecimalsMap: Record<ChainKey, number> = {
  ethereum: 6,
  polygon: 6,
  arbitrum: 6,
  bsc: 18,
};

export default function P2PPaymentManagementPage() {
  const params = useParams<{ lang: string }>();
  const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko';
  const searchParams = useSearchParams();
  const storecode = String(searchParams?.get('storecode') || '').trim();

  const activeAccount = useActiveAccount();
  const walletAddress = activeAccount?.address || '';
  const { wallet, chain } = useClientWallets();
  const activeChainKey: ChainKey = chain === 'ethereum' || chain === 'arbitrum' || chain === 'bsc' ? chain : 'polygon';

  const activeChain =
    activeChainKey === 'ethereum'
      ? ethereum
      : activeChainKey === 'arbitrum'
      ? arbitrum
      : activeChainKey === 'bsc'
      ? bsc
      : polygon;
  const activeChainLabel = chainLabelMap[activeChainKey];
  const activeUsdtContractAddress = usdtContractMap[activeChainKey];
  const activeUsdtTokenDecimals = usdtDecimalsMap[activeChainKey];
  const paymentWalletContract = useMemo(
    () =>
      getContract({
        client,
        chain: activeChain,
        address: activeUsdtContractAddress,
      }),
    [activeChain, activeUsdtContractAddress],
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [paymentWalletBalance, setPaymentWalletBalance] = useState<number | null>(null);
  const [paymentWalletBalanceLoading, setPaymentWalletBalanceLoading] = useState(false);
  const [paymentWalletBalanceError, setPaymentWalletBalanceError] = useState<string | null>(null);
  const [paymentWalletBalanceUpdatedAt, setPaymentWalletBalanceUpdatedAt] = useState('');
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [collectingBalance, setCollectingBalance] = useState(false);
  const [collectModalError, setCollectModalError] = useState<string | null>(null);
  const [lastCollectTransactionId, setLastCollectTransactionId] = useState('');

  const loadDashboard = useCallback(async () => {
    if (!walletAddress || !storecode) {
      setDashboard(null);
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
          adminWalletAddress: walletAddress,
          limit: 40,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string' ? payload.error : '가맹점 결제 내역을 불러오지 못했습니다.',
        );
      }

      setDashboard(payload?.result || null);
    } catch (fetchError: unknown) {
      const message =
        fetchError instanceof Error ? fetchError.message : '가맹점 결제 내역 조회 중 오류가 발생했습니다.';
      setError(message);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [storecode, walletAddress]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const loadPaymentWalletBalance = useCallback(async () => {
    const paymentWalletAddress = String(dashboard?.store?.paymentWalletAddress || '').trim();
    if (!paymentWalletAddress) {
      setPaymentWalletBalance(null);
      setPaymentWalletBalanceError(null);
      return;
    }
    if (!isWalletAddress(paymentWalletAddress)) {
      setPaymentWalletBalance(null);
      setPaymentWalletBalanceError('결제지갑 주소 형식이 올바르지 않습니다.');
      return;
    }

    setPaymentWalletBalanceLoading(true);
    try {
      const result = await balanceOf({
        contract: paymentWalletContract,
        address: paymentWalletAddress,
      });
      setPaymentWalletBalance(Number(result) / 10 ** activeUsdtTokenDecimals);
      setPaymentWalletBalanceUpdatedAt(new Date().toISOString());
      setPaymentWalletBalanceError(null);
    } catch (balanceError: unknown) {
      console.error('Failed to load payment wallet balance', balanceError);
      setPaymentWalletBalanceError('결제지갑 잔고를 불러오지 못했습니다.');
    } finally {
      setPaymentWalletBalanceLoading(false);
    }
  }, [activeUsdtTokenDecimals, dashboard?.store?.paymentWalletAddress, paymentWalletContract]);

  useEffect(() => {
    if (!dashboard?.store?.paymentWalletAddress) {
      setPaymentWalletBalance(null);
      setPaymentWalletBalanceError(null);
      setPaymentWalletBalanceUpdatedAt('');
      return;
    }

    void loadPaymentWalletBalance();
    const intervalId = window.setInterval(() => {
      void loadPaymentWalletBalance();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [dashboard?.store?.paymentWalletAddress, loadPaymentWalletBalance]);

  const maxDailyUsdt = useMemo(() => {
    if (!dashboard?.daily?.length) return 0;
    return dashboard.daily.reduce((max, item) => Math.max(max, Number(item.totalUsdtAmount) || 0), 0);
  }, [dashboard?.daily]);

  const canCollectBalance = useMemo(() => {
    return Boolean(walletAddress) && (paymentWalletBalance || 0) > 0;
  }, [paymentWalletBalance, walletAddress]);

  const openCollectModal = () => {
    if (!canCollectBalance) {
      setCollectModalError('회수 가능한 결제지갑 잔고가 없습니다.');
      return;
    }
    setCollectModalError(null);
    setIsCollectModalOpen(true);
  };

  const closeCollectModal = useCallback(() => {
    if (collectingBalance) return;
    setIsCollectModalOpen(false);
    setCollectModalError(null);
  }, [collectingBalance]);

  const submitCollectBalance = useCallback(async () => {
    if (!dashboard || !walletAddress || !storecode || !canCollectBalance || collectingBalance) {
      return;
    }

    setCollectingBalance(true);
    setCollectModalError(null);
    try {
      const response = await fetch('/api/wallet/payment-usdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'collect',
          storecode,
          chain: activeChainKey,
          adminWalletAddress: walletAddress,
          toWalletAddress: walletAddress,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string' ? payload.error : '결제지갑 잔고 회수에 실패했습니다.',
        );
      }

      const transactionId = String(payload?.result?.transactionId || '').trim();
      setLastCollectTransactionId(transactionId);
      setPaymentWalletBalance(0);
      setPaymentWalletBalanceUpdatedAt(new Date().toISOString());
      setPaymentWalletBalanceError(null);
      setIsCollectModalOpen(false);
      await loadDashboard();
      window.setTimeout(() => {
        void loadPaymentWalletBalance();
      }, 3000);
    } catch (collectError: unknown) {
      const message = collectError instanceof Error ? collectError.message : '잔고 회수 중 오류가 발생했습니다.';
      setCollectModalError(message);
    } finally {
      setCollectingBalance(false);
    }
  }, [
    activeChainKey,
    canCollectBalance,
    collectingBalance,
    dashboard,
    loadDashboard,
    loadPaymentWalletBalance,
    storecode,
    walletAddress,
  ]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ecfeff_0%,#f8fafc_45%,#eef2ff_100%)] px-4 py-7 lg:px-6">
      <AutoConnect client={client} wallets={[wallet]} />

      <div className="mx-auto w-full max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-700">Store Payment Desk</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">가맹점 결제 관리</h1>
              <p className="mt-1 text-sm text-slate-600">
                상점 결제 내역과 누적 실적을 대시보드로 확인합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/${lang}/p2p`}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                P2P 홈으로
              </Link>
              <button
                type="button"
                onClick={loadDashboard}
                className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                새로고침
              </button>
            </div>
          </div>
        </section>

        {!walletAddress ? (
          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 text-sm text-slate-700 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.45)]">
            <p className="font-semibold">관리 페이지를 보려면 지갑 연결이 필요합니다.</p>
            <div className="mt-3">
              <ConnectButton
                client={client}
                wallets={[wallet]}
                chain={activeChain}
                connectButton={{
                  label: '지갑 연결',
                  className:
                    'inline-flex h-10 items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800',
                }}
              />
            </div>
          </section>
        ) : !storecode ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
            storecode 쿼리가 없습니다. P2P 홈에서 가맹점을 선택해 진입해 주세요.
          </section>
        ) : (
          <>
            {error && (
              <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                {error}
              </section>
            )}

            {loading ? (
              <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.45)]">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`loading-${index}`} className="h-14 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </section>
            ) : dashboard ? (
              <>
                <section className="rounded-2xl border border-slate-200/80 bg-white/92 p-4 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.45)]">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                      {dashboard.store.storeLogo ? (
                        <Image
                          src={dashboard.store.storeLogo}
                          alt={dashboard.store.storeName || dashboard.store.storecode}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-700">
                          {(dashboard.store.storeName || dashboard.store.storecode).slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-bold text-slate-900">
                        {dashboard.store.storeName || dashboard.store.storecode}
                      </p>
                      <p className="text-xs font-mono text-slate-500">
                        {dashboard.store.storecode}
                      </p>
                    </div>
                    <div className="text-xs text-slate-600">
                      <p>결제지갑 {shortAddress(dashboard.store.paymentWalletAddress)}</p>
                      <p>관리자 {shortAddress(dashboard.store.adminWalletAddress)}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-cyan-100 bg-[linear-gradient(140deg,#ecfeff_0%,#cffafe_45%,#e0f2fe_100%)] p-5 shadow-[0_24px_60px_-38px_rgba(14,116,144,0.45)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-700">Wallet Balance</p>
                      <h2 className="mt-1 text-lg font-bold text-cyan-950">결제지갑 실시간 USDT 잔고</h2>
                      <p className="mt-1 text-xs text-cyan-800/90">
                        네트워크 {activeChainLabel} · 15초 주기 자동 조회
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void loadPaymentWalletBalance();
                      }}
                      className="inline-flex items-center rounded-full border border-cyan-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-white"
                    >
                      잔고 새로고침
                    </button>
                    <button
                      type="button"
                      onClick={openCollectModal}
                      disabled={!canCollectBalance || collectingBalance}
                      className="inline-flex items-center rounded-full bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      회수하기
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-cyan-200/80 bg-white/80 px-4 py-4">
                    <p className="text-xs font-semibold text-slate-500">결제지갑</p>
                    <p className="mt-1 break-all text-xs font-mono text-slate-700">
                      {dashboard.store.paymentWalletAddress || '-'}
                    </p>
                    <p className="mt-3 text-3xl font-bold text-cyan-900">
                      {paymentWalletBalance !== null
                        ? formatUsdt(paymentWalletBalance)
                        : paymentWalletBalanceLoading
                        ? '조회 중...'
                        : '-'}
                    </p>
                    {paymentWalletBalanceError ? (
                      <p className="mt-2 text-xs font-semibold text-rose-600">{paymentWalletBalanceError}</p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">
                        마지막 갱신 {paymentWalletBalanceUpdatedAt ? toDateTime(paymentWalletBalanceUpdatedAt) : '-'}
                      </p>
                    )}
                    {lastCollectTransactionId && (
                      <p className="mt-1 break-all text-[11px] text-cyan-700">
                        최근 회수 요청 ID: {lastCollectTransactionId}
                      </p>
                    )}
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-2xl border border-cyan-100 bg-[linear-gradient(145deg,#ecfeff,#cffafe)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">결제 건수</p>
                    <p className="mt-2 text-2xl font-bold text-cyan-900">
                      {dashboard.summary.totalCount.toLocaleString()}건
                    </p>
                  </article>
                  <article className="rounded-2xl border border-emerald-100 bg-[linear-gradient(145deg,#ecfdf5,#d1fae5)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">누적 USDT</p>
                    <p className="mt-2 text-2xl font-bold text-emerald-900">
                      {formatUsdt(dashboard.summary.totalUsdtAmount)}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-indigo-100 bg-[linear-gradient(145deg,#eef2ff,#e0e7ff)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">누적 KRW</p>
                    <p className="mt-2 text-2xl font-bold text-indigo-900">
                      {formatKrw(dashboard.summary.totalKrwAmount)}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-amber-100 bg-[linear-gradient(145deg,#fffbeb,#fef3c7)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">평균 환율</p>
                    <p className="mt-2 text-2xl font-bold text-amber-900">
                      {dashboard.summary.avgExchangeRate > 0
                        ? `${dashboard.summary.avgExchangeRate.toLocaleString()} KRW`
                        : '-'}
                    </p>
                    <p className="mt-1 text-xs text-amber-700/90">
                      최근 확정 {toDateTime(dashboard.summary.latestConfirmedAt)}
                    </p>
                  </article>
                </section>

                <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                  <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_56px_-42px_rgba(15,23,42,0.45)] xl:col-span-7">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">일별 결제 추이</p>
                      <p className="text-xs text-slate-500">최근 14일 기준</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {dashboard.daily.length === 0 ? (
                        <div className="px-4 py-10 text-center text-sm text-slate-500">데이터가 없습니다.</div>
                      ) : (
                        dashboard.daily.map((item) => {
                          const barWidth =
                            maxDailyUsdt > 0 ? `${Math.max(8, (item.totalUsdtAmount / maxDailyUsdt) * 100)}%` : '8%';
                          return (
                            <div key={item.day} className="px-4 py-2.5">
                              <div className="flex items-center justify-between text-xs text-slate-600">
                                <span>{item.day}</span>
                                <span>{item.count}건</span>
                              </div>
                              <div className="mt-1 h-2.5 rounded-full bg-slate-100">
                                <div
                                  className="h-2.5 rounded-full bg-[linear-gradient(90deg,#06b6d4,#3b82f6)]"
                                  style={{ width: barWidth }}
                                />
                              </div>
                              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                                <span>{formatUsdt(item.totalUsdtAmount)}</span>
                                <span>{formatKrw(item.totalKrwAmount)}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </article>

                  <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_56px_-42px_rgba(15,23,42,0.45)] xl:col-span-5">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">상위 결제 지갑</p>
                      <p className="text-xs text-slate-500">누적 USDT 기준</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {dashboard.topPayers.length === 0 ? (
                        <div className="px-4 py-10 text-center text-sm text-slate-500">데이터가 없습니다.</div>
                      ) : (
                        dashboard.topPayers.map((payer, index) => (
                          <div key={`${payer.walletAddress}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{shortAddress(payer.walletAddress)}</p>
                              <p className="text-xs text-slate-500">{payer.count.toLocaleString()}건</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-900">{formatUsdt(payer.totalUsdtAmount)}</p>
                              <p className="text-xs text-slate-500">{formatKrw(payer.totalKrwAmount)}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                </section>

                <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_56px_-42px_rgba(15,23,42,0.45)]">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">최근 결제 내역</p>
                  </div>
                  {dashboard.payments.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-slate-500">결제 내역이 없습니다.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1020px]">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                          <tr>
                            <th className="px-4 py-3">시각</th>
                            <th className="px-4 py-3">송신지갑</th>
                            <th className="px-4 py-3">결제한 회원</th>
                            <th className="px-4 py-3 text-right">USDT</th>
                            <th className="px-4 py-3 text-right">KRW</th>
                            <th className="px-4 py-3 text-right">환율</th>
                            <th className="px-4 py-3">네트워크</th>
                            <th className="px-4 py-3">TX</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                          {dashboard.payments.map((item) => {
                            const txBase = txExplorerMap[item.chain] || '';
                            const txUrl = txBase && item.transactionHash ? `${txBase}${item.transactionHash}` : '';
                            const memberBankInfo = formatMemberBankInfo(item.member);
                            return (
                              <tr key={item.id}>
                                <td className="px-4 py-3 text-xs text-slate-500">{toDateTime(item.confirmedAt || item.createdAt)}</td>
                                <td className="px-4 py-3 font-mono text-xs text-slate-700">{shortAddress(item.fromWalletAddress)}</td>
                                <td className="px-4 py-3">
                                  <p className="text-xs font-semibold text-slate-800">{formatMemberName(item.member)}</p>
                                  {memberBankInfo && (
                                    <p className="mt-1 text-[11px] text-slate-500">{memberBankInfo}</p>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatUsdt(item.usdtAmount)}</td>
                                <td className="px-4 py-3 text-right">{formatKrw(item.krwAmount)}</td>
                                <td className="px-4 py-3 text-right">
                                  {item.exchangeRate > 0 ? `${item.exchangeRate.toLocaleString()} KRW` : '-'}
                                </td>
                                <td className="px-4 py-3 capitalize">{item.chain}</td>
                                <td className="px-4 py-3">
                                  {txUrl ? (
                                    <a
                                      href={txUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-2"
                                    >
                                      {shortAddress(item.transactionHash)}
                                    </a>
                                  ) : (
                                    <span className="text-xs text-slate-400">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </>
        )}
      </div>

      {isCollectModalOpen && dashboard && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
            onClick={closeCollectModal}
            aria-label="회수하기 모달 닫기"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="결제지갑 잔고 회수"
            className="relative z-[1201] w-full max-w-md rounded-3xl border border-cyan-100 bg-white p-5 shadow-[0_30px_90px_-45px_rgba(8,145,178,0.75)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-700">Collect Balance</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">결제지갑 잔고 전액 회수</h3>
            <p className="mt-1 text-sm text-slate-600">
              결제지갑의 USDT 잔고를 내 지갑으로 전송합니다.
            </p>

            <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">가맹점</span>
                <span className="font-semibold text-slate-800">{dashboard.store.storeName || dashboard.store.storecode}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">결제지갑</span>
                <span className="font-mono font-semibold text-slate-800">{shortAddress(dashboard.store.paymentWalletAddress)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">내 지갑(수신)</span>
                <span className="font-mono font-semibold text-slate-800">{shortAddress(walletAddress)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">전송 예정</span>
                <span className="font-semibold text-cyan-800">
                  {paymentWalletBalance !== null ? formatUsdt(paymentWalletBalance) : '-'}
                </span>
              </div>
            </div>

            {collectModalError && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {collectModalError}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCollectModal}
                disabled={collectingBalance}
                className="inline-flex h-10 items-center rounded-full border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  void submitCollectBalance();
                }}
                disabled={collectingBalance || !canCollectBalance}
                className="inline-flex h-10 items-center rounded-full bg-cyan-700 px-3.5 text-xs font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {collectingBalance ? '전송 처리 중...' : '전액 회수하기'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
