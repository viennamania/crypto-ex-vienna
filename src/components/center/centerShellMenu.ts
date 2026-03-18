export type CenterRouteAccessLevel = 'registration' | 'member' | 'seller' | 'center_admin';

export type CenterShellMenuItem = {
  key: string;
  label: string;
  hint: string;
  href: string;
  accessLevel?: CenterRouteAccessLevel;
};

type CenterAccessDescriptor = {
  accessLevel: CenterRouteAccessLevel;
  label: string;
};

const REGISTRATION_SECTIONS = new Set([
  'profiles',
  'profiles-new',
  'profiles-snt',
]);

const CENTER_ADMIN_SECTIONS = new Set([
  'center',
  'member',
  'buyorder',
  'trade-history',
  'clearance-history',
  'clearance-request',
  'daily-close',
  'escrow-history',
  'manager-wallet-management',
  'settings',
  'settings-bangbang',
  'admin',
]);

const SELLER_SECTIONS = new Set([
  'sell-usdt',
  'sell-usdt-center',
  'sell-usdt-web3',
  'withdraw-usdt',
  'send-usdt-web3',
  'send-usdt-withdraw',
  'wallet-settings',
  'seller-settings',
  'seller-clearance-settings',
  'escrow-settings',
  'web3',
  'paymaster',
  'paymaster-register',
]);

const normalizePathname = (pathname: string) => pathname.replace(/\/+$/, '');

export const shortWalletAddress = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

export const normalizeAddress = (value: string) => String(value || '').trim().toLowerCase();

export const buildCenterShellMenuItems = (lang: string, center: string): CenterShellMenuItem[] => {
  const root = `/${lang}/${center}`;

  return [
    { key: 'wallet-management', label: '지갑 관리', hint: 'Wallet', href: `${root}/wallet-management`, accessLevel: 'member' },
    { key: 'center', label: '센터 대시보드', hint: 'Ops', href: `${root}/center`, accessLevel: 'center_admin' },
    { key: 'profile-settings', label: '회원 정보', hint: 'Account', href: `${root}/profile-settings`, accessLevel: 'member' },
    { key: 'member', label: '회원 관리', hint: 'Member', href: `${root}/member`, accessLevel: 'center_admin' },
    { key: 'buyorder', label: '구매주문 관리', hint: 'Orders', href: `${root}/buyorder`, accessLevel: 'center_admin' },
    { key: 'trade-history', label: '거래내역', hint: 'History', href: `${root}/trade-history`, accessLevel: 'center_admin' },
    { key: 'daily-close', label: '일 마감', hint: 'Close', href: `${root}/daily-close`, accessLevel: 'center_admin' },
    { key: 'settings', label: '센터 설정', hint: 'Settings', href: `${root}/settings`, accessLevel: 'center_admin' },
  ];
};

export const getCenterRegistrationHref = (lang: string, center: string) => `/${lang}/${center}/profiles`;

export const resolveCenterRouteAccess = (
  pathname: string,
  lang: string,
  center: string,
): CenterAccessDescriptor => {
  const normalizedPathname = normalizePathname(pathname || '');
  const basePath = normalizePathname(`/${lang}/${center}`);

  if (normalizedPathname === basePath) {
    return {
      accessLevel: 'member',
      label: '센터 홈',
    };
  }

  const relativePath = normalizedPathname.startsWith(`${basePath}/`)
    ? normalizedPathname.slice(basePath.length + 1)
    : '';

  const [section = ''] = relativePath.split('/');

  if (REGISTRATION_SECTIONS.has(section)) {
    return {
      accessLevel: 'registration',
      label: '회원 등록',
    };
  }

  if (CENTER_ADMIN_SECTIONS.has(section)) {
    return {
      accessLevel: 'center_admin',
      label: '센터 관리자 전용',
    };
  }

  if (SELLER_SECTIONS.has(section)) {
    return {
      accessLevel: 'seller',
      label: '판매자 권한',
    };
  }

  return {
    accessLevel: 'member',
    label: '회원 전용',
  };
};
