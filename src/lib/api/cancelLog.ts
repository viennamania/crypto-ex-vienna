import clientPromise, { dbName } from '../mongodb';

export type CancelLog = {
  _id?: string;
  sellerWalletAddress: string;
  orderId?: string;
  reason: string;
  status: 'success' | 'fail';
  actor?: string; // admin, system, etc.
  createdAt: string;
};

export async function insertCancelLog(log: CancelLog) {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('cancelLogs');
  const { _id, ...rest } = log;
  const doc = {
    ...rest,
    sellerWalletAddress: log.sellerWalletAddress.toLowerCase(),
  };
  const result = await collection.insertOne(doc as any);
  return { ...doc, _id: result.insertedId.toString() };
}

export async function getCancelLogsBySellerWalletAddress(
  sellerWalletAddress: string,
  limit = 50,
) {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('cancelLogs');
  const logs = await collection
    .find<CancelLog>({ sellerWalletAddress: sellerWalletAddress.toLowerCase() })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return logs;
}
