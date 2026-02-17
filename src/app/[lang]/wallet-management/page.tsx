'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Manrope, Playfair_Display } from 'next/font/google';
import { toast } from 'react-hot-toast';
import { getContract } from 'thirdweb';
import { balanceOf } from 'thirdweb/extensions/erc20';
import { AutoConnect, useActiveAccount } from 'thirdweb/react';
import { ethereum, polygon, arbitrum, bsc, type Chain } from 'thirdweb/chains';

import { client } from '@/app/client';
import { useClientWallets } from '@/lib/useClientWallets';
import { useClientSettings } from '@/components/ClientSettingsProvider';
import WalletConnectPrompt from '@/components/wallet-management/WalletConnectPrompt';
import WalletSummaryCard from '@/components/wallet-management/WalletSummaryCard';
import WalletManagementBottomNav from '@/components/wallet-management/WalletManagementBottomNav';
import {
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from '@/app/config/contractAddresses';

type NetworkKey = 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';

type NetworkOption = {
  id: NetworkKey;
  label: string;
  chain: Chain;
  contractAddress: string;
  tokenDecimals: number;
};

const displayFont = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
});

const bodyFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

const WALLET_AUTH_OPTIONS = ['phone', 'email', 'google', 'apple', 'line', 'telegram'];

const NETWORK_BY_KEY: Record<NetworkKey, NetworkOption> = {
  ethereum: {
    id: 'ethereum',
    label: 'Ethereum',
    chain: ethereum,
    contractAddress: ethereumContractAddressUSDT,
    tokenDecimals: 6,
  },
  polygon: {
    id: 'polygon',
    label: 'Polygon',
    chain: polygon,
    contractAddress: polygonContractAddressUSDT,
    tokenDecimals: 6,
  },
  arbitrum: {
    id: 'arbitrum',
    label: 'Arbitrum',
    chain: arbitrum,
    contractAddress: arbitrumContractAddressUSDT,
    tokenDecimals: 6,
  },
  bsc: {
    id: 'bsc',
    label: 'BSC',
    chain: bsc,
    contractAddress: bscContractAddressUSDT,
    tokenDecimals: 18,
  },
};

const shortAddress = (value: string) => {
  if (!value || value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

export default function WalletManagementHomePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const lang = typeof params?.lang === 'string' ? params.lang : 'ko';
  const storecode = String(searchParams?.get('storecode') || '').trim();
  const querySuffix = storecode ? `?storecode=${encodeURIComponent(storecode)}` : '';

  const walletPath = `/${lang}/wallet-management/wallet-usdt${querySuffix}`;
  const paymentPath = `/${lang}/wallet-management/payment-usdt${querySuffix}`;

  const { chain, loading: clientSettingsLoading } = useClientSettings();
  const activeAccount = useActiveAccount();
  const { wallet, wallets, smartAccountEnabled } = useClientWallets({
    authOptions: WALLET_AUTH_OPTIONS,
    sponsorGas: true,
    defaultSmsCountryCode: 'KR',
  });

  const activeNetwork = useMemo(
    () => NETWORK_BY_KEY[chain] ?? NETWORK_BY_KEY.polygon,
    [chain],
  );

  const contract = useMemo(
    () =>
      getContract({
        client,
        chain: activeNetwork.chain,
        address: activeNetwork.contractAddress,
      }),
    [activeNetwork],
  );

  const [balance, setBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');

  const loadBalance = useCallback(async () => {
    if (!activeAccount?.address) {
      setBalance(0);
      setLastUpdatedAt('');
      return;
    }

    setLoadingBalance(true);
    try {
      const result = await balanceOf({
        contract,
        address: activeAccount.address,
      });

      const parsed = Number(result) / 10 ** activeNetwork.tokenDecimals;
      setBalance(Number.isFinite(parsed) ? parsed : 0);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      console.error('Failed to load wallet balance', error);
    } finally {
      setLoadingBalance(false);
    }
  }, [activeAccount?.address, contract, activeNetwork.tokenDecimals]);

  useEffect(() => {
    loadBalance();

    if (!activeAccount?.address) {
      return;
    }

    const interval = setInterval(() => {
      loadBalance();
    }, 12000);

    return () => clearInterval(interval);
  }, [activeAccount?.address, loadBalance]);

  if (clientSettingsLoading) {
    return (
      <main
        className={`${displayFont.variable} ${bodyFont.variable} relative min-h-screen overflow-hidden bg-[radial-gradient(130%_130%_at_100%_0%,#cffafe_0%,#eef2ff_40%,#f8fafc_100%)] px-4 py-8 pb-28 text-slate-900`}
        style={{ fontFamily: 'var(--font-body), "Avenir Next", "Segoe UI", sans-serif' }}
      >
        <div className="mx-auto flex min-h-[70vh] max-w-[430px] items-center justify-center text-center">
          <p className="text-lg font-semibold text-slate-600">클라이언트 설정을 확인 중입니다...</p>
        </div>
        <WalletManagementBottomNav lang={lang} active="home" />
      </main>
    );
  }

  return (
    <main
      className={`${displayFont.variable} ${bodyFont.variable} relative min-h-screen overflow-hidden bg-[radial-gradient(130%_130%_at_100%_0%,#cffafe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-900`}
      style={{ fontFamily: 'var(--font-body), "Avenir Next", "Segoe UI", sans-serif' }}
    >
      <AutoConnect client={client} wallets={[wallet]} />

      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-300/40 blur-3xl" />
      <div className="pointer-events-none absolute top-24 right-0 h-80 w-80 rounded-full bg-blue-300/30 blur-3xl" />

      <div className="relative mx-auto w-full max-w-[430px] px-4 pb-28 pt-8">
        <div className="mb-7">
          <p className="mb-2 inline-flex rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">
            Wallet Management Home
          </p>
          <h1
            className="text-3xl font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: 'var(--font-display), "Times New Roman", serif' }}
          >
            USDT 금융 홈
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            자산 관리와 상점 결제를 한 흐름으로 연결한 모바일형 금융 화면입니다.
            필요한 작업으로 바로 이동하세요.
          </p>
          {storecode && (
            <p className="mt-3 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
              지정 상점 코드: {storecode}
            </p>
          )}
        </div>

        {activeAccount?.address ? (
          <>
            <WalletSummaryCard
              walletAddress={activeAccount.address}
              walletAddressDisplay={shortAddress(activeAccount.address)}
              networkLabel={activeNetwork.label}
              usdtBalanceDisplay={
                loadingBalance
                  ? '조회 중...'
                  : `${balance.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`
              }
              modeLabel="홈"
              smartAccountEnabled={smartAccountEnabled}
              onCopyAddress={(walletAddress) => {
                navigator.clipboard.writeText(walletAddress);
                toast.success('지갑 주소를 복사했습니다.');
              }}
            />

            <section className="mb-5 rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_26px_60px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                MY DASHBOARD
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                내 지갑 상태와 결제 동선을 한눈에 확인할 수 있습니다.
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-3">
                  <p className="font-semibold text-emerald-800">연결 상태</p>
                  <p className="mt-1 text-emerald-700">연결됨</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3">
                  <p className="font-semibold text-slate-800">스마트 계정</p>
                  <p className="mt-1 text-slate-600">{smartAccountEnabled ? '활성' : '비활성'}</p>
                </div>
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-2 py-3">
                  <p className="font-semibold text-cyan-800">선택 상점</p>
                  <p className="mt-1 truncate text-cyan-700">{storecode || '미지정'}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href={walletPath}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  지갑 관리
                </Link>
                <Link
                  href={paymentPath}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-cyan-600 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-500"
                >
                  결제 진행
                </Link>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                {lastUpdatedAt ? `최근 잔액 업데이트: ${new Date(lastUpdatedAt).toLocaleTimeString()}` : '잔액 데이터를 불러오는 중입니다.'}
              </p>
            </section>
          </>
        ) : (
          <div className="mb-5 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.5)] backdrop-blur">
            <WalletConnectPrompt
              wallets={wallets}
              chain={activeNetwork.chain}
              lang={lang}
              title="대시보드를 보려면 지갑을 연결하세요."
              description="연결 후 내 지갑 요약, 네트워크 정보, 결제 진입을 바로 사용할 수 있습니다."
            />
          </div>
        )}

        <section className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_26px_60px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            SMART USDT FLOW
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            내 지갑 관리와 상점 결제를 분리해 빠르고 안전하게 처리합니다.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3">
              <p className="font-semibold text-slate-800">실시간</p>
              <p className="mt-1 text-slate-500">USDT 상태 확인</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3">
              <p className="font-semibold text-slate-800">간편</p>
              <p className="mt-1 text-slate-500">원화 기준 결제</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3">
              <p className="font-semibold text-slate-800">투명</p>
              <p className="mt-1 text-slate-500">거래내역 추적</p>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-4">
          <section className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">USDT Wallet</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">USDT 지갑</h2>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 5v14m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="4" y="3" width="16" height="6" rx="2" />
                </svg>
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              네트워크별 잔액 확인, 출금/입금, 전송내역을 한 화면에서 관리합니다.
            </p>
            <Link
              href={walletPath}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              USDT 지갑으로 이동
            </Link>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">USDT Payment</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">USDT 결제</h2>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-600 text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" />
                  <path d="M7 9h10M7 13h5" strokeLinecap="round" />
                </svg>
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              원화 금액 입력 시 환율 기반 USDT 수량을 계산하고 상점 결제지갑으로 전송합니다.
            </p>
            <Link
              href={paymentPath}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-cyan-600 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-500"
            >
              USDT 결제로 이동
            </Link>
          </section>
        </div>

        <p className="mt-5 text-center text-xs text-slate-500">
          거래 전 금액, 수신지갑, 네트워크 정보를 반드시 확인해 주세요.
        </p>
      </div>

      <WalletManagementBottomNav lang={lang} active="home" />
    </main>
  );
}
