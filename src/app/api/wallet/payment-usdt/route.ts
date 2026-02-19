import { NextResponse, type NextRequest } from "next/server";
import { ObjectId, type Collection } from "mongodb";
import { createThirdwebClient, Engine, getContract } from "thirdweb";
import { balanceOf, transfer } from "thirdweb/extensions/erc20";
import { ethereum, polygon, arbitrum, bsc } from "thirdweb/chains";

import clientPromise, { dbName } from "@lib/mongodb";
import { getStoreByStorecode } from "@lib/api/store";
import { getOneByWalletAddress } from "@lib/api/user";
import { getAgentByAgentcode } from "@lib/api/agent";
import {
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from "@/app/config/contractAddresses";

type ChainKey = "ethereum" | "polygon" | "arbitrum" | "bsc";
type PaymentStatus = "prepared" | "confirmed";
type CollectStatus = "REQUESTING" | "QUEUED" | "SUBMITTED" | "CONFIRMED" | "FAILED";
type BankInfoSnapshot = Record<string, unknown>;
type PaymentMemberSnapshot = {
  nickname: string;
  storecode: string;
  buyer: {
    bankInfo: BankInfoSnapshot | null;
  };
};

type WalletPaymentDocument = {
  _id?: ObjectId;
  agentcode?: string;
  storecode: string;
  storeName: string;
  chain: ChainKey;
  fromWalletAddress: string;
  toWalletAddress: string;
  usdtAmount: number;
  krwAmount?: number;
  exchangeRate?: number;
  status: PaymentStatus;
  transactionHash?: string;
  createdAt: string;
  confirmedAt?: string;
  member?: PaymentMemberSnapshot;
};

type WalletCollectDocument = {
  _id?: ObjectId;
  agentcode?: string;
  storecode: string;
  storeName: string;
  chain?: ChainKey;
  fromWalletAddress: string;
  toWalletAddress: string;
  requestedByWalletAddress: string;
  requestedByRole?: "store-admin" | "agent-admin";
  requestedAmount: number;
  transactionId: string;
  status: CollectStatus;
  onchainStatus?: string;
  transactionHash?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
};

type WalletCollectQueueDocument = {
  _id?: ObjectId;
  queueType: "payment-usdt-collect";
  transactionId: string;
  status: CollectStatus;
  onchainStatus?: string;
  transactionHash?: string;
  error?: string;
  agentcode?: string;
  storecode: string;
  storeName: string;
  chain?: ChainKey;
  fromWalletAddress: string;
  toWalletAddress: string;
  requestedByWalletAddress: string;
  requestedByRole?: "store-admin" | "agent-admin";
  requestedAmount: number;
  createdAt: string;
  updatedAt: string;
};

const SUPPORTED_CHAINS: ChainKey[] = ["ethereum", "polygon", "arbitrum", "bsc"];
const CHAIN_TO_TOKEN_DECIMALS: Record<ChainKey, number> = {
  ethereum: 6,
  polygon: 6,
  arbitrum: 6,
  bsc: 18,
};

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value);
const isTransactionHash = (value: string) => /^0x[a-fA-F0-9]{64}$/.test(value);

const normalizeChain = (value: unknown): ChainKey => {
  const chain = String(value || "").trim().toLowerCase();
  if (SUPPORTED_CHAINS.includes(chain as ChainKey)) {
    return chain as ChainKey;
  }
  return "polygon";
};

const normalizeAddress = (value: unknown) => String(value || "").trim().toLowerCase();
const normalizeAgentcode = (value: unknown) => String(value || "").trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isSameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const resolveCollectRequester = async ({
  store,
  agentcode,
  requestedByWalletAddress,
}: {
  store: any;
  agentcode: string;
  requestedByWalletAddress: string;
}): Promise<{
  role: "store-admin" | "agent-admin";
  authorizedWalletAddress: string;
  resolvedAgentcode: string;
} | null> => {
  const normalizedRequester = normalizeAddress(requestedByWalletAddress);
  if (!isWalletAddress(normalizedRequester)) {
    return null;
  }

  const storeAdminWalletAddress = normalizeAddress(store?.adminWalletAddress);
  if (isWalletAddress(storeAdminWalletAddress) && normalizedRequester === storeAdminWalletAddress) {
    return {
      role: "store-admin",
      authorizedWalletAddress: storeAdminWalletAddress,
      resolvedAgentcode: normalizeAgentcode(store?.agentcode || agentcode),
    };
  }

  const storeAgentcode = normalizeAgentcode(store?.agentcode);
  const requestedAgentcode = normalizeAgentcode(agentcode);
  if (requestedAgentcode && storeAgentcode && !isSameText(requestedAgentcode, storeAgentcode)) {
    return null;
  }

  const targetAgentcode = requestedAgentcode || storeAgentcode;
  if (!targetAgentcode) {
    return null;
  }

  const agent = await getAgentByAgentcode({ agentcode: targetAgentcode });
  const agentAdminWalletAddress = normalizeAddress(agent?.adminWalletAddress);
  if (!isWalletAddress(agentAdminWalletAddress)) {
    return null;
  }
  if (normalizedRequester !== agentAdminWalletAddress) {
    return null;
  }

  return {
    role: "agent-admin",
    authorizedWalletAddress: agentAdminWalletAddress,
    resolvedAgentcode: targetAgentcode,
  };
};

const normalizeCollectStatus = (value: unknown): CollectStatus => {
  const status = String(value || "").trim().toUpperCase();
  if (
    status === "REQUESTING" ||
    status === "QUEUED" ||
    status === "SUBMITTED" ||
    status === "CONFIRMED" ||
    status === "FAILED"
  ) {
    return status;
  }
  return "QUEUED";
};

const isCollectFinalStatus = (status: CollectStatus) => status === "CONFIRMED" || status === "FAILED";

const normalizeAmount = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return null;
  }
  const rounded = Number(amount.toFixed(6));
  if (rounded <= 0) {
    return null;
  }
  return rounded;
};

const normalizeKrwAmount = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return null;
  }
  const rounded = Math.round(amount);
  if (rounded <= 0) {
    return null;
  }
  return rounded;
};

const normalizeExchangeRate = (value: unknown) => {
  const rate = Number(value);
  if (!Number.isFinite(rate)) {
    return null;
  }
  const rounded = Number(rate.toFixed(2));
  if (rounded <= 0) {
    return null;
  }
  return rounded;
};

const serializePayment = (doc: WalletPaymentDocument & { _id?: ObjectId }) => ({
  id: doc._id?.toString() || "",
  agentcode: doc.agentcode || "",
  storecode: doc.storecode,
  storeName: doc.storeName,
  chain: doc.chain,
  fromWalletAddress: doc.fromWalletAddress,
  toWalletAddress: doc.toWalletAddress,
  usdtAmount: doc.usdtAmount,
  krwAmount: doc.krwAmount ?? 0,
  exchangeRate: doc.exchangeRate ?? 0,
  status: doc.status,
  transactionHash: doc.transactionHash || "",
  createdAt: doc.createdAt,
  confirmedAt: doc.confirmedAt || "",
  member: doc.member || null,
});

const serializeCollect = (doc: WalletCollectDocument & { _id?: ObjectId }) => ({
  id: doc._id?.toString() || "",
  agentcode: doc.agentcode || "",
  storecode: doc.storecode,
  storeName: doc.storeName,
  chain: doc.chain || "",
  fromWalletAddress: doc.fromWalletAddress,
  toWalletAddress: doc.toWalletAddress,
  requestedByWalletAddress: doc.requestedByWalletAddress,
  requestedByRole: doc.requestedByRole || "",
  requestedAmount: Number(doc.requestedAmount || 0),
  transactionId: doc.transactionId,
  status: doc.status,
  onchainStatus: doc.onchainStatus || "",
  transactionHash: doc.transactionHash || "",
  error: doc.error || "",
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  confirmedAt: doc.confirmedAt || "",
});

const serializeCollectQueue = (doc: WalletCollectQueueDocument & { _id?: ObjectId }) => ({
  id: doc._id?.toString() || "",
  queueType: doc.queueType,
  transactionId: doc.transactionId,
  status: doc.status,
  onchainStatus: doc.onchainStatus || "",
  transactionHash: doc.transactionHash || "",
  error: doc.error || "",
  agentcode: doc.agentcode || "",
  storecode: doc.storecode,
  storeName: doc.storeName,
  chain: doc.chain || "",
  fromWalletAddress: doc.fromWalletAddress,
  toWalletAddress: doc.toWalletAddress,
  requestedByWalletAddress: doc.requestedByWalletAddress,
  requestedByRole: doc.requestedByRole || "",
  requestedAmount: Number(doc.requestedAmount || 0),
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const upsertCollectQueue = async ({
  queueCollection,
  transactionId,
  status,
  onchainStatus,
  transactionHash,
  error,
  agentcode,
  storecode,
  storeName,
  chain,
  fromWalletAddress,
  toWalletAddress,
  requestedByWalletAddress,
  requestedByRole,
  requestedAmount,
}: {
  queueCollection: Collection<WalletCollectQueueDocument>;
  transactionId: string;
  status: CollectStatus;
  onchainStatus: string;
  transactionHash: string;
  error: string;
  agentcode: string;
  storecode: string;
  storeName: string;
  chain: ChainKey;
  fromWalletAddress: string;
  toWalletAddress: string;
  requestedByWalletAddress: string;
  requestedByRole: "store-admin" | "agent-admin";
  requestedAmount: number;
}) => {
  const now = new Date().toISOString();
  await queueCollection.updateOne(
    {
      queueType: "payment-usdt-collect",
      transactionId,
    },
    {
      $set: {
        queueType: "payment-usdt-collect",
        transactionId,
        status,
        onchainStatus,
        transactionHash,
        error,
        agentcode,
        storecode,
        storeName,
        chain,
        fromWalletAddress,
        toWalletAddress,
        requestedByWalletAddress,
        requestedByRole,
        requestedAmount,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = String(body?.action || "").trim().toLowerCase();

  const client = await clientPromise;
  const collection = client.db(dbName).collection<WalletPaymentDocument>("walletUsdtPayments");
  const collectCollection = client.db(dbName).collection<WalletCollectDocument>("walletUsdtCollects");
  const queueCollection = client.db(dbName).collection<WalletCollectQueueDocument>("walletUsdtServerWalletQueues");

  if (action === "prepare") {
    const storecode = String(body?.storecode || "").trim();
    const fromWalletAddress = normalizeAddress(body?.fromWalletAddress);
    const usdtAmount = normalizeAmount(body?.usdtAmount);
    const chain = normalizeChain(body?.chain);
    const hasKrwAmount = body?.krwAmount !== undefined;
    const hasExchangeRate = body?.exchangeRate !== undefined;
    const krwAmount = hasKrwAmount ? normalizeKrwAmount(body?.krwAmount) : undefined;
    const exchangeRate = hasExchangeRate ? normalizeExchangeRate(body?.exchangeRate) : undefined;

    if (!storecode) {
      return NextResponse.json({ error: "storecode is required" }, { status: 400 });
    }
    if (!isWalletAddress(fromWalletAddress)) {
      return NextResponse.json({ error: "invalid wallet address" }, { status: 400 });
    }
    if (usdtAmount === null) {
      return NextResponse.json({ error: "invalid usdt amount" }, { status: 400 });
    }
    if (hasKrwAmount && krwAmount === null) {
      return NextResponse.json({ error: "invalid krw amount" }, { status: 400 });
    }
    if (hasExchangeRate && exchangeRate === null) {
      return NextResponse.json({ error: "invalid exchange rate" }, { status: 400 });
    }

    const store = await getStoreByStorecode({ storecode });
    if (!store) {
      return NextResponse.json({ error: "store not found" }, { status: 404 });
    }

    const candidateWalletAddress = String(store?.paymentWalletAddress || "").trim();
    const toWalletAddress = candidateWalletAddress;

    if (!isWalletAddress(toWalletAddress)) {
      return NextResponse.json({ error: "store payment wallet is not configured" }, { status: 400 });
    }

    const memberUser = await getOneByWalletAddress(storecode, fromWalletAddress);
    if (!memberUser) {
      return NextResponse.json(
        { error: "member signup required for this store" },
        { status: 403 }
      );
    }

    const memberNickname = String(memberUser?.nickname || body?.memberNickname || "").trim();
    const memberStorecode = String(memberUser?.storecode || storecode).trim();

    const memberBuyerSource = isRecord(memberUser?.buyer) ? memberUser.buyer : null;
    const memberBankInfoFromUser = memberBuyerSource?.bankInfo;
    const memberBankInfoFromBody = body?.memberBuyerBankInfo;

    let memberBuyerBankInfo: BankInfoSnapshot | null = isRecord(memberBankInfoFromUser)
      ? memberBankInfoFromUser
      : isRecord(memberBankInfoFromBody)
      ? memberBankInfoFromBody
      : null;

    if (!memberBuyerBankInfo && memberBuyerSource) {
      const depositBankName = String(memberBuyerSource.depositBankName || "").trim();
      const depositBankAccountNumber = String(memberBuyerSource.depositBankAccountNumber || "").trim();
      const depositName = String(memberBuyerSource.depositName || "").trim();
      if (depositBankName || depositBankAccountNumber || depositName) {
        memberBuyerBankInfo = {
          bankName: depositBankName,
          accountNumber: depositBankAccountNumber,
          accountHolder: depositName,
          depositBankName,
          depositBankAccountNumber,
          depositName,
        };
      }
    }

    const memberSnapshot: PaymentMemberSnapshot | undefined =
      memberNickname || memberStorecode || memberBuyerBankInfo
        ? {
            nickname: memberNickname,
            storecode: memberStorecode,
            buyer: {
              bankInfo: memberBuyerBankInfo,
            },
          }
        : undefined;

    const paymentRequest: WalletPaymentDocument = {
      agentcode: String(store?.agentcode || '').trim(),
      storecode,
      storeName: String(store?.storeName || storecode),
      chain,
      fromWalletAddress,
      toWalletAddress,
      usdtAmount,
      ...(krwAmount ? { krwAmount } : {}),
      ...(exchangeRate ? { exchangeRate } : {}),
      status: "prepared",
      createdAt: new Date().toISOString(),
      ...(memberSnapshot ? { member: memberSnapshot } : {}),
    };

    const inserted = await collection.insertOne(paymentRequest);

    return NextResponse.json({
      result: {
        paymentRequestId: inserted.insertedId.toString(),
        agentcode: paymentRequest.agentcode || '',
        storecode: paymentRequest.storecode,
        storeName: paymentRequest.storeName,
        chain: paymentRequest.chain,
        fromWalletAddress: paymentRequest.fromWalletAddress,
        toWalletAddress: paymentRequest.toWalletAddress,
        usdtAmount: paymentRequest.usdtAmount,
        krwAmount: paymentRequest.krwAmount ?? 0,
        exchangeRate: paymentRequest.exchangeRate ?? 0,
        status: paymentRequest.status,
        createdAt: paymentRequest.createdAt,
        member: paymentRequest.member || null,
      },
    });
  }

  if (action === "confirm") {
    const paymentRequestId = String(body?.paymentRequestId || "").trim();
    const fromWalletAddress = normalizeAddress(body?.fromWalletAddress);
    const transactionHash = String(body?.transactionHash || "").trim();

    if (!ObjectId.isValid(paymentRequestId)) {
      return NextResponse.json({ error: "invalid paymentRequestId" }, { status: 400 });
    }
    if (!isWalletAddress(fromWalletAddress)) {
      return NextResponse.json({ error: "invalid wallet address" }, { status: 400 });
    }
    if (!isTransactionHash(transactionHash)) {
      return NextResponse.json({ error: "invalid transaction hash" }, { status: 400 });
    }

    const _id = new ObjectId(paymentRequestId);
    const existing = await collection.findOne({ _id });

    if (!existing) {
      return NextResponse.json({ error: "payment request not found" }, { status: 404 });
    }
    if (existing.fromWalletAddress !== fromWalletAddress) {
      return NextResponse.json({ error: "wallet mismatch for this payment request" }, { status: 403 });
    }

    const currentAgentcode = String(existing.agentcode || "").trim();
    let resolvedAgentcode = currentAgentcode;

    if (!resolvedAgentcode) {
      const storecodeFromPayment = String(existing.storecode || "").trim();
      if (storecodeFromPayment) {
        const store = await getStoreByStorecode({ storecode: storecodeFromPayment });
        resolvedAgentcode = String(store?.agentcode || "").trim();
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (existing.status !== "confirmed") {
      updatePayload.status = "confirmed";
      updatePayload.transactionHash = transactionHash;
      updatePayload.confirmedAt = new Date().toISOString();
    }
    if (resolvedAgentcode && resolvedAgentcode !== currentAgentcode) {
      updatePayload.agentcode = resolvedAgentcode;
    }

    if (Object.keys(updatePayload).length > 0) {
      await collection.updateOne(
        { _id },
        {
          $set: updatePayload,
        }
      );
    }

    const updated = await collection.findOne({ _id });
    if (!updated) {
      return NextResponse.json({ error: "failed to update payment request" }, { status: 500 });
    }

    return NextResponse.json({
      result: serializePayment(updated),
    });
  }

  if (action === "list") {
    const fromWalletAddress = normalizeAddress(body?.fromWalletAddress);
    const storecode = String(body?.storecode || "").trim();
    const limit = Math.min(Math.max(Number(body?.limit || 10), 1), 50);

    if (!isWalletAddress(fromWalletAddress)) {
      return NextResponse.json({ error: "invalid wallet address" }, { status: 400 });
    }

    const query: any = {
      fromWalletAddress,
      status: "confirmed",
    };
    if (storecode) {
      query.storecode = { $regex: `^${escapeRegex(storecode)}$`, $options: "i" };
    }

    const payments = await collection
      .find(query)
      .sort({ confirmedAt: -1, createdAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      result: payments.map((item) => serializePayment(item)),
    });
  }

  if (action === "store-dashboard") {
    const storecode = String(body?.storecode || "").trim();
    const adminWalletAddress = normalizeAddress(body?.adminWalletAddress);
    const limit = Math.min(Math.max(Number(body?.limit || 30), 1), 100);

    if (!storecode) {
      return NextResponse.json({ error: "storecode is required" }, { status: 400 });
    }

    const store = await getStoreByStorecode({ storecode });
    if (!store) {
      return NextResponse.json({ error: "store not found" }, { status: 404 });
    }

    const storeAdminWalletAddress = normalizeAddress(store?.adminWalletAddress);
    if (
      adminWalletAddress &&
      storeAdminWalletAddress &&
      adminWalletAddress !== storeAdminWalletAddress
    ) {
      return NextResponse.json({ error: "not authorized for this store" }, { status: 403 });
    }

    const storeQuery = {
      storecode: { $regex: `^${escapeRegex(storecode)}$`, $options: "i" },
      status: "confirmed" as PaymentStatus,
    };

    const [recentPayments, summaryRows, topMembersRows, dailyRows, totalCount] = await Promise.all([
      collection
        .find(storeQuery)
        .sort({ confirmedAt: -1, createdAt: -1 })
        .limit(limit)
        .toArray(),
      collection
        .aggregate([
          { $match: storeQuery },
          {
            $group: {
              _id: null,
              totalUsdtAmount: { $sum: "$usdtAmount" },
              totalKrwAmount: { $sum: { $ifNull: ["$krwAmount", 0] } },
              avgExchangeRate: { $avg: { $ifNull: ["$exchangeRate", 0] } },
              latestConfirmedAt: { $max: "$confirmedAt" },
            },
          },
        ])
        .toArray(),
      collection
        .aggregate([
          { $match: storeQuery },
          { $sort: { confirmedAt: -1, createdAt: -1 } },
          {
            $project: {
              fromWalletAddress: 1,
              usdtAmount: 1,
              krwAmount: { $ifNull: ["$krwAmount", 0] },
              memberNickname: {
                $trim: {
                  input: { $ifNull: ["$member.nickname", ""] },
                },
              },
              memberStorecode: {
                $trim: {
                  input: { $ifNull: ["$member.storecode", ""] },
                },
              },
            },
          },
          {
            $group: {
              _id: "$fromWalletAddress",
              totalUsdtAmount: { $sum: "$usdtAmount" },
              totalKrwAmount: { $sum: { $ifNull: ["$krwAmount", 0] } },
              count: { $sum: 1 },
              memberNickname: { $first: "$memberNickname" },
              memberStorecode: { $first: "$memberStorecode" },
            },
          },
          { $sort: { totalUsdtAmount: -1, count: -1 } },
          { $limit: 8 },
        ])
        .toArray(),
      collection
        .aggregate([
          { $match: storeQuery },
          {
            $project: {
              day: { $substrBytes: [{ $ifNull: ["$confirmedAt", "$createdAt"] }, 0, 10] },
              usdtAmount: 1,
              krwAmount: { $ifNull: ["$krwAmount", 0] },
            },
          },
          {
            $group: {
              _id: "$day",
              count: { $sum: 1 },
              totalUsdtAmount: { $sum: "$usdtAmount" },
              totalKrwAmount: { $sum: "$krwAmount" },
            },
          },
          { $sort: { _id: -1 } },
          { $limit: 14 },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      collection.countDocuments(storeQuery),
    ]);

    const summary = summaryRows[0] || null;

    return NextResponse.json({
      result: {
        store: {
          storecode: String(store?.storecode || storecode),
          storeName: String(store?.storeName || storecode),
          storeLogo: String(store?.storeLogo || ""),
          backgroundColor: String(store?.backgroundColor || "").trim(),
          paymentWalletAddress: String(store?.paymentWalletAddress || ""),
          adminWalletAddress: String(store?.adminWalletAddress || ""),
        },
        summary: {
          totalCount,
          totalUsdtAmount: Number(summary?.totalUsdtAmount || 0),
          totalKrwAmount: Number(summary?.totalKrwAmount || 0),
          avgExchangeRate: Number(summary?.avgExchangeRate || 0),
          latestConfirmedAt: String(summary?.latestConfirmedAt || ""),
        },
        topMembers: topMembersRows.map((item) => ({
          walletAddress: String(item?._id || ""),
          nickname: String(item?.memberNickname || ""),
          memberStorecode: String(item?.memberStorecode || ""),
          totalUsdtAmount: Number(item?.totalUsdtAmount || 0),
          totalKrwAmount: Number(item?.totalKrwAmount || 0),
          count: Number(item?.count || 0),
        })),
        // Backward compatible field.
        topPayers: topMembersRows.map((item) => ({
          walletAddress: String(item?._id || ""),
          nickname: String(item?.memberNickname || ""),
          memberStorecode: String(item?.memberStorecode || ""),
          totalUsdtAmount: Number(item?.totalUsdtAmount || 0),
          totalKrwAmount: Number(item?.totalKrwAmount || 0),
          count: Number(item?.count || 0),
        })),
        daily: dailyRows.map((item) => ({
          day: String(item?._id || ""),
          count: Number(item?.count || 0),
          totalUsdtAmount: Number(item?.totalUsdtAmount || 0),
          totalKrwAmount: Number(item?.totalKrwAmount || 0),
        })),
        payments: recentPayments.map((item) => serializePayment(item)),
      },
    });
  }

  if (action === "collect-balance") {
    const storecode = String(body?.storecode || "").trim();
    const chain = normalizeChain(body?.chain);
    const agentcode = normalizeAgentcode(body?.agentcode);
    const adminWalletAddress = normalizeAddress(body?.adminWalletAddress);

    if (!storecode) {
      return NextResponse.json({ error: "storecode is required" }, { status: 400 });
    }
    if (!isWalletAddress(adminWalletAddress)) {
      return NextResponse.json({ error: "adminWalletAddress is required" }, { status: 400 });
    }

    const store = await getStoreByStorecode({ storecode });
    if (!store) {
      return NextResponse.json({ error: "store not found" }, { status: 404 });
    }

    const requester = await resolveCollectRequester({
      store,
      agentcode,
      requestedByWalletAddress: adminWalletAddress,
    });
    if (!requester) {
      return NextResponse.json({ error: "not authorized for this store" }, { status: 403 });
    }

    const paymentWalletAddress = String(store?.paymentWalletAddress || "").trim();
    if (!isWalletAddress(paymentWalletAddress)) {
      return NextResponse.json({ error: "store payment wallet is not configured" }, { status: 400 });
    }

    const secretKey = process.env.THIRDWEB_SECRET_KEY || "";
    if (!secretKey) {
      return NextResponse.json({ error: "THIRDWEB_SECRET_KEY is not configured" }, { status: 500 });
    }

    try {
      const thirdwebClient = createThirdwebClient({ secretKey });
      const chainInfo =
        chain === "ethereum"
          ? ethereum
          : chain === "arbitrum"
          ? arbitrum
          : chain === "bsc"
          ? bsc
          : polygon;
      const usdtContractAddress =
        chain === "ethereum"
          ? ethereumContractAddressUSDT
          : chain === "arbitrum"
          ? arbitrumContractAddressUSDT
          : chain === "bsc"
          ? bscContractAddressUSDT
          : polygonContractAddressUSDT;
      const tokenDecimals = CHAIN_TO_TOKEN_DECIMALS[chain];

      const usdtContract = getContract({
        client: thirdwebClient,
        chain: chainInfo,
        address: usdtContractAddress,
      });

      const walletBalanceRaw = await balanceOf({
        contract: usdtContract,
        address: paymentWalletAddress,
      });
      const walletBalance = Number(walletBalanceRaw) / 10 ** tokenDecimals;
      const collectToWalletBalanceRaw = await balanceOf({
        contract: usdtContract,
        address: requester.authorizedWalletAddress,
      });
      const collectToWalletBalance = Number(collectToWalletBalanceRaw) / 10 ** tokenDecimals;

      return NextResponse.json({
        result: {
          store: {
            storecode: String(store?.storecode || storecode),
            storeName: String(store?.storeName || storecode),
            storeLogo: String(store?.storeLogo || ""),
            agentcode: String(store?.agentcode || requester.resolvedAgentcode || ""),
            paymentWalletAddress,
            adminWalletAddress: String(store?.adminWalletAddress || ""),
          },
          chain,
          balance: Number.isFinite(walletBalance) && walletBalance > 0 ? walletBalance : 0,
          collectToWalletAddress: requester.authorizedWalletAddress,
          collectToWalletBalance:
            Number.isFinite(collectToWalletBalance) && collectToWalletBalance > 0
              ? collectToWalletBalance
              : 0,
          requestedByRole: requester.role,
        },
      });
    } catch (collectBalanceError) {
      console.error("wallet payment-usdt collect-balance error", collectBalanceError);
      return NextResponse.json({ error: "failed to load payment wallet balance" }, { status: 500 });
    }
  }

  if (action === "collect") {
    const storecode = String(body?.storecode || "").trim();
    const chain = normalizeChain(body?.chain);
    const agentcode = normalizeAgentcode(body?.agentcode);
    const adminWalletAddress = normalizeAddress(body?.adminWalletAddress);
    const toWalletAddress = String(body?.toWalletAddress || "").trim();
    const normalizedToWalletAddress = normalizeAddress(toWalletAddress);

    if (!storecode) {
      return NextResponse.json({ error: "storecode is required" }, { status: 400 });
    }
    if (!isWalletAddress(normalizedToWalletAddress)) {
      return NextResponse.json({ error: "invalid toWalletAddress" }, { status: 400 });
    }
    if (!isWalletAddress(adminWalletAddress)) {
      return NextResponse.json({ error: "adminWalletAddress is required" }, { status: 400 });
    }

    const store = await getStoreByStorecode({ storecode });
    if (!store) {
      return NextResponse.json({ error: "store not found" }, { status: 404 });
    }

    const requester = await resolveCollectRequester({
      store,
      agentcode,
      requestedByWalletAddress: adminWalletAddress,
    });
    if (!requester) {
      return NextResponse.json({ error: "not authorized for this store" }, { status: 403 });
    }
    if (requester.authorizedWalletAddress !== normalizedToWalletAddress) {
      return NextResponse.json({ error: "toWalletAddress must match authorized admin wallet" }, { status: 403 });
    }

    const paymentWalletAddress = String(store?.paymentWalletAddress || "").trim();
    if (!isWalletAddress(paymentWalletAddress)) {
      return NextResponse.json({ error: "store payment wallet is not configured" }, { status: 400 });
    }

    const secretKey = process.env.THIRDWEB_SECRET_KEY || "";
    if (!secretKey) {
      return NextResponse.json({ error: "THIRDWEB_SECRET_KEY is not configured" }, { status: 500 });
    }

    try {
      const thirdwebClient = createThirdwebClient({ secretKey });
      const chainInfo =
        chain === "ethereum"
          ? ethereum
          : chain === "arbitrum"
          ? arbitrum
          : chain === "bsc"
          ? bsc
          : polygon;
      const usdtContractAddress =
        chain === "ethereum"
          ? ethereumContractAddressUSDT
          : chain === "arbitrum"
          ? arbitrumContractAddressUSDT
          : chain === "bsc"
          ? bscContractAddressUSDT
          : polygonContractAddressUSDT;
      const tokenDecimals = CHAIN_TO_TOKEN_DECIMALS[chain];

      const usdtContract = getContract({
        client: thirdwebClient,
        chain: chainInfo,
        address: usdtContractAddress,
      });

      const walletBalanceRaw = await balanceOf({
        contract: usdtContract,
        address: paymentWalletAddress,
      });
      const walletBalance = Number(walletBalanceRaw) / 10 ** tokenDecimals;

      if (!Number.isFinite(walletBalance) || walletBalance <= 0) {
        return NextResponse.json({ error: "payment wallet balance is zero" }, { status: 400 });
      }

      const paymentWallet = Engine.serverWallet({
        client: thirdwebClient,
        address: paymentWalletAddress,
      });

      const transaction = transfer({
        contract: usdtContract,
        to: normalizedToWalletAddress,
        amount: walletBalance,
      });

      const { transactionId } = await paymentWallet.enqueueTransaction({
        transaction,
      });

      let executionStatus = "QUEUED";
      try {
        const executionResult = await Engine.getTransactionStatus({
          client: thirdwebClient,
          transactionId,
        });
        executionStatus = String(executionResult?.status || "QUEUED").toUpperCase();
      } catch {
        executionStatus = "QUEUED";
      }

      const now = new Date().toISOString();
      const collectStatus = normalizeCollectStatus(executionStatus);
      await collectCollection.updateOne(
        { transactionId },
        {
          $set: {
            agentcode: requester.resolvedAgentcode,
            storecode: String(store?.storecode || storecode),
            storeName: String(store?.storeName || storecode),
            chain,
            fromWalletAddress: normalizeAddress(paymentWalletAddress),
            toWalletAddress: requester.authorizedWalletAddress,
            requestedByWalletAddress: adminWalletAddress,
            requestedByRole: requester.role,
            requestedAmount: walletBalance,
            transactionId,
            status: collectStatus,
            onchainStatus: "",
            transactionHash: "",
            error: "",
            updatedAt: now,
            ...(collectStatus === "CONFIRMED" ? { confirmedAt: now } : {}),
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true }
      );

      if (isCollectFinalStatus(collectStatus)) {
        await queueCollection.deleteOne({
          queueType: "payment-usdt-collect",
          transactionId,
        });
      } else {
        await upsertCollectQueue({
          queueCollection,
          transactionId,
          status: collectStatus,
          onchainStatus: "",
          transactionHash: "",
          error: "",
          agentcode: requester.resolvedAgentcode,
          storecode: String(store?.storecode || storecode),
          storeName: String(store?.storeName || storecode),
          chain,
          fromWalletAddress: normalizeAddress(paymentWalletAddress),
          toWalletAddress: requester.authorizedWalletAddress,
          requestedByWalletAddress: adminWalletAddress,
          requestedByRole: requester.role,
          requestedAmount: walletBalance,
        });
      }

      return NextResponse.json({
        result: {
          storecode: String(store?.storecode || storecode),
          fromWalletAddress: paymentWalletAddress,
          toWalletAddress: requester.authorizedWalletAddress,
          transferredAmount: walletBalance,
          chain,
          transactionId,
          status: collectStatus,
        },
      });
    } catch (collectError) {
      console.error("wallet payment-usdt collect error", collectError);
      return NextResponse.json({ error: "failed to collect payment wallet balance" }, { status: 500 });
    }
  }

  if (action === "collect-status") {
    const storecode = String(body?.storecode || "").trim();
    const agentcode = normalizeAgentcode(body?.agentcode);
    const adminWalletAddress = normalizeAddress(body?.adminWalletAddress);
    const transactionId = String(body?.transactionId || "").trim();

    if (!storecode) {
      return NextResponse.json({ error: "storecode is required" }, { status: 400 });
    }
    if (!isWalletAddress(adminWalletAddress)) {
      return NextResponse.json({ error: "adminWalletAddress is required" }, { status: 400 });
    }
    if (!transactionId) {
      return NextResponse.json({ error: "transactionId is required" }, { status: 400 });
    }

    const store = await getStoreByStorecode({ storecode });
    if (!store) {
      return NextResponse.json({ error: "store not found" }, { status: 404 });
    }

    const requester = await resolveCollectRequester({
      store,
      agentcode,
      requestedByWalletAddress: adminWalletAddress,
    });
    if (!requester) {
      return NextResponse.json({ error: "not authorized for this store" }, { status: 403 });
    }

    const paymentWalletAddress = normalizeAddress(store?.paymentWalletAddress);
    if (!isWalletAddress(paymentWalletAddress)) {
      return NextResponse.json({ error: "store payment wallet is not configured" }, { status: 400 });
    }

    const existingCollect = await collectCollection.findOne({ transactionId });
    const collectChain = normalizeChain(existingCollect?.chain || "polygon");
    const collectRequestedAmount = Number(existingCollect?.requestedAmount || 0);

    const secretKey = process.env.THIRDWEB_SECRET_KEY || "";
    if (!secretKey) {
      return NextResponse.json({ error: "THIRDWEB_SECRET_KEY is not configured" }, { status: 500 });
    }

    try {
      const thirdwebClient = createThirdwebClient({ secretKey });
      const executionResult = await Engine.getTransactionStatus({
        client: thirdwebClient,
        transactionId,
      });

      const status = normalizeCollectStatus(executionResult?.status || "");
      const fromWalletAddress = normalizeAddress(executionResult?.from || "");
      if (fromWalletAddress && fromWalletAddress !== paymentWalletAddress) {
        return NextResponse.json({ error: "transaction does not belong to this store payment wallet" }, { status: 403 });
      }

      const transactionHash =
        executionResult && "transactionHash" in executionResult
          ? String(executionResult.transactionHash || "")
          : "";
      const onchainStatus =
        executionResult && "onchainStatus" in executionResult
          ? String(executionResult.onchainStatus || "")
          : "";
      const error =
        executionResult && "error" in executionResult
          ? String(executionResult.error || "")
          : "";
      const now = new Date().toISOString();

      await collectCollection.updateOne(
        { transactionId },
        {
          $set: {
            agentcode: requester.resolvedAgentcode,
            storecode: String(store?.storecode || storecode),
            storeName: String(store?.storeName || storecode),
            fromWalletAddress: paymentWalletAddress,
            toWalletAddress: requester.authorizedWalletAddress,
            requestedByWalletAddress: adminWalletAddress,
            requestedByRole: requester.role,
            transactionId,
            status,
            onchainStatus,
            transactionHash,
            error,
            updatedAt: now,
            ...(status === "CONFIRMED" ? { confirmedAt: now } : {}),
          },
          $setOnInsert: {
            requestedAmount: 0,
            createdAt: now,
          },
        },
        { upsert: true }
      );

      if (isCollectFinalStatus(status)) {
        await queueCollection.deleteOne({
          queueType: "payment-usdt-collect",
          transactionId,
        });
      } else {
        await upsertCollectQueue({
          queueCollection,
          transactionId,
          status,
          onchainStatus,
          transactionHash,
          error,
          agentcode: requester.resolvedAgentcode,
          storecode: String(store?.storecode || storecode),
          storeName: String(store?.storeName || storecode),
          chain: collectChain,
          fromWalletAddress: paymentWalletAddress,
          toWalletAddress: requester.authorizedWalletAddress,
          requestedByWalletAddress: adminWalletAddress,
          requestedByRole: requester.role,
          requestedAmount: collectRequestedAmount,
        });
      }

      return NextResponse.json({
        result: {
          storecode: String(store?.storecode || storecode),
          transactionId,
          status,
          transactionHash,
          onchainStatus,
          confirmedAt: String(executionResult?.confirmedAt || ""),
          error,
        },
      });
    } catch (collectStatusError) {
      const message =
        collectStatusError instanceof Error ? collectStatusError.message : "failed to get collect transaction status";
      if (message.toLowerCase().includes("not found")) {
        const now = new Date().toISOString();
        await collectCollection.updateOne(
          { transactionId },
          {
            $set: {
              agentcode: requester.resolvedAgentcode,
              storecode: String(store?.storecode || storecode),
              storeName: String(store?.storeName || storecode),
              fromWalletAddress: paymentWalletAddress,
              toWalletAddress: requester.authorizedWalletAddress,
              requestedByWalletAddress: adminWalletAddress,
              requestedByRole: requester.role,
              transactionId,
              status: "QUEUED",
              onchainStatus: "",
              transactionHash: "",
              error: "",
              updatedAt: now,
            },
            $setOnInsert: {
              requestedAmount: 0,
              createdAt: now,
            },
          },
          { upsert: true }
        );
        await upsertCollectQueue({
          queueCollection,
          transactionId,
          status: "QUEUED",
          onchainStatus: "",
          transactionHash: "",
          error: "",
          agentcode: requester.resolvedAgentcode,
          storecode: String(store?.storecode || storecode),
          storeName: String(store?.storeName || storecode),
          chain: collectChain,
          fromWalletAddress: paymentWalletAddress,
          toWalletAddress: requester.authorizedWalletAddress,
          requestedByWalletAddress: adminWalletAddress,
          requestedByRole: requester.role,
          requestedAmount: collectRequestedAmount,
        });
        return NextResponse.json({
          result: {
            storecode: String(store?.storecode || storecode),
            transactionId,
            status: "QUEUED",
            transactionHash: "",
            onchainStatus: "",
            confirmedAt: "",
            error: "",
          },
        });
      }
      console.error("wallet payment-usdt collect-status error", collectStatusError);
      return NextResponse.json({ error: "failed to get collect transaction status" }, { status: 500 });
    }
  }

  if (action === "collect-history") {
    const storecode = String(body?.storecode || "").trim();
    const agentcode = normalizeAgentcode(body?.agentcode);
    const adminWalletAddress = normalizeAddress(body?.adminWalletAddress);
    const limit = Math.min(Math.max(Number(body?.limit || 30), 1), 100);

    if (!storecode) {
      return NextResponse.json({ error: "storecode is required" }, { status: 400 });
    }
    if (!isWalletAddress(adminWalletAddress)) {
      return NextResponse.json({ error: "adminWalletAddress is required" }, { status: 400 });
    }

    const store = await getStoreByStorecode({ storecode });
    if (!store) {
      return NextResponse.json({ error: "store not found" }, { status: 404 });
    }

    const requester = await resolveCollectRequester({
      store,
      agentcode,
      requestedByWalletAddress: adminWalletAddress,
    });
    if (!requester) {
      return NextResponse.json({ error: "not authorized for this store" }, { status: 403 });
    }
    void requester;

    const history = await collectCollection
      .find({
        storecode: { $regex: `^${escapeRegex(storecode)}$`, $options: "i" },
      })
      .sort({ createdAt: -1, updatedAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      result: history.map((item) => serializeCollect(item)),
    });
  }

  if (action === "collect-queue") {
    const storecode = String(body?.storecode || "").trim();
    const agentcode = normalizeAgentcode(body?.agentcode);
    const adminWalletAddress = normalizeAddress(body?.adminWalletAddress);
    const limit = Math.min(Math.max(Number(body?.limit || 100), 1), 300);

    if (!storecode) {
      return NextResponse.json({ error: "storecode is required" }, { status: 400 });
    }
    if (!isWalletAddress(adminWalletAddress)) {
      return NextResponse.json({ error: "adminWalletAddress is required" }, { status: 400 });
    }

    const store = await getStoreByStorecode({ storecode });
    if (!store) {
      return NextResponse.json({ error: "store not found" }, { status: 404 });
    }

    const requester = await resolveCollectRequester({
      store,
      agentcode,
      requestedByWalletAddress: adminWalletAddress,
    });
    if (!requester) {
      return NextResponse.json({ error: "not authorized for this store" }, { status: 403 });
    }
    void requester;

    const queue = await queueCollection
      .find({
        queueType: "payment-usdt-collect",
        storecode: { $regex: `^${escapeRegex(storecode)}$`, $options: "i" },
      })
      .sort({ createdAt: -1, updatedAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      result: queue.map((item) => serializeCollectQueue(item)),
    });
  }

  return NextResponse.json({ error: "unsupported action" }, { status: 400 });
}
