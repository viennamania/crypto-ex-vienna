'use client';

import { useCallback, useMemo } from 'react';
import { useActiveAccount, useActiveWallet, useConnectedWallets } from 'thirdweb/react';

import { createWalletSignatureAuthPayload } from '@/lib/security/walletSignature';

type SignableAccount = {
  address?: string;
  signMessage?: (options: {
    message: string;
    originalMessage?: string;
    chainId?: number;
  }) => Promise<string>;
};

export function useSmartAccountAuth(defaultStorecode = 'admin') {
  const rawActiveAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const connectedWallets = useConnectedWallets();

  const activeAccount = activeWallet?.getAccount?.() ?? rawActiveAccount;

  const signatureAccount = useMemo<SignableAccount | null>(() => {
    const candidates: Array<unknown> = [
      activeWallet?.getAccount?.(),
      activeAccount,
      activeWallet?.getAdminAccount?.(),
    ];

    for (const walletItem of connectedWallets) {
      candidates.push(walletItem?.getAccount?.());
      candidates.push(walletItem?.getAdminAccount?.());
    }

    for (const candidate of candidates) {
      const account = candidate as SignableAccount | null | undefined;
      if (account?.address && typeof account.signMessage === 'function') {
        return account;
      }
    }

    return null;
  }, [activeAccount, activeWallet, connectedWallets]);

  const connectedWalletAddress = String(activeAccount?.address || signatureAccount?.address || '').trim();

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
        storecode: String(storecode || defaultStorecode || 'admin').trim() || 'admin',
        path,
        method,
      });

      return {
        ...payload,
        auth,
      };
    },
    [defaultStorecode, signatureAccount],
  );

  return {
    activeAccount,
    signatureAccount,
    connectedWalletAddress,
    buildSignedRequestBody,
  };
}

