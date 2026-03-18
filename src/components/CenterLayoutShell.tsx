'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import CenterSidebar from '@/components/CenterSidebar';
import {
  buildCenterShellMenuItems,
  shortWalletAddress,
  type CenterRouteAccessLevel,
  type CenterShellMenuItem,
} from '@/components/center/centerShellMenu';

type CenterLayoutShellProps = {
  lang: string;
  center: string;
  children: ReactNode;
  storeName?: string;
  storeLogo?: string;
  memberNickname?: string;
  walletAddress?: string;
  roleLabel?: string;
  routeAccessLevel?: CenterRouteAccessLevel;
};

const isActiveRoute = (pathname: string, href: string) => {
  if (href === pathname) return true;
  return pathname.startsWith(`${href}/`);
};

export default function CenterLayoutShell({
  lang,
  center,
  children,
  storeName,
  storeLogo,
  memberNickname,
  walletAddress,
  roleLabel,
  routeAccessLevel,
}: CenterLayoutShellProps) {
  const pathname = (usePathname() || '').replace(/\/+$/, '');
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const useTopManagerNav = routeAccessLevel === 'center_admin';
  const profileSettingsPath = `/${lang}/${center}/profile-settings`;
  const registrationPath = `/${lang}/${center}/profiles`;
  const hideSidebarNavigation =
    !useTopManagerNav && (pathname === profileSettingsPath || pathname === registrationPath);
  const managerWalletManagementPath = `/${lang}/${center}/manager-wallet-management`;
  const menuItems = buildCenterShellMenuItems(lang, center);
  const walletManagementHref =
    useTopManagerNav
      ? `${managerWalletManagementPath}?returnTo=${encodeURIComponent(pathname || `/${lang}/${center}/member`)}`
      : menuItems.find((item) => item.key === 'wallet-management')?.href || `/${lang}/${center}/wallet-management`;
  const managerTopNavItems: CenterShellMenuItem[] = [
    { key: 'member', label: '회원관리', hint: 'Members', href: `/${lang}/${center}/member`, accessLevel: 'center_admin' },
    { key: 'buyorder', label: 'P2P구매관리', hint: 'Buyorder', href: `/${lang}/${center}/buyorder`, accessLevel: 'center_admin' },
    { key: 'trade-history', label: '거래내역', hint: 'History', href: `/${lang}/${center}/trade-history`, accessLevel: 'center_admin' },
    { key: 'daily-close', label: '통계(일별)', hint: 'Daily Stats', href: `/${lang}/${center}/daily-close`, accessLevel: 'center_admin' },
  ];
  const brandTitle = (storeName || center || 'Center').trim();
  const brandInitial = brandTitle.slice(0, 1).toUpperCase() || 'C';
  const normalizedStoreLogo = String(storeLogo || '').trim();
  const isManagerWalletPage = isActiveRoute(pathname, managerWalletManagementPath);

  useEffect(() => {
    const updateViewport = () => {
      const nextIsMobile = window.innerWidth < 1024;
      setIsMobileViewport(nextIsMobile);
      setIsSidebarOpen((previous) => (nextIsMobile ? previous : true));
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (useTopManagerNav) {
      document.body.style.overflow = '';
      return;
    }

    if (!isMobileViewport) {
      document.body.style.overflow = '';
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = isSidebarOpen ? 'hidden' : '';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileViewport, isSidebarOpen, useTopManagerNav]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef6ff_0%,#e5efff_45%,#f8fbff_100%)] text-slate-900">
      {!useTopManagerNav && !hideSidebarNavigation && (
        <>
          <button
            type="button"
            onClick={() => setIsSidebarOpen((previous) => !previous)}
            className="fixed left-3 top-[calc(env(safe-area-inset-top)+0.6rem)] z-[60] inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white/95 px-3 text-xs font-semibold text-slate-700 shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] backdrop-blur transition hover:border-cyan-300 hover:text-slate-900 lg:hidden"
          >
            {isSidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
          </button>

          <CenterSidebar
            lang={lang}
            center={center}
            isOpen={isMobileViewport ? isSidebarOpen : true}
            onOpenChange={setIsSidebarOpen}
            isMobileViewport={isMobileViewport}
            storeName={storeName}
            storeLogo={storeLogo}
            memberNickname={memberNickname}
            walletAddress={walletAddress}
            roleLabel={roleLabel}
          />
        </>
      )}

      {useTopManagerNav && (
        <header className="sticky top-0 z-50 border-b border-slate-900/70 bg-[linear-gradient(180deg,rgba(7,17,31,0.98)_0%,rgba(15,29,52,0.96)_100%)] shadow-[0_24px_54px_-36px_rgba(2,6,23,0.85)] backdrop-blur">
          <div className="mx-auto w-full max-w-[1680px] px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-4 lg:px-8">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-cyan-200/20 bg-[radial-gradient(circle_at_top,#ecfeff_0%,#67e8f9_38%,#0f172a_100%)] text-sm font-black text-slate-950 shadow-[0_16px_34px_-24px_rgba(34,211,238,0.7)]">
                    {normalizedStoreLogo ? (
                      <span
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${encodeURI(normalizedStoreLogo)})` }}
                        aria-label={`${brandTitle} logo`}
                      />
                    ) : (
                      brandInitial
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/85">Center Manager</p>
                    <p className="truncate text-base font-black text-white sm:text-lg">{brandTitle}</p>
                    <p className="truncate text-[11px] text-slate-300">
                      {memberNickname || '회원 정보 확인 중'} · {roleLabel || '권한 확인 중'}
                    </p>
                  </div>
                </div>

                <Link
                  href={walletManagementHref}
                  className={`inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition ${
                    isManagerWalletPage
                      ? 'border-[#f6bf18]/60 bg-[#f6bf18] text-[#113d86] shadow-[0_18px_34px_-24px_rgba(246,191,24,0.88)]'
                      : 'border-cyan-200/20 bg-white/10 text-cyan-50 hover:border-cyan-200/30 hover:bg-white/14'
                  }`}
                >
                  <span>내 지갑 관리</span>
                  <span
                    className={`rounded-full px-2 py-1 font-mono text-[11px] ${
                      isManagerWalletPage ? 'bg-[#113d86]/10 text-[#113d86]' : 'bg-white/10 text-cyan-100/90'
                    }`}
                  >
                    {shortWalletAddress(walletAddress || '')}
                  </span>
                </Link>
              </div>

              <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <nav className="flex min-w-max items-center gap-2">
                  {managerTopNavItems.map((item) => {
                    const active = isActiveRoute(pathname, item.href);

                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={`inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-semibold shadow-sm transition ${
                          active
                            ? 'bg-[#f6bf18] text-[#113d86] shadow-[0_16px_32px_-20px_rgba(246,191,24,0.9)]'
                            : 'bg-[#0f4aa4] text-[#eff6ff] hover:bg-[#1658bf]'
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>
          </div>
        </header>
      )}

      <div className={`min-h-screen ${useTopManagerNav || hideSidebarNavigation ? '' : 'lg:pl-[304px]'}`}>
        <div className={`center-shell-legacy-content px-3 pb-12 ${useTopManagerNav ? 'pt-4 sm:px-4 lg:px-8' : 'pt-16 sm:px-4 lg:px-8 lg:pt-8'}`}>
          <div className="mx-auto w-full max-w-[1680px]">{children}</div>
        </div>
      </div>

      <style jsx global>{`
        .center-shell-legacy-content .MuiAppBar-root {
          display: none !important;
        }

        .center-shell-legacy-content [data-test='connect-wallet-button'],
        .center-shell-legacy-content .tw-connect-wallet {
          display: none !important;
        }

        .center-shell-legacy-content > main {
          max-width: 100% !important;
          padding-top: 0 !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
        }

        .center-shell-legacy-content > main > div > .MuiAppBar-root + div {
          display: none !important;
        }

        .center-shell-legacy-content > main > div > div[class*='justify-between'][class*='rounded-lg'][class*='mb-4'] {
          display: none !important;
        }

        .center-shell-legacy-content > main > div > div:first-child > div[class*='justify-between'][class*='rounded-lg'][class*='mb-4'] {
          display: none !important;
        }

        .center-shell-legacy-content > main > div > div[class*='grid-cols-2'][class*='mb-4'] {
          display: none !important;
        }

        .center-shell-legacy-content > main > div > div:first-child > div[class*='grid-cols-2'][class*='mb-4'] {
          display: none !important;
        }

        .center-shell-legacy-content .container {
          max-width: 100% !important;
        }

        .center-shell-legacy-content .overflow-x-auto {
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
        }
      `}</style>
    </div>
  );
}
