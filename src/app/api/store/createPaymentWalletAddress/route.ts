import { NextResponse, type NextRequest } from "next/server";

import {
  createThirdwebClient,
  Engine,
} from "thirdweb";

import {
  getStoreByStorecode,
  updateStorePaymentWalletAddress,
} from '@lib/api/store';

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const storecode = String(body?.storecode || "").trim();

  if (!storecode) {
    return NextResponse.json({
      error: "storecode is required",
    }, { status: 400 });
  }

  const store = await getStoreByStorecode({ storecode });
  if (!store) {
    return NextResponse.json({
      error: "store not found",
    }, { status: 404 });
  }

  const existingPaymentWalletAddress = String(store?.paymentWalletAddress || "").trim();
  if (isWalletAddress(existingPaymentWalletAddress)) {
    return NextResponse.json({
      result: {
        storecode,
        paymentWalletAddress: existingPaymentWalletAddress,
        created: false,
      },
    });
  }

  const secretKey = process.env.THIRDWEB_SECRET_KEY || "";
  if (!secretKey) {
    return NextResponse.json({
      error: "THIRDWEB_SECRET_KEY is not configured",
    }, { status: 500 });
  }

  try {
    const client = createThirdwebClient({
      secretKey,
    });

    const wallet = await Engine.createServerWallet({
      client,
      label: `store-${storecode}-payment-${Date.now()}`,
    }) as any;

    const paymentWalletAddress = String(
      wallet?.smartAccountAddress ||
      wallet?.address ||
      wallet?.walletAddress ||
      ""
    ).trim();

    if (!isWalletAddress(paymentWalletAddress)) {
      return NextResponse.json({
        error: "failed to create payment wallet address",
      }, { status: 500 });
    }

    const updated = await updateStorePaymentWalletAddress({
      storecode,
      paymentWalletAddress,
    });

    if (!updated) {
      return NextResponse.json({
        error: "failed to update store payment wallet address",
      }, { status: 500 });
    }

    const refreshedStore = await getStoreByStorecode({ storecode });
    const refreshedAddress = String(refreshedStore?.paymentWalletAddress || "").trim();

    return NextResponse.json({
      result: {
        storecode,
        paymentWalletAddress: refreshedAddress || paymentWalletAddress,
        created: true,
      },
    });
  } catch (error) {
    console.error("createPaymentWalletAddress error", error);
    return NextResponse.json({
      error: "failed to create payment wallet address",
    }, { status: 500 });
  }
}

