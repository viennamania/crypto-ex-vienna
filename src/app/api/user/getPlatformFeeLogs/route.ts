import { NextResponse, type NextRequest } from "next/server";
import clientPromise, { dbName } from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { storecode, walletAddress, limit = 50 } = body;

  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const client = await clientPromise;
  const logs = client.db(dbName).collection("platform_fee_logs");

  const filter: any = { walletAddress };
  if (storecode) filter.storecode = storecode;

  const result = await logs
    .find(filter)
    .sort({ changedAt: -1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .toArray();

  return NextResponse.json({ result });
}
