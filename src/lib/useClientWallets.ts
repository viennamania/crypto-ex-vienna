'use client';

import { useMemo } from 'react';
import { inAppWallet } from 'thirdweb/wallets';
import { arbitrum, bsc, ethereum, polygon } from 'thirdweb/chains';

import { useClientSettings } from '@/components/ClientSettingsProvider';

type NetworkKey = 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';
type InAppAuthOption =
  | 'email'
  | 'phone'
  | 'line'
  | 'google'
  | 'apple'
  | 'facebook'
  | 'discord'
  | 'x'
  | 'tiktok'
  | 'coinbase'
  | 'farcaster'
  | 'telegram'
  | 'github'
  | 'twitch'
  | 'steam'
  | 'guest'
  | 'backend'
  | 'passkey'
  | 'wallet';

type InAppWalletOptions = Parameters<typeof inAppWallet>[0];
type SupportedSmsCountry = Exclude<
  NonNullable<NonNullable<InAppWalletOptions>["auth"]>["defaultSmsCountryCode"],
  undefined
>;

type UseClientWalletsOptions = {
  authOptions?: string[];
  sponsorGas?: boolean;
  defaultSmsCountryCode?: SupportedSmsCountry;
  allowedSmsCountryCodes?: SupportedSmsCountry[];
};

const isInAppAuthOption = (value: string): value is InAppAuthOption =>
  value === 'email' ||
  value === 'phone' ||
  value === 'line' ||
  value === 'google' ||
  value === 'apple' ||
  value === 'facebook' ||
  value === 'discord' ||
  value === 'x' ||
  value === 'tiktok' ||
  value === 'coinbase' ||
  value === 'farcaster' ||
  value === 'telegram' ||
  value === 'github' ||
  value === 'twitch' ||
  value === 'steam' ||
  value === 'guest' ||
  value === 'backend' ||
  value === 'passkey' ||
  value === 'wallet';

const resolveChain = (value: NetworkKey) => {
  switch (value) {
    case 'ethereum':
      return ethereum;
    case 'arbitrum':
      return arbitrum;
    case 'bsc':
      return bsc;
    case 'polygon':
    default:
      return polygon;
  }
};

export function useClientWallets(options: UseClientWalletsOptions = {}) {
  const {
    authOptions = [],
    sponsorGas = true,
    defaultSmsCountryCode,
    allowedSmsCountryCodes,
  } = options;
  const { chain, smartAccountEnabled } = useClientSettings();
  const activeChain = resolveChain(chain);
  const normalizedAuthOptions = useMemo(
    () => authOptions.filter(isInAppAuthOption),
    [authOptions]
  );
  const authKey = normalizedAuthOptions.join('|');

  const wallet = useMemo(() => {
    const authConfig =
      normalizedAuthOptions.length > 0
        ? {
            auth: {
              options: normalizedAuthOptions,
              ...(defaultSmsCountryCode ? { defaultSmsCountryCode } : {}),
              ...(allowedSmsCountryCodes ? { allowedSmsCountryCodes } : {}),
            },
          }
        : {};
    if (!smartAccountEnabled) {
      return inAppWallet(authConfig);
    }




    /*
    const wallet = inAppWallet({
      // enable gasless transactions for the wallet
      executionMode: {
        mode: "EIP7702",
        sponsorGas: true,
      },
    });
    */


    return inAppWallet({
      ...authConfig,
      smartAccount: {
        sponsorGas,
        chain: activeChain,
      },

      /*
      executionMode: {
        mode: 'EIP7702',
        sponsorGas: true,
      },
      */


    });

  }, [
    smartAccountEnabled,
    sponsorGas,
    activeChain,
    normalizedAuthOptions,
    defaultSmsCountryCode,
    allowedSmsCountryCodes,
  ]);

  const wallets = useMemo(() => {
    const config: Parameters<typeof inAppWallet>[0] = {};
    if (normalizedAuthOptions.length > 0) {
      config.auth = {
        options: normalizedAuthOptions,
        ...(defaultSmsCountryCode ? { defaultSmsCountryCode } : {}),
        ...(allowedSmsCountryCodes ? { allowedSmsCountryCodes } : {}),
      };
    }
    if (smartAccountEnabled) {
      config.smartAccount = {
        sponsorGas,
        chain: activeChain,
      };
    }
    return [inAppWallet(config)];
  }, [
    authKey,
    normalizedAuthOptions,
    smartAccountEnabled,
    sponsorGas,
    activeChain,
    defaultSmsCountryCode,
    allowedSmsCountryCodes,
  ]);

  return {
    wallet,
    wallets,
    smartAccountEnabled,
    chain,
  };
}
