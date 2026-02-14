import { NextResponse, type NextRequest } from 'next/server';
import { getPrivateTradeStatusByBuyerAndSeller } from '@lib/api/order';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const buyerWalletAddress =
      typeof body?.buyerWalletAddress === 'string' ? body.buyerWalletAddress.trim() : '';
    const sellerWalletAddress =
      typeof body?.sellerWalletAddress === 'string' ? body.sellerWalletAddress.trim() : '';

    if (!buyerWalletAddress || !sellerWalletAddress) {
      return NextResponse.json(
        { error: 'buyerWalletAddress, sellerWalletAddress are required.' },
        { status: 400 },
      );
    }

    const result = await getPrivateTradeStatusByBuyerAndSeller({
      buyerWalletAddress,
      sellerWalletAddress,
    });

    return NextResponse.json({ result });
  } catch {
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR' },
      { status: 500 },
    );
  }
}
