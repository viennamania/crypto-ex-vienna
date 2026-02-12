import { NextRequest, NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";
import { dbName } from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const walletAddress = (body?.walletAddress || "").trim();
  const enabled = body?.enabled;

  if (!walletAddress || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "walletAddress and enabled(boolean) are required" }, { status: 400 });
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection("users");
  const historyCollection = client.db(dbName).collection("seller_enabled_logs");

  const addrLower = walletAddress.toLowerCase();
  const addrUpper = walletAddress.toUpperCase();
  const addrCandidates = [walletAddress, addrLower, addrUpper];

  const walletQuery = {
    $or: [
      { walletAddress: { $in: addrCandidates } },
      { walletAddress: { $regex: `^${walletAddress}$`, $options: "i" } },
      { "seller.walletAddress": { $in: addrCandidates } },
      { "store.walletAddress": { $in: addrCandidates } },
      { "storeInfo.walletAddress": { $in: addrCandidates } },
    ],
  };

  const existing = await collection.findOne(walletQuery, {
    projection: { seller: 1, walletAddress: 1, nickname: 1 },
  });

  const result = await collection.updateMany(walletQuery, {
    $set: {
      "seller.enabled": enabled,
    },
  });

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  const updated = await collection.findOne(walletQuery, {
    projection: { seller: 1, walletAddress: 1, nickname: 1 },
  });

  await historyCollection.insertOne({
    walletAddress,
    prevEnabled: existing?.seller?.enabled ?? null,
    newEnabled: enabled,
    nickname: existing?.nickname || null,
    changedAt: new Date(),
  });

  return NextResponse.json({ success: true, user: updated, matched: result.matchedCount, modified: result.modifiedCount });
}
