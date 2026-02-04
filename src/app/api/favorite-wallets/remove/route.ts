import { NextResponse, type NextRequest } from "next/server";
import { removeFavoriteWallet } from "@lib/api/favoriteWallet";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { ownerWalletAddress, walletAddress } = body ?? {};

  if (!ownerWalletAddress || !walletAddress) {
    return NextResponse.json({ error: "ownerWalletAddress and walletAddress are required" }, { status: 400 });
  }

  const result = await removeFavoriteWallet(ownerWalletAddress, walletAddress);
  return NextResponse.json({ result });
}
