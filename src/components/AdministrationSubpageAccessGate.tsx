'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AutoConnect,
  useActiveAccount,
  useActiveWallet,
  useConnectedWallets,
  useDisconnect,
} from 'thirdweb/react';
import { arbitrum, bsc, ethereum, polygon } from 'thirdweb/chains';

import { client } from '@/app/client';
import AdministrationLayoutShell from '@/components/AdministrationLayoutShell';
import { ConnectButton } from '@/components/WalletConnectButton';
import { clearWalletConnectionState } from '@/lib/clearWalletConnectionState';
import { useClientWallets } from '@/lib/useClientWallets';

const ADMIN_STORECODE = 'admin';
const WALLET_AUTH_OPTIONS = ['google', 'email'];

type AdministrationSubpageAccessGateProps = {
  lang: string;
  children: ReactNode;
};

type AdminMemberInfo = {
  nickname?: string;
  role?: string;
  email?: string;
  mobile?: string;
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
  const activeWallet = useActiveWallet();
  const connectedWallets = useConnectedWallets();
  const { disconnect } = useDisconnect();
  const walletAddress = activeAccount?.address || '';
  const hasConnectedWallet = Boolean(activeWallet) || connectedWallets.length > 0;

  const [isCheckingRole, setIsCheckingRole] = useState(false);
  const [hasCheckedRole, setHasCheckedRole] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [memberInfo, setMemberInfo] = useState<AdminMemberInfo | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkRole = async () => {
      if (!walletAddress) {
        setIsCheckingRole(false);
        setHasCheckedRole(false);
        setIsAdmin(false);
        setMemberInfo(null);
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
          const result = data?.result;
          setIsAdmin(result?.role === 'admin');
          setMemberInfo(
            result
              ? {
                  nickname: result?.nickname,
                  role: result?.role,
                  email: result?.email,
                  mobile: result?.mobile,
                }
              : null,
          );
          setHasCheckedRole(true);
        }
      } catch (error) {
        console.error('failed to verify admin role', error);
        if (!cancelled) {
          setIsAdmin(false);
          setMemberInfo(null);
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

  const handleDisconnectWallet = async () => {
    if (!hasConnectedWallet || disconnecting) {
      return;
    }

    setDisconnecting(true);
    try {
      for (const walletItem of connectedWallets) {
        try {
          await disconnect(walletItem);
        } catch (error) {
          console.warn('disconnect(connectedWallet) failed', error);
        }
      }

      if (activeWallet) {
        await disconnect(activeWallet);
      }
    } catch (error) {
      console.warn('disconnect() failed, fallback to wallet.disconnect()', error);
      try {
        await activeWallet?.disconnect?.();
      } catch (fallbackError) {
        console.warn('activeWallet.disconnect() failed', fallbackError);
      }
    } finally {
      clearWalletConnectionState();
      window.dispatchEvent(new Event('wallet-disconnected'));
      window.location.replace(window.location.pathname + window.location.search);
    }
  };

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
    const memberLabel = memberInfo?.nickname || '미등록 회원';
    const roleLabel = memberInfo?.role || '일반';
    const contactLabel = memberInfo?.email || memberInfo?.mobile || '-';

    return (
      <div className="min-h-[60vh] w-full flex items-center justify-center p-6">
        <AutoConnect client={client} wallets={[wallet]} />
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <p className="text-lg font-semibold text-rose-700">접근 권한이 없습니다.</p>
          <div className="mt-4 rounded-xl border border-rose-200/80 bg-white/70 p-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">내 지갑주소</p>
            <p className="mt-1 break-all text-sm font-semibold text-slate-900">{walletAddress || '-'}</p>
            <div className="mt-3 grid gap-1 text-sm text-slate-700">
              <p>
                회원: <span className="font-semibold text-slate-900">{memberLabel}</span>
              </p>
              <p>
                권한: <span className="font-semibold text-slate-900">{roleLabel}</span>
              </p>
              <p className="break-all">
                연락처: <span className="font-semibold text-slate-900">{contactLabel}</span>
              </p>
            </div>
          </div>
          {hasConnectedWallet && (
            <button
              type="button"
              onClick={handleDisconnectWallet}
              disabled={disconnecting}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {disconnecting ? '지갑 해제 중...' : '지갑 연결 해제'}
            </button>
          )}
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
