'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type WalletManagementBottomNavProps = {
  lang: string;
  active: 'home' | 'wallet' | 'payment' | 'buy' | 'token';
};

const NAV_ITEMS: Array<{
  key: 'home' | 'wallet' | 'payment' | 'buy' | 'token';
  label: string;
  href: (lang: string) => string;
  icon: JSX.Element;
}> = [
  {
    key: 'home',
    label: '홈',
    href: (lang) => `/${lang}/wallet-management`,
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'token',
    label: '토큰',
    href: (lang) => `/${lang}/wallet-management/token-studio`,
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="7.5" />
        <path d="M12 7v10M8.75 9.5c.4-1.1 1.6-1.9 3.25-1.9 1.9 0 3.25 1.03 3.25 2.45 0 1.28-1.05 1.95-2.62 2.27l-1.26.26c-1.26.25-2.12.75-2.12 1.83 0 1.35 1.2 2.29 3 2.29 1.63 0 2.86-.7 3.37-1.9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'wallet',
    label: '지갑',
    href: (lang) => `/${lang}/wallet-management/wallet-usdt`,
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 5v14m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="4" y="3" width="16" height="6" rx="2" />
      </svg>
    ),
  },
  {
    key: 'payment',
    label: '결제',
    href: (lang) => `/${lang}/wallet-management/payment-usdt`,
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M7 9h10M7 13h5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'buy',
    label: '구매',
    href: (lang) => `/${lang}/wallet-management/buy-usdt`,
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 15.5 10 11.5l2.5 2.5L18 8.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 8.5h3v3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
      </svg>
    ),
  },
];

export default function WalletManagementBottomNav({
  lang,
  active,
}: WalletManagementBottomNavProps) {
  const searchParams = useSearchParams();
  const storecode = String(searchParams?.get('storecode') || '').trim();
  const seller = String(searchParams?.get('seller') || '').trim();
  const memberIdFromQuery = String(searchParams?.get('mb_id') || '').trim().slice(0, 24);
  const amountKrwFromQuery = String(searchParams?.get('amount_krw') || '').trim().replace(/,/g, '').replace(/[^\d]/g, '');
  const productIdFromQuery = String(searchParams?.get('product_id') || '').trim().slice(0, 120);
  const [hasValidStoreInfo, setHasValidStoreInfo] = useState(false);

  useEffect(() => {
    let activeRequest = true;

    if (!storecode) {
      setHasValidStoreInfo(false);
      return () => {
        activeRequest = false;
      };
    }

    const checkStorecode = async () => {
      try {
        const response = await fetch('/api/store/getOneStore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ storecode }),
        });
        const payload = await response.json().catch(() => ({}));
        const hasResult = Boolean(
          response.ok &&
            payload &&
            typeof payload === 'object' &&
            !Array.isArray(payload) &&
            (payload as Record<string, unknown>).result &&
            typeof (payload as Record<string, unknown>).result === 'object',
        );

        if (activeRequest) {
          setHasValidStoreInfo(hasResult);
        }
      } catch (error) {
        console.error('Failed to verify storecode for bottom nav', error);
        if (activeRequest) {
          setHasValidStoreInfo(false);
        }
      }
    };

    checkStorecode();

    return () => {
      activeRequest = false;
    };
  }, [storecode]);

  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => !(item.key === 'wallet' && hasValidStoreInfo)),
    [hasValidStoreInfo],
  );
  const orderedNavItems = useMemo(() => {
    const priority: Record<WalletManagementBottomNavProps['active'], number> = {
      home: 0,
      token: 1,
      payment: 2,
      buy: 3,
      wallet: 4,
    };

    return [...visibleNavItems].sort((a, b) => priority[a.key] - priority[b.key]);
  }, [visibleNavItems]);
  const navGridColsClass =
    orderedNavItems.length >= 5 ? 'grid-cols-6' : orderedNavItems.length >= 4 ? 'grid-cols-5' : 'grid-cols-4';

  const withQuery = (href: string, navKey: 'home' | 'wallet' | 'payment' | 'buy' | 'token') => {
    const query = new URLSearchParams();
    if (storecode) {
      query.set('storecode', storecode);
    }
    if (memberIdFromQuery) {
      query.set('mb_id', memberIdFromQuery);
    }
    if (amountKrwFromQuery) {
      query.set('amount_krw', amountKrwFromQuery);
    }
    if (productIdFromQuery) {
      query.set('product_id', productIdFromQuery);
    }
    if (navKey === 'buy' && seller) {
      query.set('seller', seller);
    }
    const queryString = query.toString();
    if (!queryString) return href;
    return `${href}?${queryString}`;
  };

  return (
    <nav className="pointer-events-none fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 px-3 pb-[calc(env(safe-area-inset-bottom)+0.8rem)] pt-3">
      <div className="pointer-events-auto mx-auto rounded-[30px] border border-slate-200/80 bg-white/88 p-2 shadow-[0_26px_60px_-34px_rgba(15,23,42,0.38)] backdrop-blur-xl">
        <div className={`grid w-full items-end gap-2 ${navGridColsClass}`}>
        {orderedNavItems.map((item) => {
          const isActive = item.key === active;
          const isPayment = item.key === 'payment';
          return (
            <Link
              key={item.key}
              href={withQuery(item.href(lang), item.key)}
              className={`group relative flex min-w-0 flex-col items-center justify-center overflow-hidden transition ${
                isPayment
                  ? `col-span-2 min-h-[74px] rounded-[24px] px-4 py-3 text-white shadow-[0_22px_44px_-24px_rgba(8,47,73,0.9)] ${
                      isActive
                        ? '-translate-y-3 bg-[linear-gradient(135deg,#0f766e_0%,#155e75_42%,#0f172a_100%)]'
                        : '-translate-y-2 bg-[linear-gradient(135deg,#0891b2_0%,#0f766e_42%,#0f172a_100%)]'
                    }`
                  : `min-h-[60px] rounded-[20px] border px-2.5 py-2.5 ${
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white shadow-[0_16px_30px_-22px_rgba(15,23,42,0.9)]'
                        : 'border-slate-200 bg-slate-50/90 text-slate-600'
                    }`
              }`}
            >
              {isPayment && (
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/30" />
              )}
              <span
                className={`flex items-center justify-center ${
                  isPayment
                    ? 'h-9 w-9 rounded-full bg-white/14 text-white ring-1 ring-white/20'
                    : isActive
                      ? 'text-white'
                      : 'text-slate-500 transition group-hover:text-slate-700'
                }`}
              >
                {item.icon}
              </span>
              <span
                className={`mt-1.5 text-center font-semibold leading-none ${
                  isPayment
                    ? 'text-base tracking-tight'
                    : 'text-[11px] tracking-[-0.01em]'
                }`}
              >
                {item.label}
              </span>
              {isPayment && (
                <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-cyan-50/85">
                  Quick Pay
                </span>
              )}
            </Link>
          );
        })}
        </div>
      </div>
    </nav>
  );
}
