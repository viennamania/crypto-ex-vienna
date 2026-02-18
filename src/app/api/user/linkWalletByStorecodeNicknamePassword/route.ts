import { NextRequest, NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";
import { dbName } from "@/lib/mongodb";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const storecode = String(body?.storecode || "").trim();
  const nickname = String(body?.nickname || "").trim();
  const password = String(body?.password || "").trim();
  const walletAddress = String(body?.walletAddress || "").trim();
  const mobile = String(body?.mobile || "").trim();

  if (!storecode || !nickname || !password || !walletAddress) {
    return NextResponse.json(
      { error: "storecode, nickname, password, walletAddress are required." },
      { status: 400 },
    );
  }

  const client = await clientPromise;
  const users = client.db(dbName).collection("users");

  const normalizedStorecodeRegex = {
    $regex: `^${escapeRegex(storecode)}$`,
    $options: "i",
  };
  const normalizedNicknameRegex = {
    $regex: `^${escapeRegex(nickname)}$`,
    $options: "i",
  };
  const passwordCandidates: Array<string | number> = [password];
  if (/^\d+$/.test(password)) {
    passwordCandidates.push(Number(password));
  }

  const member = await users.findOne(
    {
      storecode: normalizedStorecodeRegex,
      nickname: normalizedNicknameRegex,
      password: { $in: passwordCandidates },
    },
    {
      projection: {
        _id: 1,
        storecode: 1,
        nickname: 1,
        walletAddress: 1,
        buyer: 1,
      },
    },
  );

  if (!member?._id) {
    return NextResponse.json(
      { error: "회원 아이디 또는 비밀번호가 올바르지 않습니다." },
      { status: 404 },
    );
  }

  const existingMemberWalletAddress = String(member?.walletAddress || "").trim();
  if (existingMemberWalletAddress) {
    const isSameWallet =
      existingMemberWalletAddress.toLowerCase() === walletAddress.toLowerCase();

    return NextResponse.json(
      {
        error: isSameWallet
          ? "이미 이 지갑에 연동된 회원입니다."
          : "이미 다른 지갑에 연동된 회원입니다.",
      },
      { status: 409 },
    );
  }

  const walletRegex = { $regex: `^${escapeRegex(walletAddress)}$`, $options: "i" };

  const alreadyLinkedUser = await users.findOne(
    {
      storecode: normalizedStorecodeRegex,
      walletAddress: walletRegex,
      _id: { $ne: member._id },
    },
    { projection: { _id: 1, nickname: 1 } },
  );

  if (alreadyLinkedUser?._id) {
    return NextResponse.json(
      { error: "이미 다른 회원에 연결된 지갑주소입니다." },
      { status: 409 },
    );
  }

  const updateResult = await users.updateOne(
    { _id: member._id },
    {
      $set: {
        walletAddress,
        ...(mobile ? { mobile } : {}),
        updatedAt: new Date().toISOString(),
      },
    },
  );

  if (updateResult.matchedCount === 0) {
    return NextResponse.json(
      { error: "회원 정보를 찾지 못했습니다." },
      { status: 404 },
    );
  }

  const updated = await users.findOne(
    { _id: member._id },
    {
      projection: {
        _id: 0,
        storecode: 1,
        nickname: 1,
        walletAddress: 1,
        mobile: 1,
        buyer: 1,
      },
    },
  );

  return NextResponse.json({
    success: true,
    result: updated,
  });
}
