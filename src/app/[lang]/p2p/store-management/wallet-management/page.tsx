'use client';

import AdministrationWalletManagementPage from '../../../administration/wallet-management/page';

export default function P2PStoreWalletManagementPage({ params }: { params: { lang: string } }) {
  return <AdministrationWalletManagementPage params={params} />;
}
