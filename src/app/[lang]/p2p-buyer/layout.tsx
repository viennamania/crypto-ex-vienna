import type { ReactNode } from 'react';

import ClientBrandTitleSync from '@/components/ClientBrandTitleSync';

export default function P2PBuyerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ClientBrandTitleSync />
      {children}
    </>
  );
}
