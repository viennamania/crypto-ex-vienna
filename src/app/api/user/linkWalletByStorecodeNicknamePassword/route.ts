import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

import clientPromise from "@/lib/mongodb";
import { dbName } from "@/lib/mongodb";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const shortWallet = (value: string) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 8)}...${normalized.slice(-6)}`;
};
const makeRequestId = () => `linkWallet:${randomUUID().slice(0, 8)}`;

export async function POST(request: NextRequest) {
  const requestId = makeRequestId();
  const body = await request.json().catch(() => ({}));

  const storecode = String(body?.storecode || "").trim();
  const nickname = String(body?.nickname || "").trim();
  const password = String(body?.password || "").trim();
  const walletAddress = String(body?.walletAddress || "").trim();
  const mobile = String(body?.mobile || "").trim();

  console.log(`[${requestId}] request_received`, {
    storecode,
    nickname,
    walletAddress: shortWallet(walletAddress),
    hasMobile: Boolean(mobile),
    passwordLength: password.length,
    passwordIsNumeric: /^\d+$/.test(password),
  });

  if (!storecode || !nickname || !password || !walletAddress) {
    console.warn(`[${requestId}] validation_failed_missing_required`, {
      hasStorecode: Boolean(storecode),
      hasNickname: Boolean(nickname),
      hasPassword: Boolean(password),
      hasWalletAddress: Boolean(walletAddress),
    });
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

  console.log(`[${requestId}] finding_member`, {
    storecode,
    nickname,
    passwordCandidateTypes: passwordCandidates.map((candidate) => typeof candidate),
  });

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

  console.log(`[${requestId}] member_lookup_result`, {
    found: Boolean(member?._id),
    memberNickname: String(member?.nickname || ""),
    memberWalletAddress: shortWallet(String(member?.walletAddress || "")),
  });

  if (!member?._id) {
    console.warn(`[${requestId}] member_not_found_or_password_mismatch`, {
      storecode,
      nickname,
    });
    return NextResponse.json(
      { error: "회원 아이디 또는 비밀번호가 올바르지 않습니다." },
      { status: 404 },
    );
  }

  const existingMemberWalletAddress = String(member?.walletAddress || "").trim();
  if (existingMemberWalletAddress) {
    const isSameWallet =
      existingMemberWalletAddress.toLowerCase() === walletAddress.toLowerCase();

    console.warn(`[${requestId}] member_already_has_wallet`, {
      memberNickname: String(member.nickname || ""),
      memberWalletAddress: shortWallet(existingMemberWalletAddress),
      inputWalletAddress: shortWallet(walletAddress),
      isSameWallet,
    });

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
    console.warn(`[${requestId}] wallet_already_linked_to_other_member`, {
      inputWalletAddress: shortWallet(walletAddress),
      conflictedNickname: String(alreadyLinkedUser?.nickname || ""),
    });
    return NextResponse.json(
      { error: "이미 다른 회원에 연결된 지갑주소입니다." },
      { status: 409 },
    );
  }

  console.log(`[${requestId}] updating_member_wallet`, {
    memberNickname: String(member.nickname || ""),
    inputWalletAddress: shortWallet(walletAddress),
    updateMobile: Boolean(mobile),
  });

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

  console.log(`[${requestId}] update_result`, {
    matchedCount: updateResult.matchedCount,
    modifiedCount: updateResult.modifiedCount,
  });

  if (updateResult.matchedCount === 0) {
    console.warn(`[${requestId}] update_failed_member_not_found_after_lookup`, {
      memberId: String(member._id),
    });
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

  console.log(`[${requestId}] link_success`, {
    linkedNickname: String(updated?.nickname || ""),
    linkedWalletAddress: shortWallet(String(updated?.walletAddress || "")),
    hasBuyer: Boolean(updated?.buyer),
  });

  return NextResponse.json({
    success: true,
    result: updated,
  });
}
