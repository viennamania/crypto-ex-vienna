import { NextResponse, type NextRequest } from "next/server";
import { addFavoriteSeller } from "@lib/api/favoriteSeller";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { ownerWalletAddress, sellerWalletAddress, sellerNickname, storecode } = body;

  if (!ownerWalletAddress || !sellerWalletAddress) {
    return NextResponse.json({ error: "ownerWalletAddress and sellerWalletAddress are required" }, { status: 400 });
  }

  const result = await addFavoriteSeller({
    ownerWalletAddress,
    sellerWalletAddress,
    sellerNickname,
    storecode,
  });

  return NextResponse.json({ result });
}
