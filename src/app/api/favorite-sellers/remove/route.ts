import { NextResponse, type NextRequest } from "next/server";
import { removeFavoriteSeller } from "@lib/api/favoriteSeller";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { ownerWalletAddress, sellerWalletAddress } = body;

  if (!ownerWalletAddress || !sellerWalletAddress) {
    return NextResponse.json({ error: "ownerWalletAddress and sellerWalletAddress are required" }, { status: 400 });
  }

  const result = await removeFavoriteSeller(ownerWalletAddress, sellerWalletAddress);
  return NextResponse.json({ result });
}
