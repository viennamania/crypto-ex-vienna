import type { ReactNode } from 'react';

import WalletActiveTradeNotice from '@/components/wallet-management/WalletActiveTradeNotice';

export default function WalletManagementLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <WalletActiveTradeNotice />
      {children}
    </>
  );
}
