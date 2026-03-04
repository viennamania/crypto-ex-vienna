'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider';
import GroupChannel from '@sendbird/uikit-react/GroupChannel';
import { toast } from 'react-hot-toast';
import { useActiveAccount } from 'thirdweb/react';
import { ConnectButton } from '@/components/WalletConnectButton';
import { client } from '@/app/client';

const SENDBIRD_APP_ID =
  process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID || process.env.NEXT_PUBLIC_SENDBIRD_APP_ID || '';
const POLLING_INTERVAL_MS = 5000;
const UNREAD_POLLING_INTERVAL_MS = 4000;
const parsedMaxOpenChatPanels = Number(process.env.NEXT_PUBLIC_SELLER_MULTI_CHAT_MAX_OPEN ?? '20');
const MAX_OPEN_CHAT_PANELS = Number.isFinite(parsedMaxOpenChatPanels)
  ? Math.max(1, Math.min(100, Math.floor(parsedMaxOpenChatPanels)))
  : 20;
const CHAT_LAYOUT_STORAGE_VERSION = 1;

const ACTIVE_ORDER_STATUSES = new Set(['ordered', 'accepted', 'paymentRequested']);
const COMPLETED_ORDER_STATUSES = new Set(['paymentConfirmed']);
const TODAY_ORDER_STATUSES = Array.from(new Set([...ACTIVE_ORDER_STATUSES, ...COMPLETED_ORDER_STATUSES]));

type BuyerConsentSnapshot = {
  accepted: boolean;
  acceptedAt: string;
  requestedAt: string;
  channelUrl: string;
};

type SellerTodayOrder = {
  id: string;
  tradeId: string;
  status: string;
  createdAt: string;
  paymentConfirmedAt: string;
  buyerNickname: string;
  buyerDepositName: string;
  buyerWalletAddress: string;
  krwAmount: number;
  usdtAmount: number;
  rate: number;
  buyerConsent: BuyerConsentSnapshot;
};

type OpenChatPanel = {
  channelUrl: string;
  tradeId: string;
  buyerLabel: string;
  status: string;
  consentAccepted: boolean;
};

type PersistedChatLayout = {
  version: number;
  channelUrls: string[];
};

type SendbirdUserChannelItem = {
  channelUrl?: string;
  unreadMessageCount?: number;
};

type PageProps = {
  params: {
    lang: string;
    sellerWalletAddress: string;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const toNumber = (value: unknown): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const resolveObjectId = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value.$oid === 'string') return value.$oid;
  return '';
};

const formatDateTime = (value: string): string => {
  const normalized = toText(value);
  if (!normalized) return '-';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

const formatKrw = (value: number): string =>
  `${Math.round(toNumber(value)).toLocaleString('ko-KR')}원`;

const formatUsdt = (value: number): string =>
  `${toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  })} USDT`;

const truncateWalletAddress = (value: string): string => {
  const normalized = toText(value);
  if (!normalized) return '-';
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 8)}...${normalized.slice(-6)}`;
};

const getTodayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    dateLabel: `${year}-${month}-${day}`,
  };
};

const getOrderBuyerLabel = (order: SellerTodayOrder): string =>
  toText(order.buyerDepositName)
  || toText(order.buyerNickname)
  || truncateWalletAddress(order.buyerWalletAddress);

const getOrderStatusLabel = (status: string): string => {
  if (ACTIVE_ORDER_STATUSES.has(status)) return '진행중';
  if (COMPLETED_ORDER_STATUSES.has(status)) return '완료';
  return status || '-';
};

const getChatLayoutStorageKey = (sellerWalletAddress: string): string =>
  `seller-escrow:today-orders-chat-layout:${sellerWalletAddress.toLowerCase()}`;

const dedupeChannelUrls = (channelUrls: string[]): string[] => {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const channelUrl of channelUrls) {
    const normalized = toText(channelUrl);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
    if (next.length >= MAX_OPEN_CHAT_PANELS) break;
  }
  return next;
};

const normalizeOrder = (source: unknown): SellerTodayOrder => {
  const order = isRecord(source) ? source : {};
  const buyer = isRecord(order.buyer) ? order.buyer : {};
  const buyerBankInfo = isRecord(buyer.bankInfo) ? buyer.bankInfo : {};
  const consent = isRecord(order.buyerConsent) ? order.buyerConsent : {};
  const consentStatus = toText(consent.status).toLowerCase();

  const id = resolveObjectId(order._id);
  const tradeId = toText(order.tradeId);
  const status = toText(order.status);
  const createdAt = toText(order.createdAt);
  const paymentConfirmedAt = toText(order.paymentConfirmedAt);

  const buyerNickname = toText(order.nickname) || toText(buyer.nickname);
  const buyerDepositName =
    toText(buyer.depositName)
    || toText(buyerBankInfo.depositName)
    || toText(buyerBankInfo.accountHolder);
  const buyerWalletAddress =
    toText(buyer.walletAddress)
    || toText(order.walletAddress);

  const buyerConsent: BuyerConsentSnapshot = {
    accepted: consent.accepted === true || consentStatus === 'accepted',
    acceptedAt: toText(consent.acceptedAt),
    requestedAt: toText(consent.requestedAt) || toText(consent.requestMessageSentAt),
    channelUrl: toText(consent.channelUrl),
  };

  return {
    id,
    tradeId,
    status,
    createdAt,
    paymentConfirmedAt,
    buyerNickname,
    buyerDepositName,
    buyerWalletAddress,
    krwAmount: toNumber(order.krwAmount),
    usdtAmount: toNumber(order.usdtAmount),
    rate: toNumber(order.rate),
    buyerConsent,
  };
};

const parseOrdersFromPayload = (payload: unknown): SellerTodayOrder[] => {
  if (!isRecord(payload)) return [];
  const result = isRecord(payload.result) ? payload.result : {};
  const items = Array.isArray(result.orders) ? result.orders : [];
  return items
    .map((item) => normalizeOrder(item))
    .filter((order) => ACTIVE_ORDER_STATUSES.has(order.status) || COMPLETED_ORDER_STATUSES.has(order.status))
    .sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (Number.isNaN(timeA) || Number.isNaN(timeB)) return 0;
      return timeB - timeA;
    });
};

const parseOwnerWalletAddressFromPayload = (payload: unknown): string => {
  if (!isRecord(payload)) return '';
  const result = isRecord(payload.result) ? payload.result : {};
  return toText(result.ownerWalletAddress);
};

export default function SellerTodayOrdersChatPage({ params }: PageProps) {
  const activeAccount = useActiveAccount();
  const sellerWalletAddress = toText(params.sellerWalletAddress);
  const lang = toText(params.lang) || 'ko';
  const connectedWalletAddress = toText(activeAccount?.address);
  const [resolvedOwnerWalletAddress, setResolvedOwnerWalletAddress] = useState('');
  const ownerWalletAddress = useMemo(
    () => resolvedOwnerWalletAddress || sellerWalletAddress,
    [resolvedOwnerWalletAddress, sellerWalletAddress],
  );
  const isOwnerWallet =
    Boolean(connectedWalletAddress)
    && Boolean(ownerWalletAddress)
    && connectedWalletAddress.toLowerCase() === ownerWalletAddress.toLowerCase();

  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<SellerTodayOrder[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [hasLoadedOrders, setHasLoadedOrders] = useState(false);
  const requestInFlightRef = useRef(false);

  const [openChats, setOpenChats] = useState<OpenChatPanel[]>([]);
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({});
  const [chatSessionToken, setChatSessionToken] = useState<string | null>(null);
  const [chatSessionLoading, setChatSessionLoading] = useState(false);
  const [chatSessionError, setChatSessionError] = useState<string | null>(null);
  const chatLayoutHydratedRef = useRef(false);
  const chatUnreadInitializedRef = useRef(false);
  const chatUnreadByChannelRef = useRef<Record<string, number>>({});
  const chatNotificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const [chatNotificationAudioUnlocked, setChatNotificationAudioUnlocked] = useState(false);
  const [chatNotificationAudioUnlockNeeded, setChatNotificationAudioUnlockNeeded] = useState(false);

  const chatLayoutStorageKey = useMemo(
    () => getChatLayoutStorageKey(sellerWalletAddress || 'unknown'),
    [sellerWalletAddress],
  );

  const activeOrders = useMemo(
    () => orders.filter((order) => ACTIVE_ORDER_STATUSES.has(order.status)),
    [orders],
  );
  const completedOrders = useMemo(
    () => orders.filter((order) => COMPLETED_ORDER_STATUSES.has(order.status)),
    [orders],
  );

  const totalKrwAmount = useMemo(
    () => orders.reduce((sum, item) => sum + item.krwAmount, 0),
    [orders],
  );
  const totalUsdtAmount = useMemo(
    () => orders.reduce((sum, item) => sum + item.usdtAmount, 0),
    [orders],
  );
  const totalUnreadCount = useMemo(
    () => Object.values(unreadByChannel).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0),
    [unreadByChannel],
  );

  const playChatNotificationSound = useCallback(async () => {
    const audio = chatNotificationAudioRef.current;
    if (!audio) return;
    try {
      audio.loop = false;
      audio.muted = false;
      audio.volume = 1;
      if (!audio.paused) {
        audio.pause();
      }
      audio.currentTime = 0;
      await audio.play();
      setChatNotificationAudioUnlockNeeded(false);
    } catch (error) {
      setChatNotificationAudioUnlockNeeded(true);
      console.warn('today-orders-chat notification audio play blocked', error);
    }
  }, []);

  const unlockChatNotificationAudio = useCallback(async () => {
    const audio = chatNotificationAudioRef.current;
    if (!audio) {
      setChatNotificationAudioUnlocked(true);
      setChatNotificationAudioUnlockNeeded(false);
      return;
    }
    const previousMuted = audio.muted;
    const previousVolume = audio.volume;
    try {
      audio.loop = false;
      audio.muted = true;
      audio.volume = 0;
      audio.currentTime = 0;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = previousMuted;
      audio.volume = previousVolume;
      setChatNotificationAudioUnlocked(true);
      setChatNotificationAudioUnlockNeeded(false);
      toast.success('채팅 알림 소리를 활성화했습니다.');
    } catch (error) {
      console.warn('today-orders-chat notification audio unlock failed', error);
      audio.pause();
      audio.currentTime = 0;
      audio.muted = previousMuted;
      audio.volume = previousVolume;
      setChatNotificationAudioUnlocked(false);
      setChatNotificationAudioUnlockNeeded(true);
      toast.error('브라우저 정책으로 알림 소리 활성화에 실패했습니다.');
    }
  }, []);

  const fetchOrders = useCallback(async (mode: 'manual' | 'polling' = 'manual') => {
    if (!sellerWalletAddress) {
      setOrders([]);
      setResolvedOwnerWalletAddress('');
      setError('판매자 지갑 주소가 없습니다.');
      return;
    }
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    if (mode === 'manual') {
      setLoading(true);
      setError(null);
    } else {
      setPolling(true);
    }

    try {
      const { startIso, endIso } = getTodayRange();
      const response = await fetch('/api/order/getAllBuyOrdersBySellerEscrowWallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 300,
          page: 1,
          walletAddress: sellerWalletAddress,
          requesterWalletAddress: connectedWalletAddress,
          startDate: startIso,
          endDate: endIso,
          status: TODAY_ORDER_STATUSES,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          toText(payload.error)
          || toText(payload.message)
          || '오늘 주문 목록을 불러오지 못했습니다.',
        );
      }
      setResolvedOwnerWalletAddress(parseOwnerWalletAddressFromPayload(payload) || sellerWalletAddress);
      setOrders(parseOrdersFromPayload(payload));
      setLastUpdatedAt(new Date().toISOString());
      setHasLoadedOrders(true);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : '오늘 주문 목록을 불러오지 못했습니다.';
      if (mode === 'manual') {
        setError(message);
      } else {
        console.error('seller today orders polling failed', fetchError);
      }
    } finally {
      requestInFlightRef.current = false;
      if (mode === 'manual') {
        setLoading(false);
      } else {
        setPolling(false);
      }
    }
  }, [connectedWalletAddress, sellerWalletAddress]);

  useEffect(() => {
    setResolvedOwnerWalletAddress('');
  }, [sellerWalletAddress]);

  useEffect(() => {
    void fetchOrders('manual');
    const intervalId = window.setInterval(() => {
      void fetchOrders('polling');
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchOrders]);

  const refreshUnreadCounts = useCallback(async (mode: 'manual' | 'polling' = 'manual') => {
    if (!SENDBIRD_APP_ID || !isOwnerWallet || !connectedWalletAddress) {
      setUnreadByChannel({});
      chatUnreadInitializedRef.current = false;
      chatUnreadByChannelRef.current = {};
      return;
    }
    try {
      const response = await fetch('/api/sendbird/user-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: connectedWalletAddress,
          limit: 100,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          toText(payload.error)
          || toText(payload.message)
          || '채팅 미읽음 정보를 불러오지 못했습니다.',
        );
      }

      const items = Array.isArray(payload.items) ? (payload.items as SendbirdUserChannelItem[]) : [];
      const nextUnreadByChannel: Record<string, number> = {};
      for (const item of items) {
        const channelUrl = toText(item.channelUrl);
        if (!channelUrl) continue;
        nextUnreadByChannel[channelUrl] = Math.max(0, Number(item.unreadMessageCount || 0));
      }
      setUnreadByChannel(nextUnreadByChannel);
    } catch (error) {
      if (mode === 'manual') {
        console.error('failed to load unread channels', error);
      }
    }
  }, [connectedWalletAddress, isOwnerWallet]);

  useEffect(() => {
    void refreshUnreadCounts('manual');
    const intervalId = window.setInterval(() => {
      void refreshUnreadCounts('polling');
    }, UNREAD_POLLING_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshUnreadCounts]);

  useEffect(() => {
    const audio = new Audio('/notification-chat.mp3');
    audio.preload = 'auto';
    chatNotificationAudioRef.current = audio;
    return () => {
      if (!chatNotificationAudioRef.current) return;
      chatNotificationAudioRef.current.pause();
      chatNotificationAudioRef.current.currentTime = 0;
      chatNotificationAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isOwnerWallet) {
      chatUnreadInitializedRef.current = false;
      chatUnreadByChannelRef.current = {};
      return;
    }
    const previousUnreadByChannel = chatUnreadByChannelRef.current;
    const nextUnreadByChannel = unreadByChannel;
    if (!chatUnreadInitializedRef.current) {
      chatUnreadByChannelRef.current = nextUnreadByChannel;
      chatUnreadInitializedRef.current = true;
      return;
    }
    const hasNewUnreadMessage = Object.entries(nextUnreadByChannel).some(([channelUrl, unreadCount]) => {
      const prevUnreadCount = Math.max(0, Number(previousUnreadByChannel[channelUrl] || 0));
      return Number(unreadCount || 0) > prevUnreadCount;
    });
    if (hasNewUnreadMessage && (chatNotificationAudioUnlocked || !chatNotificationAudioUnlockNeeded)) {
      void playChatNotificationSound();
    }
    chatUnreadByChannelRef.current = nextUnreadByChannel;
  }, [
    chatNotificationAudioUnlockNeeded,
    chatNotificationAudioUnlocked,
    isOwnerWallet,
    playChatNotificationSound,
    unreadByChannel,
  ]);

  useEffect(() => {
    if (!chatLayoutStorageKey || typeof window === 'undefined') return;
    let restoredChannels: string[] = [];
    try {
      const raw = window.localStorage.getItem(chatLayoutStorageKey);
      if (!raw) {
        chatLayoutHydratedRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as PersistedChatLayout | null;
      if (!parsed || parsed.version !== CHAT_LAYOUT_STORAGE_VERSION || !Array.isArray(parsed.channelUrls)) {
        chatLayoutHydratedRef.current = true;
        return;
      }
      restoredChannels = dedupeChannelUrls(parsed.channelUrls.map((item) => toText(item)));
    } catch {
      restoredChannels = [];
    }

    if (restoredChannels.length > 0) {
      setOpenChats(
        restoredChannels.map((channelUrl) => ({
          channelUrl,
          tradeId: '',
          buyerLabel: '-',
          status: '',
          consentAccepted: false,
        })),
      );
    }

    chatLayoutHydratedRef.current = true;
  }, [chatLayoutStorageKey]);

  useEffect(() => {
    if (!chatLayoutStorageKey || typeof window === 'undefined') return;
    if (!chatLayoutHydratedRef.current) return;
    const payload: PersistedChatLayout = {
      version: CHAT_LAYOUT_STORAGE_VERSION,
      channelUrls: dedupeChannelUrls(openChats.map((item) => item.channelUrl)),
    };
    if (payload.channelUrls.length <= 0) {
      window.localStorage.removeItem(chatLayoutStorageKey);
      return;
    }
    window.localStorage.setItem(chatLayoutStorageKey, JSON.stringify(payload));
  }, [chatLayoutStorageKey, openChats]);

  useEffect(() => {
    const orderByChannel = new Map<string, SellerTodayOrder>();
    orders.forEach((order) => {
      const channelUrl = toText(order.buyerConsent.channelUrl);
      if (channelUrl) {
        orderByChannel.set(channelUrl, order);
      }
    });

    setOpenChats((previous) => {
      const next = previous
      .filter((panel) => !hasLoadedOrders || orderByChannel.has(panel.channelUrl))
      .map((panel) => {
        const latestOrder = orderByChannel.get(panel.channelUrl);
        if (!latestOrder) return panel;
        return {
          ...panel,
          tradeId: latestOrder.tradeId || panel.tradeId,
          buyerLabel: getOrderBuyerLabel(latestOrder),
          status: latestOrder.status,
          consentAccepted: latestOrder.buyerConsent.accepted,
        };
      });
      return next.slice(0, MAX_OPEN_CHAT_PANELS);
    });
  }, [hasLoadedOrders, orders]);

  useEffect(() => {
    if (!SENDBIRD_APP_ID) {
      setChatSessionToken(null);
      setChatSessionError('채팅 설정이 비어 있습니다. NEXT_PUBLIC_SENDBIRD_APP_ID 값을 확인해 주세요.');
      return;
    }
    if (!isOwnerWallet || !connectedWalletAddress) {
      setChatSessionToken(null);
      setChatSessionError('판매자 본인 지갑을 연결하면 채팅을 사용할 수 있습니다.');
      return;
    }

    let cancelled = false;
    const issueSessionToken = async () => {
      setChatSessionLoading(true);
      setChatSessionError(null);
      try {
        const response = await fetch('/api/sendbird/session-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: connectedWalletAddress,
            nickname: `seller_${connectedWalletAddress.slice(2, 8)}`,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok || !toText(payload.sessionToken)) {
          throw new Error(
            toText(payload.error)
            || toText(payload.message)
            || '채팅 세션 토큰 발급에 실패했습니다.',
          );
        }
        if (!cancelled) {
          setChatSessionToken(toText(payload.sessionToken));
        }
      } catch (sessionError) {
        if (!cancelled) {
          setChatSessionToken(null);
          setChatSessionError(
            sessionError instanceof Error ? sessionError.message : '채팅 세션 발급에 실패했습니다.',
          );
        }
      } finally {
        if (!cancelled) {
          setChatSessionLoading(false);
        }
      }
    };

    void issueSessionToken();

    return () => {
      cancelled = true;
    };
  }, [connectedWalletAddress, isOwnerWallet]);

  const openChatPanel = useCallback((order: SellerTodayOrder) => {
    const channelUrl = toText(order.buyerConsent.channelUrl);
    if (!channelUrl) {
      toast.error('해당 주문의 채팅 채널 정보가 없습니다.');
      return;
    }

    let blockedByLimit = false;
    setOpenChats((previous) => {
      if (previous.some((item) => item.channelUrl === channelUrl)) {
        return previous;
      }
      if (previous.length >= MAX_OPEN_CHAT_PANELS) {
        blockedByLimit = true;
        return previous;
      }
      return [
        ...previous,
        {
          channelUrl,
          tradeId: order.tradeId,
          buyerLabel: getOrderBuyerLabel(order),
          status: order.status,
          consentAccepted: order.buyerConsent.accepted,
        },
      ];
    });

    if (blockedByLimit) {
      toast.error(`동시에 최대 ${MAX_OPEN_CHAT_PANELS}개 채팅만 열 수 있습니다.`);
    }
  }, []);

  const closeChatPanel = useCallback((channelUrl: string) => {
    setOpenChats((previous) => previous.filter((item) => item.channelUrl !== channelUrl));
  }, []);

  const resetChatLayout = useCallback(() => {
    setOpenChats([]);
    if (chatLayoutStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(chatLayoutStorageKey);
    }
    toast.success('채팅 레이아웃을 초기화했습니다.');
  }, [chatLayoutStorageKey]);

  const openTopActiveChats = useCallback(() => {
    let blockedByLimit = false;
    let addedCount = 0;

    setOpenChats((previous) => {
      const next = [...previous];
      for (const order of activeOrders) {
        const channelUrl = toText(order.buyerConsent.channelUrl);
        if (!channelUrl) continue;
        if (next.some((item) => item.channelUrl === channelUrl)) continue;
        if (next.length >= MAX_OPEN_CHAT_PANELS) {
          blockedByLimit = true;
          break;
        }
        next.push({
          channelUrl,
          tradeId: order.tradeId,
          buyerLabel: getOrderBuyerLabel(order),
          status: order.status,
          consentAccepted: order.buyerConsent.accepted,
        });
        addedCount += 1;
      }
      return next;
    });

    if (addedCount <= 0) {
      toast('열 수 있는 진행중 주문 채팅이 없습니다.');
      return;
    }
    if (blockedByLimit) {
      toast(`최대 ${MAX_OPEN_CHAT_PANELS}개까지만 열렸습니다.`);
    }
  }, [activeOrders]);

  const renderOrderCard = (order: SellerTodayOrder) => {
    const isActive = ACTIVE_ORDER_STATUSES.has(order.status);
    const channelUrl = toText(order.buyerConsent.channelUrl);
    const unreadCount = channelUrl ? Math.max(0, Number(unreadByChannel[channelUrl] || 0)) : 0;

    return (
      <article
        key={`${order.id}-${order.tradeId}-${order.createdAt}`}
        className={`rounded-xl border px-3 py-3 ${
          isActive ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-extrabold text-slate-900">
              TID #{order.tradeId || '-'}
            </p>
            <p className="text-[11px] text-slate-500">
              주문시각 {formatDateTime(order.createdAt)}
            </p>
          </div>
          <span
            className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
              isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {getOrderStatusLabel(order.status)}
          </span>
        </div>

        <div className="mt-2 space-y-0.5 text-sm text-slate-700">
          <p>
            구매자 {getOrderBuyerLabel(order)}
          </p>
          <p className="text-xs text-slate-500">
            지갑 {truncateWalletAddress(order.buyerWalletAddress)}
          </p>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
          <p className="text-sm font-bold text-amber-700">{formatKrw(order.krwAmount)}</p>
          <p className="text-xs text-slate-600">{formatUsdt(order.usdtAmount)}</p>
          <p className="text-xs text-slate-500">환율 {Math.round(order.rate || 0).toLocaleString('ko-KR')} 원/USDT</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {order.buyerConsent.accepted ? (
            <div className="inline-flex rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-semibold text-cyan-700">
              이용동의 완료 · {formatDateTime(order.buyerConsent.acceptedAt)}
            </div>
          ) : (
            <div className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
              이용동의 대기 · {formatDateTime(order.buyerConsent.requestedAt)}
            </div>
          )}

          <div className="flex items-center gap-2">
            {channelUrl && unreadCount > 0 && (
              <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-700">
                미읽음 {unreadCount.toLocaleString()}
              </span>
            )}
            <button
              type="button"
              onClick={() => openChatPanel(order)}
              disabled={!channelUrl}
              className="inline-flex items-center justify-center rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              채팅 열기
            </button>
          </div>
        </div>
      </article>
    );
  };

  const { dateLabel } = getTodayRange();

  return (
    <div className="min-h-dvh bg-slate-100">
      <div className="mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-5 lg:px-7">
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 p-4 text-white shadow-[0_24px_60px_-40px_rgba(2,132,199,0.95)] sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">
                Seller Escrow Multi Chat
              </p>
              <h1 className="text-lg font-black sm:text-2xl">
                오늘 주문 + 주문별 채팅 통합 화면
              </h1>
              <p className="text-xs text-cyan-100 sm:text-sm">
                {dateLabel} 기준 진행중/완료 주문을 한 번에 보고, 여러 주문 채팅을 동시에 대응합니다.
              </p>
              <p className="text-xs text-cyan-100">
                판매자 지갑 {truncateWalletAddress(ownerWalletAddress || sellerWalletAddress)}
              </p>
              {ownerWalletAddress && ownerWalletAddress.toLowerCase() !== sellerWalletAddress.toLowerCase() && (
                <p className="text-xs text-cyan-100">
                  페이지 주소 지갑 {truncateWalletAddress(sellerWalletAddress)}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {chatNotificationAudioUnlockNeeded && (
                <button
                  type="button"
                  onClick={() => {
                    void unlockChatNotificationAudio();
                  }}
                  className="inline-flex items-center justify-center rounded-lg border border-fuchsia-300/80 bg-fuchsia-400/20 px-3 py-1.5 text-xs font-semibold text-fuchsia-100 transition hover:bg-fuchsia-400/30"
                >
                  채팅 알림 소리 켜기
                </button>
              )}
              <Link
                href={`/${lang}/seller-escrow/${sellerWalletAddress}`}
                className="inline-flex items-center justify-center rounded-lg border border-cyan-300/60 bg-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-50 transition hover:bg-white/20"
              >
                기존 페이지로 이동
              </Link>
              <button
                type="button"
                onClick={resetChatLayout}
                className="inline-flex items-center justify-center rounded-lg border border-amber-300/80 bg-amber-400/20 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/30"
              >
                채팅 레이아웃 초기화
              </button>
              <button
                type="button"
                onClick={() => void fetchOrders('manual')}
                disabled={loading || polling}
                className="inline-flex items-center justify-center rounded-lg border border-emerald-300/80 bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading || polling ? '갱신중...' : '새로고침'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
              <p className="text-[11px] text-cyan-100">진행중 주문</p>
              <p className="text-lg font-extrabold text-white">{activeOrders.length.toLocaleString()}건</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
              <p className="text-[11px] text-cyan-100">완료 주문</p>
              <p className="text-lg font-extrabold text-white">{completedOrders.length.toLocaleString()}건</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
              <p className="text-[11px] text-cyan-100">오늘 거래량</p>
              <p className="text-base font-bold text-white">{formatUsdt(totalUsdtAmount)}</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
              <p className="text-[11px] text-cyan-100">열린 채팅 패널</p>
              <p className="text-lg font-extrabold text-white">
                {openChats.length}/{MAX_OPEN_CHAT_PANELS}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-cyan-100">
            <p>총 결제금액 {formatKrw(totalKrwAmount)}</p>
            <p>마지막 갱신 {formatDateTime(lastUpdatedAt)}</p>
            <p>미읽음 {totalUnreadCount.toLocaleString()}건</p>
            {polling && <p>실시간 갱신중...</p>}
          </div>
        </section>

        {error && (
          <section className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </section>
        )}

        <div className="mt-4 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Today Orders</p>
                <h2 className="text-base font-extrabold text-slate-900">구매주문 목록</h2>
              </div>
              <button
                type="button"
                onClick={openTopActiveChats}
                className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                진행중 채팅 열기
              </button>
            </div>

            <div className="mt-3 space-y-3 overflow-y-auto pr-1 xl:max-h-[calc(100dvh-260px)]">
              {loading ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  오늘 주문을 불러오는 중입니다...
                </div>
              ) : activeOrders.length + completedOrders.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  오늘 생성된 진행중/완료 주문이 없습니다.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-emerald-700">진행중 ({activeOrders.length})</p>
                    {activeOrders.length > 0 ? (
                      activeOrders.map((order) => renderOrderCard(order))
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                        진행중 주문이 없습니다.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-bold text-slate-700">완료 ({completedOrders.length})</p>
                    {completedOrders.length > 0 ? (
                      completedOrders.map((order) => renderOrderCard(order))
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                        완료 주문이 없습니다.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Multi Chat Panels</p>
                <h2 className="text-base font-extrabold text-slate-900">주문별 채팅 동시 처리</h2>
              </div>
              <p className="text-xs text-slate-600">
                최대 {MAX_OPEN_CHAT_PANELS}개 동시 오픈
              </p>
            </div>

            {openChats.length <= 0 ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                좌측 주문 목록에서 `채팅 열기`를 누르면 주문별 채팅 패널이 열립니다.
              </div>
            ) : !SENDBIRD_APP_ID ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm font-semibold text-rose-700">
                채팅 설정이 비어 있습니다. `NEXT_PUBLIC_SENDBIRD_APP_ID` 값을 확인해 주세요.
              </div>
            ) : !isOwnerWallet ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">
                <p>
                  판매자 본인 지갑({truncateWalletAddress(ownerWalletAddress || sellerWalletAddress)})을 연결하면 주문 채팅 입력이 가능합니다.
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  현재 연결 지갑: {connectedWalletAddress ? truncateWalletAddress(connectedWalletAddress) : '미연결'}
                </p>
                {ownerWalletAddress && ownerWalletAddress.toLowerCase() !== sellerWalletAddress.toLowerCase() && (
                  <p className="mt-1 text-xs text-amber-700">
                    페이지 주소 지갑: {truncateWalletAddress(sellerWalletAddress)}
                  </p>
                )}
                <div className="mt-3">
                  <ConnectButton
                    client={client}
                    connectButton={{
                      label: connectedWalletAddress ? '지갑 다시 연결' : '판매자 지갑 연결',
                      className:
                        'inline-flex h-10 items-center justify-center rounded-lg border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-700 transition hover:bg-amber-100',
                    }}
                  />
                </div>
              </div>
            ) : chatSessionError ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm font-semibold text-rose-700">
                {chatSessionError}
              </div>
            ) : chatSessionLoading || !chatSessionToken ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                채팅 세션을 준비 중입니다...
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 2xl:grid-cols-2">
                {openChats.map((chat) => (
                  <article key={chat.channelUrl} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">TID #{chat.tradeId || '-'}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          구매자 {chat.buyerLabel} · {getOrderStatusLabel(chat.status)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          이용동의 {chat.consentAccepted ? '완료' : '미완료'}
                        </p>
                        {Math.max(0, Number(unreadByChannel[chat.channelUrl] || 0)) > 0 && (
                          <p className="text-[11px] font-semibold text-rose-600">
                            미읽음 {Math.max(0, Number(unreadByChannel[chat.channelUrl] || 0)).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => closeChatPanel(chat.channelUrl)}
                        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                      >
                        닫기
                      </button>
                    </div>

                    <div className="h-[420px] overflow-hidden">
                      <SendbirdProvider
                        appId={SENDBIRD_APP_ID}
                        userId={connectedWalletAddress}
                        accessToken={chatSessionToken}
                        theme="light"
                      >
                        <GroupChannel channelUrl={chat.channelUrl} />
                      </SendbirdProvider>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
