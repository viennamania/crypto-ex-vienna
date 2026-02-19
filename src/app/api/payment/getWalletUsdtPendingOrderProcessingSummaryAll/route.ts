import { NextResponse, type NextRequest } from 'next/server';

import { getWalletUsdtPendingOrderProcessingSummaryAll } from '@lib/api/payment';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { limit } = body as { limit?: number };

  const result = await getWalletUsdtPendingOrderProcessingSummaryAll({
    limit,
  });

  return NextResponse.json({
    result,
  });
}
