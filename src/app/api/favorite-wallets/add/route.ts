import { NextResponse, type NextRequest } from "next/server";
import { upsertFavoriteWallet } from "@lib/api/favoriteWallet";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { ownerWalletAddress, walletAddress, label, chainId } = body ?? {};

  if (!ownerWalletAddress || !walletAddress) {
    return NextResponse.json({ error: "ownerWalletAddress and walletAddress are required" }, { status: 400 });
  }

  const isEth = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);
  if (!isEth) {
    return NextResponse.json({ error: "walletAddress must be a valid EVM address" }, { status: 400 });
  }

  const result = await upsertFavoriteWallet({
    ownerWalletAddress,
    walletAddress,
    label: label ?? null,
    chainId: typeof chainId === "number" ? chainId : null,
  });

  return NextResponse.json({ result });
}
