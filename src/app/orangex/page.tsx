'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
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

const RECENT_TRADES = [
    { id: 1, side: 'buy', user: 'mango***', amount: '12,500 USDT', price: '1,342 KRW', time: '방금' },
    { id: 2, side: 'sell', user: 'river***', amount: '8,200 USDT', price: '1,340 KRW', time: '1분 전' },
    { id: 3, side: 'buy', user: 'star***', amount: '25,000 USDT', price: '1,345 KRW', time: '3분 전' },
    { id: 4, side: 'sell', user: 'mint***', amount: '6,400 USDT', price: '1,339 KRW', time: '5분 전' },
    { id: 5, side: 'buy', user: 'cloud***', amount: '18,750 USDT', price: '1,343 KRW', time: '7분 전' },
    { id: 6, side: 'sell', user: 'luna***', amount: '9,900 USDT', price: '1,341 KRW', time: '10분 전' },
    { id: 7, side: 'buy', user: 'zero***', amount: '30,000 USDT', price: '1,346 KRW', time: '12분 전' },
    { id: 8, side: 'sell', user: 'nova***', amount: '7,300 USDT', price: '1,338 KRW', time: '15분 전' },
    { id: 9, side: 'buy', user: 'olive***', amount: '14,600 USDT', price: '1,344 KRW', time: '18분 전' },
    { id: 10, side: 'sell', user: 'stone***', amount: '11,200 USDT', price: '1,340 KRW', time: '22분 전' },
];

const TRADE_STYLES = {
    buy: {
        label: '구매',
        badge: 'border-emerald-200/80 bg-emerald-500/10 text-emerald-700',
        accent: 'bg-[linear-gradient(180deg,#10b981,#14b8a6)]',
        glow: 'bg-emerald-400/25',
    },
    sell: {
        label: '판매',
        badge: 'border-orange-200/80 bg-orange-500/10 text-orange-700',
        accent: 'bg-[linear-gradient(180deg,#f97316,#f59e0b)]',
        glow: 'bg-orange-400/25',
    },
} as const;

const numberFormatter = new Intl.NumberFormat('ko-KR');
const formatKrw = (value: number | null) =>
    value === null ? '--' : `₩${numberFormatter.format(value)}`;

export default function OrangeXPage() {
    const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
    const [animatedStats, setAnimatedStats] = useState(() => STAT_ITEMS.map(() => 0));
    const [chatOpen, setChatOpen] = useState(false);
    const [marketTickers, setMarketTickers] = useState<MarketTicker[]>(() => MARKET_SOURCES);
    const [tickerUpdatedAt, setTickerUpdatedAt] = useState<string | null>(null);
    const [tickerError, setTickerError] = useState<string | null>(null);

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

    return (
        <div
            className={`${bodyFont.variable} ${displayFont.variable} relative min-h-screen overflow-hidden bg-[color:var(--paper)] text-[color:var(--ink)] font-[var(--font-body)]`}
            style={{
                '--paper': '#f8f4ee',
                '--ink': '#1c1917',
                '--accent': '#f97316',
                '--accent-deep': '#c2410c',
                '--sea': '#0f766e',
                '--mist': '#e2e8f0',
            } as React.CSSProperties}
        >
            <div className="pointer-events-none absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,var(--accent)_0%,transparent_70%)] opacity-35 blur-3xl float-slow" />
            <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,var(--sea)_0%,transparent_70%)] opacity-30 blur-3xl float-slower" />
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
                            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/70 bg-orange-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
                                USDT · P2P · Escrow
                            </div>
                            <h1 className="font-[var(--font-display)] text-4xl leading-tight text-[color:var(--ink)] md:text-6xl">
                                OrangeX 테더 P2P 마켓
                            </h1>
                            <p className="text-lg text-slate-700 md:text-xl">
                                개인 간 테더(USDT) 구매·판매를 안전하게 연결합니다
                            </p>

                            <div className="flex flex-col gap-4 sm:flex-row">
                                <Link
                                    href="/ko/buyer/buyorder"
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
                                    href="/ko/seller/buyorder"
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

                <div className="grid gap-6 mb-12 md:grid-cols-2">
                    {STAT_ITEMS.map((item, index) => (
                        <div
                            key={item.label}
                            className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur"
                        >
                            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.3),transparent_70%)] opacity-40" />
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                            <div className="mt-4 flex items-baseline gap-3">
                                <span className="font-[var(--font-display)] text-4xl text-slate-900 tabular-nums md:text-5xl">
                                    {numberFormatter.format(animatedStats[index])}
                                </span>
                                <span className="text-sm font-semibold text-slate-500">{item.suffix}</span>
                            </div>
                            <p className="mt-3 text-sm text-slate-600">실시간 누적 지표를 반영합니다</p>
                        </div>
                    ))}
                </div>

                <div className="rounded-[28px] border border-slate-200/70 bg-white/80 p-8 mb-12 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.7)] backdrop-blur">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div>
                            <h2 className="font-[var(--font-display)] text-3xl text-slate-900">USDT/KRW 실시간 시세</h2>
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
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                                {style.label}
                                            </p>
                                            <p className="text-lg font-semibold text-slate-900">{ticker.name}</p>
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
                            <h2 className="font-[var(--font-display)] text-3xl text-slate-900">최근 거래내역</h2>
                            <p className="text-sm text-slate-600">최근 10건이 순환 표시됩니다</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
                            <span className="inline-flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                구매
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-orange-500" />
                                판매
                            </span>
                        </div>
                    </div>

                    <div className="ticker relative overflow-hidden">
                        <div className="ticker-track">
                            {[0, 1].map((loopIndex) => (
                                <div key={`trade-loop-${loopIndex}`} className="ticker-group">
                                    {RECENT_TRADES.map((trade) => {
                                        const style = TRADE_STYLES[trade.side];
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
                                                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${style.badge}`}>
                                                    {style.label}
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
                            href="/ko/buyer/buyorder"
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
                            href="/ko/seller/buyorder"
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
                <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(120deg,var(--sea),var(--accent))] p-8 text-center text-white shadow-[0_40px_120px_-60px_rgba(15,23,42,0.8)]">
                    <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.45),transparent_70%)] opacity-60 blur-3xl" />
                    <h2 className="font-[var(--font-display)] text-3xl mb-4">지금 바로 시작하세요!</h2>
                    <p className="text-lg text-white/90 mb-8">
                        개인 간 테더 거래를 쉽고 안전하게
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <Link 
                            href="/ko/buyer/buyorder"
                            className="w-full sm:w-auto rounded-full bg-white px-8 py-4 text-base font-semibold text-slate-900 shadow-[0_18px_45px_-25px_rgba(15,23,42,0.8)] transition hover:bg-white/90"
                        >
                            구매하기 →
                        </Link>
                        <Link 
                            href="/ko/seller/buyorder"
                            className="w-full sm:w-auto rounded-full border border-white/70 px-8 py-4 text-base font-semibold text-white transition hover:bg-white/10"
                        >
                            판매하기 →
                        </Link>
                    </div>
                </div>
            </main>

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

                @media (max-width: 640px) {
                    .ticker {
                        height: 280px;
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .ticker-track {
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
