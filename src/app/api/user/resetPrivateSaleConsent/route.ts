import { NextResponse, type NextRequest } from "next/server";
import clientPromise, { dbName } from "@/lib/mongodb";
import { BUYER_CONSENT_KEYWORD } from "@/lib/sendbird/privateSaleConsent";

const toTrimmedString = (value: unknown) => String(value ?? "").trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const storecode = toTrimmedString(body?.storecode);
  const walletAddress = toTrimmedString(body?.walletAddress);
  const memberId = toTrimmedString(body?.memberId);

  if (!walletAddress) {
    return NextResponse.json(
      {
        result: false,
        error: "walletAddress is required",
      },
      { status: 400 },
    );
  }

  const walletRegex = {
    $regex: `^${escapeRegex(walletAddress)}$`,
    $options: "i",
  };

  const client = await clientPromise;
  const usersCollection = client.db(dbName).collection("users");

  const nowIso = new Date().toISOString();
  const resetSet: Record<string, unknown> = {
    "buyer.privateSaleConsent.required": false,
    "buyer.privateSaleConsent.keyword": BUYER_CONSENT_KEYWORD,
    "buyer.privateSaleConsent.status": "pending",
    "buyer.privateSaleConsent.accepted": false,
    "buyer.privateSaleConsent.acceptedAt": "",
    "buyer.privateSaleConsent.acceptedByMessage": "",
    "buyer.privateSaleConsent.acceptedMessageAt": "",
    "buyer.privateSaleConsent.acceptedMessageId": "",
    "buyer.privateSaleConsent.lastTradeId": "",
    "buyer.privateSaleConsent.lastChannelUrl": "",
    "buyer.privateSaleConsent.sourceSellerWalletAddress": "",
    "buyer.privateSaleConsent.consentMessage": "",
    "buyer.privateSaleConsent.consentMessageSentAt": "",
    "buyer.privateSaleConsent.resetAt": nowIso,
    updatedAt: nowIso,
  };

  const result = await usersCollection.updateMany(
    {
      walletAddress: walletRegex,
      "buyer.privateSaleConsent": { $exists: true },
    },
    {
      $set: resetSet,
    },
  );

  if (result.matchedCount === 0) {
    return NextResponse.json(
      {
        result: false,
        error: "CONSENT_NOT_FOUND",
        message: "초기화할 이용동의 기록이 없습니다.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    result: true,
    walletAddress,
    storecode,
    memberId,
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  });
}
