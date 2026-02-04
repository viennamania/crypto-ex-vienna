import { NextResponse, type NextRequest } from "next/server";
import clientPromise, { dbName } from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { storecode, walletAddress, feeWalletAddress, feeRate, changedBy = "admin" } = body;

  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const client = await clientPromise;
  const users = client.db(dbName).collection("users");
  const logs = client.db(dbName).collection("platform_fee_logs");

  const filter: any = { walletAddress };
  if (storecode) filter.storecode = storecode;

  const current = await users.findOne(filter, { projection: { seller: 1, storecode: 1, walletAddress: 1 } });
  const prevFee = current?.seller?.platformFee || null;

  const nextFee = {
    walletAddress: feeWalletAddress,
    rate: typeof feeRate === "number" ? feeRate : Number(feeRate),
  };

  await users.updateOne(filter, {
    $set: { "seller.platformFee": nextFee },
    $currentDate: { updatedAt: true },
  });

  await logs.insertOne({
    walletAddress,
    storecode: current?.storecode || storecode || "admin",
    prev: prevFee,
    next: nextFee,
    changedAt: new Date().toISOString(),
    changedBy,
  });

  return NextResponse.json({ result: nextFee });
}
