import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { createThirdwebClient, Engine, getContract } from "thirdweb";
import { balanceOf, transfer } from "thirdweb/extensions/erc20";
import { ethereum, polygon, arbitrum, bsc } from "thirdweb/chains";

import clientPromise, { dbName } from "@lib/mongodb";
import { getStoreByStorecode } from "@lib/api/store";
import { getOneByWalletAddress } from "@lib/api/user";
import {
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from "@/app/config/contractAddresses";

type ChainKey = "ethereum" | "polygon" | "arbitrum" | "bsc";
type PaymentStatus = "prepared" | "confirmed";
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
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = String(body?.action || "").trim().toLowerCase();

  const client = await clientPromise;
  const collection = client.db(dbName).collection<WalletPaymentDocument>("walletUsdtPayments");

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

    if (existing.status !== "confirmed") {
      await collection.updateOne(
        { _id },
        {
          $set: {
            status: "confirmed",
            transactionHash,
            confirmedAt: new Date().toISOString(),
          },
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
    const limit = Math.min(Math.max(Number(body?.limit || 10), 1), 50);

    if (!isWalletAddress(fromWalletAddress)) {
      return NextResponse.json({ error: "invalid wallet address" }, { status: 400 });
    }

    const payments = await collection
      .find({ fromWalletAddress, status: "confirmed" })
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

    const [recentPayments, summaryRows, topPayers, dailyRows, totalCount] = await Promise.all([
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
          {
            $group: {
              _id: "$fromWalletAddress",
              totalUsdtAmount: { $sum: "$usdtAmount" },
              totalKrwAmount: { $sum: { $ifNull: ["$krwAmount", 0] } },
              count: { $sum: 1 },
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
        topPayers: topPayers.map((item) => ({
          walletAddress: String(item?._id || ""),
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

  if (action === "collect") {
    const storecode = String(body?.storecode || "").trim();
    const chain = normalizeChain(body?.chain);
    const adminWalletAddress = normalizeAddress(body?.adminWalletAddress);
    const toWalletAddress = String(body?.toWalletAddress || "").trim();
    const normalizedToWalletAddress = normalizeAddress(toWalletAddress);

    if (!storecode) {
      return NextResponse.json({ error: "storecode is required" }, { status: 400 });
    }
    if (!isWalletAddress(normalizedToWalletAddress)) {
      return NextResponse.json({ error: "invalid toWalletAddress" }, { status: 400 });
    }
    if (!adminWalletAddress) {
      return NextResponse.json({ error: "adminWalletAddress is required" }, { status: 400 });
    }

    const store = await getStoreByStorecode({ storecode });
    if (!store) {
      return NextResponse.json({ error: "store not found" }, { status: 404 });
    }

    const storeAdminWalletAddress = normalizeAddress(store?.adminWalletAddress);
    if (!storeAdminWalletAddress || storeAdminWalletAddress !== adminWalletAddress) {
      return NextResponse.json({ error: "not authorized for this store" }, { status: 403 });
    }
    if (storeAdminWalletAddress !== normalizedToWalletAddress) {
      return NextResponse.json({ error: "toWalletAddress must be admin wallet address" }, { status: 403 });
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

      return NextResponse.json({
        result: {
          storecode: String(store?.storecode || storecode),
          fromWalletAddress: paymentWalletAddress,
          toWalletAddress: normalizedToWalletAddress,
          transferredAmount: walletBalance,
          chain,
          transactionId,
        },
      });
    } catch (collectError) {
      console.error("wallet payment-usdt collect error", collectError);
      return NextResponse.json({ error: "failed to collect payment wallet balance" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "unsupported action" }, { status: 400 });
}
