import { NextResponse, type NextRequest } from "next/server";
import { searchUsersByNickname } from "@lib/api/user";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { storecode, nickname, limit } = body ?? {};

  if (!nickname || typeof nickname !== "string" || nickname.trim().length === 0) {
    return NextResponse.json({ error: "nickname is required" }, { status: 400 });
  }

  const maxLimit = Math.min(Number(limit) || 20, 50);

  const result = await searchUsersByNickname(storecode, nickname, maxLimit);

  return NextResponse.json({ result });
}
