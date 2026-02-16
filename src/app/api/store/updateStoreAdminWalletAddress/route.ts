import { NextResponse, type NextRequest } from "next/server";

import {
	updateStoreAdminWalletAddress,
} from '@lib/api/store';
import clientPromise, { dbName } from '@/lib/mongodb';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeAddress = (value: string) => String(value || '').trim().toLowerCase();
const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

export async function POST(request: NextRequest) {

  const body = await request.json().catch(() => ({}));

  const {
    storecode,
    adminWalletAddress,
    changedByWalletAddress,
    changedByName,
  } = body;

  const normalizedStorecode = String(storecode || '').trim();
  const normalizedAdminWalletAddress = String(adminWalletAddress || '').trim();

  if (!normalizedStorecode || !normalizedAdminWalletAddress) {
    return NextResponse.json({
      error: "storecode and adminWalletAddress are required",
    }, { status: 400 });
  }

  if (!isWalletAddress(normalizedAdminWalletAddress)) {
    return NextResponse.json({
      error: "invalid adminWalletAddress",
    }, { status: 400 });
  }

  const client = await clientPromise;
  const storeCollection = client.db(dbName).collection('stores');
  const historyCollection = client.db(dbName).collection('store_admin_wallet_role_logs');

  const store = await storeCollection.findOne(
    { storecode: { $regex: `^${escapeRegex(normalizedStorecode)}$`, $options: 'i' } },
    { projection: { storecode: 1, storeName: 1, adminWalletAddress: 1 } }
  );

  if (!store) {
    return NextResponse.json({
      error: "store not found",
    }, { status: 404 });
  }

  const previousAdminWalletAddress = String(store?.adminWalletAddress || '').trim();
  const isChanged =
    normalizeAddress(previousAdminWalletAddress) !== normalizeAddress(normalizedAdminWalletAddress);

  const resolvedStorecode = String(store?.storecode || normalizedStorecode).trim();

  const result = await updateStoreAdminWalletAddress({
    storecode: resolvedStorecode,
    adminWalletAddress: normalizedAdminWalletAddress,
  });

  if (!result) {
    return NextResponse.json({
      error: "failed to update admin wallet address",
    }, { status: 500 });
  }

  if (isChanged) {
    await historyCollection.insertOne({
      storecode: resolvedStorecode,
      storeName: String(store?.storeName || ''),
      prevAdminWalletAddress: previousAdminWalletAddress,
      nextAdminWalletAddress: normalizedAdminWalletAddress,
      changedByWalletAddress: String(changedByWalletAddress || '').trim(),
      changedByName: String(changedByName || '').trim(),
      changedAt: new Date(),
    });
  }
 
  return NextResponse.json({
    result,
    changed: isChanged,
  });
  
}
