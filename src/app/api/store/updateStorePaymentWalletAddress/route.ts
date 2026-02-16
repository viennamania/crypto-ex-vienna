import { NextResponse, type NextRequest } from "next/server";

import {
  updateStorePaymentWalletAddress,
} from '@lib/api/store';


export async function POST(request: NextRequest) {
  const body = await request.json();

  const {
    storecode,
    paymentWalletAddress,
  } = body;

  const result = await updateStorePaymentWalletAddress({
    storecode,
    paymentWalletAddress,
  });

  return NextResponse.json({
    result,
  });
}

