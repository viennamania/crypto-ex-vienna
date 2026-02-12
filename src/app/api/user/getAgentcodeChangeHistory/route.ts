import { NextResponse, type NextRequest } from "next/server";

import { getAgentcodeChangeHistory } from '@lib/api/user';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const walletAddress = body?.walletAddress;
  const limit = Number(body?.limit) || 10;
  const page = Number(body?.page) || 1;

  if (!walletAddress) {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }

  const result = await getAgentcodeChangeHistory({
    walletAddress,
    limit,
    page,
  });

  return NextResponse.json({
    result,
  });
}
