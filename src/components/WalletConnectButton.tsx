'use client';

import { usePathname } from 'next/navigation';
import {
  ConnectButton as ThirdwebConnectButton,
  type ConnectButtonProps,
} from 'thirdweb/react';

import { useClientWallets } from '@/lib/useClientWallets';
import { WALLET_CONNECT_MODAL } from '@/lib/walletConnectModal';

const DEFAULT_CONNECT_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-400';

const KNOWN_LANG_ROOT_SEGMENTS = new Set([
  'administration',
  'buyer',
  'buyerGuide',
  'contact',
  'home',
  'notice',
  'p2p',
  'p2p-buyer',
  'privacy-policy',
  'refund-policy',
  'seller',
  'seller-escrow',
  'sellerGuide',
  'telegram-profile-settings',
  'terms-of-service',
  'wallet-management',
  'web3login',
]);

const ADMIN_SMART_ACCOUNT_PATH_PATTERN =
  /\/[^/]+\/administration(?:\/(?:center-management|store|agent|member|buyorder|trade-history)(?:\/|$)|$)/;

export function ConnectButton(props: ConnectButtonProps) {
  const {
    connectButton,
    connectModal,
    locale,
    theme,
    ...rest
  } = props;
  const pathname = usePathname() || '';
  const pathSegments = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const isCenterRoute = pathSegments.length >= 2 && !KNOWN_LANG_ROOT_SEGMENTS.has(pathSegments[1] || '');
  const isAdminSmartAccountRoute = ADMIN_SMART_ACCOUNT_PATH_PATTERN.test(pathname);
  const forceSmartAccount = isCenterRoute || isAdminSmartAccountRoute;
  const { wallets: centerWallets } = useClientWallets({
    authOptions: ['google', 'email'],
    sponsorGas: true,
    forceSmartAccount,
  });
  const wallets = forceSmartAccount ? centerWallets : rest.wallets;

  const mergedConnectButton = {
    label: connectButton?.label ?? 'Connect Wallet',
    className: [DEFAULT_CONNECT_BUTTON_CLASS, connectButton?.className]
      .filter(Boolean)
      .join(' '),
    style: connectButton?.style,
  };

  const mergedConnectModal = {
    ...(connectModal ?? {}),
    ...WALLET_CONNECT_MODAL,
  };

  return (
      <ThirdwebConnectButton
        {...rest}
        wallets={wallets}
        locale={locale ?? 'en_US'}
        theme={theme ?? 'light'}
        connectButton={mergedConnectButton}
      connectModal={mergedConnectModal}
    />
  );
}
