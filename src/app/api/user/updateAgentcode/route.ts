import { NextRequest, NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";
import { dbName } from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const walletAddress = (body?.walletAddress || '').trim();
  const agentcode = body?.agentcode;

  if (!walletAddress || !agentcode) {
    return NextResponse.json({ error: "walletAddress and agentcode are required" }, { status: 400 });
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection("users");
  const historyCollection = client.db(dbName).collection("agent_change_logs");
  const agentsCollection = client.db(dbName).collection("agents");

  const addrLower = walletAddress.toLowerCase();
  const addrUpper = walletAddress.toUpperCase();
  const addrCandidates = [walletAddress, addrLower, addrUpper];
  const walletQuery = {
    $or: [
      { walletAddress: { $in: addrCandidates } },
      { walletAddress: { $regex: `^${walletAddress}$`, $options: 'i' } },
      { 'seller.walletAddress': { $in: addrCandidates } },
      { 'store.walletAddress': { $in: addrCandidates } },
      { 'storeInfo.walletAddress': { $in: addrCandidates } },
    ],
  };

  const existing = await collection.findOne(
    walletQuery,
    { projection: { agentcode: 1, seller: 1, nickname: 1, store: 1, storeInfo: 1, walletAddress: 1 } }
  );

  const updateResult = await collection.updateMany(walletQuery, {
    $set: {
      walletAddress,
      'seller.walletAddress': walletAddress,
      'store.walletAddress': walletAddress,
      'storeInfo.walletAddress': walletAddress,
      agentcode,
      'seller.agentcode': agentcode,
      'store.agentcode': agentcode,
      'storeInfo.agentcode': agentcode,
    },
  });

  if (updateResult.matchedCount === 0) {
    return NextResponse.json({ error: "user not found", debug: { walletAddress } }, { status: 404 });
  }
  if (updateResult.modifiedCount === 0) {
    return NextResponse.json({ error: "update failed", debug: { walletAddress } }, { status: 500 });
  }

  const updated = await collection.findOne(walletQuery, {
    projection: {
      agentcode: 1,
      seller: 1,
      store: 1,
      storeInfo: 1,
      walletAddress: 1,
      nickname: 1,
    },
  });

  if (!updated || updated.agentcode !== agentcode) {
    return NextResponse.json({ error: "update verification failed", debug: { walletAddress } }, { status: 500 });
  }

  const prevCode = existing?.agentcode || existing?.seller?.agentcode || null;
  const [prevAgent, newAgent] = await Promise.all([
    prevCode
      ? agentsCollection.findOne(
          { agentcode: prevCode },
          { projection: { agentcode: 1, agentName: 1, agentLogo: 1 } }
        )
      : null,
    agentsCollection.findOne(
      { agentcode },
      { projection: { agentcode: 1, agentName: 1, agentLogo: 1 } }
    ),
  ]);

  await historyCollection.insertOne({
    walletAddress,
    prevAgent: prevAgent
      ? {
          agentcode: prevAgent.agentcode,
          agentName: prevAgent.agentName,
          agentLogo: prevAgent.agentLogo,
        }
      : prevCode
      ? { agentcode: prevCode }
      : null,
    newAgent: newAgent
      ? {
          agentcode: newAgent.agentcode,
          agentName: newAgent.agentName,
          agentLogo: newAgent.agentLogo,
        }
      : { agentcode },
    nickname: existing?.nickname || null,
    changedAt: new Date(),
  });

  return NextResponse.json({
    success: true,
    user: updated,
    matched: updateResult.matchedCount,
    modified: updateResult.modifiedCount,
  });
}
