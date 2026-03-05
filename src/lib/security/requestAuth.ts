import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { createThirdwebClient } from 'thirdweb';
import { verifySignature } from 'thirdweb/auth';
import { ethereum, polygon, arbitrum, bsc, type Chain } from 'thirdweb/chains';
import { getUser as getThirdwebUser } from 'thirdweb/wallets';

import clientPromise, { dbName } from '@lib/mongodb';
import { normalizeIpAddress, pickFirstPublicIpAddress } from '@/lib/ip-address';
import {
  buildWalletSignatureMessage,
  isWalletAddress,
  normalizeWalletAddress,
  type WalletSignatureAuthPayload,
} from '@/lib/security/walletSignature';

type WalletAuthNonceState = {
  expiresAt: number;
};

type WalletAuthNonceStore = Map<string, WalletAuthNonceState>;

declare global {
  // eslint-disable-next-line no-var
  var __orangeXWalletAuthNonces: WalletAuthNonceStore | undefined;
}

const toText = (value: unknown) => String(value ?? '').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CHAIN_BY_ID: Record<number, Chain> = {
  1: ethereum,
  56: bsc,
  137: polygon,
  42161: arbitrum,
};

const CHAIN_BY_NAME: Record<string, Chain> = {
  ethereum,
  eth: ethereum,
  mainnet: ethereum,
  bsc,
  bnb: bsc,
  polygon,
  matic: polygon,
  arbitrum,
  arb: arbitrum,
};

const getNonceStore = (): WalletAuthNonceStore => {
  if (!globalThis.__orangeXWalletAuthNonces) {
    globalThis.__orangeXWalletAuthNonces = new Map<string, WalletAuthNonceState>();
  }

  return globalThis.__orangeXWalletAuthNonces;
};

const cleanupExpiredNonces = (store: WalletAuthNonceStore, now: number) => {
  for (const [key, value] of store.entries()) {
    if (value.expiresAt <= now) {
      store.delete(key);
    }
  }
};

const consumeNonce = ({
  walletAddress,
  nonce,
  ttlMs,
}: {
  walletAddress: string;
  nonce: string;
  ttlMs: number;
}) => {
  const now = Date.now();
  const store = getNonceStore();
  cleanupExpiredNonces(store, now);

  const nonceKey = `${walletAddress}:${nonce}`;
  const existing = store.get(nonceKey);

  if (existing && existing.expiresAt > now) {
    return false;
  }

  store.set(nonceKey, {
    expiresAt: now + ttlMs,
  });

  return true;
};

const parseSignatureAuthPayload = (value: unknown): WalletSignatureAuthPayload | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;

  const walletAddress = normalizeWalletAddress(source.walletAddress);
  const nonce = toText(source.nonce);
  const signature = toText(source.signature);

  const timestampRaw = source.timestamp;
  const timestamp =
    typeof timestampRaw === 'number'
      ? timestampRaw
      : Number(toText(timestampRaw));

  const chainIdRaw = source.chainId;
  const chainIdCandidate = Number(toText(chainIdRaw));
  const chainId =
    Number.isInteger(chainIdCandidate) && chainIdCandidate > 0
      ? chainIdCandidate
      : undefined;

  if (!isWalletAddress(walletAddress) || !nonce || !signature || !Number.isFinite(timestamp)) {
    return null;
  }

  return {
    walletAddress,
    nonce,
    signature,
    timestamp: Math.trunc(timestamp),
    ...(chainId ? { chainId } : {}),
  };
};

const resolvePreferredChains = (chainId?: number): Chain[] => {
  const candidates: Chain[] = [];
  if (chainId && CHAIN_BY_ID[chainId]) {
    candidates.push(CHAIN_BY_ID[chainId]);
  }

  const configuredChainName = toText(process.env.NEXT_PUBLIC_CHAIN).toLowerCase();
  if (configuredChainName && CHAIN_BY_NAME[configuredChainName]) {
    const configuredChain = CHAIN_BY_NAME[configuredChainName];
    if (!candidates.includes(configuredChain)) {
      candidates.push(configuredChain);
    }
  }

  for (const chain of [polygon, arbitrum, bsc, ethereum]) {
    if (!candidates.includes(chain)) {
      candidates.push(chain);
    }
  }

  return candidates;
};

const createThirdwebVerificationClient = () => {
  const secretKey = toText(process.env.THIRDWEB_SECRET_KEY);
  if (secretKey) {
    return createThirdwebClient({ secretKey });
  }

  const clientId = toText(process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID);
  if (clientId) {
    return createThirdwebClient({ clientId });
  }

  return null;
};

export const resolvePrimaryWalletAddress = async (walletAddress: string) => {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  if (!isWalletAddress(normalizedWalletAddress)) {
    return '';
  }

  const thirdwebClient = createThirdwebVerificationClient();
  if (!thirdwebClient) {
    return normalizedWalletAddress;
  }

  try {
    const thirdwebUser = await getThirdwebUser({
      client: thirdwebClient,
      walletAddress: normalizedWalletAddress,
    });
    const ownerWalletAddress = normalizeWalletAddress(thirdwebUser?.walletAddress || '');
    if (isWalletAddress(ownerWalletAddress)) {
      return ownerWalletAddress;
    }
  } catch {
    // Keep normalized walletAddress on fallback path.
  }

  return normalizedWalletAddress;
};

export const isWalletAddressAuthorizedForExpectedWallet = async ({
  expectedWalletAddress,
  candidateWalletAddress,
}: {
  expectedWalletAddress: string;
  candidateWalletAddress: string;
}) => {
  const normalizedExpectedWalletAddress = normalizeWalletAddress(expectedWalletAddress);
  const normalizedCandidateWalletAddress = normalizeWalletAddress(candidateWalletAddress);

  if (!isWalletAddress(normalizedExpectedWalletAddress) || !isWalletAddress(normalizedCandidateWalletAddress)) {
    return false;
  }

  if (normalizedExpectedWalletAddress === normalizedCandidateWalletAddress) {
    return true;
  }

  const [expectedPrimaryWalletAddress, candidatePrimaryWalletAddress] = await Promise.all([
    resolvePrimaryWalletAddress(normalizedExpectedWalletAddress),
    resolvePrimaryWalletAddress(normalizedCandidateWalletAddress),
  ]);

  if (isWalletAddress(expectedPrimaryWalletAddress) && expectedPrimaryWalletAddress === normalizedCandidateWalletAddress) {
    return true;
  }

  if (isWalletAddress(candidatePrimaryWalletAddress) && candidatePrimaryWalletAddress === normalizedExpectedWalletAddress) {
    return true;
  }

  if (
    isWalletAddress(expectedPrimaryWalletAddress)
    && isWalletAddress(candidatePrimaryWalletAddress)
    && expectedPrimaryWalletAddress === candidatePrimaryWalletAddress
  ) {
    return true;
  }

  return false;
};

export const getRequesterIpAddress = (request: NextRequest) =>
  pickFirstPublicIpAddress([
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-real-ip'),
    request.headers.get('cf-connecting-ip'),
  ]) || normalizeIpAddress(request.headers.get('x-forwarded-for'));

export const verifyWalletAuthFromBody = async ({
  body,
  path,
  method = 'POST',
  storecode,
  consumeNonceValue = true,
  maxAgeMs = 5 * 60 * 1000,
  futureSkewMs = 30_000,
}: {
  body: Record<string, unknown>;
  path: string;
  method?: string;
  storecode?: string;
  consumeNonceValue?: boolean;
  maxAgeMs?: number;
  futureSkewMs?: number;
}): Promise<
  | {
      ok: true;
      walletAddress: string;
      authPayload: WalletSignatureAuthPayload;
    }
  | {
      ok: false;
      response: NextResponse;
    }
  | {
      ok: null;
    }
> => {
  const authPayload = parseSignatureAuthPayload(body?.auth);

  if (!authPayload) {
    return { ok: null };
  }

  const now = Date.now();
  const ageMs = now - authPayload.timestamp;

  if (ageMs > maxAgeMs || ageMs < -futureSkewMs) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'wallet signature is expired.' }, { status: 401 }),
    };
  }

  const message = buildWalletSignatureMessage({
    walletAddress: authPayload.walletAddress,
    storecode,
    path,
    method,
    timestamp: authPayload.timestamp,
    nonce: authPayload.nonce,
    chainId: authPayload.chainId,
  });

  let recoveredAddress = '';
  let isSignatureValid = false;

  try {
    recoveredAddress = normalizeWalletAddress(
      ethers.utils.verifyMessage(message, authPayload.signature),
    );
    if (isWalletAddress(recoveredAddress) && recoveredAddress === authPayload.walletAddress) {
      isSignatureValid = true;
    }
  } catch {
    recoveredAddress = '';
  }

  if (!isSignatureValid) {
    const thirdwebClient = createThirdwebVerificationClient();
    if (thirdwebClient) {
      const chains = resolvePreferredChains(authPayload.chainId);
      for (const chain of chains) {
        try {
          const matched = await verifySignature({
            client: thirdwebClient,
            chain,
            address: authPayload.walletAddress,
            message,
            signature: authPayload.signature,
          });
          if (matched) {
            isSignatureValid = true;
            recoveredAddress = authPayload.walletAddress;
            break;
          }
        } catch {
          // Keep iterating through fallback chains.
        }
      }
    }
  }

  if (!isSignatureValid) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'wallet signature is invalid or does not match walletAddress.' }, { status: 401 }),
    };
  }

  if (consumeNonceValue) {
    const consumed = consumeNonce({
      walletAddress: recoveredAddress,
      nonce: authPayload.nonce,
      ttlMs: maxAgeMs,
    });

    if (!consumed) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'wallet signature nonce already used.' }, { status: 409 }),
      };
    }
  }

  return {
    ok: true,
    walletAddress: recoveredAddress,
    authPayload,
  };
};

export const getRoleForWalletAddress = async ({
  storecode,
  walletAddress,
}: {
  storecode?: string;
  walletAddress: string;
}) => {
  if (!isWalletAddress(walletAddress)) {
    return null;
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection('users');

  const walletAddressRegex = {
    $regex: `^${escapeRegex(walletAddress)}$`,
    $options: 'i',
  };
  const filter: Record<string, unknown> = {
    $or: [
      { walletAddress: walletAddressRegex },
      { smartAccountAddress: walletAddressRegex },
      { 'thirdweb.smartAccountAddress': walletAddressRegex },
    ],
  };

  const normalizedStorecode = toText(storecode);
  if (normalizedStorecode) {
    filter.storecode = normalizedStorecode;
  }

  const user = await collection.findOne<Record<string, unknown>>(filter, {
    projection: {
      _id: 0,
      walletAddress: 1,
      storecode: 1,
      role: 1,
      nickname: 1,
    },
  });

  if (user) {
    return {
      walletAddress: toText(user.walletAddress),
      storecode: toText(user.storecode),
      role: toText(user.role).toLowerCase(),
      nickname: toText(user.nickname),
    };
  }

  const thirdwebClient = createThirdwebVerificationClient();
  if (!thirdwebClient) {
    return null;
  }

  try {
    const thirdwebUser = await getThirdwebUser({
      client: thirdwebClient,
      walletAddress,
    });

    const ownerWalletAddress = normalizeWalletAddress(
      thirdwebUser?.walletAddress || '',
    );

    if (!isWalletAddress(ownerWalletAddress)) {
      return null;
    }

    const ownerFilter: Record<string, unknown> = {
      walletAddress: {
        $regex: `^${escapeRegex(ownerWalletAddress)}$`,
        $options: 'i',
      },
    };
    if (normalizedStorecode) {
      ownerFilter.storecode = normalizedStorecode;
    }

    const ownerUser = await collection.findOne<Record<string, unknown>>(ownerFilter, {
      projection: {
        _id: 0,
        walletAddress: 1,
        storecode: 1,
        role: 1,
        nickname: 1,
      },
    });

    if (!ownerUser) {
      return null;
    }

    return {
      walletAddress: toText(ownerUser.walletAddress),
      storecode: toText(ownerUser.storecode),
      role: toText(ownerUser.role).toLowerCase(),
      nickname: toText(ownerUser.nickname),
    };
  } catch {
    return null;
  }
};
