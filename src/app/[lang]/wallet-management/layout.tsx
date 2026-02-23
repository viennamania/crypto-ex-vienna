import type { ReactNode } from 'react';

import WalletActiveTradeNotice from '@/components/wallet-management/WalletActiveTradeNotice';
import ClientBrandTitleSync from '@/components/ClientBrandTitleSync';

export default function WalletManagementLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <ClientBrandTitleSync />
      <WalletActiveTradeNotice />
      {children}
    </>
  );
}
