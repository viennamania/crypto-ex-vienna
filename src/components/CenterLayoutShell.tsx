'use client';

import { useEffect, useState, type ReactNode } from 'react';

import CenterSidebar from '@/components/CenterSidebar';

type CenterLayoutShellProps = {
  lang: string;
  center: string;
  children: ReactNode;
  storeName?: string;
  memberNickname?: string;
  walletAddress?: string;
  roleLabel?: string;
};

export default function CenterLayoutShell({
  lang,
  center,
  children,
  storeName,
  memberNickname,
  walletAddress,
  roleLabel,
}: CenterLayoutShellProps) {
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
    if (!isMobileViewport) {
      document.body.style.overflow = '';
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = isSidebarOpen ? 'hidden' : '';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileViewport, isSidebarOpen]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef6ff_0%,#e5efff_45%,#f8fbff_100%)] text-slate-900">
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
        memberNickname={memberNickname}
        walletAddress={walletAddress}
        roleLabel={roleLabel}
      />

      <div className="min-h-screen lg:pl-[304px]">
        <div className="center-shell-legacy-content px-3 pb-12 pt-16 sm:px-4 lg:px-8 lg:pt-8">
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

        .center-shell-legacy-content > main > div > div[class*='grid-cols-2'][class*='mb-4'] {
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
