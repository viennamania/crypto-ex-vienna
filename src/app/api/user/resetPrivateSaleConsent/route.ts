import { NextResponse, type NextRequest } from "next/server";
import clientPromise, { dbName } from "@/lib/mongodb";
import { BUYER_CONSENT_KEYWORD } from "@/lib/sendbird/privateSaleConsent";
import {
  isWalletAddressAuthorizedForExpectedWallet,
  verifyWalletAuthFromBody,
} from "@/lib/security/requestAuth";
import { isWalletAddress } from "@/lib/security/walletSignature";

const toTrimmedString = (value: unknown) => String(value ?? "").trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const storecode = toTrimmedString(body?.storecode);
  const walletAddress = toTrimmedString(body?.walletAddress);
  const memberId = toTrimmedString(body?.memberId);

  if (!storecode) {
    return NextResponse.json(
      {
        result: false,
        error: "storecode is required",
      },
      { status: 400 },
    );
  }

  const signatureAuth = await verifyWalletAuthFromBody({
    body: body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {},
    path: "/api/user/resetPrivateSaleConsent",
    method: "POST",
    storecode,
    consumeNonceValue: true,
  });
  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  if (!walletAddress) {
    return NextResponse.json(
      {
        result: false,
        error: "walletAddress is required",
      },
      { status: 400 },
    );
  }
  if (!isWalletAddress(walletAddress)) {
    return NextResponse.json(
      {
        result: false,
        error: "walletAddress is invalid",
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
  if (signatureAuth.ok === true) {
    const storesCollection = client.db(dbName).collection("stores");
    const agentsCollection = client.db(dbName).collection("agents");

    const store = await storesCollection.findOne<Record<string, unknown>>(
      {
        storecode: {
          $regex: `^${escapeRegex(storecode)}$`,
          $options: "i",
        },
      },
      {
        projection: {
          _id: 0,
          agentcode: 1,
        },
      },
    );
    if (!store) {
      return NextResponse.json(
        {
          result: false,
          error: "STORE_NOT_FOUND",
          message: "가맹점 정보를 찾을 수 없습니다.",
        },
        { status: 404 },
      );
    }

    const agentcode = toTrimmedString(store.agentcode);
    if (!agentcode) {
      return NextResponse.json(
        {
          result: false,
          error: "AGENT_NOT_FOUND",
          message: "가맹점의 에이전트 정보를 찾을 수 없습니다.",
        },
        { status: 400 },
      );
    }

    const agent = await agentsCollection.findOne<Record<string, unknown>>(
      {
        agentcode: {
          $regex: `^${escapeRegex(agentcode)}$`,
          $options: "i",
        },
      },
      {
        projection: {
          _id: 0,
          adminWalletAddress: 1,
        },
      },
    );
    const adminWalletAddress = toTrimmedString(agent?.adminWalletAddress);
    if (!adminWalletAddress) {
      return NextResponse.json(
        {
          result: false,
          error: "AGENT_ADMIN_WALLET_MISSING",
          message: "에이전트 관리자 지갑이 설정되지 않았습니다.",
        },
        { status: 400 },
      );
    }

    const isAuthorized = await isWalletAddressAuthorizedForExpectedWallet({
      expectedWalletAddress: adminWalletAddress,
      candidateWalletAddress: signatureAuth.walletAddress,
    });
    if (!isAuthorized) {
      return NextResponse.json(
        {
          result: false,
          error: "FORBIDDEN",
          message: "에이전트 관리자 지갑만 이용동의를 초기화할 수 있습니다.",
        },
        { status: 403 },
      );
    }
  }

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
      storecode: {
        $regex: `^${escapeRegex(storecode)}$`,
        $options: "i",
      },
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
