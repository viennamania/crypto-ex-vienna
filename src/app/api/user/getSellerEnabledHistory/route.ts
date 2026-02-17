import { NextRequest, NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";
import { dbName } from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const walletAddress = (body?.walletAddress || "").trim();
  const limit = Number(body?.limit) || 10;
  const page = Number(body?.page) || 1;

  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection("seller_enabled_logs");

  const escapedWalletAddress = walletAddress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const query = {
    walletAddress: { $regex: `^${escapedWalletAddress}$`, $options: "i" },
  };
  const items = await collection
    .find(query, {
      limit,
      skip: (page - 1) * limit,
    })
    .sort({ changedAt: -1 })
    .toArray();

  const totalCount = await collection.countDocuments(query);

  return NextResponse.json({ result: { items, totalCount } });
}
