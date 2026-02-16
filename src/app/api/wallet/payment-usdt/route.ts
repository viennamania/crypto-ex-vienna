import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import clientPromise, { dbName } from "@lib/mongodb";
import { getStoreByStorecode } from "@lib/api/store";

type ChainKey = "ethereum" | "polygon" | "arbitrum" | "bsc";
type PaymentStatus = "prepared" | "confirmed";

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
};

const SUPPORTED_CHAINS: ChainKey[] = ["ethereum", "polygon", "arbitrum", "bsc"];

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

    const candidateWalletAddress = String(
      store?.settlementWalletAddress || store?.sellerWalletAddress || store?.adminWalletAddress || ""
    ).trim();
    const toWalletAddress = normalizeAddress(candidateWalletAddress);

    if (!isWalletAddress(toWalletAddress)) {
      return NextResponse.json({ error: "store payment wallet is not configured" }, { status: 400 });
    }

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

  return NextResponse.json({ error: "unsupported action" }, { status: 400 });
}
