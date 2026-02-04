import { NextResponse, type NextRequest } from "next/server";
import { listFavoriteSellers } from "@lib/api/favoriteSeller";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { ownerWalletAddress } = body;

  if (!ownerWalletAddress) {
    return NextResponse.json({ result: [] });
  }

  const result = await listFavoriteSellers(ownerWalletAddress);
  return NextResponse.json({ result });
}
