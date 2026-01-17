'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Manrope, Playfair_Display } from 'next/font/google';

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

const STAT_ITEMS = [
    {
        label: '누적 거래량',
        value: 12876432,
        suffix: 'USDT',
    },
    {
        label: '누적 거래금액',
        value: 51298412000,
        suffix: 'KRW',
    },
];

const SCROLL_BANNER_ADS = [
    { id: 1, title: 'USDT Gift Cards', image: '/ads/orangex-banner-01.svg', link: '#' },
    { id: 2, title: 'USDT Travel Pass', image: '/ads/orangex-banner-02.svg', link: '#' },
    { id: 3, title: 'USDT Food Delivery', image: '/ads/orangex-banner-03.svg', link: '#' },
    { id: 4, title: 'USDT Gaming', image: '/ads/orangex-banner-04.svg', link: '#' },
    { id: 5, title: 'USDT Subscriptions', image: '/ads/orangex-banner-05.svg', link: '#' },
    { id: 6, title: 'USDT Cloud', image: '/ads/orangex-banner-06.svg', link: '#' },
    { id: 7, title: 'USDT Retail', image: '/ads/orangex-banner-07.svg', link: '#' },
    { id: 8, title: 'USDT Market', image: '/ads/orangex-banner-08.svg', link: '#' },
    { id: 9, title: 'USDT Education', image: '/ads/orangex-banner-09.svg', link: '#' },
    { id: 10, title: 'USDT Utilities', image: '/ads/orangex-banner-10.svg', link: '#' },
];

const STAT_CARD_STYLES = [
    {
        base: 'bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,237,213,0.88))]',
        orb: 'bg-[radial-gradient(circle_at_center,var(--sun)_0%,transparent_70%)]',
    },
    {
        base: 'bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(219,234,254,0.88))]',
        orb: 'bg-[radial-gradient(circle_at_center,var(--sea)_0%,transparent_70%)]',
    },
];

type MarketId = 'upbit' | 'bithumb' | 'korbit';
type MarketTicker = {
    id: MarketId;
    name: string;
    price: number | null;
    error?: string;
};

const MARKET_SOURCES: MarketTicker[] = [
    { id: 'upbit', name: '업비트', price: null },
    { id: 'bithumb', name: '빗썸', price: null },
    { id: 'korbit', name: '코빗', price: null },
];

const MARKET_STYLES: Record<
    MarketId,
    { badge: string; accent: string; glow: string; label: string }
> = {
    upbit: {
        label: 'Upbit',
        badge: 'border-emerald-200/80 bg-emerald-500/10 text-emerald-700',
        accent: 'bg-[linear-gradient(135deg,#10b981,#22d3ee)]',
        glow: 'bg-emerald-400/25',
    },
    bithumb: {
        label: 'Bithumb',
        badge: 'border-sky-200/80 bg-sky-500/10 text-sky-700',
        accent: 'bg-[linear-gradient(135deg,#38bdf8,#0ea5e9)]',
        glow: 'bg-sky-400/25',
    },
    korbit: {
        label: 'Korbit',
        badge: 'border-amber-200/80 bg-amber-500/10 text-amber-700',
        accent: 'bg-[linear-gradient(135deg,#f59e0b,#f97316)]',
        glow: 'bg-amber-400/25',
    },
};

type TradeTone = 'buy' | 'sell' | 'pending';
type RecentTrade = {
    id: string;
    tone: TradeTone;
    user: string;
    amount: string;
    price: string;
    time: string;
    statusLabel: string;
};

const STATUS_LABELS: Record<string, string> = {
    paymentConfirmed: '완료',
    cancelled: '취소',
    paymentRequested: '입금요청',
    accepted: '수락',
    ordered: '대기',
};

const TRADE_STYLES: Record<
    TradeTone,
    { label: string; badge: string; accent: string; glow: string }
> = {
    buy: {
        label: '구매',
        badge: 'border-emerald-200/80 bg-emerald-500/10 text-emerald-700',
        accent: 'bg-[linear-gradient(180deg,#10b981,#14b8a6)]',
        glow: 'bg-emerald-400/25',
    },
    sell: {
        label: '취소',
        badge: 'border-orange-200/80 bg-orange-500/10 text-orange-700',
        accent: 'bg-[linear-gradient(180deg,#f97316,#f59e0b)]',
        glow: 'bg-orange-400/25',
    },
    pending: {
        label: '진행',
        badge: 'border-sky-200/80 bg-sky-500/10 text-sky-700',
        accent: 'bg-[linear-gradient(180deg,#38bdf8,#0ea5e9)]',
        glow: 'bg-sky-400/25',
    },
};

const numberFormatter = new Intl.NumberFormat('ko-KR');
const formatKrw = (value: number | null) =>
    value === null ? '--' : `₩${numberFormatter.format(value)}`;

const getBalanceTone = (balance: number, totalBalance: number) => {
    const ratio = totalBalance > 0 ? balance / totalBalance : 0;
    if (ratio >= 0.15) {
        return {
            card: 'border-amber-200/80 bg-amber-50/85 shadow-[0_22px_60px_-38px_rgba(251,191,36,0.65)]',
            glow: 'bg-amber-300/55',
            amount: 'text-amber-700',
            pill: 'border-amber-200/80 bg-amber-100/80 text-amber-700',
        };
    }
    if (ratio >= 0.07) {
        return {
            card: 'border-sky-200/80 bg-sky-50/85 shadow-[0_22px_60px_-38px_rgba(56,189,248,0.55)]',
            glow: 'bg-sky-300/45',
            amount: 'text-sky-700',
            pill: 'border-sky-200/80 bg-sky-100/80 text-sky-700',
        };
    }
    if (ratio >= 0.03) {
        return {
            card: 'border-emerald-200/80 bg-emerald-50/85 shadow-[0_22px_60px_-38px_rgba(16,185,129,0.55)]',
            glow: 'bg-emerald-300/45',
            amount: 'text-emerald-700',
            pill: 'border-emerald-200/80 bg-emerald-100/80 text-emerald-700',
        };
    }
    return {
        card: 'border-slate-200/70 bg-white/80 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.6)]',
        glow: 'bg-amber-200/40',
        amount: 'text-slate-900',
        pill: 'border-slate-200/70 bg-white/80 text-slate-600',
    };
};

const maskName = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
        return '익명';
    }
    const visible = trimmed.slice(0, Math.min(3, trimmed.length));
    return `${visible}***`;
};

const formatRelativeTime = (value?: string) => {
    if (!value) {
        return '--';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '--';
    }
    const diffMs = Date.now() - date.getTime();
    const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSeconds < 60) {
        return '방금';
    }
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
        return `${diffMinutes}분 전`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return `${diffHours}시간 전`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}일 전`;
};

export default function OrangeXPage() {
    const params = useParams<{ lang: string }>();
    const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang ?? 'ko';
    const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
    const [animatedStats, setAnimatedStats] = useState(() => STAT_ITEMS.map(() => 0));
    const [chatOpen, setChatOpen] = useState(false);
    const [marketTickers, setMarketTickers] = useState<MarketTicker[]>(() => MARKET_SOURCES);
    const [tickerUpdatedAt, setTickerUpdatedAt] = useState<string | null>(null);
    const [tickerError, setTickerError] = useState<string | null>(null);
    const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
    const [recentTradesUpdatedAt, setRecentTradesUpdatedAt] = useState<string | null>(null);
    const [recentTradesError, setRecentTradesError] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (shouldReduceMotion) {
            setAnimatedStats(STAT_ITEMS.map((item) => item.value));
            return;
        }

        let frame = 0;
        const start = performance.now();
        const durationMs = 1600;

        const tick = (now: number) => {
            const progress = Math.min((now - start) / durationMs, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setAnimatedStats(STAT_ITEMS.map((item) => Math.floor(item.value * eased)));

            if (progress < 1) {
                frame = window.requestAnimationFrame(tick);
            }
        };

        frame = window.requestAnimationFrame(tick);

        return () => window.cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        let active = true;

        const fetchTickers = async () => {
            try {
                const response = await fetch('/api/markets/usdt-krw', { cache: 'no-store' });

                if (!response.ok) {
                    throw new Error('Failed to load tickers');
                }

                const data = await response.json();
                const items = Array.isArray(data?.items) ? data.items : [];
                const nextTickers = MARKET_SOURCES.map((source) => {
                    const match = items.find((item: MarketTicker) => item.id === source.id);
                    return match
                        ? { ...source, price: match.price, error: match.error }
                        : source;
                });

                if (active) {
                    setMarketTickers(nextTickers);
                    setTickerUpdatedAt(data?.updatedAt ?? new Date().toISOString());
                    setTickerError(null);
                }
            } catch (error) {
                if (active) {
                    setMarketTickers(MARKET_SOURCES);
                    setTickerUpdatedAt(null);
                    setTickerError('시세를 불러오지 못했습니다');
                }
            }
        };

        fetchTickers();
        const intervalId = window.setInterval(fetchTickers, 15000);

        return () => {
            active = false;
            window.clearInterval(intervalId);
        };
    }, []);

    useEffect(() => {
        let active = true;

        const fetchRecentTrades = async () => {
            try {
                const response = await fetch('/api/order/getAllBuyOrders', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        storecode: '',
                        limit: 10,
                        page: 1,
                        walletAddress: '',
                        searchMyOrders: false,
                        searchOrderStatusCancelled: false,
                        searchOrderStatusCompleted: true,
                        searchStoreName: '',
                        fromDate: '',
                        toDate: '',
                    }),
                });

                if (!response.ok) {
                    throw new Error('Failed to load trades');
                }

                const data = await response.json();
                const orders = Array.isArray(data?.result?.orders) ? data.result.orders : [];
                const nextTrades = orders.map((order: any) => {
                    const status = order?.status ?? 'ordered';
                    const tone: TradeTone =
                        status === 'paymentConfirmed'
                            ? 'buy'
                            : status === 'cancelled'
                            ? 'sell'
                            : 'pending';
                    const displayName = maskName(
                        order?.nickname ||
                            order?.buyer?.nickname ||
                            order?.buyer?.depositName ||
                            order?.buyer?.name ||
                            order?.store?.storeName ||
                            ''
                    );
                    const amount =
                        typeof order?.usdtAmount === 'number'
                            ? `${numberFormatter.format(order.usdtAmount)} USDT`
                            : '--';
                    const price =
                        typeof order?.rate === 'number'
                            ? `${numberFormatter.format(order.rate)} KRW`
                            : typeof order?.krwAmount === 'number'
                            ? `${numberFormatter.format(order.krwAmount)} KRW`
                            : '--';
                    const time = formatRelativeTime(
                        order?.paymentConfirmedAt || order?.createdAt || order?.acceptedAt
                    );

                    return {
                        id: String(order?._id ?? `${order?.createdAt ?? Date.now()}-${order?.nickname ?? ''}`),
                        tone,
                        user: displayName,
                        amount,
                        price,
                        time,
                        statusLabel: STATUS_LABELS[status] ?? '진행',
                    } as RecentTrade;
                });

                if (active) {
                    setRecentTrades(nextTrades);
                    setRecentTradesUpdatedAt(new Date().toISOString());
                    setRecentTradesError(null);
                }
            } catch (error) {
                if (active) {
                    setRecentTrades([]);
                    setRecentTradesUpdatedAt(null);
                    setRecentTradesError('거래내역을 불러오지 못했습니다');
                }
            }
        };

        fetchRecentTrades();
        const intervalId = window.setInterval(fetchRecentTrades, 20000);

        return () => {
            active = false;
            window.clearInterval(intervalId);
        };
    }, []);

    // 배너 광고 데이터 (실제로는 API에서 가져올 수 있습니다)
    const bannerAds = [
        {
            id: 1,
            title: 'CoinGate - USDT 결제',
            image: '/ads/tetherpay-coingate.svg',
            link: 'https://coingate.com',
        },
        {
            id: 2,
            title: 'NOWPayments - USDT 결제',
            image: '/ads/tetherpay-nowpayments.svg',
            link: 'https://nowpayments.io',
        },
    ];





  // /api/user/getAllSellersForBalance
  const [sellersBalance, setSellersBalance] = useState([] as any[]);
  const [sellersBalanceUpdatedAt, setSellersBalanceUpdatedAt] = useState<string | null>(null);
  const fetchSellersBalance = async () => {
    const response = await fetch('/api/user/getAllSellersForBalance', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        {
          storecode: "admin",
          limit: 100,
          page: 1,
        }
      )
    });

    const data = await response.json();

    ///console.log('getAllSellersForBalance data', data);

    if (data.result) {
      setSellersBalance(data.result.users || []);
      setSellersBalanceUpdatedAt(new Date().toISOString());
    } else {
      console.error('Error fetching sellers balance');
      setSellersBalanceUpdatedAt(null);
    }
  };
  useEffect(() => {

    fetchSellersBalance();
    // interval to fetch every 10 seconds
    const interval = setInterval(() => {
      fetchSellersBalance();
    }, 100000);
    return () => clearInterval(interval);
  }, []);




    const totalSellerBalance = sellersBalance.reduce(
        (acc, seller) => acc + (Number(seller?.currentUsdtBalance) || 0),
        0
    );
    const bestSellers = [...sellersBalance]
        .filter((seller) => seller?.walletAddress || seller?.nickname)
        .sort(
            (a, b) =>
                (b?.seller?.totalPaymentConfirmedUsdtAmount || 0) -
                (a?.seller?.totalPaymentConfirmedUsdtAmount || 0)
        )
        .slice(0, 12);

    return (
        <div
            className={`${bodyFont.variable} ${displayFont.variable} relative min-h-screen overflow-hidden bg-[linear-gradient(160deg,var(--paper),#f0f9ff_45%,#fff1f2_85%)] text-[color:var(--ink)] font-[var(--font-body)]`}
            style={{
                '--paper': '#fff4ea',
                '--ink': '#1c1917',
                '--accent': '#ff7a1a',
                '--accent-deep': '#ea580c',
                '--sea': '#0ea5e9',
                '--mist': '#f5efe5',
                '--rose': '#fb7185',
                '--sun': '#fbbf24',
            } as React.CSSProperties}
        >
            <div className="pointer-events-none absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,var(--accent)_0%,transparent_70%)] opacity-35 blur-3xl float-slow" />
            <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,var(--sea)_0%,transparent_70%)] opacity-30 blur-3xl float-slower" />
            <div className="pointer-events-none absolute left-[-8%] top-[18%] h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,var(--rose)_0%,transparent_70%)] opacity-25 blur-3xl float-slow" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(255,255,255,0))]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:18px_18px] opacity-20" />
            {/* PC 좌측 광고 배너 */}
            <aside className="hidden lg:block fixed left-0 top-20 z-10 w-56 h-[calc(100vh-5rem)] overflow-y-auto p-4 space-y-4">
                {bannerAds.map((ad) => (
                    <a key={`left-${ad.id}`} href={ad.link} className="block" target="_blank" rel="noreferrer">
                        <div className="rounded-2xl border border-white/80 bg-white/70 p-2 shadow-[0_16px_45px_-32px_rgba(15,23,42,0.6)] backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_26px_60px_-36px_rgba(15,23,42,0.6)]">
                            <div className="relative aspect-[2/1] rounded-lg overflow-hidden bg-[#f1eee7]">
                                <Image
                                    src={ad.image}
                                    alt={ad.title}
                                    fill
                                    sizes="(min-width: 1024px) 224px, 50vw"
                                    className="object-contain"
                                />
                            </div>
                        </div>
                    </a>
                ))}
            </aside>

            {/* PC 우측 광고 배너 */}
            <aside className="hidden lg:block fixed right-0 top-20 z-10 w-56 h-[calc(100vh-5rem)] overflow-y-auto p-4 space-y-4">
                {bannerAds.map((ad) => (
                    <a key={`right-${ad.id}`} href={ad.link} className="block" target="_blank" rel="noreferrer">
                        <div className="rounded-2xl border border-white/80 bg-white/70 p-2 shadow-[0_16px_45px_-32px_rgba(15,23,42,0.6)] backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_26px_60px_-36px_rgba(15,23,42,0.6)]">
                            <div className="relative aspect-[2/1] rounded-lg overflow-hidden bg-[#f1eee7]">
                                <Image
                                    src={ad.image}
                                    alt={ad.title}
                                    fill
                                    sizes="(min-width: 1024px) 224px, 50vw"
                                    className="object-contain"
                                />
                            </div>
                        </div>
                    </a>
                ))}
            </aside>

            {/* 메인 컨텐츠 */}
            <main className="container relative z-10 mx-auto max-w-5xl px-4 pb-16 lg:px-8 lg:pb-12">
                {/* 히어로 섹션 */}
                <div className="hero-fade relative mt-10 mb-14 overflow-hidden rounded-[28px] border border-white/70 bg-white/70 shadow-[0_40px_120px_-60px_rgba(15,23,42,0.6)] backdrop-blur">
                    <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,var(--accent)_0%,transparent_70%)] opacity-30" />
                    <div className="absolute -bottom-24 left-[-10%] h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,var(--sea)_0%,transparent_70%)] opacity-25" />
                    <div className="relative grid gap-10 p-8 md:grid-cols-[1.1fr_0.9fr] md:p-12">
                        <div className="space-y-6">
                            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-[linear-gradient(135deg,#fff1f2,#ffedd5)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
                                USDT · P2P · Escrow
                            </div>
                            <div className="flex items-center gap-4">
                                <Image
                                    src="/logo-orangex.png"
                                    alt="OrangeX"
                                    width={180}
                                    height={56}
                                    className="h-12 w-auto"
                                    priority
                                />
                            </div>
                            <h1 className="font-[var(--font-display)] text-4xl leading-tight text-[color:var(--ink)] md:text-6xl">
                                테더 P2P 마켓
                            </h1>
                            <p className="text-lg text-slate-700 md:text-xl">
                                개인 간 테더(USDT) 구매·판매를 안전하게 연결합니다
                            </p>

                            <div className="flex flex-col gap-4 sm:flex-row">
                                <Link
                                    href="/ko/p2p/buy"
                                    className="inline-flex w-full items-center justify-center gap-3 rounded-full bg-[color:var(--accent)] px-8 py-4 text-base font-semibold text-white shadow-[0_18px_45px_-20px_rgba(249,115,22,0.9)] transition hover:bg-[color:var(--accent-deep)] sm:w-auto"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="inline-block">
                                        <path d="M6 6h15l-1.5 9h-13L6 6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M9 22a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor"/>
                                        <path d="M18 22a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor"/>
                                    </svg>
                                    구매하기
                                </Link>
                                <Link
                                    href="/ko/p2p/sell"
                                    className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-slate-300/80 bg-white/80 px-8 py-4 text-base font-semibold text-slate-900 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)] transition hover:bg-white sm:w-auto"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="inline-block">
                                        <path d="M12 2l7 7-7 7-7-7 7-7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    판매하기
                                </Link>
                            </div>

                            <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
                                <span className="rounded-full border border-slate-200/80 bg-white/80 px-4 py-2">에스크로 보호</span>
                                <span className="rounded-full border border-slate-200/80 bg-white/80 px-4 py-2">실시간 매칭</span>
                                <span className="rounded-full border border-slate-200/80 bg-white/80 px-4 py-2">자동 정산</span>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_25px_70px_-45px_rgba(15,23,42,0.7)]">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">거래 흐름</p>
                                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">보호됨</span>
                            </div>
                            <div className="mt-6 space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ink)] text-xs font-semibold text-white">1</div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">주문 생성</p>
                                        <p className="text-xs text-slate-600">구매자가 주문을 생성합니다</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ink)] text-xs font-semibold text-white">2</div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">에스크로 예치</p>
                                        <p className="text-xs text-slate-600">판매자가 테더를 예치합니다</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ink)] text-xs font-semibold text-white">3</div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">입금 확인 & 전송</p>
                                        <p className="text-xs text-slate-600">입금 확인 후 자동 전송됩니다</p>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 rounded-xl border border-orange-200/60 bg-orange-50/80 px-4 py-3 text-sm text-orange-800">
                                평균 처리 10-30분, 입금 확인 후 자동 전송
                            </div>
                        </div>
                    </div>
                </div>

                {/* 스크롤 배너 섹션 */}
                <div className="rounded-[28px] border border-slate-200/70 bg-white/80 p-6 mb-12 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur overflow-x-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                        <div>
                            <div className="flex items-center gap-3">
                                {/* partner icon */}
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="inline-block">
                                    <path d="M12 2a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M19 10h2a2 2 0 0 1 2 2v6a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4v-6a2 2 0 0 1 2-2h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M8 14h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>

                                <h2 className="font-[var(--font-display)] text-2xl text-slate-900">제휴 배너</h2>
                            </div>

                            <p className="text-sm text-slate-600">좌우로 스와이프하여 확인하세요</p>
                        </div>
                        <span className="text-xs font-semibold text-slate-500">USDT 파트너</span>
                    </div>
                    {/* 스크롤 배너 컨테이너 */}

                    <div
                        className="
                        md:w-full w-[78vw]
                        flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 py-2 scrollbar-hide relative
                        "
                        aria-label="제휴 배너 스크롤"
                    >
                        <div className="absolute left-0 top-0 h-full w-16 bg-[linear-gradient(90deg,rgba(255,255,255,1),rgba(255,255,255,0))]" />
                        <div className="absolute right-0 top-0 h-full w-16 bg-[linear-gradient(270deg,rgba(255,255,255,1),rgba(255,255,255,0))]" />

                        {SCROLL_BANNER_ADS.map((ad) => (
                            <a
                                key={ad.id}
                                href={ad.link}
                                className="banner-card shrink-0 snap-start"
                                target="_blank"
                                rel="noreferrer"
                                aria-label={ad.title}
                            >
                                <div className="relative w-[78vw] max-w-[260px] aspect-[2/1] overflow-hidden rounded-2xl shadow-[0_18px_40px_-30px_rgba(15,23,42,0.6)] sm:w-64 md:max-w-none md:w-72">
                                    <Image
                                        src={ad.image}
                                        alt={ad.title}
                                        fill
                                        sizes="(min-width: 768px) 288px, 78vw"
                                        className="object-cover"
                                    />
                                </div>
                            </a>
                        ))}
                        
                    </div>
                </div>


                {/* 통계 섹션 */}
                <div className="grid gap-6 mb-12 md:grid-cols-2">
                    {STAT_ITEMS.map((item, index) => {
                        const style = STAT_CARD_STYLES[index % STAT_CARD_STYLES.length];
                        return (
                            <div
                                key={item.label}
                                className={`relative overflow-hidden rounded-2xl border border-slate-200/70 p-6 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur ${style.base}`}
                            >
                                <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full ${style.orb} opacity-40`} />
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                            <div className="mt-4 flex items-baseline gap-3">
                                <span className="font-[var(--font-display)] text-4xl text-slate-900 tabular-nums md:text-5xl">
                                    {numberFormatter.format(animatedStats[index])}
                                </span>
                                <span className="text-sm font-semibold text-slate-500">{item.suffix}</span>
                            </div>
                            <p className="mt-3 text-sm text-slate-600">실시간 누적 지표를 반영합니다</p>
                            </div>
                        );
                    })}
                </div>

                <div className="rounded-[28px] border border-slate-200/70 bg-white/80 p-8 mb-12 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div>
                            <div className="flex items-center gap-3">
                                {/* market icon */}
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="inline-block">
                                    <path d="M3 3h18v4H3V3zM5 7v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7H5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M8 10h8M8 14h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <h2 className="font-[var(--font-display)] text-3xl text-slate-900">USDT/KRW 실시간 시세</h2>
                            </div>
                            <p className="text-sm text-slate-600">업비트 · 빗썸 · 코빗 기준</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-emerald-700">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                LIVE
                            </span>
                            <span>
                                업데이트{' '}
                                {tickerUpdatedAt
                                    ? new Date(tickerUpdatedAt).toLocaleTimeString('ko-KR', { hour12: false })
                                    : '--:--:--'}
                            </span>
                        </div>
                    </div>

                    {tickerError && <p className="mb-4 text-xs font-semibold text-orange-600">{tickerError}</p>}

                    <div className="grid gap-4 md:grid-cols-3">
                        {marketTickers.map((ticker) => {
                            const style = MARKET_STYLES[ticker.id];
                            return (
                                <div
                                    key={ticker.id}
                                    className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/75 p-5 shadow-[0_24px_60px_-45px_rgba(15,23,42,0.7)] backdrop-blur"
                                >
                                    <span className={`absolute left-0 top-0 h-full w-1.5 ${style.accent}`} />
                                    <span className={`pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full ${style.glow} blur-2xl`} />
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <Image
                                                src={`/icon-market-${ticker.id}.png`}
                                                alt={`${ticker.name} 로고`}
                                                width={40}
                                                height={40}
                                                className="h-10 w-10 rounded-full border border-slate-200/70 bg-white object-contain p-1"
                                            />
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                                    {style.label}
                                                </p>
                                                <p className="text-lg font-semibold text-slate-900">{ticker.name}</p>
                                            </div>
                                        </div>
                                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${style.badge}`}>
                                            USDT/KRW
                                        </span>
                                    </div>
                                    <div className="mt-4 flex items-baseline gap-2">
                                        <span className="font-[var(--font-display)] text-3xl text-slate-900 tabular-nums">
                                            {formatKrw(ticker.price)}
                                        </span>
                                        {ticker.price === null && (
                                            <span className="text-xs text-slate-500">불러오는 중</span>
                                        )}
                                    </div>
                                    <p className="mt-2 text-xs text-slate-500">공개 API 기준</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-[28px] border border-slate-200/70 bg-white/80 p-8 mb-12 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div>
                            <div className="flex items-center gap-3">
                                {/* best seller icon */}
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="inline-block">
                                    <path
                                        d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.5L12 15.8 7.2 18l.9-5.5L4.2 8.7l5.4-.8L12 3z"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                                <h2 className="font-[var(--font-display)] text-3xl text-slate-900">베스트 셀러</h2>
                            </div>
                            <p className="text-sm text-slate-600">최근 거래 완료량 기준 상위 판매자</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
                            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-amber-50/80 px-3 py-1 text-amber-700">
                                <span className="h-2 w-2 rounded-full bg-amber-500" />
                                TOP
                            </span>
                            <span>
                                업데이트{' '}
                                {sellersBalanceUpdatedAt
                                    ? new Date(sellersBalanceUpdatedAt).toLocaleTimeString('ko-KR', {
                                          hour12: false,
                                      })
                                    : '--:--:--'}
                            </span>
                        </div>
                    </div>

                    {bestSellers.length === 0 ? (
                        <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-5 py-6 text-sm text-slate-600">
                            베스트 셀러를 불러오는 중입니다.
                        </div>
                    ) : (
                        <div className="seller-ticker relative overflow-hidden">
                            <div className="seller-ticker-track">
                                {[0, 1].map((loopIndex) => (
                                    <div key={`seller-loop-${loopIndex}`} className="seller-ticker-group">
                                        {bestSellers.map((seller, index) => {
                                            const displayName = maskName(
                                                seller?.nickname ||
                                                    seller?.store?.storeName ||
                                                    seller?.walletAddress ||
                                                    '판매자'
                                            );
                                            const totalConfirmed =
                                                seller?.seller?.totalPaymentConfirmedUsdtAmount || 0;
                                            const currentBalanceRaw = Number(seller?.currentUsdtBalance ?? 0);
                                            const currentBalance = Number.isFinite(currentBalanceRaw)
                                                ? currentBalanceRaw
                                                : 0;
                                            const rate = seller?.seller?.usdtToKrwRate;
                                            //const sellerWalletAddress = seller?.walletAddress;
                                            const sellerWalletAddress = seller?.seller?.escrowWalletAddress;
                                            const promotionText = seller?.seller?.promotionText || seller?.promotionText;
                                            const priceSettingMethod = seller?.seller?.priceSettingMethod;
                                            const market = seller?.seller?.market;
                                            const balanceTone = getBalanceTone(currentBalance, totalSellerBalance);
                                            return (
                                                <div
                                                    key={`${loopIndex}-${seller?.walletAddress || index}`}
                                                    className={`seller-card relative flex flex-col gap-4 rounded-2xl border p-4 backdrop-blur ${balanceTone.card}`}
                                                >
                                                    <span
                                                        className={`pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full blur-2xl ${balanceTone.glow}`}
                                                    />
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
                                                            <Image
                                                                src={
                                                                    seller?.avatar ||
                                                                    seller?.store?.storeLogo ||
                                                                    '/icon-seller.png'
                                                                }
                                                                alt="Seller"
                                                                fill
                                                                sizes="44px"
                                                                className="object-cover object-center"
                                                            />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-semibold text-slate-900">
                                                                {displayName}
                                                            </p>
                                                            <p className="text-xs text-slate-500">
                                                                완료 {numberFormatter.format(totalConfirmed)} USDT
                                                            </p>
                                                            {promotionText && (
                                                                <p className="promo-text text-xs text-slate-600">
                                                                    <span className="promo-text-content">
                                                                    <span className="promo-text-message">
                                                                        {promotionText}
                                                                    </span>
                                                                    </span>
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-end justify-between gap-4">
                                                        <div>
                                                            <p className="text-xs text-slate-500">보유 잔액</p>
                                                            <p className={`text-base font-semibold ${balanceTone.amount}`}>
                                                                {numberFormatter.format(currentBalance)} USDT
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-2">
                                                            <div className="flex flex-col items-end gap-1">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <span className="text-[11px] font-semibold text-slate-500">
                                                                        판매가격
                                                                    </span>
                                                                    {priceSettingMethod === 'market' ? (
                                                                        <div className="flex items-center gap-1">
                                                                            {market === 'upbit' && (
                                                                                <Image
                                                                                    src="/icon-market-upbit.png"
                                                                                    alt="Upbit"
                                                                                    width={18}
                                                                                    height={18}
                                                                                    className="h-4 w-4"
                                                                                />
                                                                            )}
                                                                            {market === 'bithumb' && (
                                                                                <Image
                                                                                    src="/icon-market-bithumb.png"
                                                                                    alt="Bithumb"
                                                                                    width={18}
                                                                                    height={18}
                                                                                    className="h-4 w-4"
                                                                                />
                                                                            )}
                                                                            {market === 'korbit' && (
                                                                                <Image
                                                                                    src="/icon-market-korbit.png"
                                                                                    alt="Korbit"
                                                                                    width={18}
                                                                                    height={18}
                                                                                    className="h-4 w-4"
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[11px] font-semibold text-slate-500">
                                                                            고정가격
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span
                                                                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${balanceTone.pill}`}
                                                                >
                                                                    {typeof rate === 'number'
                                                                        ? `${numberFormatter.format(rate)} KRW`
                                                                        : '시세 준비중'}
                                                                </span>
                                                            </div>
                                                            {sellerWalletAddress && (
                                                                <a
                                                                    href={`/${lang}/escrow/${sellerWalletAddress}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent)] px-3 py-1 text-xs font-semibold text-white shadow-[0_10px_25px_-12px_rgba(249,115,22,0.8)] transition hover:bg-[color:var(--accent-deep)]"
                                                                >
                                                                    <svg
                                                                        width="14"
                                                                        height="14"
                                                                        viewBox="0 0 24 24"
                                                                        fill="none"
                                                                        className="inline-block"
                                                                        aria-hidden="true"
                                                                    >
                                                                        <path
                                                                            d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"
                                                                            stroke="currentColor"
                                                                            strokeWidth="2"
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                        />
                                                                        <path
                                                                            d="M8 10h8M8 14h5"
                                                                            stroke="currentColor"
                                                                            strokeWidth="2"
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                        />
                                                                    </svg>
                                                                    문의하기
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                            <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[color:var(--paper)] to-transparent" />
                            <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[color:var(--paper)] to-transparent" />
                        </div>
                    )}
                </div>

                <div className="rounded-[28px] border border-slate-200/70 bg-white/80 p-8 mb-12 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div>
                            <div className="flex items-center gap-3">
                                {/* trade icon */}
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="inline-block">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M7 10l5-5 5 5M12 5v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <h2 className="font-[var(--font-display)] text-3xl text-slate-900">최근 거래내역</h2>
                            </div>
                            <p className="text-sm text-slate-600">최근 10건이 순환 표시됩니다</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
                            <span className="inline-flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                구매
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-sky-500" />
                                진행
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-orange-500" />
                                취소
                            </span>
                            <span>
                                업데이트{' '}
                                {recentTradesUpdatedAt
                                    ? new Date(recentTradesUpdatedAt).toLocaleTimeString('ko-KR', {
                                          hour12: false,
                                      })
                                    : '--:--:--'}
                            </span>
                        </div>
                    </div>

                    {recentTradesError && (
                        <p className="mb-4 text-xs font-semibold text-orange-600">{recentTradesError}</p>
                    )}

                    {recentTrades.length === 0 ? (
                        <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-5 py-6 text-sm text-slate-600">
                            거래내역을 불러오는 중입니다.
                        </div>
                    ) : (
                        <div className="ticker relative overflow-hidden">
                            <div className="ticker-track">
                                {[0, 1].map((loopIndex) => (
                                    <div key={`trade-loop-${loopIndex}`} className="ticker-group">
                                        {recentTrades.map((trade) => {
                                            const style = TRADE_STYLES[trade.tone];
                                            return (
                                                <div
                                                    key={`${loopIndex}-${trade.id}`}
                                                    className="relative flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/70 bg-white/70 px-5 py-4 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.7)] backdrop-blur"
                                                >
                                                    <span className={`absolute left-0 top-0 h-full w-1.5 ${style.accent}`} />
                                                    <span className={`pointer-events-none absolute right-4 top-3 h-12 w-12 rounded-full ${style.glow} blur-2xl`} />
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white">
                                                            {style.label}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-semibold text-slate-900">{trade.user}</p>
                                                            <p className="text-xs text-slate-500">{trade.time}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-base font-semibold text-slate-900">{trade.amount}</p>
                                                        <p className="text-xs text-slate-500">{trade.price}</p>
                                                    </div>
                                                    <span
                                                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${style.badge}`}
                                                    >
                                                        {trade.statusLabel}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[color:var(--paper)] to-transparent" />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[color:var(--paper)] to-transparent" />
                        </div>
                    )}
                </div>

                {/* 주요 기능 소개 */}
                <div className="grid gap-6 mb-12 md:grid-cols-3">
                    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/75 p-6 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_40px_90px_-60px_rgba(15,23,42,0.8)]">
                        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--sea)] text-white shadow-[0_12px_30px_-18px_rgba(15,118,110,0.8)]">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <h3 className="mb-3 text-center font-[var(--font-display)] text-xl text-slate-900">안전한 거래</h3>
                        <p className="text-center text-sm text-slate-700">
                            에스크로 시스템으로 거래 금액을 안전하게 보호합니다
                        </p>
                    </div>

                    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/75 p-6 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_40px_90px_-60px_rgba(15,23,42,0.8)]">
                        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--accent)] text-white shadow-[0_12px_30px_-18px_rgba(249,115,22,0.8)]">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <h3 className="mb-3 text-center font-[var(--font-display)] text-xl text-slate-900">빠른 처리</h3>
                        <p className="text-center text-sm text-slate-700">
                            실시간 거래 매칭과 즉시 정산 시스템
                        </p>
                    </div>

                    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/75 p-6 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_40px_90px_-60px_rgba(15,23,42,0.8)]">
                        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.8)]">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <h3 className="mb-3 text-center font-[var(--font-display)] text-xl text-slate-900">P2P 거래</h3>
                        <p className="text-center text-sm text-slate-700">
                            개인간 직접 거래로 최적의 가격을 찾을 수 있습니다
                        </p>
                    </div>
                </div>

                {/* 에스크로 시스템 설명 */}
                <div className="relative overflow-hidden rounded-[28px] border border-slate-800/70 bg-[linear-gradient(140deg,#0f172a,#134e4a)] p-8 md:p-12 mb-12 text-white shadow-[0_40px_120px_-60px_rgba(2,6,23,0.9)]">
                    <div className="pointer-events-none absolute right-[-10%] top-[-20%] h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.5),transparent_70%)] opacity-40 blur-3xl" />
                    <h2 className="font-[var(--font-display)] text-3xl md:text-4xl text-center mb-8">
                        🔒 에스크로 시스템이란?
                    </h2>
                    
                    <div className="max-w-4xl mx-auto">
                        <div className="grid md:grid-cols-2 gap-8 mb-8">
                            <div className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur">
                                <div className="text-4xl mb-4">1️⃣</div>
                                <h3 className="text-xl font-bold mb-3">구매자가 주문</h3>
                                <p className="text-slate-100">
                                    구매자가 원하는 금액으로 테더 구매 주문을 생성합니다
                                </p>
                            </div>
                            
                            <div className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur">
                                <div className="text-4xl mb-4">2️⃣</div>
                                <h3 className="text-xl font-bold mb-3">판매자가 에스크로에 입금</h3>
                                <p className="text-slate-100">
                                    판매자가 테더를 에스크로 지갑에 안전하게 예치합니다
                                </p>
                            </div>
                            
                            <div className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur">
                                <div className="text-4xl mb-4">3️⃣</div>
                                <h3 className="text-xl font-bold mb-3">구매자가 원화 송금</h3>
                                <p className="text-slate-100">
                                    구매자가 판매자 계좌로 원화를 송금하고 송금 완료 버튼을 클릭합니다
                                </p>
                            </div>
                            
                            <div className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur">
                                <div className="text-4xl mb-4">4️⃣</div>
                                <h3 className="text-xl font-bold mb-3">판매자 확인 후 전송</h3>
                                <p className="text-slate-100">
                                    판매자가 입금을 확인하면 에스크로에서 구매자에게 테더가 자동 전송됩니다
                                </p>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-orange-200/40 bg-orange-500/15 p-6 text-center">
                            <p className="text-lg text-white">
                                ✨ <strong>중간에서 자금을 보호</strong>하여 안전한 거래를 보장합니다!
                            </p>
                        </div>
                    </div>
                </div>

                {/* 거래 방법 */}
                <div className="grid gap-8 mb-12 md:grid-cols-2">
                    {/* 구매 방법 */}
                    <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--sea)] text-white font-bold text-xl">
                                구매
                            </div>
                            <h3 className="font-[var(--font-display)] text-2xl text-slate-900">테더 구매 방법</h3>
                        </div>
                        
                        <ol className="space-y-4 text-slate-700">
                            <li className="flex gap-3">
                                <span className="font-bold text-[color:var(--sea)]">1.</span>
                                <span>원하는 금액과 가격의 판매 주문을 선택합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-[color:var(--sea)]">2.</span>
                                <span>판매자가 에스크로에 테더를 예치할 때까지 대기합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-[color:var(--sea)]">3.</span>
                                <span>판매자 계좌로 원화를 송금합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-[color:var(--sea)]">4.</span>
                                <span>송금 완료 버튼을 클릭합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-[color:var(--sea)]">5.</span>
                                <span>판매자 확인 후 테더가 자동으로 지갑에 입금됩니다</span>
                            </li>
                        </ol>

                        <Link 
                            href="/ko/p2p/buy"
                            className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-[color:var(--sea)] px-6 py-4 text-base font-semibold text-white shadow-[0_18px_40px_-20px_rgba(15,118,110,0.8)] transition hover:brightness-110"
                        >
                            지금 구매하기 →
                        </Link>
                    </div>

                    {/* 판매 방법 */}
                    <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--accent)] text-white font-bold text-xl">
                                판매
                            </div>
                            <h3 className="font-[var(--font-display)] text-2xl text-slate-900">테더 판매 방법</h3>
                        </div>
                        
                        <ol className="space-y-4 text-slate-700">
                            <li className="flex gap-3">
                                <span className="font-bold text-[color:var(--accent)]">1.</span>
                                <span>판매할 테더 수량과 가격을 설정하여 주문을 등록합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-[color:var(--accent)]">2.</span>
                                <span>구매자가 주문을 수락하면 알림을 받습니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-[color:var(--accent)]">3.</span>
                                <span>에스크로 지갑으로 테더를 전송합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-[color:var(--accent)]">4.</span>
                                <span>구매자의 원화 입금을 확인합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-[color:var(--accent)]">5.</span>
                                <span>입금 확인 버튼을 누르면 거래가 완료됩니다</span>
                            </li>
                        </ol>

                        <Link 
                            href="/ko/p2p/sell"
                            className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-[color:var(--accent)] px-6 py-4 text-base font-semibold text-white shadow-[0_18px_40px_-20px_rgba(249,115,22,0.8)] transition hover:brightness-110"
                        >
                            지금 판매하기 →
                        </Link>
                    </div>
                </div>

                {/* FAQ */}
                <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-8 mb-12 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur">
                    <h2 className="font-[var(--font-display)] text-3xl text-center mb-8 text-slate-900">자주 묻는 질문</h2>
                    
                    <div className="space-y-6 max-w-3xl mx-auto">
                        <div className="border-b border-slate-200/70 pb-4">
                            <h4 className="text-lg font-semibold mb-2 text-slate-900">❓ 거래는 안전한가요?</h4>
                            <p className="text-slate-700">
                                네, 에스크로 시스템을 통해 거래 금액을 중간에서 안전하게 보호합니다. 
                                판매자와 구매자 모두 입금 확인 후에만 거래가 완료되므로 안심하고 거래할 수 있습니다.
                            </p>
                        </div>
                        
                        <div className="border-b border-slate-200/70 pb-4">
                            <h4 className="text-lg font-semibold mb-2 text-slate-900">❓ 수수료는 얼마인가요?</h4>
                            <p className="text-slate-700">
                                거래 수수료는 거래 금액의 일정 비율로 부과됩니다. 
                                자세한 수수료 정보는 거래 페이지에서 확인하실 수 있습니다.
                            </p>
                        </div>
                        
                        <div className="border-b border-slate-200/70 pb-4">
                            <h4 className="text-lg font-semibold mb-2 text-slate-900">❓ 거래는 얼마나 걸리나요?</h4>
                            <p className="text-slate-700">
                                일반적으로 구매자의 입금부터 판매자 확인까지 10-30분 정도 소요됩니다. 
                                은행 송금 시간에 따라 다소 차이가 있을 수 있습니다.
                            </p>
                        </div>
                        
                        <div>
                            <h4 className="text-lg font-semibold mb-2 text-slate-900">❓ 분쟁이 발생하면 어떻게 하나요?</h4>
                            <p className="text-slate-700">
                                거래 중 문제가 발생하면 고객센터로 연락주시면 전문 상담원이 신속하게 도와드립니다. 
                                에스크로 시스템으로 자금은 안전하게 보호됩니다.
                            </p>
                        </div>
                    </div>
                </div>

                {/* 최종 CTA */}
                <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(120deg,var(--sea),var(--accent),var(--rose))] p-8 text-center text-white shadow-[0_40px_120px_-60px_rgba(15,23,42,0.8)]">
                    <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.45),transparent_70%)] opacity-60 blur-3xl" />
                    <h2 className="font-[var(--font-display)] text-3xl mb-4">지금 바로 시작하세요!</h2>
                    <p className="text-lg text-white/90 mb-8">
                        개인 간 테더 거래를 쉽고 안전하게
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <Link 
                            href="/ko/p2p/buy"
                            className="w-full sm:w-auto rounded-full bg-white px-8 py-4 text-base font-semibold text-slate-900 shadow-[0_18px_45px_-25px_rgba(15,23,42,0.8)] transition hover:bg-white/90"
                        >
                            구매하기 →
                        </Link>
                        <Link 
                            href="/ko/p2p/sell"
                            className="w-full sm:w-auto rounded-full border border-white/70 px-8 py-4 text-base font-semibold text-white transition hover:bg-white/10"
                        >
                            판매하기 →
                        </Link>
                    </div>
                </div>
            </main>

            <footer className="relative z-10 border-t border-white/10 bg-[#1f1f1f] px-6 py-14 text-center text-slate-200">
                <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
                    <Image
                        src="/logo-orangex.png"
                        alt="OrangeX"
                        width={180}
                        height={56}
                        className="h-10 w-auto"
                    />
                    <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-300">
                        <a href="/terms-of-service" className="hover:text-white">
                            이용약관
                        </a>
                        <span className="text-slate-500">|</span>
                        <a href="/privacy-policy" className="hover:text-white">
                            개인정보처리방침
                        </a>
                    </div>
                    <div className="text-sm text-slate-400">
                        <p>이메일 : help@orangex.center</p>
                        <p>주소 : 14F, Corner St. Paul &amp; Tombs of the Kings, 8046 Pafos, Cyprus</p>
                    </div>
                    <p className="text-sm text-slate-500">Copyright © OrangeX All Rights Reserved</p>
                </div>
            </footer>

            <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
                {chatOpen && (
                    <div
                        id="support-chat"
                        className="w-[320px] max-w-[90vw] overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-[0_30px_70px_-40px_rgba(15,23,42,0.7)] backdrop-blur"
                        role="dialog"
                        aria-label="문의하기 채팅 위젯"
                    >
                        <div className="flex items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold text-slate-900">문의하기</p>
                                <p className="text-xs text-slate-500">평균 응답 2-5분</p>
                            </div>
                            <span className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                상담 가능
                            </span>
                        </div>
                        <div className="space-y-4 px-4 py-4 text-sm text-slate-700">
                            <div className="rounded-xl bg-slate-100/80 px-4 py-3">
                                안녕하세요! OrangeX 상담원입니다. 무엇을 도와드릴까요?
                            </div>
                            <div className="rounded-xl bg-orange-50/70 px-4 py-3 text-orange-900">
                                테더 구매/판매, 입금 확인, 에스크로 문의 모두 가능합니다.
                            </div>
                        </div>
                        <div className="border-t border-slate-200/70 bg-white/85 px-4 py-3">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="메시지를 입력하세요"
                                    className="h-11 flex-1 rounded-full border border-slate-200/80 bg-white px-4 text-sm text-slate-900 outline-none focus:border-orange-300"
                                />
                                <button
                                    type="button"
                                    className="h-11 rounded-full bg-[color:var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[color:var(--accent-deep)]"
                                >
                                    전송
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => setChatOpen((prev) => !prev)}
                    className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/90 px-5 py-3 text-sm font-semibold text-slate-900 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.7)] backdrop-blur transition hover:-translate-y-0.5"
                    aria-expanded={chatOpen}
                    aria-controls="support-chat"
                >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--accent)] text-white">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </span>
                    {chatOpen ? '채팅 닫기' : '문의하기'}
                </button>
            </div>

            {/* 모바일 하단 광고 배너 */}
            <div className="lg:hidden border-t border-slate-200/70 bg-white/85 shadow-[0_-18px_60px_-50px_rgba(15,23,42,0.6)] backdrop-blur">
                <div className="flex flex-col gap-3 p-3">
                    {bannerAds.map((ad) => (
                        <a
                            key={`mobile-${ad.id}`}
                            href={ad.link}
                            className="w-full"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <div className="rounded-2xl border border-white/80 bg-white/70 p-2 shadow-[0_16px_45px_-32px_rgba(15,23,42,0.6)] transition hover:shadow-[0_26px_60px_-36px_rgba(15,23,42,0.6)]">
                                <div className="relative aspect-[2/1] rounded-lg overflow-hidden bg-[#f1eee7]">
                                    <Image
                                        src={ad.image}
                                        alt={ad.title}
                                        fill
                                        sizes="(min-width: 1024px) 224px, 60vw"
                                        className="object-contain"
                                    />
                                </div>
                            </div>
                        </a>
                    ))}
                </div>
            </div>

            <style jsx>{`
                .hero-fade {
                    animation: heroFade 0.9s ease-out both;
                }

                .float-slow {
                    animation: floatSlow 12s ease-in-out infinite;
                }

                .float-slower {
                    animation: floatSlow 16s ease-in-out infinite;
                }

                .ticker {
                    height: 320px;
                }

                .ticker-track {
                    display: flex;
                    flex-direction: column;
                    animation: tickerMove 20s linear infinite;
                    will-change: transform;
                }

                .ticker-group {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .ticker:hover .ticker-track {
                    animation-play-state: paused;
                }

                .seller-ticker {
                    width: 100%;
                }

                .seller-ticker-track {
                    display: flex;
                    gap: 16px;
                    animation: sellerTickerMove 28s linear infinite;
                    will-change: transform;
                }

                .seller-ticker-group {
                    display: flex;
                    gap: 16px;
                }

                .seller-card {
                    flex: 0 0 320px;
                    width: 320px;
                    max-width: 320px;
                }

                .seller-ticker:hover .seller-ticker-track {
                    animation-play-state: paused;
                }

                .banner-scroll {
                    scroll-behavior: smooth;
                    -webkit-overflow-scrolling: touch;
                }

                .promo-text {
                    position: relative;
                    display: inline-block;
                    max-width: 100%;
                    margin-top: 6px;
                    padding: 6px 10px;
                    border-radius: 12px;
                    background: rgba(255, 255, 255, 0.92);
                    border: 1px solid rgba(148, 163, 184, 0.35);
                    box-shadow: 0 10px 24px -18px rgba(15, 23, 42, 0.4);
                }

                .promo-text::before {
                    content: '';
                    position: absolute;
                    left: -8px;
                    top: 6px;
                    border-width: 8px 8px 8px 0;
                    border-style: solid;
                    border-color: transparent rgba(148, 163, 184, 0.35) transparent transparent;
                }

                .promo-text::after {
                    content: '';
                    position: absolute;
                    left: -6px;
                    top: 7px;
                    border-width: 6px 6px 6px 0;
                    border-style: solid;
                    border-color: transparent rgba(255, 255, 255, 0.92) transparent transparent;
                }

                .promo-text-content {
                    display: -webkit-box;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    word-break: break-word;
                }

                .promo-text-label {
                    font-weight: 600;
                    color: #475569;
                }

                .promo-text-message {
                    font-weight: 600;
                    color: #1e293b;
                }

                .banner-scroll::-webkit-scrollbar {
                    height: 8px;
                }

                .banner-scroll::-webkit-scrollbar-thumb {
                    background: rgba(15, 23, 42, 0.2);
                    border-radius: 999px;
                }

                .banner-scroll::-webkit-scrollbar-track {
                    background: transparent;
                }

                .banner-card {
                    scroll-snap-align: center;
                    flex: 0 0 auto;
                }

                @keyframes heroFade {
                    from {
                        opacity: 0;
                        transform: translateY(16px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes floatSlow {
                    0%,
                    100% {
                        transform: translateY(0);
                    }
                    50% {
                        transform: translateY(16px);
                    }
                }

                @keyframes tickerMove {
                    from {
                        transform: translateY(0);
                    }
                    to {
                        transform: translateY(-50%);
                    }
                }

                @keyframes sellerTickerMove {
                    from {
                        transform: translateX(0);
                    }
                    to {
                        transform: translateX(-50%);
                    }
                }

                @media (max-width: 640px) {
                    .ticker {
                        height: 280px;
                    }

                    .seller-card {
                        flex: 0 0 260px;
                        width: 260px;
                        max-width: 260px;
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .ticker-track {
                        animation: none;
                    }
                    .seller-ticker-track {
                        animation: none;
                    }
                    .float-slow,
                    .float-slower,
                    .hero-fade {
                        animation: none;
                    }
                }
            `}</style>
        </div>
    );
}
