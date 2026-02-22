import { NextResponse, type NextRequest } from 'next/server';

import {
  getAllWalletUsdtPayments,
} from '@lib/api/payment';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const {
    limit,
    page,
    searchTerm,
    storecode,
    status = 'confirmed',
  } = body;

  const result = await getAllWalletUsdtPayments({
    limit,
    page,
    searchTerm,
    storecode,
    status,
  });

  return NextResponse.json({
    result,
  });
}
