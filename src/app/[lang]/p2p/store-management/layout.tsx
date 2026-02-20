'use client';

import Link from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AutoConnect,
  useActiveAccount,
  useActiveWallet,
  useConnectedWallets,
  useDisconnect,
} from 'thirdweb/react';

import { client } from '@/app/client';
import { ConnectButton } from '@/components/OrangeXConnectButton';
import { clearWalletConnectionState } from '@/lib/clearWalletConnectionState';
import { useClientWallets } from '@/lib/useClientWallets';

type MenuItem = {
  key: string;
  label: string;
  compactLabel: string;
  description: string;
  basePath: string;
};

type PendingOrderProcessingItem = {
  id: string;
  tradeId: string;
  storecode: string;
  storeName: string;
  storeLogo: string;
  memberNickname: string;
  usdtAmount: number;
  krwAmount: number;
  createdAt: string;
  confirmedAt: string;
  orderProcessing: string;
  orderProcessingUpdatedAt: string;
};

type PendingOrderProcessingSummary = {
  pendingCount: number;
  oldestPendingAt: string;
  recentPayments: PendingOrderProcessingItem[];
};

type PendingAlertCardItem = PendingOrderProcessingItem & {
  cardKey: string;
  cardState: 'entering' | 'stable' | 'exiting';
};

const WALLET_AUTH_OPTIONS = ['phone', 'google', 'email'];
const ORDER_PROCESSING_ALERT_POLLING_MS = 15000;
const ORDER_PROCESSING_ALERT_SOUND_INTERVAL_MS = 30000;
const ORDER_PROCESSING_ALERT_SOUND_ENABLED_KEY = 'store-order-processing-alert-sound-enabled';
const ORDER_PROCESSING_ALERT_EXPANDED_KEY = 'store-order-processing-alert-expanded';
const ORDER_PROCESSING_ALERT_SOUND_SRC = '/notification.mp3';
const ORDER_PROCESSING_ALERT_SOUND_FALLBACK_SRC = '/notification.wav';
const ORDER_PROCESSING_CARD_ENTER_MS = 1700;
const ORDER_PROCESSING_CARD_EXIT_MS = 420;

const shortAddress = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};
const normalizeAddress = (value: string) => String(value || '').trim().toLowerCase();
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const formatNumber = (value: number) =>
  new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number(value || 0));
const formatUsdtAmount = (value: number) =>
  new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(Number(value || 0));
const toDateTimeLabel = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR');
};
const toTimeAgoLabel = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  const time = parsed.getTime();
  if (Number.isNaN(time)) return '-';

  const diffMs = Date.now() - time;
  if (diffMs <= 0) return '방금 전';

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}주 전`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;

  const years = Math.floor(days / 365);
  return `${years}년 전`;
};
const resolvePendingCardKey = (payment: PendingOrderProcessingItem) =>
  String(payment.id || payment.tradeId || `${payment.storecode}-${payment.memberNickname}-${payment.createdAt || payment.confirmedAt}`);

const MenuIcon = ({ itemKey, active }: { itemKey: string; active: boolean }) => {
  const iconClass = active
    ? 'text-slate-900'
    : 'text-slate-400 transition group-hover:text-cyan-100';

  if (itemKey === 'home') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={`h-[18px] w-[18px] ${iconClass}`} aria-hidden="true">
        <path d="M3.5 10.8 12 3l8.5 7.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6.5 9.9V20h11V9.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (itemKey === 'member') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={`h-[18px] w-[18px] ${iconClass}`} aria-hidden="true">
        <path
          d="M9 11.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Zm0 0c-3.2 0-5.5 1.9-5.5 4.6V19h11v-2.9c0-2.7-2.3-4.6-5.5-4.6Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M16.3 7.2h4.2M18.4 5.1v4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (itemKey === 'stats') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={`h-[18px] w-[18px] ${iconClass}`} aria-hidden="true">
        <path d="M4.5 19.5h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7.5 15v-4.5M12 15V9M16.5 15V6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`h-[18px] w-[18px] ${iconClass}`} aria-hidden="true">
      <path
        d="M4.5 7.5h15M4.5 12h15M4.5 16.5h8.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M17.5 14.8 20.5 12l-3-2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
};

export default function P2PStoreManagementLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ lang: string }>();
  const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko';
  const activeWallet = useActiveWallet();
  const connectedWallets = useConnectedWallets();
  const { disconnect } = useDisconnect();
  const { wallet, wallets } = useClientWallets({
    authOptions: WALLET_AUTH_OPTIONS,
    defaultSmsCountryCode: 'KR',
  });
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storecode = String(searchParams?.get('storecode') || '').trim();
  const activeAccount = useActiveAccount();
  const connectedWalletAddress = String(activeAccount?.address || '').trim();
  const normalizedConnectedWalletAddress = normalizeAddress(connectedWalletAddress);
  const storeQuery = storecode ? `?storecode=${encodeURIComponent(storecode)}` : '';
  const paymentManagementHref = `/${lang}/p2p/store-management/payment-management${storeQuery}`;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loadingStoreAccess, setLoadingStoreAccess] = useState(false);
  const [storeAccessError, setStoreAccessError] = useState<string | null>(null);
  const [storeAdminWalletAddress, setStoreAdminWalletAddress] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeLogo, setStoreLogo] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [pendingSummary, setPendingSummary] = useState<PendingOrderProcessingSummary>({
    pendingCount: 0,
    oldestPendingAt: '',
    recentPayments: [],
  });
  const [pendingAlertError, setPendingAlertError] = useState<string | null>(null);
  const [pendingAlertLastCheckedAt, setPendingAlertLastCheckedAt] = useState('');
  const [pendingAlertSoundEnabled, setPendingAlertSoundEnabled] = useState(true);
  const [pendingAlertExpanded, setPendingAlertExpanded] = useState(true);
  const [pendingAlertCards, setPendingAlertCards] = useState<PendingAlertCardItem[]>([]);
  const pendingAlertAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAlertAudioUnlockedRef = useRef(false);
  const lastAlertSoundAtRef = useRef(0);
  const previousPendingCountRef = useRef(0);
  const pendingCardTimerIdsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!normalizedConnectedWalletAddress || !storecode) {
      setStoreAccessError(null);
      setStoreAdminWalletAddress('');
      setStoreName('');
      setStoreLogo('');
      setLoadingStoreAccess(false);
      return;
    }

    const abortController = new AbortController();
    setLoadingStoreAccess(true);
    setStoreAccessError(null);

    (async () => {
      try {
        const response = await fetch('/api/store/getOneStore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storecode }),
          signal: abortController.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.result) {
          throw new Error(String(payload?.error || '가맹점 정보를 불러오지 못했습니다.'));
        }

        const result = payload.result || {};
        const nextAdminWalletAddress = String(result?.adminWalletAddress || '').trim();
        const nextStoreName = String(result?.storeName || '').trim();
        const nextStoreLogo = String(result?.storeLogo || '').trim();
        setStoreAdminWalletAddress(nextAdminWalletAddress);
        setStoreName(nextStoreName);
        setStoreLogo(nextStoreLogo);
      } catch (error) {
        if (abortController.signal.aborted) return;
        setStoreAdminWalletAddress('');
        setStoreName('');
        setStoreLogo('');
        setStoreAccessError(
          error instanceof Error ? error.message : '가맹점 관리자 권한을 확인하지 못했습니다.',
        );
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingStoreAccess(false);
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [normalizedConnectedWalletAddress, storecode]);

  const normalizedStoreAdminWalletAddress = normalizeAddress(storeAdminWalletAddress);
  const canAccessStorePages = useMemo(() => {
    if (!normalizedConnectedWalletAddress) return false;
    if (!storecode) return true;
    if (loadingStoreAccess) return false;
    if (storeAccessError) return false;
    if (!normalizedStoreAdminWalletAddress) return false;
    return normalizedConnectedWalletAddress === normalizedStoreAdminWalletAddress;
  }, [
    loadingStoreAccess,
    normalizedConnectedWalletAddress,
    normalizedStoreAdminWalletAddress,
    storeAccessError,
    storecode,
  ]);

  const showWalletConnectRequired = !normalizedConnectedWalletAddress;
  const hasConnectedWallet = Boolean(connectedWalletAddress);
  const showStoreAccessChecking = Boolean(normalizedConnectedWalletAddress && storecode && loadingStoreAccess);
  const showStoreAccessDenied = Boolean(
    normalizedConnectedWalletAddress
      && storecode
      && !loadingStoreAccess
      && !canAccessStorePages,
  );
  const showPinnedPendingAlert = canAccessStorePages
    && Boolean(storecode)
    && (pendingSummary.pendingCount > 0 || pendingAlertCards.length > 0);

  const getPendingAlertAudio = useCallback(() => {
    if (typeof window === 'undefined') return null;

    if (!pendingAlertAudioRef.current) {
      const audio = new Audio(ORDER_PROCESSING_ALERT_SOUND_SRC);
      audio.preload = 'auto';
      audio.volume = 1;
      pendingAlertAudioRef.current = audio;
    }

    return pendingAlertAudioRef.current;
  }, []);

  const playPendingAlertTone = useCallback(async () => {
    const audio = getPendingAlertAudio();
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;

    try {
      await audio.play();
    } catch (error) {
      // Some environments fail on mp3 playback, so fallback to wav.
      if (!audio.src.endsWith(ORDER_PROCESSING_ALERT_SOUND_FALLBACK_SRC)) {
        audio.src = ORDER_PROCESSING_ALERT_SOUND_FALLBACK_SRC;
        audio.load();
        audio.currentTime = 0;
        await audio.play();
        return;
      }

      throw error;
    }
  }, [getPendingAlertAudio]);

  const loadPendingOrderProcessingSummary = useCallback(async () => {
    if (!storecode) {
      setPendingSummary({
        pendingCount: 0,
        oldestPendingAt: '',
        recentPayments: [],
      });
      setPendingAlertError(null);
      setPendingAlertLastCheckedAt('');
      return;
    }

    try {
      const response = await fetch('/api/payment/getWalletUsdtPendingOrderProcessingSummaryByStorecode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode,
          limit: 4,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '결제처리 미완료 건수를 조회하지 못했습니다.'));
      }

      const result = isRecord((payload as Record<string, unknown>)?.result)
        ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
        : {};

      const rawPayments = Array.isArray(result.recentPayments) ? result.recentPayments : [];
      setPendingSummary({
        pendingCount: Number(result.pendingCount || 0),
        oldestPendingAt: String(result.oldestPendingAt || ''),
        recentPayments: rawPayments.map((item) => {
          const source = isRecord(item) ? item : {};
          return {
            id: String(source.id || ''),
            tradeId: String(source.tradeId || ''),
            storecode: String(source.storecode || ''),
            storeName: String(source.storeName || ''),
            storeLogo: String(source.storeLogo || ''),
            memberNickname: String(source.memberNickname || ''),
            usdtAmount: Number(source.usdtAmount || 0),
            krwAmount: Number(source.krwAmount || 0),
            createdAt: String(source.createdAt || ''),
            confirmedAt: String(source.confirmedAt || ''),
            orderProcessing: String(source.orderProcessing || ''),
            orderProcessingUpdatedAt: String(source.orderProcessingUpdatedAt || ''),
          };
        }),
      });
      setPendingAlertError(null);
      setPendingAlertLastCheckedAt(new Date().toISOString());
    } catch (error) {
      setPendingAlertError(error instanceof Error ? error.message : '미완료 결제처리 현황 조회 중 오류가 발생했습니다.');
    }
  }, [storecode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = window.localStorage.getItem(ORDER_PROCESSING_ALERT_SOUND_ENABLED_KEY);
      setPendingAlertSoundEnabled(saved === null ? true : saved === 'true');
    } catch (error) {
      console.warn('failed to load pending alert sound option', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = window.localStorage.getItem(ORDER_PROCESSING_ALERT_EXPANDED_KEY);
      setPendingAlertExpanded(saved === null ? true : saved === 'true');
    } catch (error) {
      console.warn('failed to load pending alert expanded option', error);
    }
  }, []);

  useEffect(() => {
    if (!canAccessStorePages || !storecode) {
      setPendingSummary({
        pendingCount: 0,
        oldestPendingAt: '',
        recentPayments: [],
      });
      setPendingAlertError(null);
      setPendingAlertLastCheckedAt('');
      return;
    }

    let isActive = true;
    let loading = false;

    const run = async () => {
      if (loading || !isActive) return;
      loading = true;
      await loadPendingOrderProcessingSummary();
      loading = false;
    };

    run();
    const intervalId = window.setInterval(run, ORDER_PROCESSING_ALERT_POLLING_MS);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [canAccessStorePages, loadPendingOrderProcessingSummary, storecode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setPendingAlertCards((previousCards) => {
      const incomingPayments = pendingSummary.recentPayments;
      const incomingByKey = new Map<string, PendingOrderProcessingItem>();
      incomingPayments.forEach((payment) => {
        incomingByKey.set(resolvePendingCardKey(payment), payment);
      });

      const previousByKey = new Map(previousCards.map((card) => [card.cardKey, card]));
      const nextCards: PendingAlertCardItem[] = [];

      incomingPayments.forEach((payment) => {
        const cardKey = resolvePendingCardKey(payment);
        const previousCard = previousByKey.get(cardKey);

        if (previousCard) {
          nextCards.push({
            ...previousCard,
            ...payment,
            cardKey,
            cardState: previousCard.cardState === 'exiting' ? 'stable' : previousCard.cardState,
          });
          return;
        }

        nextCards.push({
          ...payment,
          cardKey,
          cardState: 'entering',
        });

        const settleTimerId = window.setTimeout(() => {
          setPendingAlertCards((cards) =>
            cards.map((card) =>
              card.cardKey === cardKey && card.cardState === 'entering'
                ? { ...card, cardState: 'stable' }
                : card,
            ),
          );
        }, ORDER_PROCESSING_CARD_ENTER_MS);
        pendingCardTimerIdsRef.current.push(settleTimerId);
      });

      previousCards.forEach((card) => {
        if (incomingByKey.has(card.cardKey)) return;

        if (card.cardState === 'exiting') {
          nextCards.push(card);
          return;
        }

        nextCards.push({
          ...card,
          cardState: 'exiting',
        });

        const removeTimerId = window.setTimeout(() => {
          setPendingAlertCards((cards) => cards.filter((entry) => entry.cardKey !== card.cardKey));
        }, ORDER_PROCESSING_CARD_EXIT_MS);
        pendingCardTimerIdsRef.current.push(removeTimerId);
      });

      return nextCards;
    });
  }, [pendingSummary.recentPayments]);

  useEffect(() => {
    if (!canAccessStorePages || !storecode) {
      previousPendingCountRef.current = 0;
      return;
    }

    const pendingCount = Number(pendingSummary.pendingCount || 0);
    const previousCount = previousPendingCountRef.current;
    const countIncreased = pendingCount > previousCount;

    if (pendingAlertSoundEnabled && pendingCount > 0) {
      const now = Date.now();
      const shouldPlayByInterval = now - lastAlertSoundAtRef.current > ORDER_PROCESSING_ALERT_SOUND_INTERVAL_MS;
      if (countIncreased || shouldPlayByInterval) {
        void playPendingAlertTone().catch(() => undefined);
        lastAlertSoundAtRef.current = now;
      }
    }

    previousPendingCountRef.current = pendingCount;
  }, [canAccessStorePages, pendingAlertSoundEnabled, pendingSummary.pendingCount, playPendingAlertTone, storecode]);

  useEffect(() => {
    const audio = getPendingAlertAudio();
    audio?.load();

    const unlockAudio = () => {
      if (pendingAlertAudioUnlockedRef.current) return;

      const pendingCount = Number(pendingSummary.pendingCount || 0);
      if (!pendingAlertSoundEnabled || pendingCount <= 0) return;

      pendingAlertAudioUnlockedRef.current = true;
      void playPendingAlertTone()
        .then(() => {
          lastAlertSoundAtRef.current = Date.now();
        })
        .catch(() => {
          pendingAlertAudioUnlockedRef.current = false;
        });
    };

    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [getPendingAlertAudio, pendingAlertSoundEnabled, pendingSummary.pendingCount, playPendingAlertTone]);

  useEffect(() => {
    return () => {
      if (!pendingAlertAudioRef.current) return;
      pendingAlertAudioRef.current.pause();
      pendingAlertAudioRef.current.currentTime = 0;
      pendingAlertAudioRef.current = null;
      pendingAlertAudioUnlockedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      pendingCardTimerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId));
      pendingCardTimerIdsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!canAccessStorePages || !storecode || typeof document === 'undefined') {
      return;
    }

    const originalTitle = document.title;
    const pendingCount = Number(pendingSummary.pendingCount || 0);
    if (pendingCount > 0) {
      document.title = `[미처리 ${pendingCount}건] ${originalTitle}`;
    }

    return () => {
      document.title = originalTitle;
    };
  }, [canAccessStorePages, pendingSummary.pendingCount, storecode]);

  const togglePendingAlertSound = async () => {
    const nextValue = !pendingAlertSoundEnabled;
    setPendingAlertSoundEnabled(nextValue);

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(ORDER_PROCESSING_ALERT_SOUND_ENABLED_KEY, String(nextValue));
      } catch (error) {
        console.warn('failed to store pending alert sound option', error);
      }
    }

    if (nextValue && Number(pendingSummary.pendingCount || 0) > 0) {
      try {
        await playPendingAlertTone();
        lastAlertSoundAtRef.current = Date.now();
      } catch (error) {
        console.warn('failed to play pending alert tone', error);
      }
    }
  };

  const togglePendingAlertExpanded = () => {
    setPendingAlertExpanded((prev) => {
      const next = !prev;

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(ORDER_PROCESSING_ALERT_EXPANDED_KEY, String(next));
        } catch (error) {
          console.warn('failed to store pending alert expanded option', error);
        }
      }

      return next;
    });
  };

  const openDisconnectModal = () => {
    if (!hasConnectedWallet || disconnecting) {
      return;
    }
    setDisconnectModalOpen(true);
  };

  const closeDisconnectModal = () => {
    if (disconnecting) {
      return;
    }
    setDisconnectModalOpen(false);
  };

  const handleDisconnectWallet = async () => {
    if (!hasConnectedWallet || disconnecting) {
      return;
    }

    setDisconnecting(true);
    try {
      for (const walletItem of connectedWallets) {
        try {
          await disconnect(walletItem);
        } catch (error) {
          console.warn('disconnect(connectedWallet) failed', error);
        }
      }

      if (activeWallet) {
        await disconnect(activeWallet);
      }
    } catch (error) {
      console.warn('disconnect() failed, fallback to wallet.disconnect()', error);
      try {
        await activeWallet?.disconnect?.();
      } catch (fallbackError) {
        console.warn('activeWallet.disconnect() failed', fallbackError);
      }
    } finally {
      clearWalletConnectionState();
      window.dispatchEvent(new Event('orangex-wallet-disconnected'));
      window.location.replace(window.location.pathname + window.location.search);
    }
  };

  const menuItems = useMemo<MenuItem[]>(
    () => [
      {
        key: 'home',
        label: '홈 대시보드',
        compactLabel: '홈',
        description: '가맹점 핵심 현황',
        basePath: `/${lang}/p2p/store-management`,
      },
      {
        key: 'member',
        label: '회원관리',
        compactLabel: '회원',
        description: '회원 등록/조회',
        basePath: `/${lang}/p2p/store-management/member-management`,
      },
      {
        key: 'payment',
        label: '결제관리',
        compactLabel: '결제',
        description: '결제 내역/상태',
        basePath: `/${lang}/p2p/store-management/payment-management`,
      },
      {
        key: 'stats',
        label: '결제통계',
        compactLabel: '통계',
        description: '결제 지표 분석',
        basePath: `/${lang}/p2p/store-management/stats-management`,
      },
    ],
    [lang],
  );

  const desktopSidebarWidthClass = collapsed ? 'lg:pl-[98px]' : 'lg:pl-[292px]';
  const desktopSidebarClass = collapsed ? 'lg:w-[98px]' : 'lg:w-[292px]';

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#edf4ff_45%,#f8fafc_100%)] text-slate-900">
      <AutoConnect client={client} wallets={[wallet]} />

      <button
        type="button"
        onClick={() => setMobileOpen((prev) => !prev)}
        className="fixed left-3 top-3 z-[70] inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white/95 px-3 text-xs font-semibold text-slate-700 shadow-[0_16px_28px_-18px_rgba(15,23,42,0.55)] backdrop-blur transition hover:border-cyan-300 hover:text-slate-900 lg:hidden"
      >
        {mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
      </button>

      {mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-[58] bg-slate-950/55 backdrop-blur-[1px] lg:hidden"
          aria-label="메뉴 닫기"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-[60] overflow-hidden border-r border-cyan-200/20 bg-[linear-gradient(170deg,#0b1224_0%,#0f1d3b_42%,#111a2f_100%)] shadow-[0_32px_90px_-36px_rgba(2,6,23,0.95)] transition-all duration-300 ${desktopSidebarClass} ${
          mobileOpen ? 'w-[260px] translate-x-0' : 'w-[260px] -translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="absolute -right-16 top-40 h-44 w-44 rounded-full bg-indigo-300/10 blur-3xl" />
          <div className="absolute bottom-0 left-6 h-36 w-36 rounded-full bg-sky-300/10 blur-3xl" />
        </div>

        <div className="flex h-full flex-col">
          <div className="relative border-b border-white/10 px-3 py-4">
            <div className="rounded-2xl border border-white/12 bg-white/5 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/90">Payment Control</p>
              {!collapsed && (
                <>
                  <p className="mt-1 text-base font-semibold text-white/95">Store Management</p>
                  <p className="mt-1 text-[11px] text-slate-300">운영 대시보드 패널</p>
                </>
              )}
            </div>
          </div>

          <div className="relative px-2 pt-3">
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-200/35 bg-white/10 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/55 hover:bg-white/15 hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                <path
                  d={collapsed ? 'M8 5.5 14.5 12 8 18.5' : 'M16 5.5 9.5 12 16 18.5'}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {collapsed ? '열기' : '접기'}
            </button>
          </div>

          <nav className="relative mt-4 flex-1 space-y-1.5 px-2">
            {menuItems.map((item) => {
              const active =
                item.key === 'home'
                  ? pathname === item.basePath
                  : pathname === item.basePath || pathname.startsWith(`${item.basePath}/`);
              const href = `${item.basePath}${storeQuery}`;

              return (
                <Link
                  key={item.key}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                  className={`group flex min-h-11 items-center rounded-xl px-3 text-sm transition ${
                    active
                      ? 'bg-[linear-gradient(135deg,#67e8f9_0%,#38bdf8_55%,#0ea5e9_100%)] text-slate-900 shadow-[0_16px_32px_-18px_rgba(14,165,233,0.9)]'
                      : 'text-slate-200 hover:bg-white/12 hover:text-white'
                  } ${collapsed ? 'justify-center' : 'justify-start gap-2.5'}`}
                >
                  <MenuIcon itemKey={item.key} active={active} />
                  {collapsed ? (
                    <span className={`truncate text-[11px] font-semibold ${active ? 'text-slate-900' : 'text-slate-100'}`}>
                      {item.compactLabel}
                    </span>
                  ) : (
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${active ? 'text-slate-900' : 'text-slate-100'}`}>
                        {item.label}
                      </p>
                      <p className={`truncate text-[11px] ${active ? 'text-slate-800/80' : 'text-slate-400'}`}>
                        {item.description}
                      </p>
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="relative border-t border-white/10 px-3 py-3">
            {collapsed ? (
              <div className="flex items-center justify-center">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-200/50 bg-cyan-300/20 text-[10px] font-semibold text-cyan-100">
                  SC
                </span>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/90">Store Scope</p>
                <p className="mt-1 truncate text-xs font-semibold text-white/90">
                  {storecode ? `storecode: ${storecode}` : 'storecode 파라미터 없음'}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className={`min-h-screen transition-all duration-300 ${desktopSidebarWidthClass}`}>
        {showPinnedPendingAlert && (
          <div className={`pointer-events-none fixed inset-x-0 top-12 z-[120] px-3 lg:top-3 ${desktopSidebarWidthClass}`}>
            <div className="mx-auto max-w-6xl">
              <section className="pointer-events-auto rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700">Payment Processing Alert</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900 sm:text-[15px]">
                      결제처리 미완료 {formatNumber(pendingSummary.pendingCount)}건
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      oldest {toTimeAgoLabel(pendingSummary.oldestPendingAt)} · checked {toDateTimeLabel(pendingAlertLastCheckedAt)}
                    </p>
                    {pendingAlertError && <p className="mt-0.5 text-[11px] text-rose-700">조회 오류: {pendingAlertError}</p>}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={togglePendingAlertExpanded}
                      className="inline-flex h-7 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                    >
                      {pendingAlertExpanded ? '접기' : '펼치기'}
                    </button>
                    <button
                      type="button"
                      onClick={togglePendingAlertSound}
                      className={`inline-flex h-7 items-center justify-center rounded-lg border px-2 text-[10px] font-semibold transition ${
                        pendingAlertSoundEnabled
                          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {pendingAlertSoundEnabled ? '알림음 끄기' : '알림음 켜기'}
                    </button>
                    <Link
                      href={paymentManagementHref}
                      className="inline-flex h-7 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                    >
                      결제관리로 이동
                    </Link>
                  </div>
                </div>

                {pendingAlertExpanded && pendingAlertCards.length > 0 && (
                  <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                    {pendingAlertCards.map((payment) => {
                      const motionClass =
                        payment.cardState === 'exiting'
                          ? 'opacity-0 -translate-y-1 scale-[0.98]'
                          : 'opacity-100 translate-y-0 scale-100';

                      return (
                        <article
                          key={payment.cardKey}
                          className={`min-w-[160px] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 transition-all duration-500 ease-out ${motionClass} ${
                            payment.cardState === 'entering' ? 'pending-order-flash' : ''
                          }`}
                        >
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white text-[10px] font-bold text-slate-600">
                              {payment.storeLogo ? (
                                <span
                                  className="h-full w-full bg-cover bg-center"
                                  style={{ backgroundImage: `url(${encodeURI(payment.storeLogo)})` }}
                                  aria-label={payment.storeName || payment.storecode || 'store logo'}
                                />
                              ) : (
                                (payment.storeName || payment.storecode || 'S').slice(0, 1)
                              )}
                            </span>
                            <p className="truncate text-[11px] font-semibold text-slate-700">
                              {payment.storeName || payment.storecode || '-'}
                            </p>
                          </div>

                          <div className="flex items-end justify-between gap-2">
                            <p className="truncate text-[13px] font-extrabold leading-tight text-slate-900">
                              {payment.memberNickname || '-'}
                            </p>
                            <p className="shrink-0 text-[12px] font-extrabold leading-tight text-rose-700">
                              {toTimeAgoLabel(payment.confirmedAt || payment.createdAt)}
                            </p>
                          </div>

                          <div className="mt-1 flex justify-end gap-1">
                            <div className="w-[72px] rounded-md border border-slate-200 bg-white px-1.5 py-1">
                              <p className="text-[9px] font-semibold uppercase tracking-[0.02em] text-slate-500">USDT</p>
                              <p className="text-right text-[12px] font-extrabold leading-tight text-slate-900">
                                {formatUsdtAmount(payment.usdtAmount)}
                              </p>
                            </div>
                            <div className="w-[72px] rounded-md border border-slate-200 bg-white px-1.5 py-1">
                              <p className="text-[9px] font-semibold uppercase tracking-[0.02em] text-slate-500">KRW</p>
                              <p className="text-right text-[12px] font-extrabold leading-tight text-slate-900">
                                {formatNumber(payment.krwAmount)}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        <div className={`px-4 pb-10 lg:px-8 ${showPinnedPendingAlert ? (pendingAlertExpanded ? 'pt-44 lg:pt-32' : 'pt-28 lg:pt-20') : 'pt-16 lg:pt-8'}`}>
          {hasConnectedWallet && (
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={openDisconnectModal}
                disabled={disconnecting}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M10 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M15 12H4" strokeLinecap="round" />
                  <path d="m8 8-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {disconnecting ? '지갑 해제 중...' : '지갑 연결 해제'}
              </button>
            </div>
          )}

          {showWalletConnectRequired ? (
            <section className="rounded-2xl border border-cyan-200 bg-cyan-50/70 px-4 py-4 shadow-[0_16px_32px_-24px_rgba(8,145,178,0.45)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">Wallet Required</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">가맹점 관리 기능을 사용하려면 지갑 연결이 필요합니다.</p>
                  <p className="mt-1 text-xs text-slate-600">지갑 연결 후 다시 접근 권한을 확인합니다.</p>
                </div>
                <ConnectButton
                  client={client}
                  wallets={wallets}
                  connectButton={{
                    label: '지갑 연결하기',
                    className:
                      'p2p-store-connect-btn inline-flex h-10 items-center justify-center rounded-xl border border-cyan-300 !bg-white px-4 text-sm font-semibold !text-cyan-800 transition hover:border-cyan-400 hover:!text-cyan-900 focus-visible:!text-cyan-900 active:!text-cyan-900',
                    style: {
                      color: '#155e75',
                      WebkitTextFillColor: '#155e75',
                    },
                  }}
                />
              </div>
            </section>
          ) : showStoreAccessChecking ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
              가맹점 관리자 권한을 확인하는 중입니다...
            </div>
          ) : showStoreAccessDenied ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Access Blocked</p>
              <h2 className="mt-2 text-xl font-bold text-rose-800">가맹점 관리 페이지 접근이 차단되었습니다.</h2>
              <p className="mt-2 text-sm text-rose-700">
                현재 연결된 지갑이 해당 가맹점의 관리자 지갑(`store.adminWalletAddress`)과 일치하지 않습니다.
              </p>

              <div className="mt-4 rounded-2xl border border-rose-200 bg-white px-4 py-4 shadow-[0_14px_28px_-20px_rgba(190,24,93,0.4)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">Store Info</p>
                <div className="mt-2 flex items-center gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-rose-100 bg-slate-100">
                    {storeLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={encodeURI(storeLogo)}
                        alt={storeName || storecode || 'store logo'}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-bold tracking-[0.08em] text-slate-600">
                        STORE
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-2xl font-extrabold text-slate-900">{storeName || '가맹점 이름 없음'}</p>
                    <p className="mt-1 text-sm font-semibold text-rose-700">코드: {storecode}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2 rounded-xl border border-rose-200 bg-white px-3 py-3 text-xs text-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">가맹점 코드</span>
                  <span className="font-semibold text-slate-900">{storecode}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">내 지갑</span>
                  <span className="font-semibold text-slate-900">{shortAddress(connectedWalletAddress)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">관리자 지갑</span>
                  <span className="font-semibold text-slate-900">{shortAddress(storeAdminWalletAddress)}</span>
                </div>
                {storeAccessError && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                    권한 확인 오류: {storeAccessError}
                  </p>
                )}
              </div>
            </section>
          ) : (
            children
          )}
        </div>
      </div>

      {disconnectModalOpen && (
        <div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-[2px] sm:items-center"
          role="presentation"
          onClick={closeDisconnectModal}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.98)_0%,rgba(254,242,242,0.96)_100%)] p-5 shadow-[0_40px_80px_-44px_rgba(15,23,42,0.85)]"
            role="dialog"
            aria-modal="true"
            aria-label="지갑 연결 해제 확인"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 8v5m0 3h.01" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3l-8.47-14.14a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <h3 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">
              지갑 연결을 해제할까요?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              지갑 연결이 해제되며 웹에 저장된 연결 정보와 캐시도 함께 삭제됩니다.
              계속 진행하려면 다시 로그인해야 합니다.
            </p>

            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-3">
              <p className="text-[12px] font-semibold text-rose-700">
                연결 해제 후 현재 페이지가 새로고침됩니다.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeDisconnectModal}
                disabled={disconnecting}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDisconnectWallet}
                disabled={disconnecting}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-rose-600 text-sm font-semibold text-white shadow-[0_16px_30px_-20px_rgba(225,29,72,0.9)] transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {disconnecting ? '해제 중...' : '연결 해제'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`
        .p2p-store-connect-btn.tw-connect-wallet,
        .p2p-store-connect-btn.tw-connect-wallet *,
        button[data-test='connect-wallet-button'].p2p-store-connect-btn {
          background-color: #ffffff !important;
          color: #155e75 !important;
          -webkit-text-fill-color: #155e75 !important;
          opacity: 1 !important;
        }

        .p2p-store-connect-btn.tw-connect-wallet:hover,
        .p2p-store-connect-btn.tw-connect-wallet:hover *,
        .p2p-store-connect-btn.tw-connect-wallet:focus-visible,
        .p2p-store-connect-btn.tw-connect-wallet:focus-visible *,
        .p2p-store-connect-btn.tw-connect-wallet:active,
        .p2p-store-connect-btn.tw-connect-wallet:active *,
        button[data-test='connect-wallet-button'].p2p-store-connect-btn:hover {
          color: #164e63 !important;
          -webkit-text-fill-color: #164e63 !important;
          opacity: 1 !important;
        }

        @keyframes pendingOrderFlash {
          0%,
          100% {
            background-color: rgb(248 250 252);
            box-shadow: 0 0 0 0 rgba(225, 29, 72, 0);
          }
          30% {
            background-color: rgb(255 241 242);
            box-shadow: 0 0 0 1px rgba(225, 29, 72, 0.35);
          }
          60% {
            background-color: rgb(248 250 252);
            box-shadow: 0 0 0 0 rgba(225, 29, 72, 0);
          }
        }

        .pending-order-flash {
          animation: pendingOrderFlash 0.85s ease-in-out 2;
        }
      `}</style>
    </div>
  );
}
