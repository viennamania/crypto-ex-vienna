'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { getContract } from 'thirdweb';
import { balanceOf } from 'thirdweb/extensions/erc20';
import { arbitrum, bsc, ethereum, polygon } from 'thirdweb/chains';
import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider';
import GroupChannel from '@sendbird/uikit-react/GroupChannel';


import { useClientWallets } from '@/lib/useClientWallets';
import { client } from '@/app/client';
import {
  chain,
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from '@/app/config/contractAddresses';

import { ConnectButton } from '@/components/OrangeXConnectButton';

const NEXT_PUBLIC_SENDBIRD_APP_ID = process.env.NEXT_PUBLIC_SENDBIRD_APP_ID || '';
const USER_STORECODE = 'admin';
const TRADE_STATUS_POLL_INTERVAL_MS = 5000;

const formatNumber = (value: number | undefined, digits = 2) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
};

const formatNumberFixed = (value: number | undefined, digits = 3) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const formatUpdatedTime = (value?: string | null) => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatCountdown = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const seconds = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const maskAccountNumber = (accountNumber?: string) => {
  if (!accountNumber) {
    return '-';
  }
  const digits = accountNumber.replace(/\s+/g, '');
  if (digits.length <= 4) {
    return digits.replace(/./g, '*');
  }
  const visible = digits.slice(-4);
  const masked = '*'.repeat(Math.max(0, digits.length - 4));
  return `${masked}${visible}`;
};

const maskWalletAddress = (addr?: string) => {
  if (!addr || addr.length < 10) return '-';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const maskName = (name?: string) => {
  if (!name) return '-';
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(1, name.length - 1))}`;
};

const LINKABLE_TOKEN_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const URL_ONLY_REGEX = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i;
const EMAIL_ONLY_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

const splitTrailingPunctuation = (value: string) => {
  const match = value.match(/([),.;!?]+)$/);
  if (!match) {
    return { core: value, trailing: '' };
  }
  return {
    core: value.slice(0, -match[1].length),
    trailing: match[1],
  };
};

const renderTextWithAutoLinks = (text?: string | null, linkClassName?: string) => {
  if (!text) {
    return null;
  }

  const lines = text.split(/\r?\n/);

  return lines.map((line, lineIndex) => {
    const tokens = line.split(LINKABLE_TOKEN_REGEX);

    return (
      <span key={`line-${lineIndex}`}>
        {tokens.map((token, tokenIndex) => {
          const { core, trailing } = splitTrailingPunctuation(token);
          const isUrl = URL_ONLY_REGEX.test(core);
          const isEmail = EMAIL_ONLY_REGEX.test(core);

          if (!isUrl && !isEmail) {
            return <span key={`text-${lineIndex}-${tokenIndex}`}>{token}</span>;
          }

          const href = isEmail
            ? `mailto:${core}`
            : (/^https?:\/\//i.test(core) ? core : `https://${core}`);

          return (
            <span key={`link-${lineIndex}-${tokenIndex}`}>
              <a
                href={href}
                {...(!isEmail ? { target: '_blank', rel: 'noreferrer' } : {})}
                className={
                  linkClassName ||
                  'font-semibold underline decoration-emerald-500/70 underline-offset-2 break-all hover:text-emerald-800'
                }
              >
                {core}
              </a>
              {trailing}
            </span>
          );
        })}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    );
  });
};

type PrivateTradeOrder = {
  orderId: string;
  tradeId: string;
  status: string;
  createdAt: string;
  acceptedAt: string;
  paymentRequestedAt: string;
  paymentConfirmedAt: string;
  cancelledAt: string;
  krwAmount: number;
  usdtAmount: number;
  buyerWalletAddress: string;
  sellerWalletAddress: string;
};

export default function SellerChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ lang?: string }>();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';

  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const address =
    activeAccount?.address ?? activeWallet?.getAccount?.()?.address ?? '';
  const isLoggedIn = Boolean(address);
  const { wallets } = useClientWallets();

  const sellerId = searchParams?.get('sellerId') || '';
  const sellerName = searchParams?.get('sellerName') || sellerId || '판매자';

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [channelUrl, setChannelUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [buyerNickname, setBuyerNickname] = useState('');
  const [buyerAvatar, setBuyerAvatar] = useState('');
  const [tradeStatusLoading, setTradeStatusLoading] = useState(false);
  const [paymentCountdownNow, setPaymentCountdownNow] = useState(() => Date.now());
  const [currentTradeOrder, setCurrentTradeOrder] = useState<PrivateTradeOrder | null>(null);
  const connectingRef = useRef(false);
  const [sellerProfile, setSellerProfile] = useState<any | null>(null);
  const [sellerEscrow, setSellerEscrow] = useState<number | null>(null);
  const [sellerUsdtRate, setSellerUsdtRate] = useState<number | null>(null);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerError, setSellerError] = useState<string | null>(null);
  const [buyKrwInput, setBuyKrwInput] = useState('');
  const [buyUsdtInput, setBuyUsdtInput] = useState('');
  const [buying, setBuying] = useState(false);
  const [cancelingBuyOrder, setCancelingBuyOrder] = useState(false);
  const [showCancelWarningModal, setShowCancelWarningModal] = useState(false);
  const [buyStatus, setBuyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [buyStatusMessage, setBuyStatusMessage] = useState('');
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState<string | null>(null);
  const promoSentRef = useRef(new Set<string>());
  const [showHistory, setShowHistory] = useState(false);
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyContainerRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);
  const sendbirdSdkInitParams = useMemo(() => ({ localCacheEnabled: false }), []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const displaySellerName = sellerProfile?.nickname || sellerName;
  const isMarketPrice = sellerProfile?.seller?.priceSettingMethod === 'market';
  const marketId = sellerProfile?.seller?.market || 'upbit';
  const marketIdForPrice = isMarketPrice ? marketId : 'upbit';
  const marketLabelMap: Record<string, string> = {
    upbit: '업비트',
    bithumb: '빗썸',
    korbit: '코빗',
  };
  const chainObject =
    chain === 'polygon'
      ? polygon
      : chain === 'arbitrum'
      ? arbitrum
      : chain === 'bsc'
      ? bsc
      : ethereum;
  const usdtContractAddress =
    chain === 'polygon'
      ? polygonContractAddressUSDT
      : chain === 'arbitrum'
      ? arbitrumContractAddressUSDT
      : chain === 'bsc'
      ? bscContractAddressUSDT
      : ethereumContractAddressUSDT;
  const marketIconMap: Record<string, string> = {
    upbit: '/icon-market-upbit.png',
    bithumb: '/icon-market-bithumb.png',
    korbit: '/icon-market-korbit.png',
  };
  const marketLabel = marketLabelMap[marketId] || '업비트';
  const marketLabelForPrice = marketLabelMap[marketIdForPrice] || '업비트';
  const marketIconForPrice = marketIconMap[marketIdForPrice] || '/icon-market-upbit.png';
  const priceTypeLabel =
    sellerProfile?.seller?.priceSettingMethod === 'market'
      ? `시장가(${marketLabel})`
      : '고정가';
  const currentTradeStatus = currentTradeOrder?.status || '';
  const currentBuyOrderId = currentTradeOrder?.orderId || '';

  const fetchEscrowBalanceOnChain = useCallback(
    async (wallet: string) => {
      if (!wallet) return null;
      try {
        const contract = getContract({
          client,
          chain: chainObject,
          address: usdtContractAddress,
        });
        const balance = await balanceOf({ contract, address: wallet });
        // assume USDT 6 decimals on all target chains
        const normalized = Number(balance) / 10 ** 6;
        return normalized;
      } catch (e) {
        console.error('fetchEscrowBalanceOnChain error', e);
        return null;
      }
    },
    [chainObject, usdtContractAddress],
  );
  const statusLabelMap: Record<string, string> = {
    accepted: '주문 수락됨',
    paymentRequested: '입금 요청됨',
    paymentConfirmed: '입금 확인됨',
    completed: '거래 완료',
    cancelled: '취소됨',
    ordered: '주문 완료',
  };
  const statusColorMap: Record<string, string> = {
    accepted: 'bg-amber-500 shadow-[0_0_0_6px_rgba(245,158,11,0.15)]',
    paymentRequested: 'bg-blue-500 shadow-[0_0_0_6px_rgba(59,130,246,0.15)]',
    paymentConfirmed: 'bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]',
    completed: 'bg-emerald-600 shadow-[0_0_0_6px_rgba(5,150,105,0.16)]',
    cancelled: 'bg-rose-500 shadow-[0_0_0_6px_rgba(244,63,94,0.15)]',
    ordered: 'bg-slate-500 shadow-[0_0_0_6px_rgba(100,116,139,0.15)]',
  };
  const tradeStatusLabel =
    (currentTradeStatus && statusLabelMap[currentTradeStatus]) || '거래가능 상태';
  const tradeStatusDotClass =
    (currentTradeStatus && statusColorMap[currentTradeStatus]) || 'bg-slate-300';
  const tradeStatusTimestamp =
    currentTradeOrder?.paymentRequestedAt ||
    currentTradeOrder?.acceptedAt ||
    currentTradeOrder?.createdAt ||
    '';
  const isPaymentRequested = currentTradeStatus === 'paymentRequested';
  const isTradeInProgress = ['ordered', 'accepted', 'paymentRequested']
    .includes(currentTradeStatus);
  const isTradeStatusResolving = tradeStatusLoading;
  const currentTradeDisplayOrderNo = currentTradeOrder?.tradeId || currentTradeOrder?.orderId || '';
  const canCancelCurrentBuyOrder =
    isPaymentRequested && Boolean(currentBuyOrderId);
  const isContactTransfer = sellerProfile?.seller?.bankInfo?.bankName === '연락처송금';
  const contactTransferMemo = String(sellerProfile?.seller?.bankInfo?.contactMemo || '').trim();
  const maxUsdtByEscrow =
    typeof sellerEscrow === 'number' && Number.isFinite(sellerEscrow) && sellerEscrow > 0
      ? Math.floor(sellerEscrow * 1000) / 1000
      : null;
  const PAYMENT_COUNTDOWN_MINUTES = 30;
  const PAYMENT_COUNTDOWN_SECONDS = PAYMENT_COUNTDOWN_MINUTES * 60;

  const paymentRequestedStartMs = useMemo(() => {
    const value = currentTradeOrder?.paymentRequestedAt;
    if (!value) {
      return null;
    }
    const parsed = new Date(value).getTime();
    if (Number.isNaN(parsed)) {
      return null;
    }
    return parsed;
  }, [currentTradeOrder?.paymentRequestedAt]);
  const paymentDeadlineMs = paymentRequestedStartMs
    ? paymentRequestedStartMs + (PAYMENT_COUNTDOWN_SECONDS * 1000)
    : null;
  const paymentCountdownSeconds = paymentDeadlineMs
    ? Math.max(0, Math.ceil((paymentDeadlineMs - paymentCountdownNow) / 1000))
    : null;
  const paymentCountdownText =
    paymentCountdownSeconds === null ? '--:--' : formatCountdown(paymentCountdownSeconds);
  const paymentCountdownRatio =
    paymentCountdownSeconds === null
      ? 0
      : Math.max(0, Math.min(1, paymentCountdownSeconds / PAYMENT_COUNTDOWN_SECONDS));
  const isPaymentCountdownUrgent = paymentCountdownSeconds !== null && paymentCountdownSeconds <= 60;
  const isPaymentCountdownExpired = paymentCountdownSeconds === 0;

  const goBuy = async () => {
    if (!isLoggedIn) {
      setBuyStatus('error');
      setBuyStatusMessage('웹3 지갑을 먼저 연결해주세요.');
      return;
    }
    if (!sellerId) {
      setBuyStatus('error');
      setBuyStatusMessage('판매자 정보를 찾을 수 없습니다.');
      return;
    }
    if (!effectiveRate) {
      setBuyStatus('error');
      setBuyStatusMessage('가격 정보를 불러오지 못했습니다.');
      return;
    }

    const krwRaw = Number((buyKrwInput || '0').replace(/,/g, '')) || 0;
    const usdtRaw = Number(buyUsdtInput || '0') || 0;

    const derivedUsdt =
      usdtRaw > 0
        ? Math.floor(usdtRaw * 1000) / 1000
        : krwRaw > 0
          ? Math.floor((krwRaw / effectiveRate) * 1000) / 1000
          : 0;
    const derivedKrw =
      krwRaw > 0
        ? krwRaw
        : derivedUsdt > 0
          ? Math.round(derivedUsdt * effectiveRate)
          : 0;

    if (!derivedUsdt || derivedUsdt <= 0 || !derivedKrw || derivedKrw <= 0) {
      setBuyStatus('error');
      setBuyStatusMessage('구매할 금액이나 수량을 입력해주세요.');
      return;
    }

    if (derivedUsdt > 100000) {
      setBuyStatus('error');
      setBuyStatusMessage('구매 수량은 100,000 USDT 이하로 입력해주세요.');
      return;
    }

    if (maxUsdtByEscrow !== null && derivedUsdt > maxUsdtByEscrow) {
      setBuyStatus('error');
      setBuyStatusMessage(
        `구매 수량은 판매자 에스크로 수량(${formatNumber(maxUsdtByEscrow, 3)} USDT)을 초과할 수 없습니다.`,
      );
      return;
    }

    setBuying(true);
    setBuyStatus('loading');
    setBuyStatusMessage('구매 주문을 생성하는 중입니다...');

    try {
      const response = await fetch('/api/order/buyOrderPrivateSale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerWalletAddress: address,
          sellerWalletAddress: sellerId,
          usdtAmount: derivedUsdt,
          krwAmount: derivedKrw,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.result) {
        throw new Error(
          data?.message
          || data?.detail
          || data?.reason
          || data?.error
          || '구매 주문 생성에 실패했습니다.',
        );
      }

      const apiOrder =
        data?.order && typeof data.order === 'object'
          ? (data.order as PrivateTradeOrder)
          : null;
      if (!apiOrder?.status) {
        throw new Error('구매 주문 상태를 확인하지 못했습니다. 다시 시도해 주세요.');
      }
      setCurrentTradeOrder(apiOrder);
      setPaymentCountdownNow(Date.now());

      const isNewOrderCreated = data?.created !== false;
      setBuyStatus('success');
      setBuyStatusMessage(
        isNewOrderCreated
          ? '구매 주문이 생성되었습니다.'
          : '이미 거래중인 주문이 있어 새 주문을 생성하지 않았습니다.',
      );
      if (isNewOrderCreated) {
        setBuyUsdtInput('');
        setBuyKrwInput('');
      }
      fetchSellerProfile();
      fetchBuyerSellerTradeStatus({ showLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : '구매 주문 생성에 실패했습니다.';
      setBuyStatus('error');
      setBuyStatusMessage(message);
    } finally {
      setBuying(false);
    }
  };

  const cancelMyBuyOrder = async () => {
    if (!isLoggedIn || !address) {
      setBuyStatus('error');
      setBuyStatusMessage('웹3 지갑을 먼저 연결해주세요.');
      return;
    }

    if (!sellerId || !currentBuyOrderId || !canCancelCurrentBuyOrder) {
      setShowCancelWarningModal(false);
      setBuyStatus('error');
      setBuyStatusMessage('취소 가능한 구매 주문을 찾을 수 없습니다.');
      return;
    }

    setCancelingBuyOrder(true);
    setBuyStatus('loading');
    setBuyStatusMessage('구매 주문을 취소하는 중입니다...');

    try {
      let cancelledByIpAddress = '';
      try {
        const response = await fetch('/api/server/getServerInfo', {
          method: 'GET',
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
          cancelledByIpAddress = String((payload as { ipAddress?: string })?.ipAddress || '').trim();
        }
      } catch (serverIpError) {
        console.error('Failed to fetch server side ip address', serverIpError);
      }

      if (!cancelledByIpAddress) {
        try {
          const ipifyResponse = await fetch('https://api64.ipify.org?format=json', {
            method: 'GET',
            cache: 'no-store',
          });
          const ipifyPayload = await ipifyResponse.json().catch(() => ({}));
          if (ipifyResponse.ok) {
            cancelledByIpAddress = String((ipifyPayload as { ip?: string })?.ip || '').trim();
          }
        } catch (ipifyError) {
          console.error('Failed to fetch client public ip address', ipifyError);
        }
      }

      const cancelledByUserAgent =
        typeof window !== 'undefined' ? String(window.navigator.userAgent || '').trim() : '';

      const response = await fetch('/api/order/cancelPrivateBuyOrderByBuyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentBuyOrderId,
          buyerWalletAddress: address,
          sellerWalletAddress: sellerId,
          cancelledByIpAddress,
          cancelledByUserAgent,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.result) {
        throw new Error(data?.error || '구매 주문 취소에 실패했습니다.');
      }

      const nowIso = new Date().toISOString();
      setCurrentTradeOrder((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: 'cancelled',
          cancelledAt: nowIso,
        };
      });
      setBuyStatus('idle');
      setBuyStatusMessage('');
      setShowCancelWarningModal(false);
      fetchSellerProfile({ showLoading: false });
      fetchBuyerSellerTradeStatus({ showLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : '구매 주문 취소에 실패했습니다.';
      setBuyStatus('error');
      setBuyStatusMessage(message);
      setShowCancelWarningModal(false);
    } finally {
      setCancelingBuyOrder(false);
    }
  };

  const openCancelBuyOrderModal = () => {
    if (!isLoggedIn || !address) {
      setBuyStatus('error');
      setBuyStatusMessage('웹3 지갑을 먼저 연결해주세요.');
      return;
    }
    if (!sellerId || !currentBuyOrderId || !canCancelCurrentBuyOrder) {
      setBuyStatus('error');
      setBuyStatusMessage('취소 가능한 구매 주문을 찾을 수 없습니다.');
      return;
    }
    setShowCancelWarningModal(true);
  };

  const effectiveRate =
    typeof sellerUsdtRate === 'number'
      ? sellerUsdtRate
      : typeof marketPrice === 'number'
        ? marketPrice
        : null;

  const handleKrwChange = (value: string) => {
    const onlyDigits = value.replace(/[^0-9]/g, '');
    if (!onlyDigits) {
      setBuyKrwInput('');
      setBuyUsdtInput('');
      return;
    }

    const numericKrw = Number(onlyDigits);
    if (!Number.isFinite(numericKrw) || numericKrw <= 0) {
      setBuyKrwInput('');
      setBuyUsdtInput('');
      return;
    }

    if (effectiveRate) {
      const maxKrwByEscrow =
        maxUsdtByEscrow !== null ? Math.floor(maxUsdtByEscrow * effectiveRate) : null;
      const clampedKrw =
        maxKrwByEscrow !== null ? Math.min(numericKrw, maxKrwByEscrow) : numericKrw;
      const usdt = clampedKrw / effectiveRate;

      setBuyKrwInput(clampedKrw > 0 ? clampedKrw.toString() : '');
      setBuyUsdtInput(usdt > 0 ? usdt.toFixed(3) : '');
    } else {
      setBuyKrwInput(onlyDigits);
      setBuyUsdtInput('');
    }
  };

  const handleUsdtChange = (value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, '');
    const dotIndex = sanitized.indexOf('.');
    const normalizedUsdtInput = dotIndex === -1
      ? sanitized
      : `${(sanitized.slice(0, dotIndex).replace(/\./g, '') || '0')}.${sanitized
          .slice(dotIndex + 1)
          .replace(/\./g, '')
          .slice(0, 3)}`;
    const numericUsdt = Number(normalizedUsdtInput || '0');

    if (
      maxUsdtByEscrow !== null &&
      Number.isFinite(numericUsdt) &&
      numericUsdt > maxUsdtByEscrow
    ) {
      const clampedUsdt = maxUsdtByEscrow;
      const clampedText = clampedUsdt.toFixed(3).replace(/\.?0+$/, '');
      setBuyUsdtInput(clampedText);
      if (effectiveRate) {
        const krw = clampedUsdt * effectiveRate;
        setBuyKrwInput(Number.isFinite(krw) && krw > 0 ? Math.round(krw).toString() : '');
      } else {
        setBuyKrwInput('');
      }
      return;
    }

    setBuyUsdtInput(normalizedUsdtInput);
    if (effectiveRate) {
      const krw = Number(normalizedUsdtInput || '0') * effectiveRate;
      setBuyKrwInput(Number.isFinite(krw) && krw > 0 ? Math.round(krw).toString() : '');
    } else {
      setBuyKrwInput('');
    }
  };

  useEffect(() => {
    if (!isLoggedIn) {
      setSessionToken(null);
      setChannelUrl(null);
      setErrorMessage(null);
      setLoading(false);
      setBuyerNickname('');
      setBuyerAvatar('');
      setCurrentTradeOrder(null);
      setTradeStatusLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isPaymentRequested || !paymentRequestedStartMs) {
      return;
    }
    setPaymentCountdownNow(Date.now());
    const intervalId = window.setInterval(() => {
      setPaymentCountdownNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPaymentRequested, paymentRequestedStartMs]);

  useEffect(() => {
    let active = true;

    const fetchUserProfile = async () => {
      if (!address) {
        return;
      }
      try {
        const response = await fetch('/api/user/getUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storecode: USER_STORECODE,
            walletAddress: address,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || '회원 정보를 불러오지 못했습니다.');
        }
        if (active) {
          setBuyerNickname(data?.result?.nickname || '');
          setBuyerAvatar(data?.result?.avatar || '');
        }
      } catch {
        if (active) {
          setBuyerNickname('');
          setBuyerAvatar('');
        }
      }
    };

    fetchUserProfile();

    return () => {
      active = false;
    };
  }, [address]);

  useEffect(() => {
    let active = true;

    const fetchMarketPrice = async () => {
      try {
        const response = await fetch('/api/markets/usdt-krw');
        const data = await response.json().catch(() => ({}));
        const items = Array.isArray(data?.items)
          ? (data.items as Array<{ id?: string; price?: number }>)
          : [];
        const market = items.find((item) => item?.id === marketIdForPrice);
        if (active) {
          setMarketPrice(typeof market?.price === 'number' ? market.price : null);
          setMarketUpdatedAt(typeof data?.updatedAt === 'string' ? data.updatedAt : null);
        }
      } catch {
        if (active) {
          setMarketPrice(null);
          setMarketUpdatedAt(null);
        }
      }
    };

    fetchMarketPrice();

    return () => {
      active = false;
    };
  }, [marketIdForPrice]);

  const fetchSellerProfile = useCallback(
    async (options?: { showLoading?: boolean }) => {
      if (!sellerId) {
        if (!isMountedRef.current) return;
        if (options?.showLoading) {
          setSellerLoading(false);
        }
        setSellerProfile(null);
        setSellerEscrow(null);
        setSellerError(null);
        return;
      }
      if (options?.showLoading) {
        setSellerLoading(true);
      }
      setSellerError(null);
      try {
        const response = await fetch('/api/user/getSellerSummary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storecode: USER_STORECODE,
            walletAddress: sellerId,
          }),
        });
        const data = await response.json().catch(() => ({}));


        //console.log('Seller summary response data:', data);

        if (!response.ok) {
          throw new Error(data?.error || '판매자 정보를 불러오지 못했습니다.');
        }
        
        // 이게 왜 필요하지????
        //if (!isMountedRef.current) return;



        setSellerProfile(data?.result?.user || null);
        setSellerEscrow(
          typeof data?.result?.currentUsdtBalance === 'number'
            ? data.result.currentUsdtBalance
            : null,
        );
        setSellerUsdtRate(
          typeof data?.result?.user?.seller?.usdtToKrwRate === 'number'
            ? data.result.user.seller.usdtToKrwRate
            : null,
        );
        setSellerError(null);
        setSellerLoading(false);
      } catch (error) {
        if (!isMountedRef.current) return;
        setSellerProfile(null);
        setSellerEscrow(null);
        setSellerUsdtRate(null);
        setSellerError(
          error instanceof Error ? error.message : '판매자 정보를 불러오지 못했습니다.',
        );
        setSellerLoading(false);
      } finally {
        if (isMountedRef.current) {
          setSellerLoading(false);
        }
      }
    },
    [sellerId],
  );

  useEffect(() => {
    fetchSellerProfile({ showLoading: true });
    const intervalId = window.setInterval(() => {
      fetchSellerProfile({ showLoading: false });
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchSellerProfile]);

  const fetchBuyerSellerTradeStatus = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const showLoading = options?.showLoading === true;
      if (!address || !sellerId) {
        if (showLoading) {
          setTradeStatusLoading(false);
        }
        setCurrentTradeOrder(null);
        return;
      }

      const loadingStartedAt = showLoading ? Date.now() : null;
      if (showLoading) {
        setTradeStatusLoading(true);
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, 6000);

      try {
        const response = await fetch('/api/order/getPrivateTradeStatus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            buyerWalletAddress: address,
            sellerWalletAddress: sellerId,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || '거래 상태를 불러오지 못했습니다.');
        }
        if (!isMountedRef.current) return;

        const nextOrder =
          data?.result?.order && typeof data.result.order === 'object'
            ? (data.result.order as PrivateTradeOrder)
            : null;
        setCurrentTradeOrder(nextOrder);
      } catch (error) {
        if (!isMountedRef.current) return;
        if (showLoading) {
          setCurrentTradeOrder(null);
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (showLoading) {
          const elapsed = Date.now() - (loadingStartedAt || Date.now());
          const minimumVisibleMs = 350;
          if (elapsed < minimumVisibleMs) {
            await new Promise((resolve) => window.setTimeout(resolve, minimumVisibleMs - elapsed));
          }
          if (isMountedRef.current) {
            setTradeStatusLoading(false);
          }
        }
      }
    },
    [address, sellerId],
  );

  useEffect(() => {
    fetchBuyerSellerTradeStatus({ showLoading: true });
    if (!address || !sellerId) {
      return;
    }
    const intervalId = window.setInterval(() => {
      fetchBuyerSellerTradeStatus({ showLoading: false });
    }, TRADE_STATUS_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [address, fetchBuyerSellerTradeStatus, sellerId]);

  useEffect(() => {
    if (!address || !sellerId) {
      return;
    }

    const syncTradeStatus = () => {
      fetchBuyerSellerTradeStatus({ showLoading: false });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncTradeStatus();
      }
    };

    window.addEventListener('focus', syncTradeStatus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', syncTradeStatus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [address, sellerId, fetchBuyerSellerTradeStatus]);

  // on-chain escrow balance polling
  useEffect(() => {
    if (!sellerId) return;
    let active = true;
    const poll = async () => {
      const wallet = sellerProfile?.seller?.escrowWalletAddress || sellerId;
      const onChain = await fetchEscrowBalanceOnChain(wallet);
      if (active && typeof onChain === 'number') {
        setSellerEscrow(onChain);
      }
    };
    poll();
    const interval = setInterval(poll, 12000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sellerId, sellerProfile?.seller?.escrowWalletAddress, fetchEscrowBalanceOnChain]);

  // 거래내역 로드
  const fetchHistory = async (nextPage = 1) => {
    if (historyLoading || !sellerId) return;
    const escrowWalletAddress = sellerProfile?.seller?.escrowWalletAddress || sellerId;
    if (!escrowWalletAddress) return;
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/order/getAllBuyOrdersBySellerEscrowWallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: escrowWalletAddress,
          requesterWalletAddress: address,
          limit: 10,
          page: nextPage,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.result?.orders) {
        throw new Error(data?.error || '거래내역을 불러오지 못했습니다.');
      }
      const newOrders = Array.isArray(data.result.orders) ? data.result.orders : [];
      setHistoryOrders((prev) => (nextPage === 1 ? newOrders : [...prev, ...newOrders]));
      const totalCount = data?.result?.totalCount ?? newOrders.length;
      const loadedCount = (nextPage - 1) * 10 + newOrders.length;
      setHistoryHasMore(loadedCount < totalCount);
      setHistoryPage(nextPage);
    } catch (error) {
      console.error('fetchHistory error', error);
      setHistoryHasMore(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  // 패널 열릴 때 초기 로드
  useEffect(() => {
    if (showHistory) {
      fetchHistory(1);
    } else {
      setHistoryOrders([]);
      setHistoryHasMore(true);
      setHistoryPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistory, sellerId]);

  // 무한 스크롤
  useEffect(() => {
    const el = historyContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!historyHasMore || historyLoading) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollTop + clientHeight >= scrollHeight - 120) {
        fetchHistory(historyPage + 1);
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [historyHasMore, historyLoading, historyPage]);

  useEffect(() => {
    let active = true;

    const syncSendbirdProfile = async () => {
      if (!address || !buyerNickname) {
        return;
      }
      try {
        await fetch('/api/sendbird/update-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: address,
            nickname: buyerNickname,
            ...(buyerAvatar ? { profileUrl: buyerAvatar } : {}),
          }),
        });
      } catch {
        // ignore sendbird sync errors here
      }
    };

    if (active) {
      syncSendbirdProfile();
    }

    return () => {
      active = false;
    };
  }, [address, buyerAvatar, buyerNickname]);

  useEffect(() => {
    let active = true;

    const sendPromotionMessage = async () => {
      const promotionText = sellerProfile?.seller?.promotionText?.trim?.() || '';
      if (!channelUrl || !sellerId || !promotionText) {
        return;
      }
      if (promoSentRef.current.has(channelUrl)) {
        return;
      }
      try {
        const response = await fetch('/api/sendbird/welcome-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelUrl,
            senderId: sellerId,
            message: promotionText,
          }),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => null);
          throw new Error(error?.error || '프로모션 메시지를 전송하지 못했습니다.');
        }
        if (active) {
          promoSentRef.current.add(channelUrl);
        }
      } catch (error) {
        if (active) {
          console.warn('Failed to send promotion message', error);
        }
      }
    };

    sendPromotionMessage();

    return () => {
      active = false;
    };
  }, [channelUrl, sellerId, sellerProfile?.seller?.promotionText]);

  useEffect(() => {
    let active = true;

    const connectChat = async () => {
      if (!isLoggedIn || !sellerId) {
        return;
      }
      if (!NEXT_PUBLIC_SENDBIRD_APP_ID) {
        setErrorMessage('채팅 앱 ID가 설정되지 않았습니다. NEXT_PUBLIC_SENDBIRD_APP_ID를 확인해주세요.');
        return;
      }
      if (sessionToken && channelUrl) {
        return;
      }
      if (connectingRef.current) {
        return;
      }
      if (!buyerNickname) {
        setLoading(false);
        return;
      }
      connectingRef.current = true;
      setLoading(true);
      setErrorMessage(null);

      try {
        const sessionUrl =
          typeof window !== 'undefined'
            ? new URL('/api/sendbird/session-token', window.location.origin)
            : null;
        if (!sessionUrl) {
          throw new Error('세션 요청 URL을 만들지 못했습니다.');
        }
        sessionUrl.searchParams.set('userId', address);
        sessionUrl.searchParams.set('nickname', buyerNickname.trim());
        if (buyerAvatar) {
          sessionUrl.searchParams.set('profileUrl', buyerAvatar);
        }

        const sessionResponse = await fetch(sessionUrl.toString(), {
          method: 'GET',
        });
        if (!sessionResponse.ok) {
          const error = await sessionResponse.json().catch(() => null);
          throw new Error(
            error?.error
              ? `세션 토큰 오류: ${error.error}`
              : `세션 토큰 발급 실패 (status ${sessionResponse.status})`,
          );
        }
        const sessionData = (await sessionResponse.json()) as { sessionToken?: string };
        if (!sessionData.sessionToken) {
          throw new Error('세션 토큰이 비어 있습니다.');
        }

        const channelResponse = await fetch('/api/sendbird/group-channel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buyerId: address,
            sellerId,
          }),
        });
        if (!channelResponse.ok) {
          const error = await channelResponse.json().catch(() => null);
          throw new Error(
            error?.error
              ? `채널 생성 오류: ${error.error}`
              : `채팅 채널 생성 실패 (status ${channelResponse.status})`,
          );
        }
        const channelData = (await channelResponse.json()) as { channelUrl?: string };

        if (active) {
          setSessionToken(sessionData.sessionToken);
          setChannelUrl(channelData.channelUrl || null);
        }
      } catch (error) {
        if (active) {
          const message =
            error instanceof Error ? error.message : '채팅을 불러오지 못했습니다.';
          setErrorMessage(message);
        }
      } finally {
        connectingRef.current = false;
        if (active) {
          setLoading(false);
        }
      }
    };

    connectChat();

    return () => {
      active = false;
    };
  }, [address, buyerAvatar, buyerNickname, channelUrl, isLoggedIn, sellerId, sessionToken]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-black sm:bg-[radial-gradient(120%_120%_at_50%_0%,#ffffff_0%,#f0f0f3_45%,#dadce1_100%)]">
      {/* 거래내역 슬라이드 패널 */}
      <div
        className={`fixed inset-0 z-30 flex transition duration-300 ${showHistory ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!showHistory}
      >
        <div
          className={`relative h-full w-full max-w-md bg-white shadow-2xl ring-1 ring-black/10 transform transition duration-300 ${
            showHistory ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                거래내역
              </span>
              <span className="text-base font-semibold text-slate-900">
                {displaySellerName || '판매자'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
          <div
            ref={historyContainerRef}
            className="h-[calc(100%-56px)] overflow-y-auto px-4 py-4 space-y-3"
          >
            {historyOrders.length === 0 && !historyLoading ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-500">
                거래내역이 없습니다.
              </div>
            ) : (
              historyOrders.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          item.status === 'paymentConfirmed'
                            ? 'bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.18)]'
                            : item.status === 'paymentRequested'
                              ? 'bg-amber-500 shadow-[0_0_0_6px_rgba(245,158,11,0.18)]'
                              : 'bg-slate-400'
                        }`}
                      />
                      <span className="text-xs font-semibold text-slate-700">
                        {item.status || '미정'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : '-'}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">USDT</p>
                      <p className="font-semibold">{formatNumberFixed(item.usdtAmount, 3)} USDT</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">KRW</p>
                      <p className="font-semibold">{formatNumber(item.krwAmount, 0)} KRW</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">바이어</p>
                      <p className="font-semibold">
                        {maskName(item.buyerName)} ({maskWalletAddress(item.buyerWalletAddress)})
                      </p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">거래 ID</p>
                      <p className="font-semibold">{item.tradeId || '-'}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
            {historyLoading && (
              <div className="flex items-center justify-center py-3 text-xs text-slate-500">
                불러오는 중...
              </div>
            )}
            {!historyHasMore && historyOrders.length > 0 && (
              <div className="py-3 text-center text-[11px] text-slate-500">마지막 거래까지 확인했습니다.</div>
            )}
          </div>
        </div>
        {/* 오른쪽 클릭 차단용 투명 레이어 */}
        <div
          className={`flex-1 bg-black/10 transition duration-300 ${showHistory ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setShowHistory(false)}
        />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-0 pt-6 pb-0 sm:px-5 sm:py-10">
        <main className="flex flex-1 flex-col overflow-hidden bg-white sm:rounded-[32px] sm:border sm:border-black/10 sm:shadow-[0_34px_90px_-50px_rgba(15,15,18,0.45)] sm:ring-1 sm:ring-black/10">
          <div className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-6">
            <header className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold tracking-tight">판매자에게 문의하기</h1>
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-black/60"
                >
                  뒤로
                </button>
              </div>
              {isLoggedIn && buyerNickname && (
                <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-blue-50 px-4 py-3 shadow-[0_16px_36px_-28px_rgba(14,116,144,0.75)]">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 overflow-hidden rounded-full border border-sky-200 bg-white shadow-sm">
                      {buyerAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={buyerAvatar}
                          alt={buyerNickname}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm font-bold text-sky-700">
                          {(buyerNickname || address || 'ME').slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">내 정보</p>
                      <p className="truncate text-sm font-extrabold text-slate-900">{buyerNickname}</p>
                      <p className="mt-0.5 truncate font-mono text-xs text-slate-600">
                        {maskWalletAddress(address)}
                      </p>
                    </div>
                    <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-sky-700">
                      BUYER
                    </span>
                  </div>
                </div>
              )}
            </header>

            <section className="rounded-3xl bg-white/95 p-5 text-black shadow-[0_18px_40px_-24px_rgba(0,0,0,0.25)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-black/50">
                    Seller Profile
                  </p>
                  <p className="text-lg font-semibold tracking-tight">판매자 정보</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowHistory(true)}
                    className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
                  >
                    거래내역 보기
                  </button>
                </div>
              </div>
              {!sellerId ? (
                <p className="mt-3 text-sm text-black/60">판매자 정보를 찾을 수 없습니다.</p>
              ) : sellerLoading ? (
                <p className="mt-3 text-sm text-black/60">판매자 정보를 불러오는 중입니다.</p>
              ) : sellerError ? (
                <p className="mt-3 text-sm text-rose-500">{sellerError}</p>
              ) : (
                <div className="mt-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-full border border-black/10 bg-[#f2f2f3] shadow-[0_8px_18px_-12px_rgba(0,0,0,0.35)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sellerProfile?.avatar || '/profile-default.png'}
                        alt={displaySellerName || '판매자'}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <span className="inline-flex items-center rounded-full bg-black/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-black/50">
                        Seller
                      </span>
                      <p className="mt-1 text-base font-semibold text-black">
                        {displaySellerName || '판매자'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-black/80">
                    {isContactTransfer ? (
                      <div className="flex items-center justify-between border-b border-black/10 pb-2">
                        <span className="text-xs uppercase tracking-[0.2em] text-black/50">
                          결제방식
                        </span>
                        <span className="text-sm font-semibold text-black">
                          연락처송금
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between border-b border-black/10 pb-2">
                          <span className="text-xs uppercase tracking-[0.2em] text-black/50">
                            은행
                          </span>
                          <span className="text-sm font-semibold text-black">
                            {sellerProfile?.seller?.bankInfo?.bankName || '-'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-black/10 pb-2">
                          <span className="text-xs uppercase tracking-[0.2em] text-black/50">
                            계좌번호
                          </span>
                          <span className="text-sm font-semibold text-black">
                            {maskAccountNumber(sellerProfile?.seller?.bankInfo?.accountNumber)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-black/10 pb-2">
                          <span className="text-xs uppercase tracking-[0.2em] text-black/50">
                            예금주
                          </span>
                          <span className="text-sm font-semibold text-black">
                            {sellerProfile?.seller?.bankInfo?.accountHolder || '-'}
                          </span>
                        </div>
                      </>
                    )}
                    {isContactTransfer && contactTransferMemo && (
                      <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-4 py-3 shadow-[0_16px_40px_-30px_rgba(16,185,129,0.75)]">
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                          연락처 메모
                        </p>
                        <div className="mt-2 whitespace-pre-wrap break-words text-[15px] font-semibold leading-relaxed text-emerald-950">
                          {renderTextWithAutoLinks(
                            contactTransferMemo,
                            'font-bold underline decoration-emerald-500/80 underline-offset-2 break-all hover:text-emerald-800'
                          )}
                        </div>
                      </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-4 py-3 shadow-[0_18px_40px_-30px_rgba(5,150,105,0.9)]">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                          에스크로 수량
                        </p>
                        <p className="mt-2 flex w-full items-end justify-end gap-1 text-right text-[28px] font-black leading-none tracking-tight text-emerald-700 tabular-nums">
                          {typeof sellerEscrow === 'number' ? formatNumber(sellerEscrow, 2) : '-'}
                          {typeof sellerEscrow === 'number' && (
                            <span className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800/80">
                              USDT
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-emerald-800/75">
                          실시간 잔고
                        </p>
                      </div>
                      <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-blue-50 px-4 py-3 shadow-[0_18px_40px_-30px_rgba(79,70,229,0.7)]">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-700">
                          USDT 판매금액
                        </p>
                        <p className="mt-2 flex w-full items-end justify-end gap-1 whitespace-nowrap text-right text-[28px] font-black leading-none tracking-tight text-indigo-700 tabular-nums">
                          {typeof sellerUsdtRate === 'number'
                            ? formatNumber(sellerUsdtRate, 0)
                            : '-'}
                          {typeof sellerUsdtRate === 'number' && (
                            <span className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-800/80">
                              KRW
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-indigo-800/75">
                          {priceTypeLabel}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-b border-black/10 pb-2">
                      <span className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-black/50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={marketIconForPrice}
                          alt={marketLabelForPrice}
                          className="h-5 w-5 rounded-full"
                        />
                        {marketLabelForPrice} 시세
                      </span>
                      <span className="text-right text-sm font-semibold text-black">
                        {typeof marketPrice === 'number'
                          ? `${formatNumber(marketPrice, 0)} KRW`
                          : '-'}
                        {marketUpdatedAt && (
                          <span className="mt-1 block text-xs font-medium text-black/50">
                            업데이트 {formatUpdatedTime(marketUpdatedAt)}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-5 text-slate-800 shadow-[0_24px_60px_-34px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                          Quick Order
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">USDT 구매하기</p>
                      </div>
                      <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-[0_10px_26px_-20px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.12)]" />
                        실시간 단가 {effectiveRate ? `${formatNumber(effectiveRate, 0)} KRW` : '-'}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        현재 거래 상태
                      </span>
                      <span className="flex items-center gap-2 font-semibold text-slate-900">
                        <span className={`h-2.5 w-2.5 rounded-full ${tradeStatusDotClass}`} />
                        {tradeStatusLoading ? '확인 중...' : tradeStatusLabel}
                      </span>
                    </div>
                    {isTradeInProgress && currentTradeDisplayOrderNo && (
                      <div className="mt-1 flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          주문번호
                        </span>
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {currentTradeDisplayOrderNo}
                        </span>
                      </div>
                    )}
                    {tradeStatusTimestamp && (
                      <div className="mt-1 flex items-center justify-end text-[11px] text-slate-500">
                        최근 업데이트 {formatUpdatedTime(tradeStatusTimestamp)}
                      </div>
                    )}
                    {isPaymentRequested && (
                      <div className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-700">
                        <div className="flex items-start gap-2">
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                          <div>
                            <p className="font-semibold text-slate-900">
                              {sellerProfile?.seller?.bankInfo?.bankName === '연락처송금'
                                ? '판매자가 등록한 연락처송금 안내를 확인해 주세요.'
                                : '입금 요청 상태입니다. 아래 계좌로 입금해 주세요.'}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {sellerProfile?.seller?.bankInfo?.bankName === '연락처송금'
                                ? `안내된 연락처 방식으로 ${PAYMENT_COUNTDOWN_MINUTES}분 이내 송금하지 않으면 주문이 자동 취소됩니다.`
                                : `${PAYMENT_COUNTDOWN_MINUTES}분 이내 입금하지 않으면 자동 취소됩니다.`}
                            </p>
                          </div>
                        </div>
                        <div
                          className={`mt-2 rounded-lg border px-3 py-2 ${
                            isPaymentCountdownUrgent
                              ? 'border-rose-200 bg-rose-50/80'
                              : 'border-blue-200 bg-blue-50/80'
                          }`}
                        >
                          <div className="flex items-end justify-between gap-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              입금 마감까지
                            </p>
                            <p
                              className={`font-mono text-[30px] font-black leading-none tracking-tight tabular-nums ${
                                isPaymentCountdownUrgent
                                  ? 'text-rose-600 animate-pulse'
                                  : 'text-blue-700'
                              }`}
                            >
                              {paymentCountdownText}
                            </p>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                                isPaymentCountdownUrgent
                                  ? 'bg-gradient-to-r from-rose-500 via-orange-400 to-rose-500 animate-pulse'
                                  : 'bg-gradient-to-r from-emerald-500 to-blue-500'
                              }`}
                              style={{
                                width: isPaymentCountdownExpired
                                  ? '0%'
                                  : `${Math.max(2, paymentCountdownRatio * 100)}%`,
                              }}
                            />
                          </div>
                          <p
                            className={`mt-1 text-[11px] font-semibold ${
                              isPaymentCountdownUrgent ? 'text-rose-600' : 'text-slate-500'
                            }`}
                          >
                            {isPaymentCountdownExpired
                              ? '입금 가능 시간이 지났습니다. 주문 상태를 다시 확인해 주세요.'
                              : '남은 시간 안에 입금을 완료하면 자동 취소를 방지할 수 있습니다.'}
                          </p>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          {isContactTransfer ? (
                            <div className="flex items-center justify-between border-b border-slate-200 py-1.5">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                결제방식
                              </p>
                              <p className="text-sm font-semibold text-slate-900">
                                연락처송금
                              </p>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between border-b border-slate-200 py-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  은행
                                </p>
                                <p className="text-sm font-semibold text-slate-900">
                                  {sellerProfile?.seller?.bankInfo?.bankName || '-'}
                                </p>
                              </div>
                              <div className="flex items-center justify-between border-b border-slate-200 py-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  예금주
                                </p>
                                <p className="text-sm font-semibold text-slate-900">
                                  {sellerProfile?.seller?.bankInfo?.accountHolder || '-'}
                                </p>
                              </div>
                              <div className="flex items-center justify-between border-b border-slate-200 py-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  계좌번호
                                </p>
                                <p className="text-sm font-semibold text-slate-900">
                                  {sellerProfile?.seller?.bankInfo?.accountNumber || '-'}
                                </p>
                              </div>
                            </>
                          )}
                          {isContactTransfer && (
                            <div className="border-b border-slate-200 py-1.5">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                연락처 메모
                              </p>
                              <div className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-slate-900">
                                {contactTransferMemo
                                  ? renderTextWithAutoLinks(
                                      contactTransferMemo,
                                      'font-semibold underline decoration-slate-400 underline-offset-2 break-all hover:text-slate-700'
                                    )
                                  : '-'}
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="text-right">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                입금액
                              </p>
                              <p className="mt-0.5 flex items-end justify-end gap-1 whitespace-nowrap text-[24px] font-black leading-none tracking-tight text-slate-900 tabular-nums">
                                {formatNumber(currentTradeOrder?.krwAmount, 0)}
                                <span className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                                  KRW
                                </span>
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                주문 수량
                              </p>
                              <p className="mt-0.5 flex items-end justify-end gap-1 whitespace-nowrap text-[24px] font-black leading-none tracking-tight text-slate-900 tabular-nums">
                                {formatNumberFixed(currentTradeOrder?.usdtAmount, 3)}
                                <span className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                                  USDT
                                </span>
                              </p>
                            </div>
                          </div>
                        </div>
                        {canCancelCurrentBuyOrder && (
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={openCancelBuyOrderModal}
                              disabled={cancelingBuyOrder}
                              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {cancelingBuyOrder ? '구매 주문 취소 중...' : '구매 주문 취소하기'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {!isTradeInProgress && (
                      <div className="relative mt-3">
                        <div
                          className={`transition duration-200 ${
                            isTradeStatusResolving
                              ? 'pointer-events-none select-none opacity-45 blur-[1.5px]'
                              : ''
                          }`}
                        >
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-500">
                              결제할 원화 금액
                            </label>
                            <div className="relative overflow-hidden rounded-2xl bg-white shadow-[0_10px_28px_-24px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={buyKrwInput ? Number(buyKrwInput).toLocaleString('ko-KR') : ''}
                                onChange={(e) => handleKrwChange(e.target.value.replace(/,/g, ''))}
                                placeholder="원화 금액을 입력하세요"
                                disabled={!isLoggedIn || buying || isPaymentRequested || isTradeStatusResolving}
                                className={`
                                  w-full border-0 px-4 py-4 pr-20 text-right text-[30px] font-black leading-none tracking-tight tabular-nums placeholder:text-base placeholder:font-semibold placeholder:text-slate-400 focus:outline-none focus:ring-2
                                  ${isLoggedIn && !buying && !isTradeStatusResolving
                                    ? 'bg-white text-slate-900 focus:ring-blue-500'
                                    : 'cursor-not-allowed bg-slate-100 text-slate-400 focus:ring-0'}
                                `}
                              />
                              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                                KRW
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 space-y-2">
                            <label className="block text-xs font-semibold text-slate-500">
                              구매할 USDT 수량
                            </label>
                            <div className="relative overflow-hidden rounded-2xl bg-white shadow-[0_10px_28px_-24px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={buyUsdtInput}
                                onChange={(e) => handleUsdtChange(e.target.value)}
                                placeholder="USDT 수량을 입력하세요"
                                disabled={!isLoggedIn || buying || isPaymentRequested || isTradeStatusResolving}
                                className={`
                                  w-full border-0 px-4 py-4 pr-20 text-right text-[30px] font-black leading-none tracking-tight tabular-nums placeholder:text-base placeholder:font-semibold placeholder:text-slate-400 focus:outline-none focus:ring-2
                                  ${isLoggedIn && !buying && !isTradeStatusResolving
                                    ? 'bg-white text-slate-900 focus:ring-blue-500'
                                    : 'cursor-not-allowed bg-slate-100 text-slate-400 focus:ring-0'}
                                `}
                              />
                              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                                USDT
                              </span>
                            </div>
                          </div>
                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={goBuy}
                              disabled={
                                !isLoggedIn
                                || !sellerId
                                || !effectiveRate
                                || (!buyKrwInput && !buyUsdtInput)
                                || buying
                                || cancelingBuyOrder
                                || isPaymentRequested
                                || isTradeStatusResolving
                              }
                              className={`
                                group flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition
                                ${
                                  !isLoggedIn
                                  || !sellerId
                                  || !effectiveRate
                                  || (!buyKrwInput && !buyUsdtInput)
                                  || buying
                                  || cancelingBuyOrder
                                  || isPaymentRequested
                                  || isTradeStatusResolving
                                  ? 'cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200'
                                  : 'bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 text-white shadow-[0_18px_45px_-16px_rgba(37,99,235,0.65)] hover:-translate-y-0.5 hover:shadow-[0_28px_60px_-18px_rgba(37,99,235,0.85)] active:translate-y-0'}
                              `}
                            >
                              {buying ? (
                                <>
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    className="h-5 w-5 animate-spin"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M12 4v2m0 12v2m8-8h-2M6 12H4m11.314-5.314-1.414 1.414M8.1 15.9l-1.414 1.414m0-11.314L8.1 8.1m7.8 7.8 1.414 1.414"
                                    />
                                  </svg>
                                  주문 처리 중...
                                </>
                              ) : (
                                <>
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    className="h-5 w-5"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M3.5 5h1.75l.6 3m0 0 .9 4H17l2-7H6.25m0 0H20.5"
                                    />
                                    <circle cx="9.5" cy="18.5" r="1.25" />
                                    <circle cx="16" cy="18.5" r="1.25" />
                                  </svg>
                                  USDT 구매하기
                                </>
                              )}
                            </button>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 ring-1 ring-slate-200/70">
                                최소 1 USDT
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 ring-1 ring-slate-200/70">
                                최대 100,000 USDT
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 ring-1 ring-slate-200/70">
                                실시간 시세 반영
                              </span>
                            </div>
                            {!isLoggedIn && (
                              <p className="mt-2 text-xs text-slate-500">
                                웹3 지갑을 연결하면 빠르게 구매를 진행할 수 있습니다.
                              </p>
                            )}
                            {!effectiveRate && (
                              <p className="mt-2 text-xs text-rose-500">
                                판매자 가격 정보를 불러오지 못했습니다.
                              </p>
                            )}
                            {buyStatus !== 'idle' && buyStatus !== 'success' && (
                              <div
                                className={`mt-3 rounded-2xl border px-3 py-3 text-xs font-semibold ${
                                  buyStatus === 'error'
                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-600'
                                }`}
                              >
                                <div className="flex items-center gap-2 text-sm">
                                  {buyStatus === 'error' && (
                                    <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_6px_rgba(244,63,94,0.14)]" />
                                  )}
                                  {buyStatus === 'loading' && (
                                    <span className="h-2 w-2 rounded-full bg-slate-400 animate-pulse" />
                                  )}
                                  <span>{buyStatusMessage}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        {isTradeStatusResolving && (
                          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/45 backdrop-blur-[1px]">
                            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/25 via-slate-100/60 to-white/30" />
                            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.4)]">
                              <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
                                거래 상태를 읽어오는 중입니다. 잠시만 기다려 주세요.
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-2">
                                <span className="h-2 rounded-full bg-slate-200/90 animate-pulse" />
                                <span className="h-2 rounded-full bg-slate-200/90 animate-pulse" />
                                <span className="h-2 rounded-full bg-slate-200/90 animate-pulse" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl bg-transparent py-5 text-black">
              <div className="flex items-start justify-between gap-3 px-0">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-black/50">
                    Live Chat
                  </p>
                  <p className="text-lg font-semibold tracking-tight">판매자 채팅</p>
                </div>
                <div className="rounded-2xl border border-black/10 bg-black/5 px-3 py-2 text-xs font-semibold text-black/70">
                  상담 진행
                </div>
              </div>
              {!sellerId ? (
                <p className="mt-3 px-5 text-sm text-black/60">판매자 정보를 찾을 수 없습니다.</p>
              ) : !isLoggedIn ? (
                <div className="mt-3 flex flex-col gap-3 px-5">
                  <p className="text-sm text-black/60">
                    지갑 연결 후 판매자와 상담할 수 있습니다.
                  </p>
                    <ConnectButton
                      client={client}
                      wallets={wallets}
                      theme="light"
                      connectButton={{
                        label: '웹3 로그인',
                        style: {
                        background: '#ff7a1a',
                        color: '#ffffff',
                        border: '1px solid rgba(255,177,116,0.7)',
                        boxShadow: '0 14px 32px -18px rgba(249,115,22,0.9)',
                        width: '100%',
                        height: '48px',
                        borderRadius: '9999px',
                        fontWeight: 600,
                        fontSize: '15px',
                        },
                      }}
                    connectModal={{
                      size: 'wide',
                      showThirdwebBranding: false,
                    }}
                    locale="ko_KR"
                  />
                  {errorMessage && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                      {errorMessage}
                    </div>
                  )}
                </div>
              ) : errorMessage ? (
                <p className="mt-3 px-5 text-sm text-rose-500">{errorMessage}</p>
              ) : !buyerNickname ? (
                <p className="mt-3 px-5 text-sm text-black/60">회원 정보를 불러오는 중입니다.</p>
              ) : !sessionToken || !channelUrl ? (
                <p className="mt-3 px-5 text-sm text-black/60">
                  {loading ? '채팅을 준비 중입니다.' : '채팅을 불러오는 중입니다.'}
                </p>
              ) : (
                <div className="mt-4 h-[520px]">
                  <SendbirdProvider
                    appId={NEXT_PUBLIC_SENDBIRD_APP_ID}
                    userId={address}
                    accessToken={sessionToken}
                    theme="light"
                    sdkInitParams={sendbirdSdkInitParams}
                  >
                    <GroupChannel channelUrl={channelUrl} />
                  </SendbirdProvider>
                </div>
              )}
            </section>
          </div>
          {showCancelWarningModal && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
              <button
                type="button"
                aria-label="닫기"
                onClick={() => {
                  if (!cancelingBuyOrder) {
                    setShowCancelWarningModal(false);
                  }
                }}
                className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="cancel-buyorder-warning-title"
                className="relative w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.7)]"
              >
                <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-rose-700">
                  Warning
                </div>
                <h2
                  id="cancel-buyorder-warning-title"
                  className="mt-3 text-lg font-bold tracking-tight text-slate-900"
                >
                  구매 주문을 취소할까요?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  구매 주문을 취소하면 구매자 평점에 반영됩니다. 신중하게 진행해 주세요.
                </p>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCancelWarningModal(false)}
                    disabled={cancelingBuyOrder}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={cancelMyBuyOrder}
                    disabled={cancelingBuyOrder}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {cancelingBuyOrder ? '취소 진행 중...' : '평점 반영 확인 후 취소'}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="mt-auto px-0 sm:px-5">
            <footer className="mx-0 rounded-none bg-[#1f1f1f] px-0 py-6 pb-0 text-center text-xs text-[#9aa3b2] sm:-mx-5 sm:rounded-b-[32px] sm:px-5 sm:pb-8">
              <div className="px-5 sm:px-0">
                <div className="flex flex-col items-center gap-2">
                  <p className="text-2xl font-semibold tracking-tight text-[#ff8a1f]">
                    Orange X™
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-[#b6beca]">
                    <Link href={`/${lang}/p2p-buyer/terms-of-service`} className="px-2 hover:text-white">
                      Terms of Service
                    </Link>
                    <span className="text-[#566072]">|</span>
                    <Link href={`/${lang}/p2p-buyer/privacy-policy`} className="px-2 hover:text-white">
                      Privacy Policy
                    </Link>
                    <span className="text-[#566072]">|</span>
                    <Link href={`/${lang}/p2p-buyer/refund-policy`} className="px-2 hover:text-white">
                      Refund & Dispute Policy
                    </Link>
                  </div>
                </div>

                <p className="mt-4 text-[11px] leading-relaxed text-[#8a93a6]">
                  Risk notice: Crypto payments involve risks such as price volatility and network delays.
                  Please review fees, exchange rates, and settlement terms before payment.
                </p>

                <div className="mt-4 space-y-1 text-[11px] text-[#b6beca]">
                  <p>Email: help@orangex.center</p>
                  <p>Address: 14F, Corner St. Paul &amp; Tombs of the Kings, 8046 Pafos, Cyprus</p>
                </div>

                <p className="mt-4 text-[11px] text-[#6c7688]">
                  Copyright © OrangeX All Rights Reserved
                </p>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
