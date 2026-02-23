import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { ConnectButtonProps, UseConnectModalOptions } from 'thirdweb/react';

type OrangeXConnectModalConfig = Pick<
  UseConnectModalOptions,
  'size' | 'title' | 'titleIcon' | 'showThirdwebBranding' | 'welcomeScreen'
>;

type OrangeXWelcomeScreenData = Exclude<
  NonNullable<NonNullable<ConnectButtonProps['connectModal']>['welcomeScreen']>,
  (...args: never[]) => unknown
>;

const panelStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  height: '100%',
  minHeight: 420,
  flexDirection: 'column',
  justifyContent: 'space-between',
  borderRadius: 22,
  border: '1px solid rgba(16, 185, 129, 0.22)',
  background:
    'linear-gradient(165deg, rgba(236,253,245,0.96) 0%, rgba(240,249,255,0.94) 48%, rgba(255,255,255,0.98) 100%)',
  padding: '28px 24px',
  boxShadow: '0 26px 65px -42px rgba(6, 95, 70, 0.62)',
};

const glowTopStyle: CSSProperties = {
  position: 'absolute',
  top: -120,
  right: -70,
  width: 240,
  height: 240,
  borderRadius: '9999px',
  background: 'radial-gradient(circle at center, rgba(45, 212, 191, 0.3), rgba(45, 212, 191, 0))',
};

const glowBottomStyle: CSSProperties = {
  position: 'absolute',
  bottom: -90,
  left: -80,
  width: 220,
  height: 220,
  borderRadius: '9999px',
  background: 'radial-gradient(circle at center, rgba(125, 211, 252, 0.32), rgba(125, 211, 252, 0))',
};

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 9999,
  border: '1px solid rgba(8, 145, 178, 0.35)',
  background: 'rgba(236, 254, 255, 0.86)',
  padding: '5px 12px',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.12em',
  color: '#0e7490',
};

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 9999,
  border: '1px solid rgba(15, 23, 42, 0.1)',
  background: 'rgba(255, 255, 255, 0.82)',
  padding: '7px 12px',
  fontSize: 12,
  fontWeight: 700,
  color: '#0f172a',
};

export const ORANGEX_WELCOME_SCREEN: OrangeXWelcomeScreenData = {
  title: 'OrangeX Sign In',
  subtitle: 'Quickly connect your wallet with phone verification and get started.',
  img: {
    src: '/logo-orangex.png',
    width: 320,
    height: 78,
  },
};

export const OrangeXConnectWelcomeScreen = () => {
  return (
    <div style={panelStyle}>
      <div style={glowTopStyle} />
      <div style={glowBottomStyle} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <span style={badgeStyle}>ORANGEX WALLET</span>
        <Image
          src="/logo-orangex.png"
          alt="OrangeX"
          width={320}
          height={78}
          style={{ marginTop: 14, width: 220, maxWidth: '100%', height: 'auto' }}
        />

        <h2
          style={{
            marginTop: 20,
            marginBottom: 0,
            color: '#0f172a',
            fontSize: 27,
            lineHeight: 1.2,
            fontWeight: 800,
            letterSpacing: '-0.02em',
          }}
        >
          Fast sign-in with your phone number
        </h2>
        <p style={{ marginTop: 10, marginBottom: 0, color: '#334155', fontSize: 14, lineHeight: 1.65 }}>
          Connect your wallet with simple verification and securely start payments, buying, and settlement.
        </p>
      </div>

      <div style={{ position: 'relative', zIndex: 1, marginTop: 24 }}>
        <div
          style={{
            borderRadius: 16,
            border: '1px solid rgba(15, 23, 42, 0.08)',
            background: 'rgba(255, 255, 255, 0.86)',
            padding: '14px 14px 12px',
          }}
        >
          <p style={{ margin: 0, color: '#0f172a', fontSize: 13, fontWeight: 800 }}>
            Available right after connection
          </p>
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: '#334155', fontSize: 13, lineHeight: 1.7 }}>
            <li>Check your USDT wallet balance</li>
            <li>Start USDT payments and purchases</li>
            <li>Track transaction history in real time</li>
          </ul>
        </div>

        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span style={chipStyle}>SMS OTP</span>
          <span style={chipStyle}>Smart Account</span>
          <span style={chipStyle}>Fast Onboarding</span>
        </div>
      </div>
    </div>
  );
};

export const ORANGEX_CONNECT_MODAL: OrangeXConnectModalConfig &
  NonNullable<ConnectButtonProps['connectModal']> = {
  size: 'wide',
  title: 'OrangeX Sign In',
  titleIcon: '/logo-orangex-mark.svg',
  showThirdwebBranding: false,
  welcomeScreen: () => <OrangeXConnectWelcomeScreen />,
};

export const ORANGEX_CONNECT_OPTIONS: OrangeXConnectModalConfig &
  Pick<UseConnectModalOptions, 'theme' | 'locale'> = {
  theme: 'light',
  locale: 'en_US',
  ...ORANGEX_CONNECT_MODAL,
};
