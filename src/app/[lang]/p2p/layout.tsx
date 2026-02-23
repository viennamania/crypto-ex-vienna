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
    <>
      <ClientBrandTitleSync enabled={!hasNestedTitleHandler} />
      {children}
    </>
  );
}
