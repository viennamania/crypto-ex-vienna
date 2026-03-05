import type { ReactNode } from 'react';

import ClientBrandTitleSync from '@/components/ClientBrandTitleSync';
import P2PBuyerSmartAccountAuthProvider from '@/components/P2PBuyerSmartAccountAuthProvider';

export default function P2PBuyerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ClientBrandTitleSync />
      <P2PBuyerSmartAccountAuthProvider>
        {children}
      </P2PBuyerSmartAccountAuthProvider>
    </>
  );
}
