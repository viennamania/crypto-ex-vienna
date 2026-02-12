import { NextRequest, NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";
import { dbName } from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const walletAddress = (body?.walletAddress || "").trim();
  const verified = body?.verified;

  if (!walletAddress || typeof verified !== "boolean") {
    return NextResponse.json({ error: "walletAddress and verified(boolean) are required" }, { status: 400 });
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection("users");
  const historyCollection = client.db(dbName).collection("buyer_verified_logs");

  const addrLower = walletAddress.toLowerCase();
  const addrUpper = walletAddress.toUpperCase();
  const addrCandidates = [walletAddress, addrLower, addrUpper];

  const walletQuery = {
    $or: [
      { walletAddress: { $in: addrCandidates } },
      { walletAddress: { $regex: `^${walletAddress}$`, $options: "i" } },
      { "buyer.walletAddress": { $in: addrCandidates } },
      { "store.walletAddress": { $in: addrCandidates } },
      { "storeInfo.walletAddress": { $in: addrCandidates } },
    ],
  };

  const existing = await collection.findOne(walletQuery, {
    projection: { buyer: 1, walletAddress: 1, nickname: 1 },
  });

  const result = await collection.updateMany(walletQuery, {
    $set: {
      verified,
    },
  });

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  const updated = await collection.findOne(walletQuery, {
    projection: { buyer: 1, walletAddress: 1, nickname: 1, verified: 1 },
  });

  await historyCollection.insertOne({
    walletAddress,
    prevVerified: existing?.verified ?? null,
    newVerified: verified,
    nickname: existing?.nickname || null,
    changedAt: new Date(),
  });

  return NextResponse.json({
    success: true,
    user: updated,
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });
}
