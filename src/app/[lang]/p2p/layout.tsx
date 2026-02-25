'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import ClientBrandTitleSync from '@/components/ClientBrandTitleSync';

export default function P2PLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '';
  const hasNestedTitleHandler =
    pathname.includes('/p2p/store-management')
    || pathname.includes('/p2p/agent-management');

  return (
    <div className="p2p-mobile-shell">
      <ClientBrandTitleSync enabled={!hasNestedTitleHandler} />
      {children}
      <style jsx global>{`
        .p2p-mobile-shell {
          position: relative;
          isolation: isolate;
        }

        .p2p-mobile-shell main,
        .p2p-mobile-shell section,
        .p2p-mobile-shell article,
        .p2p-mobile-shell aside {
          max-width: 100%;
        }

        .p2p-mobile-shell img,
        .p2p-mobile-shell video,
        .p2p-mobile-shell canvas,
        .p2p-mobile-shell iframe {
          max-width: 100%;
        }

        @media (max-width: 1024px) {
          .p2p-mobile-shell {
            background:
              radial-gradient(circle at 12% -8%, rgba(56, 189, 248, 0.15), transparent 46%),
              radial-gradient(circle at 90% 10%, rgba(249, 115, 22, 0.14), transparent 42%),
              linear-gradient(180deg, #f8fbff 0%, #f8fafc 48%, #fff8f1 100%);
          }

          .p2p-mobile-shell main {
            width: 100%;
            max-width: 100% !important;
            margin-left: auto;
            margin-right: auto;
            padding-left: 0.75rem !important;
            padding-right: 0.75rem !important;
            padding-bottom: calc(5.5rem + env(safe-area-inset-bottom));
            overflow-x: clip !important;
          }

          .p2p-mobile-shell .container,
          .p2p-mobile-shell [class*='max-w-screen'],
          .p2p-mobile-shell [class*='max-w-7xl'],
          .p2p-mobile-shell [class*='max-w-6xl'],
          .p2p-mobile-shell [class*='max-w-5xl'],
          .p2p-mobile-shell [class*='max-w-4xl'] {
            max-width: 100% !important;
          }

          .p2p-mobile-shell [class*='rounded-[28px]'],
          .p2p-mobile-shell [class*='rounded-[32px]'] {
            border-radius: 1.15rem !important;
          }

          .p2p-mobile-shell table {
            width: 100% !important;
            min-width: 100% !important;
            table-layout: fixed !important;
          }

          .p2p-mobile-shell th,
          .p2p-mobile-shell td {
            white-space: normal !important;
            word-break: break-word;
            overflow-wrap: anywhere;
            font-size: 11px;
            line-height: 1.35;
            vertical-align: top;
          }

          .p2p-mobile-shell [class*='min-w-['],
          .p2p-mobile-shell [style*='min-width'] {
            min-width: 0 !important;
          }

          .p2p-mobile-shell [class*='text-4xl'] {
            font-size: 1.7rem !important;
            line-height: 2rem !important;
          }

          .p2p-mobile-shell [class*='text-3xl'] {
            font-size: 1.45rem !important;
            line-height: 1.85rem !important;
          }

          .p2p-mobile-shell [class*='text-2xl'] {
            font-size: 1.25rem !important;
            line-height: 1.65rem !important;
          }
        }
      `}</style>
    </div>
  );
}
