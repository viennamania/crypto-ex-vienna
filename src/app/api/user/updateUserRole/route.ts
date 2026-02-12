import { NextResponse, type NextRequest } from "next/server";
import { updateUserRole } from "@lib/api/user";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { storecode = '', walletAddress, role } = body;

  if (!walletAddress || !role) {
    return NextResponse.json({ error: "walletAddress and role are required" }, { status: 400 });
  }

  try {
    const updatedUser = await updateUserRole({ storecode, walletAddress, role });
    if (!updatedUser) {
      return NextResponse.json({ error: "사용자 정보를 업데이트할 수 없습니다." }, { status: 400 });
    }
    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("updateUserRole error", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
