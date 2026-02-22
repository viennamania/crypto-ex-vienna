'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AutoConnect, useActiveAccount } from 'thirdweb/react';
import { arbitrum, bsc, ethereum, polygon } from 'thirdweb/chains';

import { client } from '@/app/client';
import AdministrationLayoutShell from '@/components/AdministrationLayoutShell';
import { ConnectButton } from '@/components/OrangeXConnectButton';
import { useClientWallets } from '@/lib/useClientWallets';

const ADMIN_STORECODE = 'admin';
const WALLET_AUTH_OPTIONS = ['google', 'email'];

type AdministrationSubpageAccessGateProps = {
  lang: string;
  children: ReactNode;
};

const resolveChain = (chain: string) => {
  if (chain === 'ethereum') return ethereum;
  if (chain === 'arbitrum') return arbitrum;
  if (chain === 'bsc') return bsc;
  return polygon;
};

export default function AdministrationSubpageAccessGate({
  lang,
  children,
}: AdministrationSubpageAccessGateProps) {
  const { wallet, wallets, chain } = useClientWallets({
    authOptions: WALLET_AUTH_OPTIONS,
  });
  const activeAccount = useActiveAccount();
  const walletAddress = activeAccount?.address || '';

  const [isCheckingRole, setIsCheckingRole] = useState(false);
  const [hasCheckedRole, setHasCheckedRole] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkRole = async () => {
      if (!walletAddress) {
        setIsCheckingRole(false);
        setHasCheckedRole(false);
        setIsAdmin(false);
        return;
      }

      setIsCheckingRole(true);
      setHasCheckedRole(false);

      try {
        const response = await fetch('/api/user/getUser', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storecode: ADMIN_STORECODE,
            walletAddress,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!cancelled) {
          setIsAdmin(data?.result?.role === 'admin');
          setHasCheckedRole(true);
        }
      } catch (error) {
        console.error('failed to verify admin role', error);
        if (!cancelled) {
          setIsAdmin(false);
          setHasCheckedRole(true);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingRole(false);
        }
      }
    };

    checkRole();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  if (!walletAddress) {
    return (
      <div className="min-h-[60vh] w-full flex flex-col items-center justify-center gap-4 p-6">
        <AutoConnect client={client} wallets={[wallet]} />
        <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white/90 p-6 text-center shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
          <h1 className="text-lg font-semibold text-slate-900">관리자 지갑 연결</h1>
          <div className="mt-4 flex items-center justify-center">
            <ConnectButton
              client={client}
              wallets={wallets}
              chain={resolveChain(chain)}
              theme="light"
              connectButton={{
                style: {
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  padding: '6px 14px',
                  borderRadius: '999px',
                  fontSize: '14px',
                  height: '40px',
                },
                label: '지갑 연결하기',
              }}
              connectModal={{
                size: 'wide',
                titleIcon: 'https://crypto-ex-vienna.vercel.app/logo.png',
                showThirdwebBranding: false,
              }}
              locale="ko_KR"
            />
          </div>
        </div>
      </div>
    );
  }

  if (isCheckingRole || !hasCheckedRole) {
    return (
      <div className="min-h-[60vh] w-full flex items-center justify-center p-6">
        <AutoConnect client={client} wallets={[wallet]} />
        <p className="text-base font-semibold text-slate-700">접근 권한 확인 중...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] w-full flex items-center justify-center p-6">
        <AutoConnect client={client} wallets={[wallet]} />
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-lg font-semibold text-rose-700">접근 권한이 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AutoConnect client={client} wallets={[wallet]} />
      <AdministrationLayoutShell lang={lang}>{children}</AdministrationLayoutShell>
    </>
  );
}
