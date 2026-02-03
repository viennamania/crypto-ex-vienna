import { NextRequest, NextResponse } from 'next/server';
import { getCancelLogsBySellerWalletAddress, insertCancelLog } from '@/lib/api/cancelLog';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sellerWalletAddress = searchParams.get('sellerWalletAddress');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : 50;

  if (!sellerWalletAddress) {
    return NextResponse.json({ error: 'sellerWalletAddress is required' }, { status: 400 });
  }

  const logs = await getCancelLogsBySellerWalletAddress(sellerWalletAddress, limit);
  return NextResponse.json({ result: logs });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    sellerWalletAddress,
    orderId,
    reason,
    status,
    actor = 'admin',
  } = body;

  if (!sellerWalletAddress || !reason || !status) {
    return NextResponse.json({ error: 'sellerWalletAddress, reason, and status are required' }, { status: 400 });
  }

  const log = await insertCancelLog({
    sellerWalletAddress,
    orderId,
    reason,
    status,
    actor,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ result: log });
}
