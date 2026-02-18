import { NextResponse, type NextRequest } from 'next/server';

import {
  getAllWalletUsdtPaymentsByAgentcode,
} from '@lib/api/payment';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const {
    agentcode,
    limit,
    page,
    searchTerm,
    status = 'confirmed',
  } = body;

  const result = await getAllWalletUsdtPaymentsByAgentcode({
    agentcode,
    limit,
    page,
    searchTerm,
    status,
  });

  return NextResponse.json({
    result,
  });
}
