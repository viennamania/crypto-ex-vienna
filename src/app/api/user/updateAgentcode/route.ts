import { NextRequest, NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";
import { dbName } from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const walletAddress = body?.walletAddress;
  const agentcode = body?.agentcode;

  if (!walletAddress || !agentcode) {
    return NextResponse.json({ error: "walletAddress and agentcode are required" }, { status: 400 });
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection("users");

  const result = await collection.updateOne(
    { walletAddress },
    { $set: { agentcode } }
  );

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
