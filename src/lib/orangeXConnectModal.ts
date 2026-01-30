import type { ConnectButtonProps, UseConnectModalOptions } from 'thirdweb/react';

type OrangeXConnectModalConfig = Pick<
  UseConnectModalOptions,
  'size' | 'title' | 'titleIcon' | 'showThirdwebBranding' | 'welcomeScreen'
>;

type OrangeXWelcomeScreen = Exclude<
  NonNullable<NonNullable<ConnectButtonProps['connectModal']>['welcomeScreen']>,
  (...args: never[]) => unknown
>;

export const ORANGEX_WELCOME_SCREEN: OrangeXWelcomeScreen = {
  title: 'OrangeX',
  subtitle: '간편하게 지갑을 연결하고 서비스를 시작하세요.',
  img: {
    src: '/logo-orangex.png',
    width: 220,
    height: 68,
  },
};

export const ORANGEX_CONNECT_MODAL: OrangeXConnectModalConfig &
  NonNullable<ConnectButtonProps['connectModal']> = {
  size: 'wide',
  title: '로그인',
  titleIcon: '/logo-orangex.png',
  showThirdwebBranding: false,
  welcomeScreen: ORANGEX_WELCOME_SCREEN,
};

export const ORANGEX_CONNECT_OPTIONS: OrangeXConnectModalConfig &
  Pick<UseConnectModalOptions, 'theme' | 'locale'> = {
  theme: 'light',
  locale: 'ko_KR',
  ...ORANGEX_CONNECT_MODAL,
};
