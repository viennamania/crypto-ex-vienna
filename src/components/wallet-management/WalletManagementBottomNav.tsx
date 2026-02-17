'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type WalletManagementBottomNavProps = {
  lang: string;
  active: 'home' | 'wallet' | 'payment' | 'buy';
};

const NAV_ITEMS: Array<{
  key: 'home' | 'wallet' | 'payment' | 'buy';
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

  const withQuery = (href: string, navKey: 'home' | 'wallet' | 'payment' | 'buy') => {
    const query = new URLSearchParams();
    if (storecode) {
      query.set('storecode', storecode);
    }
    if (navKey === 'buy' && seller) {
      query.set('seller', seller);
    }
    const queryString = query.toString();
    if (!queryString) return href;
    return `${href}?${queryString}`;
  };

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur">
      <div className="mx-auto flex w-full items-center gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={withQuery(item.href(lang), item.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
