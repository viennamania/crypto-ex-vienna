import { clientId } from '@/app/client';

const LOCAL_STORAGE_EXACT_KEYS = [
  'thirdweb:connected-wallet-ids',
  'tw:connected-wallet-params',
  'tw.wc.lastUsedChainId',
  'tw.wc.requestedChains',
  'sellerOwnerWalletAddress',
  'orangex-seller-escrow-cache',
  'WALLETCONNECT_DEEPLINK_CHOICE',
];

const LOCAL_STORAGE_PREFIXES = [
  'thirdwebEwsWalletUserId-',
  'thirdwebEwsWalletUserDetails-',
  'walletToken-',
  'walletConnectSessions-',
  'thirdweb_guest_session_id_',
  'passkey-credential-id-',
  'wc@',
];

const SESSION_STORAGE_PREFIXES = [
  'thirdweb-user-sync:',
  'thirdweb:',
  'wc@',
  'walletconnect',
  'thirdweb',
];

const getLocalStoragePrefixes = () => {
  const prefixes = [...LOCAL_STORAGE_PREFIXES];
  if (clientId) {
    prefixes.push(`a-${clientId}-`);
  }
  return prefixes;
};

const safeIterateKeys = (storage: Storage, cb: (key: string) => void) => {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (!key) continue;
    cb(key);
  }
};

const removeByRule = (
  storage: Storage,
  exactKeys: string[],
  prefixes: string[],
) => {
  exactKeys.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove storage key', key, error);
    }
  });

  safeIterateKeys(storage, (key) => {
    const shouldRemove = prefixes.some((prefix) => key.startsWith(prefix));
    if (!shouldRemove) {
      return;
    }
    try {
      storage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove storage key by prefix', key, error);
    }
  });
};

export const clearWalletConnectionState = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    removeByRule(
      window.localStorage,
      LOCAL_STORAGE_EXACT_KEYS,
      getLocalStoragePrefixes(),
    );
  } catch (error) {
    console.warn('Failed to clear localStorage wallet state', error);
  }

  try {
    removeByRule(window.sessionStorage, [], SESSION_STORAGE_PREFIXES);
  } catch (error) {
    console.warn('Failed to clear sessionStorage wallet state', error);
  }
};
