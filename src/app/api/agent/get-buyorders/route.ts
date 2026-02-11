import { NextResponse } from 'next/server';

import { getAllBuyOrdersForAgent } from '@lib/api/order';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        agentcode?: string;
        page?: number;
        limit?: number;
        searchTerm?: string;
      }
    | null;

  const agentcode = body?.agentcode || '';
  const page = Number(body?.page || 1);
  const limit = Number(body?.limit || 10);
  const searchTerm = body?.searchTerm?.trim() || '';

  if (!agentcode) {
    return NextResponse.json({ error: 'agentcode is required.' }, { status: 400 });
  }

  try {
    const data = await getAllBuyOrdersForAgent({
      limit: Math.max(1, Math.min(100, limit)),
      page: Math.max(1, page),
      startDate: '',
      endDate: '',
      searchNickname: searchTerm,
      walletAddress: searchTerm,
      agentcode,
    });

    return NextResponse.json({
      items: data?.orders ?? [],
      totalCount: data?.totalCount ?? 0,
      totalKrwAmount: data?.totalKrwAmount ?? 0,
      totalUsdtAmount: data?.totalUsdtAmount ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load buy orders.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
