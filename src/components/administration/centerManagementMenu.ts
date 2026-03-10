export type CenterManagementMenuItem = {
  label: string;
  hint: string;
  href: string;
};

export const buildCenterManagementMenuItems = (lang: string): CenterManagementMenuItem[] => {
  const root = `/${lang}/administration`;

  return [
    { label: '지갑 관리', hint: 'Wallet', href: `${root}/center-management/wallet-management` },
    { label: '가맹점 관리', hint: 'Store', href: `${root}/store` },
    { label: '에이전트 관리', hint: 'Agent', href: `${root}/agent` },
    { label: '회원 관리', hint: 'Member', href: `${root}/member` },
    { label: 'P2P구매 관리', hint: 'Buy Order', href: `${root}/buyorder` },
    { label: '거래내역', hint: 'Trade History', href: `${root}/trade-history` },
  ];
};
