import { NextResponse, type NextRequest } from 'next/server';

import { getWalletUsdtPendingOrderProcessingSummaryByAgentcode } from '@lib/api/payment';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const { agentcode, limit } = body;

  const result = await getWalletUsdtPendingOrderProcessingSummaryByAgentcode({
    agentcode,
    limit,
  });

  return NextResponse.json({
    result,
  });
}
