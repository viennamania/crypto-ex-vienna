'use client';

import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useActiveAccount, useActiveWallet, useConnectedWallets } from 'thirdweb/react';

import { createWalletSignatureAuthPayload } from '@/lib/security/walletSignature';

type P2PBuyerSmartAccountAuthProviderProps = {
  children: ReactNode;
};

type SignMessageAccount = {
  address?: string;
  signMessage?: (options: {
    message: string;
    originalMessage?: string;
    chainId?: number;
  }) => Promise<string>;
};

const AUTO_SIGN_PATH_PATTERN =
  /\/(set|update|create|cancel|clear|add|remove|toggle|apply|upsert|delete|confirm|rollback|transfer|request|manage|link|complete|accept|record|refresh)(\/|$)/i;

const toText = (value: unknown) => String(value ?? '').trim();

export default function P2PBuyerSmartAccountAuthProvider({
  children,
}: P2PBuyerSmartAccountAuthProviderProps) {
  const activeWallet = useActiveWallet();
  const rawActiveAccount = useActiveAccount();
  const connectedWallets = useConnectedWallets();

  const resolvedActiveAccount = activeWallet?.getAccount?.() ?? rawActiveAccount;

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

  const connectedWalletAddress = String(
    resolvedActiveAccount?.address || signatureAccount?.address || '',
  ).trim();

  const buildSignedRequestBody = useCallback(
    async ({
      path,
      payload,
      storecode,
      method = 'POST',
    }: {
      path: string;
      payload: Record<string, unknown>;
      storecode?: string;
      method?: string;
    }) => {
      if (!signatureAccount?.address || typeof signatureAccount.signMessage !== 'function') {
        throw new Error('서명 가능한 스마트 지갑을 먼저 연결해 주세요.');
      }

      const auth = await createWalletSignatureAuthPayload({
        account: signatureAccount,
        storecode: toText(storecode) || undefined,
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
    if (!signatureAccount?.address || typeof signatureAccount.signMessage !== 'function') {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }

    const originalFetch = window.fetch.bind(window);
    const shouldAutoSign = (pathname: string) => {
      const normalizedPathname = toText(pathname);
      if (!normalizedPathname.startsWith('/api/')) return false;
      if (normalizedPathname.startsWith('/api/upload')) return false;
      if (normalizedPathname.startsWith('/api/sendbird/')) return false;
      if (normalizedPathname.startsWith('/api/client/logo')) return false;
      if (normalizedPathname.startsWith('/api/market/')) return false;
      if (normalizedPathname.startsWith('/api/markets/')) return false;
      return AUTO_SIGN_PATH_PATTERN.test(normalizedPathname.toLowerCase());
    };

    const resolveStorecode = (payload: Record<string, unknown>) => {
      const byPayload = toText(payload.storecode) || toText(payload.agentcode);
      if (byPayload) return byPayload;

      const query = new URLSearchParams(window.location.search);
      const byQuery = toText(query.get('storecode'));
      if (byQuery) return byQuery;

      return undefined;
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
          init?.method || (input instanceof Request ? input.method : 'GET'),
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
        if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
          return originalFetch(input, init);
        }

        const payload = parsedBody as Record<string, unknown>;
        if (payload.auth) {
          return originalFetch(input, init);
        }

        const payloadForSign: Record<string, unknown> = {
          ...payload,
        };
        if (!payloadForSign.requesterWalletAddress && connectedWalletAddress) {
          payloadForSign.requesterWalletAddress = connectedWalletAddress;
        }

        const signedBody = await buildSignedRequestBody({
          path: pathname,
          method: requestMethod,
          payload: payloadForSign,
          storecode: resolveStorecode(payloadForSign),
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
        console.warn('p2p-buyer auto-sign fallback', autoSignError);
        return originalFetch(input, init);
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [buildSignedRequestBody, connectedWalletAddress, signatureAccount]);

  return <>{children}</>;
}
