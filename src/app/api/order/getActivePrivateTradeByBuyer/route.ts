import { NextResponse, type NextRequest } from 'next/server';
import { getActivePrivateTradeByBuyerWallet } from '@lib/api/order';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const buyerWalletAddress =
      typeof body?.buyerWalletAddress === 'string' ? body.buyerWalletAddress.trim() : '';

    if (!buyerWalletAddress) {
      return NextResponse.json(
        { error: 'buyerWalletAddress is required.' },
        { status: 400 },
      );
    }

    const result = await getActivePrivateTradeByBuyerWallet({ buyerWalletAddress });
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR' },
      { status: 500 },
    );
  }
}
