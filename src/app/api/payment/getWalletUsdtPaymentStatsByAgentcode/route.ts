import { NextResponse, type NextRequest } from 'next/server';

import { getWalletUsdtPaymentStatsByAgentcode } from '@lib/api/payment';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const {
    agentcode,
    hourlyHours,
    dailyDays,
    monthlyMonths,
  } = body;

  const result = await getWalletUsdtPaymentStatsByAgentcode({
    agentcode,
    hourlyHours,
    dailyDays,
    monthlyMonths,
  });

  return NextResponse.json({
    result,
  });
}
