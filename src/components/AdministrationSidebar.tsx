'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type AdministrationSidebarProps = {
  lang: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

type MenuItem = {
  label: string;
  hint: string;
  href: string;
  children?: MenuItem[];
};

const buildMenuItems = (lang: string): MenuItem[] => {
  const root = `/${lang}/administration`;
  return [
    { label: '관리자 홈', hint: 'Dashboard', href: root },
    { label: '구매주문 관리', hint: 'P2P', href: `${root}/buyorder-management` },
    { label: '가맹점 결제 관리', hint: 'Payments', href: `${root}/payment-management` },
    { label: '에이전트 관리', hint: 'Agent', href: `${root}/agent-management` },
    {
      label: '가맹점 관리',
      hint: 'Store',
      href: `${root}/store-management`,
      children: [
        { label: '회원 관리', hint: 'Member', href: `${root}/store-management/member-management` },
      ],
    },
    { label: '판매자 관리', hint: 'Seller', href: `${root}/seller-management` },
    { label: '구매자 관리', hint: 'Buyer', href: `${root}/buyer-management` },
    { label: '관리자 관리', hint: 'Admin', href: `${root}/admin-management` },
    { label: '정책 관리', hint: 'Policy', href: `${root}/policy` },
    { label: '공지 관리', hint: 'Notice', href: `${root}/notice` },
    { label: '배너 관리', hint: 'Banner', href: `${root}/banner` },
    { label: '고객센터 설정', hint: 'Support', href: `${root}/support-settings` },
  ];
};

const isActiveRoute = (pathname: string, href: string) => {
  if (href.endsWith('/administration')) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
};

export default function AdministrationSidebar({ lang, isOpen, onOpenChange }: AdministrationSidebarProps) {
  const pathname = usePathname() || '';
  const menuItems = buildMenuItems(lang);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 1024);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) return;
    // Mobile UX: close the drawer only when route/viewport changes.
    onOpenChange(false);
  }, [pathname, isMobileViewport, onOpenChange]);

  const menuContent = (
    <>
      <Link
        href={`/${lang}/administration`}
        className="group rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Control Room</p>
        <h2 className="mt-1 text-base font-bold text-slate-900">Administration</h2>
      </Link>

      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto pr-1">
        {menuItems.map((item) => {
          const isActive = isActiveRoute(pathname, item.href);
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                  isActive
                    ? 'border-slate-300 bg-slate-900 text-white shadow-[0_14px_28px_-20px_rgba(15,23,42,0.65)]'
                    : 'border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-white'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-cyan-300' : 'bg-slate-300 group-hover:bg-slate-400'}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${isActive ? 'text-white' : 'text-slate-800'}`}>
                    {item.label}
                  </span>
                  <span className={`block truncate text-[11px] ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>
                    {item.hint}
                  </span>
                </span>
              </Link>

              {item.children && item.children.length > 0 && (
                <div className="ml-7 mt-1.5 space-y-1">
                  {item.children.map((child) => {
                    const isChildActive = isActiveRoute(pathname, child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`group flex items-center gap-2 rounded-lg border px-2.5 py-2 transition ${
                          isChildActive
                            ? 'border-cyan-200 bg-cyan-50 text-cyan-900'
                            : 'border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isChildActive ? 'bg-cyan-600' : 'bg-slate-300 group-hover:bg-slate-400'
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-xs font-semibold ${isChildActive ? 'text-cyan-900' : 'text-slate-700'}`}>
                            {child.label}
                          </span>
                          <span className={`block truncate text-[10px] ${isChildActive ? 'text-cyan-700' : 'text-slate-500'}`}>
                            {child.hint}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        className="fixed left-3 top-3 z-[60] inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white/90 text-slate-800 shadow-[0_14px_24px_-18px_rgba(15,23,42,0.65)] backdrop-blur transition hover:bg-white lg:hidden"
        aria-label="관리자 메뉴 열기"
      >
        {isOpen ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        className={`fixed top-4 z-[60] hidden h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white/95 text-slate-800 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.6)] transition hover:bg-white lg:inline-flex ${
          isOpen ? 'left-[252px]' : 'left-3'
        }`}
        aria-label="관리자 메뉴 토글"
      >
        {isOpen ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </button>

      {isOpen && (
        <button
          type="button"
          aria-label="관리자 메뉴 닫기"
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-[55] w-[280px] border-r border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.98)_100%)] backdrop-blur transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full w-full flex-col px-4 py-5">
          {menuContent}
        </div>
      </aside>
    </>
  );
}
