import clientPromise from '../mongodb';
import { dbName } from '../mongodb';

export interface FavoriteWallet {
  _id?: string;
  ownerWalletAddress: string;
  walletAddress: string;
  label?: string | null;
  chainId?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function listFavoriteWallets(ownerWalletAddress: string): Promise<FavoriteWallet[]> {
  if (!ownerWalletAddress) return [];

  const client = await clientPromise;
  const collection = client.db(dbName).collection<FavoriteWallet>('favorite_wallets');

  return collection
    .find(
      { ownerWalletAddress: ownerWalletAddress.toLowerCase() },
      { projection: { ownerWalletAddress: 1, walletAddress: 1, label: 1, chainId: 1, createdAt: 1, updatedAt: 1 } }
    )
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(50)
    .toArray();
}

export async function upsertFavoriteWallet(params: {
  ownerWalletAddress: string;
  walletAddress: string;
  label?: string | null;
  chainId?: number | null;
}) {
  const { ownerWalletAddress, walletAddress, label, chainId } = params;
  if (!ownerWalletAddress || !walletAddress) return null;

  const client = await clientPromise;
  const collection = client.db(dbName).collection<FavoriteWallet>('favorite_wallets');

  const now = new Date().toISOString();
  const owner = ownerWalletAddress.toLowerCase();
  const target = walletAddress.toLowerCase();

  await collection.updateOne(
    { ownerWalletAddress: owner, walletAddress: target },
    {
      $set: {
        ownerWalletAddress: owner,
        walletAddress: target,
        label: label ?? null,
        chainId: chainId ?? null,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  return collection.findOne({ ownerWalletAddress: owner, walletAddress: target });
}

export async function removeFavoriteWallet(ownerWalletAddress: string, walletAddress: string) {
  if (!ownerWalletAddress || !walletAddress) return { deletedCount: 0 };

  const client = await clientPromise;
  const collection = client.db(dbName).collection<FavoriteWallet>('favorite_wallets');

  return collection.deleteOne({
    ownerWalletAddress: ownerWalletAddress.toLowerCase(),
    walletAddress: walletAddress.toLowerCase(),
  });
}
