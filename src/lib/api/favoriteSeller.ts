import clientPromise, { dbName } from '../mongodb';

export interface FavoriteSeller {
  ownerWalletAddress: string;
  sellerWalletAddress: string;
  sellerNickname?: string | null;
  storecode?: string | null;
  createdAt?: string;
}

export async function listFavoriteSellers(ownerWalletAddress: string) {
  if (!ownerWalletAddress) return [];
  const client = await clientPromise;
  const col = client.db(dbName).collection<FavoriteSeller>('favorite_sellers');
  return col
    .find({ ownerWalletAddress: ownerWalletAddress.toLowerCase() })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
}

export async function addFavoriteSeller(fav: FavoriteSeller) {
  if (!fav.ownerWalletAddress || !fav.sellerWalletAddress) return null;
  const client = await clientPromise;
  const col = client.db(dbName).collection<FavoriteSeller>('favorite_sellers');
  const now = new Date().toISOString();
  await col.updateOne(
    {
      ownerWalletAddress: fav.ownerWalletAddress.toLowerCase(),
      sellerWalletAddress: fav.sellerWalletAddress.toLowerCase(),
    },
    {
      $set: {
        ownerWalletAddress: fav.ownerWalletAddress.toLowerCase(),
        sellerWalletAddress: fav.sellerWalletAddress.toLowerCase(),
        sellerNickname: fav.sellerNickname ?? null,
        storecode: fav.storecode ?? null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  return fav;
}

export async function removeFavoriteSeller(ownerWalletAddress: string, sellerWalletAddress: string) {
  if (!ownerWalletAddress || !sellerWalletAddress) return { deletedCount: 0 };
  const client = await clientPromise;
  const col = client.db(dbName).collection<FavoriteSeller>('favorite_sellers');
  return col.deleteOne({
    ownerWalletAddress: ownerWalletAddress.toLowerCase(),
    sellerWalletAddress: sellerWalletAddress.toLowerCase(),
  });
}
