import { NextResponse, type NextRequest } from "next/server";
import { listFavoriteWallets } from "@lib/api/favoriteWallet";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { ownerWalletAddress } = body ?? {};

  if (!ownerWalletAddress) {
    return NextResponse.json({ error: "ownerWalletAddress is required" }, { status: 400 });
  }

  const result = await listFavoriteWallets(ownerWalletAddress);
  return NextResponse.json({ result });
}
