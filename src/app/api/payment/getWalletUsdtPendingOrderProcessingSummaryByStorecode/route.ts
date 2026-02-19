import { NextResponse, type NextRequest } from 'next/server';

import { getWalletUsdtPendingOrderProcessingSummaryByStorecode } from '@lib/api/payment';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const { storecode, limit } = body;

  const result = await getWalletUsdtPendingOrderProcessingSummaryByStorecode({
    storecode,
    limit,
  });

  return NextResponse.json({
    result,
  });
}
