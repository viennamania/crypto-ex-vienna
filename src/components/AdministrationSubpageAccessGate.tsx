'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { createWalletSignatureAuthPayload } from '@/lib/security/walletSignature';
import { useClientWallets } from '@/lib/useClientWallets';

const ADMIN_STORECODE = 'admin';
const WALLET_AUTH_OPTIONS = ['google', 'email'];
const AUTO_SIGN_PATH_PATTERN =
  /\/(set|update|create|cancel|clear|add|remove|toggle|apply|upsert|delete|confirm|rollback|transfer|request|manage|link|complete|accept|record|refresh)(\/|$)/i;

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

type SignMessageAccount = {
  address?: string;
  signMessage?: (options: {
    message: string;
    originalMessage?: string;
    chainId?: number;
  }) => Promise<string>;
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

  const resolvedActiveAccount = activeWallet?.getAccount?.() ?? activeAccount;
  const signatureAccount = useMemo<SignMessageAccount | null>(() => {
    const candidates: Array<unknown> = [
      activeWallet?.getAccount?.(),
      resolvedActiveAccount,
      activeWallet?.getAdminAccount?.(),
    ];

    for (const walletItem of connectedWallets) {
      candidates.push(walletItem?.getAccount?.());
      candidates.push(walletItem?.getAdminAccount?.());
    }

    for (const candidate of candidates) {
      const account = candidate as SignMessageAccount | null | undefined;
      if (account?.address && typeof account.signMessage === 'function') {
        return account;
      }
    }

    return null;
  }, [activeWallet, connectedWallets, resolvedActiveAccount]);

  const walletAddress = String(resolvedActiveAccount?.address || signatureAccount?.address || '').trim();
  const hasConnectedWallet = Boolean(activeWallet) || connectedWallets.length > 0;

  const [isCheckingRole, setIsCheckingRole] = useState(false);
  const [hasCheckedRole, setHasCheckedRole] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [memberInfo, setMemberInfo] = useState<AdminMemberInfo | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const buildSignedRequestBody = useCallback(
    async ({
      path,
      payload,
      storecode = ADMIN_STORECODE,
      method = 'POST',
    }: {
      path: string;
      payload: Record<string, unknown>;
      storecode?: string;
      method?: string;
    }) => {
      if (!signatureAccount?.address || typeof signatureAccount.signMessage !== 'function') {
        throw new Error('wallet signature account is unavailable');
      }

      const auth = await createWalletSignatureAuthPayload({
        account: signatureAccount,
        storecode: String(storecode || ADMIN_STORECODE).trim() || ADMIN_STORECODE,
        path,
        method,
      });

      return {
        ...payload,
        auth,
      };
    },
    [signatureAccount],
  );

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
        let requestBody: Record<string, unknown> = {
          storecode: ADMIN_STORECODE,
          walletAddress,
        };

        if (signatureAccount) {
          try {
            requestBody = await buildSignedRequestBody({
              path: '/api/user/getUser',
              payload: requestBody,
              storecode: ADMIN_STORECODE,
            });
          } catch (signError) {
            console.warn('admin role check signature fallback', signError);
          }
        }

        const response = await fetch('/api/user/getUser', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
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
  }, [buildSignedRequestBody, signatureAccount, walletAddress]);

  useEffect(() => {
    if (!signatureAccount?.address || typeof signatureAccount.signMessage !== 'function') {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }

    const originalFetch = window.fetch.bind(window);
    const shouldAutoSign = (pathname: string) => {
      const normalizedPathname = String(pathname || '').trim();
      if (!normalizedPathname.startsWith('/api/')) return false;
      if (normalizedPathname.startsWith('/api/upload')) return false;
      if (normalizedPathname.startsWith('/api/sendbird/')) return false;
      if (normalizedPathname.startsWith('/api/client/logo')) return false;
      return AUTO_SIGN_PATH_PATTERN.test(normalizedPathname.toLowerCase());
    };

    const toText = (value: unknown) => String(value ?? '').trim();
    const resolveStorecode = (pathname: string, payload: Record<string, unknown>) => {
      const byPayload =
        toText(payload.storecode)
        || toText(payload.agentcode)
        || toText(payload.clientId);

      if (byPayload) {
        return byPayload;
      }

      if (pathname.startsWith('/api/agent/')) {
        return toText(payload.agentcode) || ADMIN_STORECODE;
      }

      return ADMIN_STORECODE;
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        const parsedUrl = new URL(requestUrl, window.location.origin);
        const pathname = parsedUrl.pathname;
        if (!shouldAutoSign(pathname)) {
          return originalFetch(input, init);
        }

        const requestMethod = String(
          init?.method
          || (input instanceof Request ? input.method : 'GET'),
        ).toUpperCase();
        if (requestMethod !== 'POST') {
          return originalFetch(input, init);
        }

        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        if (init?.headers) {
          const overrideHeaders = new Headers(init.headers);
          overrideHeaders.forEach((value, key) => headers.set(key, value));
        }

        const contentType = String(headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('application/json')) {
          return originalFetch(input, init);
        }

        let bodyText = '';
        if (typeof init?.body === 'string') {
          bodyText = init.body;
        } else if (!init?.body && input instanceof Request) {
          bodyText = await input.clone().text();
        } else {
          return originalFetch(input, init);
        }

        if (!bodyText) {
          return originalFetch(input, init);
        }

        const parsedBody = JSON.parse(bodyText) as unknown;
        if (
          !parsedBody
          || typeof parsedBody !== 'object'
          || Array.isArray(parsedBody)
        ) {
          return originalFetch(input, init);
        }

        const payload = parsedBody as Record<string, unknown>;
        if (payload.auth) {
          return originalFetch(input, init);
        }

        const payloadForSign: Record<string, unknown> = {
          ...payload,
        };
        if (!payloadForSign.requesterWalletAddress && walletAddress) {
          payloadForSign.requesterWalletAddress = walletAddress;
        }

        const signedBody = await buildSignedRequestBody({
          path: pathname,
          method: requestMethod,
          payload: payloadForSign,
          storecode: resolveStorecode(pathname, payloadForSign),
        });

        headers.set('Content-Type', 'application/json');
        const nextInit: RequestInit = {
          ...init,
          method: requestMethod,
          headers,
          body: JSON.stringify(signedBody),
        };

        if (input instanceof Request) {
          const signedRequest = new Request(input, nextInit);
          return originalFetch(signedRequest);
        }

        return originalFetch(input, nextInit);
      } catch (autoSignError) {
        console.warn('administration auto-sign fallback', autoSignError);
        return originalFetch(input, init);
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [buildSignedRequestBody, signatureAccount, walletAddress]);

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
