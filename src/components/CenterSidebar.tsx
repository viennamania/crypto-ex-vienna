'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  buildCenterShellMenuItems,
  shortWalletAddress,
  type CenterShellMenuItem,
} from '@/components/center/centerShellMenu';

type CenterSidebarProps = {
  lang: string;
  center: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isMobileViewport: boolean;
  storeName?: string;
  memberNickname?: string;
  walletAddress?: string;
  roleLabel?: string;
};

const isActiveRoute = (pathname: string, href: string) => {
  if (href === pathname) return true;
  return pathname.startsWith(`${href}/`);
};

const iconByKey: Record<string, string> = {
  home: 'M3.5 12 12 4l8.5 8M6.5 10.8V20h11v-9.2',
  'wallet-management': 'M6.5 6.5h11v11h-11z M9.2 10.2h5.6M9.2 13.8h3.2',
  center: 'M4.5 5.5h15v13h-15z M9 9.2h6M9 12h6M9 14.8h6',
  buy: 'M5 12h14M12 5l7 7-7 7',
  sell: 'M19 12H5m7 7-7-7 7-7',
  trade: 'M6 7.5h12M6 12h12M6 16.5h7',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2.5c-4 0-7 2.1-7 4.8V20h14v-.7c0-2.7-3-4.8-7-4.8Z',
  'profile-settings': 'M12 7.25a4.75 4.75 0 1 0 0 9.5 4.75 4.75 0 0 0 0-9.5Zm8 4.75-1.8.8a6.7 6.7 0 0 1-.45 1.06l.9 1.75-1.95 1.95-1.75-.9c-.34.18-.69.33-1.06.45L13 20h-2l-.8-1.8a6.7 6.7 0 0 1-1.06-.45l-1.75.9L5.44 16.7l.9-1.75a6.7 6.7 0 0 1-.45-1.06L4 13v-2l1.89-.8c.12-.36.27-.72.45-1.06l-.9-1.75L7.39 5.44l1.75.9c.34-.18.69-.33 1.06-.45L11 4h2l.8 1.89c.36.12.72.27 1.06.45l1.75-.9 1.95 1.95-.9 1.75c.18.34.33.7.45 1.06L20 11v2Z',
  member: 'M8.8 11.5a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6ZM16.6 10.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM4 19v-.7c0-2.7 2.4-4.8 5.4-4.8s5.4 2.1 5.4 4.8v.7H4Zm11 0v-.5c0-1.9 1.6-3.4 3.6-3.4S22.2 16.6 22.2 18.5v.5H15Z',
  buyorder: 'M5 6.5h14M5 12h14M5 17.5h9',
  'trade-history': 'M5 18.5h14M7.5 15v-4M12 15V8.5M16.5 15v-6.5',
  'clearance-request': 'M12 4v10m0 0 4-4m-4 4-4-4M5 18.5h14',
  'clearance-history': 'M6 6.5h12v11H6z M9 10h6M9 13h4',
  'daily-close': 'M7.5 4.5v3M16.5 4.5v3M5 8h14M6 11.5h4M14 11.5h4M6 15.5h4',
  settings: 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm8 3.8-1.7.7c-.1.4-.3.9-.5 1.2l.9 1.6-1.9 1.9-1.6-.9c-.4.2-.8.4-1.2.5L13 20h-2l-.7-1.7c-.4-.1-.9-.3-1.2-.5l-1.6.9-1.9-1.9.9-1.6c-.2-.4-.4-.8-.5-1.2L4 13v-2l1.7-.7c.1-.4.3-.9.5-1.2l-.9-1.6 1.9-1.9 1.6.9c.4-.2.8-.4 1.2-.5L11 4h2l.7 1.7c.4.1.9.3 1.2.5l1.6-.9 1.9 1.9-.9 1.6c.2.4.4.8.5 1.2L20 11v2Z',
};

const SidebarIcon = ({ itemKey, active }: { itemKey: string; active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-slate-950' : 'text-cyan-100/90'}`}
    aria-hidden="true"
  >
    <path
      d={iconByKey[itemKey] || iconByKey.home}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function CenterSidebar({
  lang,
  center,
  isOpen,
  onOpenChange,
  isMobileViewport,
  storeName,
  memberNickname,
  walletAddress,
  roleLabel,
}: CenterSidebarProps) {
  const pathname = (usePathname() || '').replace(/\/+$/, '');
  const menuItems = buildCenterShellMenuItems(lang, center);

  return (
    <>
      {isMobileViewport && isOpen && (
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-40 bg-slate-950/58 backdrop-blur-[2px] lg:hidden"
          aria-label="메뉴 닫기"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(82vw,304px)] overflow-y-auto border-r border-cyan-200/10 bg-[linear-gradient(180deg,#07111f_0%,#0f1d34_38%,#16263d_100%)] shadow-[0_30px_90px_-35px_rgba(2,6,23,0.95)] transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-10 top-8 h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute -right-16 top-48 h-48 w-48 rounded-full bg-sky-300/10 blur-3xl" />
          <div className="absolute bottom-0 left-10 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />
        </div>

        <div className="relative flex min-h-full flex-col px-3 pb-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:pt-5">
          <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/90">Center Console</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{storeName || center}</h2>
            <p className="mt-1 text-xs text-slate-300">센터 전용 운영 패널</p>
          </div>

          <div className="mt-4 rounded-2xl border border-cyan-300/12 bg-cyan-400/5 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/90">Session</p>
            <p className="mt-1 truncate text-sm font-semibold text-white">{memberNickname || '회원 정보 확인 중'}</p>
            <p className="mt-1 text-[11px] text-slate-300">{roleLabel || '권한 확인 중'}</p>
            <p className="mt-2 font-mono text-[11px] text-cyan-100/90">{shortWalletAddress(walletAddress || '')}</p>
          </div>

          <nav className="mt-5 flex-1 space-y-1.5">
            {menuItems.map((item: CenterShellMenuItem) => {
              const active = isActiveRoute(pathname, item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => isMobileViewport && onOpenChange(false)}
                  className={`group flex items-center gap-3 rounded-2xl px-3 py-3 transition ${
                    active
                      ? 'bg-[linear-gradient(135deg,#67e8f9_0%,#22d3ee_40%,#38bdf8_100%)] text-slate-950 shadow-[0_18px_36px_-18px_rgba(34,211,238,0.72)]'
                      : 'text-slate-100 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <SidebarIcon itemKey={item.key} active={active} />
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${active ? 'text-slate-950' : 'text-slate-100'}`}>
                      {item.label}
                    </p>
                    <p className={`truncate text-[11px] ${active ? 'text-slate-900/75' : 'text-slate-400'}`}>
                      {item.hint}
                    </p>
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">Route</p>
            <p className="mt-1 truncate text-xs text-slate-200">/{lang}/{center}</p>
          </div>
        </div>
      </aside>
    </>
  );
}
