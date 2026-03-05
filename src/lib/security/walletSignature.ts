const toText = (value: unknown) => String(value ?? '').trim();

export const WALLET_SIGNATURE_AUTH_VERSION = 'ORANGEX_WALLET_AUTH_V1';

export const isWalletAddress = (value: unknown) =>
  /^0x[a-fA-F0-9]{40}$/.test(toText(value));

export const normalizeWalletAddress = (value: unknown) =>
  toText(value).toLowerCase();

export type WalletSignatureAuthPayload = {
  walletAddress: string;
  timestamp: number;
  nonce: string;
  signature: string;
  chainId?: number;
};

type WalletSignatureMessageParams = {
  walletAddress: string;
  storecode?: string;
  path: string;
  method?: string;
  timestamp: number;
  nonce: string;
  chainId?: number;
};

const resolveChainIdByName = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  if (normalized === 'ethereum' || normalized === 'eth' || normalized === 'mainnet') return 1;
  if (normalized === 'polygon' || normalized === 'matic') return 137;
  if (normalized === 'arbitrum' || normalized === 'arb') return 42161;
  if (normalized === 'bsc' || normalized === 'bnb') return 56;
  return null;
};

const normalizeChainId = (value: unknown): number | undefined => {
  const candidate = Number(value);
  if (Number.isInteger(candidate) && candidate > 0) {
    return candidate;
  }

  const byName = resolveChainIdByName(value);
  return byName ?? undefined;
};

const resolveDefaultChainId = () => normalizeChainId(process.env.NEXT_PUBLIC_CHAIN);

export const buildWalletSignatureMessage = ({
  walletAddress,
  storecode,
  path,
  method = 'POST',
  timestamp,
  nonce,
  chainId,
}: WalletSignatureMessageParams) => {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const normalizedChainId = normalizeChainId(chainId);

  return [
    WALLET_SIGNATURE_AUTH_VERSION,
    `walletAddress:${normalizedWalletAddress}`,
    `storecode:${toText(storecode) || '-'}`,
    `chainId:${normalizedChainId ?? '-'}`,
    `method:${toText(method).toUpperCase() || 'POST'}`,
    `path:${toText(path)}`,
    `timestamp:${Number(timestamp)}`,
    `nonce:${toText(nonce)}`,
  ].join('\n');
};

type SignMessageAccount = {
  address?: string;
  signMessage?: (options: {
    message: string;
    originalMessage?: string;
    chainId?: number;
  }) => Promise<string>;
};

const createNonce = () => {
  const randomUUID = globalThis?.crypto?.randomUUID;
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto);
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const createWalletSignatureAuthPayload = async ({
  account,
  storecode,
  path,
  method = 'POST',
  chainId,
}: {
  account: SignMessageAccount | null | undefined;
  storecode?: string;
  path: string;
  method?: string;
  chainId?: number;
}): Promise<WalletSignatureAuthPayload> => {
  const walletAddress = toText(account?.address);

  if (!isWalletAddress(walletAddress)) {
    throw new Error('walletAddress is invalid for wallet signature authentication.');
  }

  const signMessage = account?.signMessage;

  if (typeof signMessage !== 'function') {
    throw new Error('Connected wallet does not support signMessage.');
  }

  const timestamp = Date.now();
  const nonce = createNonce();
  const resolvedChainId = normalizeChainId(chainId) ?? resolveDefaultChainId();

  const message = buildWalletSignatureMessage({
    walletAddress,
    storecode,
    path,
    method,
    timestamp,
    nonce,
    chainId: resolvedChainId,
  });

  const signature = await signMessage({
    message,
    ...(resolvedChainId ? { chainId: resolvedChainId } : {}),
  });

  if (!toText(signature)) {
    throw new Error('Wallet signature generation failed.');
  }

  return {
    walletAddress: normalizeWalletAddress(walletAddress),
    timestamp,
    nonce,
    signature: toText(signature),
    ...(resolvedChainId ? { chainId: resolvedChainId } : {}),
  };
};
