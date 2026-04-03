import clientPromise, { dbName } from '../mongodb';

export type WalletTokenRecord = {
  _id?: string;
  ownerWalletAddress: string;
  tokenAddress: string;
  chainId: number;
  chainSlug: string;
  tokenName: string;
  tokenSymbol: string;
  logoUrl?: string | null;
  initialSupply?: string | null;
  mintTxHash?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const normalizeWalletAddress = (value: string) => String(value || '').trim().toLowerCase();
const normalizeText = (value: unknown, maxLength = 0) => {
  const text = String(value ?? '').trim();
  if (!maxLength || text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
};

export async function listWalletTokens(
  ownerWalletAddress: string,
  chainId?: number,
): Promise<WalletTokenRecord[]> {
  const normalizedOwnerWalletAddress = normalizeWalletAddress(ownerWalletAddress);
  if (!normalizedOwnerWalletAddress) {
    return [];
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection<WalletTokenRecord>('wallet_tokens');

  const filter: Record<string, unknown> = {
    ownerWalletAddress: normalizedOwnerWalletAddress,
  };

  if (typeof chainId === 'number' && Number.isInteger(chainId) && chainId > 0) {
    filter.chainId = chainId;
  }

  return collection
    .find(filter, {
      projection: {
        ownerWalletAddress: 1,
        tokenAddress: 1,
        chainId: 1,
        chainSlug: 1,
        tokenName: 1,
        tokenSymbol: 1,
        logoUrl: 1,
        initialSupply: 1,
        mintTxHash: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(50)
    .toArray();
}

export async function upsertWalletToken(params: {
  ownerWalletAddress: string;
  tokenAddress: string;
  chainId: number;
  chainSlug?: string;
  tokenName: string;
  tokenSymbol: string;
  logoUrl?: string | null;
  initialSupply?: string | null;
  mintTxHash?: string | null;
}) {
  const normalizedOwnerWalletAddress = normalizeWalletAddress(params.ownerWalletAddress);
  const normalizedTokenAddress = normalizeWalletAddress(params.tokenAddress);
  if (!normalizedOwnerWalletAddress || !normalizedTokenAddress) {
    return null;
  }

  const chainId = Number(params.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return null;
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection<WalletTokenRecord>('wallet_tokens');
  const now = new Date().toISOString();

  await collection.updateOne(
    {
      ownerWalletAddress: normalizedOwnerWalletAddress,
      tokenAddress: normalizedTokenAddress,
      chainId,
    },
    {
      $set: {
        ownerWalletAddress: normalizedOwnerWalletAddress,
        tokenAddress: normalizedTokenAddress,
        chainId,
        chainSlug: normalizeText(params.chainSlug || 'bsc', 24) || 'bsc',
        tokenName: normalizeText(params.tokenName, 120),
        tokenSymbol: normalizeText(params.tokenSymbol, 24).toUpperCase(),
        logoUrl: normalizeText(params.logoUrl, 2048) || null,
        initialSupply: normalizeText(params.initialSupply, 120) || null,
        mintTxHash: normalizeText(params.mintTxHash, 120) || null,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );

  return collection.findOne({
    ownerWalletAddress: normalizedOwnerWalletAddress,
    tokenAddress: normalizedTokenAddress,
    chainId,
  });
}
