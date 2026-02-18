'use client';

import Link from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';

type MenuItem = {
  key: string;
  label: string;
  compactLabel: string;
  description: string;
  basePath: string;
};

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storecode = String(searchParams?.get('storecode') || '').trim();
  const storeQuery = storecode ? `?storecode=${encodeURIComponent(storecode)}` : '';

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/90">P2P Control</p>
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
        <div className="px-4 pb-10 pt-16 lg:px-8 lg:pt-8">{children}</div>
      </div>
    </div>
  );
}
