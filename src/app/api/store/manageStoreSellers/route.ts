import { NextResponse, type NextRequest } from 'next/server';

import {
  addStoreSellerWalletAddress,
  getStoreSellerWalletAddresses,
  removeStoreSellerWalletAddress,
} from '@lib/api/store';

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action || 'get').trim().toLowerCase();
    const storecode = String(body?.storecode || '').trim();
    const walletAddress = String(body?.walletAddress || '').trim();

    if (!storecode) {
      return NextResponse.json({ error: 'storecode is required' }, { status: 400 });
    }

    if (action === 'get') {
      const result = await getStoreSellerWalletAddresses({ storecode });
      return NextResponse.json({ result });
    }

    if (!isWalletAddress(walletAddress)) {
      return NextResponse.json({ error: 'valid walletAddress is required' }, { status: 400 });
    }

    if (action === 'add') {
      const result = await addStoreSellerWalletAddress({ storecode, sellerWalletAddress: walletAddress });
      return NextResponse.json({ result });
    }

    if (action === 'remove') {
      const result = await removeStoreSellerWalletAddress({ storecode, sellerWalletAddress: walletAddress });
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: 'unsupported action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'failed to manage store sellers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
