import { NextResponse, type NextRequest } from 'next/server';

import { insertOneWithoutWalletAddress } from '@lib/api/user';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const storecode = String(body?.storecode || '').trim();
    const nickname = String(body?.nickname || '').trim();
    const password = String(body?.password || '').trim();
    const depositName = String(
      body?.buyer?.bankInfo?.depositName ||
        body?.buyer?.bankInfo?.accountHolder ||
        body?.buyer?.depositName ||
        '',
    ).trim();

    if (!storecode || !nickname || !password || !depositName) {
      return NextResponse.json(
        {
          error:
            'storecode, nickname, password, buyer.bankInfo.depositName are required.',
        },
        { status: 400 },
      );
    }

    const inserted = await insertOneWithoutWalletAddress({
      storecode,
      nickname,
      password,
      role: 'buyer',
      userType: 'buyer',
      buyer: {
        depositName,
        bankInfo: {
          depositName,
          accountHolder: depositName,
        },
      },
    });

    if (!inserted || inserted?.error) {
      const errorMessage =
        typeof inserted?.error === 'string' && inserted.error
          ? inserted.error
          : 'Failed to add member';

      return NextResponse.json(
        { error: errorMessage },
        { status: errorMessage.includes('already exists') ? 409 : 400 },
      );
    }

    return NextResponse.json({
      result: inserted.result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'INTERNAL_SERVER_ERROR',
      },
      { status: 500 },
    );
  }
}
