import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Manrope, Playfair_Display } from 'next/font/google';
import { getActiveGlobalAds, type GlobalAd } from '@/lib/api/globalAd';

export const dynamic = 'force-dynamic';

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

type BannerAd = {
    id: string;
    title: string;
    image: string;
    link: string;
};

const normalizeBannerAds = (ads: GlobalAd[] = []): BannerAd[] =>
    ads
        .map((ad, index) => {
            const image = ad?.image || ad?.imageUrl || ad?.banner || ad?.bannerImage || ad?.bannerUrl;
            const link = ad?.link || ad?.linkUrl || ad?.url || ad?.redirectUrl || ad?.targetUrl;

            if (!image || !link) {
                return null;
            }

            return {
                id: String(ad?._id ?? ad?.id ?? index),
                title: ad?.title || ad?.name || 'Partner Banner',
                image,
                link,
            } as BannerAd;
        })
        .filter(Boolean) as BannerAd[];

const GUIDE_STEPS = [
    {
        title: 'Complete Seller Setup',
        description: 'Register profile and bank details, then complete seller approval.',
        icon: '/icon-manager.png',
        accent: 'bg-amber-400',
    },
    {
        title: 'Verify Escrow Wallet',
        description: 'Check the escrow wallet address and prepare your operating wallet.',
        icon: '/icon-escrow-wallet.png',
        accent: 'bg-emerald-400',
    },
    {
        title: 'Top Up USDT',
        description: 'Fund the escrow wallet with sufficient USDT.',
        icon: '/logo-tether.png',
        accent: 'bg-sky-400',
    },
    {
        title: 'Set Exchange Rate',
        description: 'Set your sell rate using market pricing or a fixed price.',
        icon: '/icon-exchange-rate.png',
        accent: 'bg-orange-400',
    },
    {
        title: 'Confirm Deposit',
        description: 'Verify the buyer\'s deposit details and depositor name.',
        icon: '/icon-bank-check.png',
        accent: 'bg-rose-400',
    },
    {
        title: 'Settlement Complete',
        description: 'After deposit confirmation, USDT is transferred and settled automatically.',
        icon: '/icon-settlement-completed.png',
        accent: 'bg-slate-400',
    },
];

const SAFETY_CHECKS = [
    {
        title: 'Maintain Escrow Balance',
        description: 'Sufficient balance is required for smooth order allocation.',
        icon: '/icon-escrow.png',
    },
    {
        title: 'Check Depositor Name & Amount',
        description: 'Always verify depositor name and amount.',
        icon: '/icon-bank-check.png',
    },
    {
        title: 'Review Rate & Visibility Status',
        description: 'Regularly check your rate settings and listing visibility.',
        icon: '/icon-exchange-rate.png',
    },
    {
        title: 'Watch for Off-Platform Contact Requests',
        description: 'It is safest to keep transactions inside the platform.',
        icon: '/icon-shield.png',
    },
];

const FAQS = [
    {
        question: 'How much escrow balance is needed?',
        answer: 'You should keep USDT balance well above your sell volume for smooth order allocation.',
    },
    {
        question: 'Can I change the exchange rate anytime?',
        answer: 'It is recommended to change rates when no trade is in progress. The new rate is applied after update.',
    },
    {
        question: 'How do I confirm a deposit?',
        answer: 'On the trade screen, verify depositor name and amount, then confirm deposit.',
    },
    {
        question: 'What if there is a dispute or cancellation request?',
        answer: 'Check the trade status and contact customer support chat immediately.',
    },
];

export default async function SellerGuidePage({ params }: { params: { lang?: string } }) {
    const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang ?? 'ko';
    let bannerAds: BannerAd[] = [];

    try {
        const ads = await getActiveGlobalAds({ placement: 'seller-guide', limit: 12 });
        bannerAds = normalizeBannerAds(ads as GlobalAd[]);
    } catch (error) {
        bannerAds = [];
    }

    return (
        <div
            className={`${bodyFont.variable} ${displayFont.variable} relative min-h-screen overflow-hidden bg-[linear-gradient(160deg,#fff7ed_0%,#f0f9ff_45%,#fff1f2_85%)] text-slate-900 font-[var(--font-body)]`}
            style={
                {
                    '--accent': '#ff7a1a',
                    '--accent-deep': '#ea580c',
                    '--sea': '#0ea5e9',
                    '--ink': '#1c1917',
                } as CSSProperties
            }
        >
            <div className="pointer-events-none absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,var(--accent)_0%,transparent_70%)] opacity-30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,var(--sea)_0%,transparent_70%)] opacity-25 blur-3xl" />
            <div className="pointer-events-none absolute left-[10%] top-[16%] h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.35),transparent_70%)] opacity-30 blur-3xl" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:18px_18px] opacity-20" />

            <main className="container relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-10">
                <header className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-8 shadow-[0_35px_100px_-60px_rgba(15,23,42,0.6)] backdrop-blur">
                    <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,var(--accent)_0%,transparent_70%)] opacity-30" />
                    <div className="absolute -bottom-16 left-[-12%] h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,var(--sea)_0%,transparent_70%)] opacity-25" />

                    <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-5">
                            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/70 bg-orange-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
                                Seller Manual
                            </div>
                            <div className="flex items-center gap-3">
                                <Image
                                    src="/logo-orangex.png"
                                    alt="OrangeX"
                                    width={140}
                                    height={44}
                                    className="h-10 w-auto"
                                />
                                <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-500">
                                    For Sellers
                                </span>
                            </div>
                            <h1 className="font-[var(--font-display)] text-3xl text-[color:var(--ink)] sm:text-4xl">
                                Seller Guide
                            </h1>
                            <p className="max-w-xl text-base text-slate-600">
                                This guide covers core seller workflow and deposit-confirmation steps. Please review before you start.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Link
                                    href={`/${lang}/p2p/seller-settings`}
                                    className="inline-flex items-center justify-center rounded-full bg-[color:var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-[0_20px_45px_-22px_rgba(249,115,22,0.85)] transition hover:bg-[color:var(--accent-deep)]"
                                >
                                    Go to Seller Settings
                                </Link>
                                <Link
                                    href={`/${lang}/p2p`}
                                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/90 px-6 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-white"
                                >
                                    Back to P2P Home
                                </Link>
                            </div>
                        </div>

                        <div className="w-full max-w-sm rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)]">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                                    Quick Check
                                </span>
                                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                                    Operations Check
                                </span>
                            </div>
                            <ul className="mt-4 space-y-3 text-sm text-slate-700">
                                <li className="flex items-start gap-3">
                                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                                    Keep escrow balance sufficiently funded
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                                    Regularly review exchange rate and promo message
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                                    Accurately verify depositor name and deposit amount
                                </li>
                            </ul>
                            <div className="mt-5 rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-xs font-semibold text-amber-700">
                                If deposit confirmation is delayed, a message is sent to the buyer.
                            </div>
                        </div>
                    </div>
                </header>

                {bannerAds.length > 0 && (
                    <section className="mt-10">
                        <div className="rounded-[26px] border border-slate-200/70 bg-white/80 p-6 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.6)] backdrop-blur">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <path
                                                d="M12 3l2.4 5 5.6.8-4 3.8.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.8 5.6-.8L12 3z"
                                                stroke="currentColor"
                                                strokeWidth="1.6"
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                                            Partner
                                        </p>
                                        <h2 className="font-[var(--font-display)] text-2xl text-slate-900">
                                            Seller Partner Banners
                                        </h2>
                                        <p className="mt-1 text-sm text-slate-600">
                                            Explore partner resources that help your seller operations.
                                        </p>
                                    </div>
                                </div>
                                <span className="text-xs font-semibold text-slate-500">Swipe Left/Right</span>
                            </div>

                            <div
                                className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 scrollbar-hide"
                                aria-label="Seller partner banners"
                            >
                                {bannerAds.map((ad) => (
                                    <a
                                        key={ad.id}
                                        href={ad.link}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="shrink-0 snap-start"
                                        aria-label={ad.title}
                                    >
                                        <div className="w-[70vw] max-w-[260px] overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_18px_40px_-30px_rgba(15,23,42,0.5)] sm:w-64">
                                            <div className="aspect-[2/1] overflow-hidden bg-slate-100">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={ad.image} alt={ad.title} className="h-full w-full object-cover" />
                                            </div>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                <section className="mt-12">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/90 text-white shadow-sm">
                            <Image
                                src="/icon-store.png"
                                alt="Seller Flow"
                                width={22}
                                height={22}
                                className="h-5 w-5"
                            />
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Flow</p>
                            <h2 className="font-[var(--font-display)] text-2xl text-slate-900 sm:text-3xl">
                                Seller Operations Flow
                            </h2>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                        {GUIDE_STEPS.map((step, index) => (
                            <div
                                key={step.title}
                                className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.4)]"
                            >
                                <span className={`absolute left-0 top-0 h-full w-1.5 ${step.accent}`} />
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                                            <Image
                                                src={step.icon}
                                                alt={step.title}
                                                width={28}
                                                height={28}
                                                className="h-6 w-6"
                                            />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                Step {String(index + 1).padStart(2, '0')}
                                            </p>
                                            <p className="text-base font-semibold text-slate-900">{step.title}</p>
                                        </div>
                                    </div>
                                    <span className="text-xs font-semibold text-slate-400">Seller</span>
                                </div>
                                <p className="mt-4 text-sm text-slate-600">{step.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)]">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                                <Image
                                    src="/icon-shield.png"
                                    alt="Safety"
                                    width={22}
                                    height={22}
                                    className="h-5 w-5"
                                />
                            </div>
                            <h3 className="font-[var(--font-display)] text-2xl text-slate-900">Operations Checklist</h3>
                        </div>
                        <div className="mt-5 space-y-4">
                            {SAFETY_CHECKS.map((item) => (
                                <div
                                    key={item.title}
                                    className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4"
                                >
                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                                        <Image
                                            src={item.icon}
                                            alt={item.title}
                                            width={20}
                                            height={20}
                                            className="h-5 w-5"
                                        />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                                        <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)]">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                                <Image
                                    src="/icon-memo.png"
                                    alt="Summary"
                                    width={22}
                                    height={22}
                                    className="h-5 w-5"
                                />
                            </div>
                            <h3 className="font-[var(--font-display)] text-2xl text-slate-900">Seller Key Summary</h3>
                        </div>
                        <div className="mt-5 space-y-4 text-sm text-slate-700">
                            <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3">
                                Consistently manage escrow balance and exchange rates.
                            </div>
                            <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3">
                                Deposit confirmation is critical to transaction trust.
                            </div>
                            <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3">
                                Regularly check automation settings and notifications.
                            </div>
                            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-emerald-700">
                                If an issue occurs, contact customer support chat immediately.
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mt-12">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/90 text-white shadow-sm">
                            <Image
                                src="/icon-info.png"
                                alt="FAQ"
                                width={22}
                                height={22}
                                className="h-5 w-5"
                            />
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">FAQ</p>
                            <h2 className="font-[var(--font-display)] text-2xl text-slate-900 sm:text-3xl">
                                Frequently Asked Questions
                            </h2>
                        </div>
                    </div>
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                        {FAQS.map((item) => (
                            <div
                                key={item.question}
                                className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.4)]"
                            >
                                <p className="text-sm font-semibold text-slate-900">{item.question}</p>
                                <p className="mt-2 text-xs text-slate-600">{item.answer}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mt-12">
                    <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(120deg,var(--sea),var(--accent),#fb7185)] p-8 text-white shadow-[0_40px_120px_-60px_rgba(15,23,42,0.8)]">
                        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
                        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/80">
                                    Ready
                                </p>
                                <h2 className="mt-2 font-[var(--font-display)] text-2xl sm:text-3xl">
                                    Ready to sell? Start now.
                                </h2>
                                <p className="mt-3 text-sm text-white/80">
                                    If seller setup and escrow funding are complete, you are ready to start selling.
                                </p>
                            </div>
                            <Link
                                href={`/${lang}/p2p/seller-settings`}
                                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-[0_20px_45px_-25px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5"
                            >
                                Open Seller Settings
                            </Link>
                        </div>
                    </div>
                </section>
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
                        <Link href={`/${lang}/terms-of-service`} className="hover:text-white">
                            Terms of Service
                        </Link>
                        <span className="text-slate-500">|</span>
                        <Link href={`/${lang}/privacy-policy`} className="hover:text-white">
                            Privacy Policy
                        </Link>
                        <span className="text-slate-500">|</span>
                        <Link href={`/${lang}/refund-policy`} className="hover:text-white">
                            Refund & Dispute Policy
                        </Link>
                    </div>
                    <p className="max-w-2xl text-xs leading-relaxed text-slate-400">
                        Risk notice: Crypto payments involve risks such as price volatility and network delays.
                        Please review fees, exchange rates, and settlement terms before payment.
                    </p>
                    <div className="text-sm text-slate-400">
                        <p>Email: help@orangex.center</p>
                        <p>Address: 14F, Corner St. Paul &amp; Tombs of the Kings, 8046 Pafos, Cyprus</p>
                    </div>
                    <p className="text-sm text-slate-500">Copyright © OrangeX All Rights Reserved</p>
                </div>
            </footer>
        </div>
    );
}
