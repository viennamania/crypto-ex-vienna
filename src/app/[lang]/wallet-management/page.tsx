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

type SellerPreviewItem = {
  walletAddress: string;
  nickname: string;
  avatar: string;
  rate: number;
  currentUsdtBalance: number;
  status: string;
};

type PaymentStoreInfo = {
  storecode: string;
  storeName: string;
  storeLogo: string;
  paymentWalletAddress: string;
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

const WALLET_AUTH_OPTIONS = ['phone'];

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

const normalizeWalletAddressList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const dedup = new Map<string, string>();
  value.forEach((item: unknown) => {
    const walletAddress = String(item || '').trim();
    if (!isWalletAddress(walletAddress)) return;
    const key = walletAddress.toLowerCase();
    if (!dedup.has(key)) {
      dedup.set(key, walletAddress);
    }
  });
  return Array.from(dedup.values());
};

export default function WalletManagementHomePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const lang = typeof params?.lang === 'string' ? params.lang : 'ko';
  const storecode = String(searchParams?.get('storecode') || '').trim();
  const sellerWalletFromQuery = String(searchParams?.get('seller') || '').trim();
  const baseQueryString = useMemo(() => {
    const query = new URLSearchParams();
    if (storecode) {
      query.set('storecode', storecode);
    }
    return query.toString();
  }, [storecode]);
  const walletPath = `/${lang}/wallet-management/wallet-usdt${baseQueryString ? `?${baseQueryString}` : ''}`;
  const paymentPath = `/${lang}/wallet-management/payment-usdt${baseQueryString ? `?${baseQueryString}` : ''}`;
  const buildBuyPath = useCallback((sellerWalletAddress?: string) => {
    const query = new URLSearchParams(baseQueryString);
    const sellerWallet = String(sellerWalletAddress || '').trim();
    if (sellerWallet) {
      query.set('seller', sellerWallet);
    }
    const queryString = query.toString();
    const basePath = `/${lang}/wallet-management/buy-usdt`;
    return queryString ? `${basePath}?${queryString}` : basePath;
  }, [baseQueryString, lang]);

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
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [sellers, setSellers] = useState<SellerPreviewItem[]>([]);
  const [storeSellerWalletAddresses, setStoreSellerWalletAddresses] = useState<string[]>([]);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [sellersError, setSellersError] = useState<string | null>(null);
  const [selectedSellerWallet, setSelectedSellerWallet] = useState(sellerWalletFromQuery);
  const [paymentStoreInfo, setPaymentStoreInfo] = useState<PaymentStoreInfo | null>(null);
  const [loadingPaymentStoreInfo, setLoadingPaymentStoreInfo] = useState(false);

  const selectedSeller = useMemo(
    () =>
      sellers.find(
        (item) => item.walletAddress.toLowerCase() === selectedSellerWallet.toLowerCase(),
      ) || null,
    [sellers, selectedSellerWallet],
  );
  const buyPath = useMemo(
    () => buildBuyPath(selectedSeller?.walletAddress || selectedSellerWallet),
    [buildBuyPath, selectedSeller?.walletAddress, selectedSellerWallet],
  );
  const isStoreSellerMode = Boolean(storecode);
  const hasSingleConfiguredStoreSeller = isStoreSellerMode && storeSellerWalletAddresses.length === 1;

  const loadBalance = useCallback(async () => {
    if (!activeAccount?.address) {
      setBalance(0);
      setLastUpdatedAt('');
      return;
    }

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

  const loadSellers = useCallback(async () => {
    setLoadingSellers(true);
    setSellersError(null);
    try {
      let walletAddressesFilter: string[] = [];
      if (storecode) {
        const storeResponse = await fetch('/api/store/getOneStore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storecode }),
        });
        const storeData = await storeResponse.json().catch(() => ({}));
        if (!storeResponse.ok) {
          throw new Error(String(storeData?.error || '가맹점 정보를 불러오지 못했습니다.'));
        }

        const storeResult = isRecord(storeData?.result) ? storeData.result : {};
        walletAddressesFilter = normalizeWalletAddressList(
          Array.isArray(storeResult.sellerWalletAddresses) ? storeResult.sellerWalletAddresses : [],
        );
        setStoreSellerWalletAddresses(walletAddressesFilter);

        if (walletAddressesFilter.length === 0) {
          setSellers([]);
          setSelectedSellerWallet('');
          return;
        }
      } else {
        setStoreSellerWalletAddresses([]);
      }

      const response = await fetch('/api/user/getAllSellersForBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: storecode || 'admin',
          limit: 40,
          page: 1,
          ...(walletAddressesFilter.length > 0 ? { walletAddresses: walletAddressesFilter } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || '판매자 목록을 불러오지 못했습니다.');
      }

      const source: unknown[] = Array.isArray(data?.result?.users) ? data.result.users : [];
      const normalized: SellerPreviewItem[] = source
        .map((rawUser: unknown): SellerPreviewItem | null => {
          if (!isRecord(rawUser)) return null;

          const user = rawUser;
          const sellerRaw = user.seller;
          const seller = isRecord(sellerRaw) ? sellerRaw : null;
          const sellerBuyOrder = isRecord(seller?.buyOrder) ? seller.buyOrder : null;
          const walletAddress = String(user.walletAddress || '').trim();
          const parsedRate = Number(
            seller?.usdtToKrwRate
            || sellerBuyOrder?.rate
            || 0,
          );
          const rate = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 1;
          const currentUsdtBalance = Number(user.currentUsdtBalance || 0);
          const enabled = seller?.enabled === true;
          const status = String(seller?.status || '');
          if (!walletAddress || !enabled || status !== 'confirmed') {
            return null;
          }
          return {
            walletAddress,
            nickname: String(user.nickname || '').trim() || '판매자',
            avatar: String(user.avatar || '').trim(),
            rate,
            currentUsdtBalance: Number.isFinite(currentUsdtBalance) ? Math.max(0, currentUsdtBalance) : 0,
            status,
          };
        })
        .filter((item: SellerPreviewItem | null): item is SellerPreviewItem => item !== null);

      if (walletAddressesFilter.length > 0) {
        const orderMap = new Map<string, number>();
        walletAddressesFilter.forEach((walletAddress, index) => {
          orderMap.set(walletAddress.toLowerCase(), index);
        });
        normalized.sort((a: SellerPreviewItem, b: SellerPreviewItem) => {
          const aIndex = orderMap.get(a.walletAddress.toLowerCase());
          const bIndex = orderMap.get(b.walletAddress.toLowerCase());
          return (aIndex ?? Number.MAX_SAFE_INTEGER) - (bIndex ?? Number.MAX_SAFE_INTEGER);
        });
      } else {
        normalized.sort((a: SellerPreviewItem, b: SellerPreviewItem) => {
          if (b.currentUsdtBalance !== a.currentUsdtBalance) {
            return b.currentUsdtBalance - a.currentUsdtBalance;
          }
          return a.rate - b.rate;
        });
      }

      setSellers(normalized);
      setSelectedSellerWallet((prev) => {
        if (sellerWalletFromQuery) {
          const matched = normalized.find(
            (item: SellerPreviewItem) => item.walletAddress.toLowerCase() === sellerWalletFromQuery.toLowerCase(),
          );
          if (matched) return matched.walletAddress;
        }
        if (walletAddressesFilter.length === 1) {
          const matchedSingle = normalized.find(
            (item: SellerPreviewItem) =>
              item.walletAddress.toLowerCase() === walletAddressesFilter[0].toLowerCase(),
          );
          return matchedSingle?.walletAddress || walletAddressesFilter[0];
        }
        if (prev && normalized.some((item: SellerPreviewItem) => item.walletAddress.toLowerCase() === prev.toLowerCase())) {
          return prev;
        }
        return normalized[0]?.walletAddress || '';
      });
    } catch (error) {
      console.error('Failed to load sellers for buy-usdt', error);
      const message = error instanceof Error ? error.message : '판매자 목록을 불러오지 못했습니다.';
      setSellersError(message);
      setSellers([]);
    } finally {
      setLoadingSellers(false);
    }
  }, [sellerWalletFromQuery, storecode]);

  useEffect(() => {
    loadSellers();
  }, [loadSellers]);

  const loadPaymentStoreInfo = useCallback(async () => {
    if (!storecode) {
      setPaymentStoreInfo(null);
      setLoadingPaymentStoreInfo(false);
      return;
    }

    setLoadingPaymentStoreInfo(true);
    try {
      const response = await fetch('/api/store/getOneStore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storecode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || '가맹점 정보를 불러오지 못했습니다.'));
      }

      const storeResult = isRecord(data?.result) ? data.result : null;
      if (!storeResult) {
        setPaymentStoreInfo(null);
        return;
      }

      setPaymentStoreInfo({
        storecode: String(storeResult.storecode || storecode).trim(),
        storeName: String(storeResult.storeName || storecode || '가맹점').trim() || '가맹점',
        storeLogo: String(storeResult.storeLogo || storeResult.storeUrl || '').trim(),
        paymentWalletAddress: String(storeResult.paymentWalletAddress || '').trim(),
      });
    } catch (error) {
      console.error('Failed to load payment store info', error);
      setPaymentStoreInfo(null);
    } finally {
      setLoadingPaymentStoreInfo(false);
    }
  }, [storecode]);

  useEffect(() => {
    loadPaymentStoreInfo();
  }, [loadPaymentStoreInfo]);

  useEffect(() => {
    if (sellerWalletFromQuery) {
      setSelectedSellerWallet(sellerWalletFromQuery);
    }
  }, [sellerWalletFromQuery]);

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
            style={{ fontFamily: '"SUIT Variable", "Pretendard", "Noto Sans KR", sans-serif' }}
          >
            USDT Finance
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            자산 관리와 상점 결제를 한 흐름으로 연결한 모바일형 금융 화면입니다.
            필요한 작업으로 바로 이동하세요.
          </p>
        </div>

        {activeAccount?.address ? (
          <>
            <WalletSummaryCard
              walletAddress={activeAccount.address}
              walletAddressDisplay={shortAddress(activeAccount.address)}
              networkLabel={activeNetwork.label}
              usdtBalanceDisplay={`${balance.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`}
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

              <div className="mt-4 grid grid-cols-3 gap-2">
                <Link
                  href={walletPath}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  지갑 관리
                </Link>
                <Link
                  href={paymentPath}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-cyan-600 px-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-500"
                >
                  결제 진행
                </Link>
                <Link
                  href={buyPath}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-600 px-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-emerald-500"
                >
                  USDT 구매
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
              <p className="mt-1 text-slate-500">USDT 수량 결제</p>
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
        </div>

        <div className="mt-5 grid gap-4">

          <section
            className={`rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] backdrop-blur ${
              storecode ? 'min-h-[260px]' : ''
            }`}
          >
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

            {storecode && (
              <div className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50/80 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">지정 상점</p>
                <div className="mt-2 flex items-center gap-2.5">
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-cyan-200 bg-white">
                    {paymentStoreInfo?.storeLogo ? (
                      <span
                        className="block h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${encodeURI(paymentStoreInfo.storeLogo)})` }}
                        aria-label={paymentStoreInfo.storeName || storecode}
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-cyan-700">
                        SHOP
                      </span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {loadingPaymentStoreInfo
                        ? '상점 정보를 확인 중입니다...'
                        : paymentStoreInfo?.storeName || storecode}
                    </p>
                    <p className="text-xs text-cyan-700">
                      {paymentStoreInfo?.storecode || storecode}
                    </p>
                  </div>
                </div>
                <p className="mt-2 min-h-[16px] text-[11px] text-slate-500">
                  {loadingPaymentStoreInfo
                    ? '결제 지갑 정보를 확인 중입니다...'
                    : paymentStoreInfo?.paymentWalletAddress
                      ? `결제 지갑: ${shortAddress(paymentStoreInfo.paymentWalletAddress)}`
                      : '\u00A0'}
                </p>
              </div>
            )}

            <p className="mt-3 text-sm text-slate-600">
              {storecode
                ? '지정된 상점 결제지갑으로 보낼 USDT 수량을 입력해 결제를 진행합니다.'
                : '결제할 USDT 수량을 입력해 상점 결제지갑으로 전송합니다.'}
            </p>
            <Link
              href={paymentPath}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-cyan-600 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-500"
            >
              {storecode
                ? loadingPaymentStoreInfo
                  ? '상점 정보 확인 중...'
                  : `${paymentStoreInfo?.storeName || '지정 상점'} USDT 결제로 이동`
                : 'USDT 결제로 이동'}
            </Link>
          </section>

        </div>

        <section className="mt-5 min-h-[390px] rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">USDT BUY</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                {isStoreSellerMode ? 'USDT 구매' : '판매자 선택 후 구매 시작'}
              </h2>
            </div>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 12h18M12 3v18" strokeLinecap="round" />
                <circle cx="12" cy="12" r="8" />
              </svg>
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            {isStoreSellerMode
              ? ''
              : 'API에서 판매자 목록을 조회해 조건이 맞는 판매자를 고르고, 구매/채팅/구매신청으로 바로 연결됩니다.'}
          </p>

          {sellersError && (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
              {sellersError}
            </p>
          )}

          <div className="mt-4 min-h-[248px]">
            {loadingSellers && sellers.length === 0 && (
              <div className="grid gap-2">
                <p className="text-sm text-slate-500">판매자 목록을 불러오는 중입니다...</p>
                <div className="h-[92px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80" />
                <div className="h-11 animate-pulse rounded-2xl bg-emerald-100/90" />
              </div>
            )}

            {!loadingSellers && sellers.length === 0 && !sellersError && (
              <div className="grid gap-2">
                <p className="text-sm text-slate-500">
                  {isStoreSellerMode && storeSellerWalletAddresses.length === 0
                    ? '가맹점에 설정된 판매자가 없습니다.'
                    : '현재 구매 가능한 판매자가 없습니다.'}
                </p>
              </div>
            )}

            {sellers.length > 0 && (
              <div className="grid gap-2">
              {hasSingleConfiguredStoreSeller ? (
                <div className="w-full rounded-2xl border border-cyan-300 bg-cyan-50 px-3 py-3">
                  {isStoreSellerMode && (
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                      지정 판매자
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white">
                        {sellers[0]?.avatar ? (
                          <span
                            className="block h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${encodeURI(sellers[0].avatar)})` }}
                            aria-label={`${sellers[0]?.nickname || '판매자'} 아바타`}
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500">
                            {String(sellers[0]?.nickname || 'S').slice(0, 1)}
                          </span>
                        )}
                      </span>
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {sellers[0]?.nickname || '판매자'}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {(sellers[0]?.rate || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} KRW
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{shortAddress(sellers[0]?.walletAddress || '')}</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-700">
                    판매 가능: {(sellers[0]?.currentUsdtBalance || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} USDT
                  </p>
                </div>
              ) : (
                <div className="max-h-[230px] space-y-2 overflow-y-auto pr-1">
                  {sellers.map((seller) => {
                    const selected =
                      seller.walletAddress.toLowerCase() === selectedSellerWallet.toLowerCase();
                    return (
                      <button
                        key={seller.walletAddress}
                        type="button"
                        onClick={() => setSelectedSellerWallet(seller.walletAddress)}
                        className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                          selected
                            ? 'border-cyan-300 bg-cyan-50 shadow-[0_12px_26px_-18px_rgba(6,182,212,0.65)]'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white">
                              {seller.avatar ? (
                                <span
                                  className="block h-full w-full bg-cover bg-center"
                                  style={{ backgroundImage: `url(${encodeURI(seller.avatar)})` }}
                                  aria-label={`${seller.nickname} 아바타`}
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500">
                                  {String(seller.nickname || 'S').slice(0, 1)}
                                </span>
                              )}
                            </span>
                            <p className="truncate text-sm font-semibold text-slate-900">{seller.nickname}</p>
                          </div>
                          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                            {seller.rate.toLocaleString(undefined, { maximumFractionDigits: 0 })} KRW
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{shortAddress(seller.walletAddress)}</p>
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          판매 가능: {seller.currentUsdtBalance.toLocaleString(undefined, { maximumFractionDigits: 3 })} USDT
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              <Link
                href={buyPath}
                className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-emerald-600 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-emerald-500"
              >
                {selectedSeller ? `${selectedSeller.nickname} 판매자 USDT 구매로 이동` : 'USDT 구매 페이지로 이동'}
              </Link>
              </div>
            )}
          </div>
        </section>

        <p className="mt-5 text-center text-xs text-slate-500">
          거래 전 금액, 수신지갑, 네트워크 정보를 반드시 확인해 주세요.
        </p>
      </div>

      <WalletManagementBottomNav lang={lang} active="home" />
    </main>
  );
}
