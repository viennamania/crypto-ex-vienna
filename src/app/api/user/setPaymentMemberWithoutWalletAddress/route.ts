import { NextResponse, type NextRequest } from 'next/server';
import { randomInt } from 'crypto';

import {
  insertOneWithoutWalletAddress,
} from '@lib/api/user';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const storecode = String(body?.storecode || '').trim();
    const nickname = String(body?.nickname || body?.userCode || '').trim();
    const mobile = String(body?.mobile || '').trim();

    if (!storecode || !nickname) {
      return NextResponse.json(
        { error: 'storecode and nickname are required.' },
        { status: 400 },
      );
    }

    const userName = String(body?.userName || '').trim();
    const userBankName = String(body?.userBankName || '').trim();
    const userBankAccountNumber = String(body?.userBankAccountNumber || '').trim();

    if (!userName) {
      return NextResponse.json(
        { error: 'userName(depositName) is required.' },
        { status: 400 },
      );
    }

    const pinCode = randomInt(0, 100000).toString().padStart(5, '0');

    const inserted = await insertOneWithoutWalletAddress({
      storecode,
      nickname,
      mobile,
      password: pinCode,
      role: 'buyer',
      userType: 'buyer',
      buyer: {
        depositBankName: userBankName,
        depositBankAccountNumber: userBankAccountNumber,
        depositName: userName,
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
