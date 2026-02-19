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
import { rgbaFromHex, resolveStoreBrandColor } from '@/lib/storeBranding';
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
  storeDescription: string;
  backgroundColor: string;
  paymentWalletAddress: string;
};

type NoticePreviewItem = {
  id: string;
  title: string;
  summary?: string;
  content?: string[] | string;
  isPinned?: boolean;
  publishedAt?: string;
  createdAt?: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
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

const resolveNoticeSummary = (notice: NoticePreviewItem): string => {
  if (notice.summary) {
    return notice.summary;
  }
  if (Array.isArray(notice.content)) {
    return notice.content.find((line) => String(line || '').trim()) || '';
  }
  if (typeof notice.content === 'string') {
    return notice.content.split('\n').find((line) => line.trim()) || '';
  }
  return '';
};

const resolveNoticeDateLabel = (notice: NoticePreviewItem): string => {
  const dateSource = String(notice.publishedAt || notice.createdAt || '').trim();
  if (!dateSource) {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateSource)) {
    return dateSource;
  }
  const parsedDate = new Date(dateSource);
  if (Number.isNaN(parsedDate.getTime())) {
    return dateSource.slice(0, 10);
  }
  return parsedDate.toISOString().slice(0, 10);
};

const BALANCE_SYNC_WARNING_THRESHOLD = 3;
const HOME_SHORTCUT_BANNER_HIDE_KEY = 'wallet-home-shortcut-banner-hide-until';
const HOME_SHORTCUT_BANNER_HIDE_DAYS = 7;
const HOME_SHORTCUT_PROMPT_DELAY_MS = 12000;

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
  const noticePath = `/${lang}/wallet-management/notice${baseQueryString ? `?${baseQueryString}` : ''}`;
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
  const [balanceSyncFailureCount, setBalanceSyncFailureCount] = useState(0);
  const [sellers, setSellers] = useState<SellerPreviewItem[]>([]);
  const [storeSellerWalletAddresses, setStoreSellerWalletAddresses] = useState<string[]>([]);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [sellersError, setSellersError] = useState<string | null>(null);
  const [selectedSellerWallet, setSelectedSellerWallet] = useState(sellerWalletFromQuery);
  const [paymentStoreInfo, setPaymentStoreInfo] = useState<PaymentStoreInfo | null>(null);
  const [loadingPaymentStoreInfo, setLoadingPaymentStoreInfo] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);
  const [showHomeShortcutBanner, setShowHomeShortcutBanner] = useState(false);
  const [showHomeShortcutGuide, setShowHomeShortcutGuide] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [notices, setNotices] = useState<NoticePreviewItem[]>([]);
  const [loadingNotices, setLoadingNotices] = useState(true);
  const [noticesError, setNoticesError] = useState<string | null>(null);

  const storeBrandColor = useMemo(
    () => resolveStoreBrandColor(storecode, paymentStoreInfo?.backgroundColor),
    [paymentStoreInfo?.backgroundColor, storecode],
  );
  const storeBrandSoftBackground = useMemo(
    () => rgbaFromHex(storeBrandColor, 0.1),
    [storeBrandColor],
  );
  const storeBrandLightBorder = useMemo(
    () => rgbaFromHex(storeBrandColor, 0.35),
    [storeBrandColor],
  );

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
  const isBalanceSyncWarning = balanceSyncFailureCount >= BALANCE_SYNC_WARNING_THRESHOLD;
  const balanceSyncStatusLabel = isBalanceSyncWarning
    ? '잔액 갱신 지연'
    : '실시간 동기화 중';

  const hideHomeShortcutBanner = useCallback((days: number = HOME_SHORTCUT_BANNER_HIDE_DAYS) => {
    const hideUntil = Date.now() + days * 24 * 60 * 60 * 1000;
    setShowHomeShortcutBanner(false);
    setShowHomeShortcutGuide(false);
    try {
      window.localStorage.setItem(HOME_SHORTCUT_BANNER_HIDE_KEY, String(hideUntil));
    } catch (error) {
      console.warn('Failed to store home shortcut banner state', error);
    }
  }, []);

  const handleOpenHomeShortcutGuide = useCallback(async () => {
    if (deferredInstallPrompt) {
      try {
        await deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setShowHomeShortcutBanner(false);
          setDeferredInstallPrompt(null);
          return;
        }
      } catch (error) {
        console.warn('Failed to open install prompt', error);
      }
      setDeferredInstallPrompt(null);
      hideHomeShortcutBanner();
      return;
    }

    setShowHomeShortcutGuide(true);
  }, [deferredInstallPrompt, hideHomeShortcutBanner]);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const mobileByAgent = /android|iphone|ipad|ipod|mobile/.test(userAgent);
    const mobileByViewport = window.matchMedia('(max-width: 768px)').matches;
    const standaloneByDisplayMode = window.matchMedia('(display-mode: standalone)').matches;
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const standaloneByNavigator = Boolean(navigatorWithStandalone.standalone);
    const isTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const iosByAgent = /iphone|ipad|ipod/.test(userAgent);

    setIsMobileDevice(mobileByAgent || mobileByViewport);
    setIsStandaloneMode(standaloneByDisplayMode || standaloneByNavigator);
    setIsIosDevice(iosByAgent || isTouchMac);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
      hideHomeShortcutBanner(365);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [hideHomeShortcutBanner]);

  useEffect(() => {
    if (!isMobileDevice || isStandaloneMode) {
      setShowHomeShortcutBanner(false);
      return;
    }

    let hiddenUntil = 0;
    try {
      hiddenUntil = Number(window.localStorage.getItem(HOME_SHORTCUT_BANNER_HIDE_KEY) || '0');
    } catch (error) {
      console.warn('Failed to read home shortcut banner state', error);
    }

    if (Number.isFinite(hiddenUntil) && hiddenUntil > Date.now()) {
      setShowHomeShortcutBanner(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowHomeShortcutBanner(true);
    }, HOME_SHORTCUT_PROMPT_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isMobileDevice, isStandaloneMode]);

  const loadBalance = useCallback(async () => {
    if (!activeAccount?.address) {
      setBalance(0);
      setBalanceSyncFailureCount(0);
      return;
    }

    try {
      const result = await balanceOf({
        contract,
        address: activeAccount.address,
      });

      const parsed = Number(result) / 10 ** activeNetwork.tokenDecimals;
      setBalance(Number.isFinite(parsed) ? parsed : 0);
      setBalanceSyncFailureCount(0);
    } catch (error) {
      console.error('Failed to load wallet balance', error);
      setBalanceSyncFailureCount((prev) => Math.min(prev + 1, 99));
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
      let useRandomFallbackSeller = false;
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
          useRandomFallbackSeller = true;
        }
      } else {
        setStoreSellerWalletAddresses([]);
      }

      const response = await fetch('/api/user/getAllSellersForBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: walletAddressesFilter.length > 0 ? (storecode || 'admin') : 'admin',
          limit: useRandomFallbackSeller ? 200 : 40,
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
          const walletAddress = String(user.walletAddress || '').trim();
          const parsedRate = Number(
            seller?.usdtToKrwRate
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

      let nextSellers = normalized;
      if (walletAddressesFilter.length > 0) {
        const orderMap = new Map<string, number>();
        walletAddressesFilter.forEach((walletAddress, index) => {
          orderMap.set(walletAddress.toLowerCase(), index);
        });
        nextSellers.sort((a: SellerPreviewItem, b: SellerPreviewItem) => {
          const aIndex = orderMap.get(a.walletAddress.toLowerCase());
          const bIndex = orderMap.get(b.walletAddress.toLowerCase());
          return (aIndex ?? Number.MAX_SAFE_INTEGER) - (bIndex ?? Number.MAX_SAFE_INTEGER);
        });
      } else if (useRandomFallbackSeller) {
        if (nextSellers.length > 0) {
          const randomIndex = Math.floor(Math.random() * nextSellers.length);
          nextSellers = [nextSellers[randomIndex]];
        }
      } else {
        nextSellers.sort((a: SellerPreviewItem, b: SellerPreviewItem) => {
          if (b.currentUsdtBalance !== a.currentUsdtBalance) {
            return b.currentUsdtBalance - a.currentUsdtBalance;
          }
          return a.rate - b.rate;
        });
      }

      setSellers(nextSellers);
      setSelectedSellerWallet((prev) => {
        if (sellerWalletFromQuery) {
          const matched = nextSellers.find(
            (item: SellerPreviewItem) => item.walletAddress.toLowerCase() === sellerWalletFromQuery.toLowerCase(),
          );
          if (matched) return matched.walletAddress;
        }
        if (walletAddressesFilter.length === 1) {
          const matchedSingle = nextSellers.find(
            (item: SellerPreviewItem) =>
              item.walletAddress.toLowerCase() === walletAddressesFilter[0].toLowerCase(),
          );
          return matchedSingle?.walletAddress || walletAddressesFilter[0];
        }
        if (prev && nextSellers.some((item: SellerPreviewItem) => item.walletAddress.toLowerCase() === prev.toLowerCase())) {
          return prev;
        }
        return nextSellers[0]?.walletAddress || '';
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
        storeDescription: String(storeResult.storeDescription || '').trim(),
        backgroundColor: String(storeResult.backgroundColor || '').trim(),
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

  useEffect(() => {
    let mounted = true;
    const loadNotices = async () => {
      setLoadingNotices(true);
      setNoticesError(null);
      try {
        const response = await fetch('/api/notice/getActive?limit=3&sortBy=publishedAt&pinnedFirst=true');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(data?.error || '공지사항을 불러오지 못했습니다.'));
        }

        const source = Array.isArray(data?.result) ? data.result : [];
        const normalized = source
          .map((item: unknown): NoticePreviewItem | null => {
            if (!isRecord(item)) {
              return null;
            }
            const id = String(item._id || item.id || '').trim();
            const title = String(item.title || '').trim();
            if (!id || !title) {
              return null;
            }
            return {
              id,
              title,
              summary: String(item.summary || '').trim(),
              content: Array.isArray(item.content)
                ? item.content.map((line: unknown) => String(line || ''))
                : typeof item.content === 'string'
                  ? item.content
                  : '',
              isPinned: item.isPinned === true,
              publishedAt: String(item.publishedAt || '').trim(),
              createdAt: String(item.createdAt || '').trim(),
            };
          })
          .filter((item: NoticePreviewItem | null): item is NoticePreviewItem => item !== null);

        if (mounted) {
          setNotices(normalized);
        }
      } catch (error) {
        console.error('Failed to load notices on wallet home', error);
        if (mounted) {
          const message = error instanceof Error ? error.message : '공지사항을 불러오지 못했습니다.';
          setNoticesError(message);
          setNotices([]);
        }
      } finally {
        if (mounted) {
          setLoadingNotices(false);
        }
      }
    };

    loadNotices();

    return () => {
      mounted = false;
    };
  }, []);

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

      <div
        className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl"
        style={{ backgroundColor: rgbaFromHex(storeBrandColor, 0.32) }}
      />
      <div
        className="pointer-events-none absolute top-24 right-0 h-80 w-80 rounded-full blur-3xl"
        style={{ backgroundColor: rgbaFromHex(storeBrandColor, 0.2) }}
      />

      <div className="relative mx-auto w-full max-w-[430px] px-4 pb-28 pt-8">
        <div className="mb-7">
          <p
            className="mb-2 inline-flex rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600"
            style={
              storecode
                ? {
                    borderColor: storeBrandLightBorder,
                    backgroundColor: storeBrandSoftBackground,
                    color: storeBrandColor,
                  }
                : undefined
            }
          >
            {storecode ? `${paymentStoreInfo?.storeName || storecode} BRAND HOME` : 'Wallet Management Home'}
          </p>
          <h1
            className="text-3xl font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: '"SUIT Variable", "Pretendard", "Noto Sans KR", sans-serif' }}
          >
            USDT Finance
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {storecode
              ? `${paymentStoreInfo?.storeName || '가맹점'} 전용 흐름으로 결제와 지갑 관리를 빠르게 시작하세요.`
              : '자산 관리부터 상점 결제까지, 서비스 이용 흐름을 하나로 연결했습니다. 필요한 업무를 바로 시작하세요.'}
          </p>
        </div>

        {activeAccount?.address ? (
          <>
            <WalletSummaryCard
              walletAddress={activeAccount.address}
              walletAddressDisplay={shortAddress(activeAccount.address)}
              networkLabel={activeNetwork.label}
              usdtBalanceDisplay={`${balance.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} USDT`}
              balanceUpdatedAtLabel={balanceSyncStatusLabel}
              balanceUpdatedAtWarning={isBalanceSyncWarning}
              modeLabel="홈"
              smartAccountEnabled={smartAccountEnabled}
              onCopyAddress={(walletAddress) => {
                navigator.clipboard.writeText(walletAddress);
                toast.success('지갑 주소를 복사했습니다.');
              }}
            />

            {storecode && paymentStoreInfo && (
              <section
                className="mb-5 rounded-3xl border bg-white/80 p-4 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] backdrop-blur"
                style={{
                  borderColor: storeBrandLightBorder,
                  background: `linear-gradient(140deg, ${rgbaFromHex(storeBrandColor, 0.13)} 0%, rgba(255,255,255,0.88) 58%, rgba(255,255,255,0.94) 100%)`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border bg-white"
                    style={{ borderColor: rgbaFromHex(storeBrandColor, 0.3) }}
                  >
                    {paymentStoreInfo.storeLogo ? (
                      <span
                        className="block h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${encodeURI(paymentStoreInfo.storeLogo)})` }}
                        aria-label={paymentStoreInfo.storeName}
                      />
                    ) : (
                      <span
                        className="flex h-full w-full items-center justify-center text-[10px] font-bold"
                        style={{ color: storeBrandColor }}
                      >
                        SHOP
                      </span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-900">{paymentStoreInfo.storeName}</p>
                    <p className="truncate text-xs text-slate-600">가맹점 코드: {paymentStoreInfo.storecode}</p>
                  </div>
                  <span
                    className="ml-auto inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold"
                    style={{
                      borderColor: rgbaFromHex(storeBrandColor, 0.35),
                      color: storeBrandColor,
                      backgroundColor: rgbaFromHex(storeBrandColor, 0.1),
                    }}
                  >
                    BRAND
                  </span>
                </div>
                {paymentStoreInfo.storeDescription && (
                  <p className="mt-2 text-xs text-slate-600">
                    {paymentStoreInfo.storeDescription}
                  </p>
                )}
              </section>
            )}

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
                <div
                  className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3"
                  style={
                    storecode
                      ? {
                          borderColor: storeBrandLightBorder,
                          backgroundColor: storeBrandSoftBackground,
                        }
                      : undefined
                  }
                >
                  <p
                    className="font-semibold text-slate-800"
                    style={storecode ? { color: storeBrandColor } : undefined}
                  >
                    선택 상점
                  </p>
                  <p
                    className="mt-1 truncate text-slate-600"
                    style={storecode ? { color: storeBrandColor } : undefined}
                  >
                    {storecode || '미지정'}
                  </p>
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
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-cyan-600 px-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:opacity-95"
                  style={storecode ? { backgroundColor: storeBrandColor } : undefined}
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

        {showHomeShortcutBanner && (
          <section
            className="mb-5 rounded-2xl border bg-white/85 p-4 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.45)] backdrop-blur"
            style={{
              borderColor: storeBrandLightBorder,
              background: `linear-gradient(145deg, ${rgbaFromHex(storeBrandColor, 0.12)} 0%, rgba(255,255,255,0.9) 60%, rgba(255,255,255,0.95) 100%)`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: storeBrandColor }}
                >
                  QUICK ACCESS
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  홈 화면에 추가하고 앱처럼 바로 실행하세요.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {deferredInstallPrompt
                    ? '한 번 탭으로 바로 추가할 수 있습니다.'
                    : isIosDevice
                      ? 'Safari 공유 버튼에서 홈 화면에 추가를 선택하세요.'
                      : '브라우저 메뉴에서 홈 화면에 추가를 선택하세요.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => hideHomeShortcutBanner()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-white transition"
                style={{
                  borderColor: rgbaFromHex(storeBrandColor, 0.28),
                  color: rgbaFromHex(storeBrandColor, 0.78),
                }}
                aria-label="홈 바로가기 안내 닫기"
              >
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 5l10 10M15 5 5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenHomeShortcutGuide}
                className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-xs font-semibold text-white transition hover:opacity-95"
                style={{ backgroundColor: storeBrandColor }}
              >
                {deferredInstallPrompt ? '홈에 바로 추가' : '추가 방법 보기'}
              </button>
              <button
                type="button"
                onClick={() => hideHomeShortcutBanner()}
                className="inline-flex h-10 items-center justify-center rounded-xl border bg-white px-3 text-xs font-semibold transition hover:opacity-90"
                style={{
                  borderColor: rgbaFromHex(storeBrandColor, 0.35),
                  color: storeBrandColor,
                }}
              >
                나중에
              </button>
            </div>
          </section>
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

        <section className="mt-5 rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">NOTICE</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">공지사항</h2>
            </div>
            <Link
              href={noticePath}
              className="inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-semibold transition hover:opacity-95"
              style={{
                borderColor: storeBrandLightBorder,
                color: storeBrandColor,
                backgroundColor: rgbaFromHex(storeBrandColor, 0.08),
              }}
            >
              공지사항 보러가기
            </Link>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            서비스 공지, 정책 변경, 업데이트 소식을 빠르게 확인하세요.
          </p>

          <div className="mt-3 grid gap-2">
            {loadingNotices && (
              <>
                <div className="h-[72px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80" />
                <div className="h-[72px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70" />
              </>
            )}

            {!loadingNotices && noticesError && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                {noticesError}
              </p>
            )}

            {!loadingNotices && !noticesError && notices.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                등록된 공지사항이 없습니다.
              </p>
            )}

            {!loadingNotices &&
              !noticesError &&
              notices.map((notice) => {
                const noticeQuery = new URLSearchParams(baseQueryString);
                noticeQuery.set('noticeId', notice.id);
                const noticeDetailPath = `/${lang}/wallet-management/notice?${noticeQuery.toString()}`;
                const summary = resolveNoticeSummary(notice);
                const dateLabel = resolveNoticeDateLabel(notice);
                return (
                  <Link
                    key={notice.id}
                    href={noticeDetailPath}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-50/80"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500">
                      <span>{dateLabel || '공지'}</span>
                      <span>{notice.isPinned ? '중요 공지' : '상세보기'}</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm font-semibold text-slate-900">{notice.title}</p>
                    {summary && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{summary}</p>
                    )}
                  </Link>
                );
              })}
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
              <div
                className="mt-3 rounded-2xl border p-3"
                style={{
                  borderColor: storeBrandLightBorder,
                  backgroundColor: rgbaFromHex(storeBrandColor, 0.1),
                }}
              >
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: storeBrandColor }}
                >
                  지정 상점
                </p>
                <div className="mt-2 flex items-center gap-2.5">
                  <span
                    className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border bg-white"
                    style={{ borderColor: rgbaFromHex(storeBrandColor, 0.3) }}
                  >
                    {paymentStoreInfo?.storeLogo ? (
                      <span
                        className="block h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${encodeURI(paymentStoreInfo.storeLogo)})` }}
                        aria-label={paymentStoreInfo.storeName || storecode}
                      />
                    ) : (
                      <span
                        className="flex h-full w-full items-center justify-center text-[10px] font-bold"
                        style={{ color: storeBrandColor }}
                      >
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
                    <p className="text-xs" style={{ color: storeBrandColor }}>
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
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-cyan-600 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:opacity-95"
              style={storecode ? { backgroundColor: storeBrandColor } : undefined}
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
                    <span className="inline-flex flex-col items-end rounded-2xl bg-slate-900 px-3 py-1.5 leading-tight text-white">
                      <span className="text-[10px] font-medium text-slate-300">판매금액</span>
                      <span className="text-xl font-extrabold tracking-tight">
                        {(sellers[0]?.rate || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        <span className="ml-1 text-xs font-semibold">KRW</span>
                      </span>
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
                          <span className="inline-flex flex-col items-end rounded-xl bg-slate-900 px-3 py-1 leading-tight text-white">
                            <span className="text-[9px] font-medium text-slate-300">판매금액</span>
                            <span className="text-lg font-extrabold tracking-tight">
                              {seller.rate.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              <span className="ml-1 text-[10px] font-semibold">KRW</span>
                            </span>
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

      {showHomeShortcutGuide && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={() => setShowHomeShortcutGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border bg-white p-5 shadow-[0_34px_70px_-40px_rgba(15,23,42,0.8)]"
            style={{
              borderColor: storeBrandLightBorder,
              background: `linear-gradient(165deg, ${rgbaFromHex(storeBrandColor, 0.08)} 0%, rgba(255,255,255,0.97) 54%, rgba(255,255,255,1) 100%)`,
            }}
            role="dialog"
            aria-modal="true"
            aria-label="홈 화면 추가 안내"
            onClick={(event) => event.stopPropagation()}
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: storeBrandColor }}
            >
              QUICK ACCESS
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
              홈 화면에 추가
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {isIosDevice
                ? 'iPhone Safari에서 아래 순서대로 추가하면 앱처럼 바로 실행할 수 있습니다.'
                : '브라우저 메뉴에서 홈 화면에 추가하면 다음부터 앱처럼 바로 열 수 있습니다.'}
            </p>

            <div
              className="mt-4 rounded-2xl border px-3 py-3 text-xs text-slate-700"
              style={{
                borderColor: rgbaFromHex(storeBrandColor, 0.26),
                backgroundColor: rgbaFromHex(storeBrandColor, 0.08),
              }}
            >
              {isIosDevice ? (
                <>
                  <p>1. Safari의 공유 버튼을 누릅니다.</p>
                  <p className="mt-1">2. 홈 화면에 추가를 선택하고 완료를 누릅니다.</p>
                </>
              ) : (
                <>
                  <p>1. 브라우저 메뉴(⋮)를 엽니다.</p>
                  <p className="mt-1">2. 홈 화면에 추가 또는 앱 설치를 선택합니다.</p>
                </>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowHomeShortcutGuide(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl border bg-white text-sm font-semibold transition hover:opacity-90"
                style={{
                  borderColor: rgbaFromHex(storeBrandColor, 0.3),
                  color: storeBrandColor,
                }}
              >
                확인
              </button>
              <button
                type="button"
                onClick={() => hideHomeShortcutBanner()}
                className="inline-flex h-10 items-center justify-center rounded-xl text-sm font-semibold text-white transition hover:opacity-95"
                style={{ backgroundColor: storeBrandColor }}
              >
                7일간 닫기
              </button>
            </div>
          </div>
        </div>
      )}

      <WalletManagementBottomNav lang={lang} active="home" />
    </main>
  );
}
