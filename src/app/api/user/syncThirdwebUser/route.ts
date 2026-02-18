import { NextResponse, type NextRequest } from 'next/server';
import { createThirdwebClient } from 'thirdweb';
import { getUser } from 'thirdweb/wallets';

import { syncThirdwebUserProfileByWalletAddress } from '@lib/api/user';

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const walletAddress = String(body?.walletAddress || '').trim();
  const storecode = String(body?.storecode || '').trim();

  if (!isWalletAddress(walletAddress)) {
    return NextResponse.json(
      {
        error: 'Invalid walletAddress',
      },
      { status: 400 },
    );
  }

  const secretKey = process.env.THIRDWEB_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({
      result: null,
      synced: false,
      reason: 'THIRDWEB_SECRET_KEY is not configured',
    });
  }

  try {
    const thirdwebClient = createThirdwebClient({ secretKey });
    const thirdwebUser = await getUser({
      client: thirdwebClient,
      walletAddress,
    });

    if (!thirdwebUser) {
      return NextResponse.json({
        result: null,
        synced: false,
        reason: 'No thirdweb member profile found for the wallet address',
      });
    }

    const result = await syncThirdwebUserProfileByWalletAddress({
      walletAddress,
      storecode: storecode || undefined,
      thirdwebUser,
    });

    return NextResponse.json({
      result,
      synced: true,
      thirdwebUser: {
        userId: thirdwebUser.userId,
        walletAddress: thirdwebUser.walletAddress,
        smartAccountAddress: thirdwebUser.smartAccountAddress,
        email: thirdwebUser.email,
        phone: thirdwebUser.phone,
        createdAt: thirdwebUser.createdAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to sync thirdweb user profile',
      },
      { status: 500 },
    );
  }
}
