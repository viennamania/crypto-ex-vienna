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
  subItems?: MenuItem[];
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

  return (
    <svg viewBox="0 0 24 24" fill="none" className={`h-[18px] w-[18px] ${iconClass}`} aria-hidden="true">
      <path d="M4.5 7.5h15M4.5 12h15M4.5 16.5h8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17.5 14.8 20.5 12l-3-2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
};

export default function P2PAgentManagementLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ lang: string }>();
  const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko';
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();
  const agentQuery = agentcode ? `?agentcode=${encodeURIComponent(agentcode)}` : '';
  const p2pHomeHref = `/${lang}/p2p${agentQuery}`;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuItems = useMemo<MenuItem[]>(
    () => [
      {
        key: 'home',
        label: '홈 대시보드',
        compactLabel: '홈',
        description: '에이전트 종합 현황',
        basePath: `/${lang}/p2p/agent-management`,
      },
      {
        key: 'payment-dashboard',
        label: '결제 관리',
        compactLabel: '결제',
        description: '결제 대시보드',
        basePath: `/${lang}/p2p/agent-management/payment-dashboard`,
        subItems: [
          {
            key: 'store',
            label: '가맹점 관리',
            compactLabel: '가맹점',
            description: '가맹점 목록',
            basePath: `/${lang}/p2p/agent-management/store-management`,
          },
          {
            key: 'store-member',
            label: '가맹점 회원 관리',
            compactLabel: '회원',
            description: '가맹점 회원',
            basePath: `/${lang}/p2p/agent-management/store-member-management`,
          },
          {
            key: 'payment',
            label: '가맹점 결제 관리',
            compactLabel: '결제',
            description: '결제 확정 거래',
            basePath: `/${lang}/p2p/agent-management/payment-management`,
          },
        ],
      },
    ],
    [lang],
  );

  const desktopSidebarWidthClass = collapsed ? 'lg:pl-[98px]' : 'lg:pl-[292px]';
  const desktopSidebarClass = collapsed ? 'lg:w-[98px]' : 'lg:w-[292px]';
  const isMenuItemActive = (item: MenuItem) =>
    item.key === 'home'
      ? pathname === item.basePath
      : pathname === item.basePath || pathname.startsWith(`${item.basePath}/`);

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
                  <p className="mt-1 text-base font-semibold text-white/95">Agent Management</p>
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
              const parentActive = isMenuItemActive(item);
              const hasActiveSubItem = Array.isArray(item.subItems) && item.subItems.some((subItem) => isMenuItemActive(subItem));
              const parentLinkActive = parentActive || hasActiveSubItem;
              const href = `${item.basePath}${agentQuery}`;

              return (
                <div key={item.key} className="space-y-1">
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={`group flex min-h-11 items-center rounded-xl px-3 text-sm transition ${
                      parentLinkActive
                        ? 'bg-[linear-gradient(135deg,#67e8f9_0%,#38bdf8_55%,#0ea5e9_100%)] text-slate-900 shadow-[0_16px_32px_-18px_rgba(14,165,233,0.9)]'
                        : 'text-slate-200 hover:bg-white/12 hover:text-white'
                    } ${collapsed ? 'justify-center' : 'justify-start gap-2.5'}`}
                  >
                    <MenuIcon itemKey={item.key} active={parentLinkActive} />
                    {collapsed ? (
                      <span
                        className={`truncate text-[11px] font-semibold ${parentLinkActive ? 'text-slate-900' : 'text-slate-100'}`}
                      >
                        {item.compactLabel}
                      </span>
                    ) : (
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold ${parentLinkActive ? 'text-slate-900' : 'text-slate-100'}`}>
                          {item.label}
                        </p>
                        <p className={`truncate text-[11px] ${parentLinkActive ? 'text-slate-800/80' : 'text-slate-400'}`}>
                          {item.description}
                        </p>
                      </div>
                    )}
                  </Link>

                  {Array.isArray(item.subItems) && item.subItems.length > 0 && (
                    <div className={`space-y-1 ${collapsed ? '' : 'ml-3 border-l border-cyan-200/20 pl-2'}`}>
                      {item.subItems.map((subItem) => {
                        const subItemActive = isMenuItemActive(subItem);
                        const subHref = `${subItem.basePath}${agentQuery}`;

                        return (
                          <Link
                            key={subItem.key}
                            href={subHref}
                            onClick={() => setMobileOpen(false)}
                            title={collapsed ? subItem.label : undefined}
                            className={`group flex min-h-9 items-center rounded-lg text-xs transition ${
                              subItemActive
                                ? 'bg-cyan-200 text-slate-900 shadow-[0_10px_24px_-18px_rgba(6,182,212,0.95)]'
                                : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            } ${collapsed ? 'justify-center px-2' : 'gap-2 px-2.5'}`}
                          >
                            {!collapsed && (
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  subItemActive ? 'bg-slate-900' : 'bg-cyan-200/60 transition group-hover:bg-cyan-100'
                                }`}
                              />
                            )}
                            <span className="truncate font-semibold">{collapsed ? subItem.compactLabel : subItem.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="relative px-2 pb-3">
            <Link
              href={p2pHomeHref}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? 'P2P 홈으로' : undefined}
              className={`group flex min-h-10 items-center rounded-xl border border-cyan-200/35 bg-white/10 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/60 hover:bg-white/15 hover:text-white ${
                collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
                <path d="M14.5 6 8.5 12l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {!collapsed && <span className="truncate">P2P 홈으로 돌아가기</span>}
            </Link>
          </div>

          <div className="relative border-t border-white/10 px-3 py-3">
            {collapsed ? (
              <div className="flex items-center justify-center">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-200/50 bg-cyan-300/20 text-[10px] font-semibold text-cyan-100">
                  AG
                </span>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/90">Agent Scope</p>
                <p className="mt-1 truncate text-xs font-semibold text-white/90">
                  {agentcode ? `agentcode: ${agentcode}` : 'agentcode 파라미터 없음'}
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
