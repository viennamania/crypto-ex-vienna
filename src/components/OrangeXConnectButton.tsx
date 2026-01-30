'use client';

import {
  ConnectButton as ThirdwebConnectButton,
  type ConnectButtonProps,
} from 'thirdweb/react';

import { ORANGEX_CONNECT_MODAL } from '@/lib/orangeXConnectModal';

const DEFAULT_CONNECT_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-400 hover:text-slate-900';

export function ConnectButton(props: ConnectButtonProps) {
  const {
    connectButton,
    connectModal,
    locale,
    theme,
    ...rest
  } = props;

  const mergedConnectButton = {
    label: connectButton?.label ?? '지갑 연결하기',
    className: [DEFAULT_CONNECT_BUTTON_CLASS, connectButton?.className]
      .filter(Boolean)
      .join(' '),
    style: connectButton?.style,
  };

  const mergedConnectModal = {
    ...(connectModal ?? {}),
    ...ORANGEX_CONNECT_MODAL,
  };

  return (
    <ThirdwebConnectButton
      {...rest}
      locale={locale ?? 'ko_KR'}
      theme={theme ?? 'light'}
      connectButton={mergedConnectButton}
      connectModal={mergedConnectModal}
    />
  );
}
