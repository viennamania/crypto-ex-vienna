import { NextResponse, type NextRequest } from 'next/server';

import { pickFirstPublicIpAddress } from '@/lib/ip-address';

export async function GET(request: NextRequest) {
  try {
    const ipAddress = pickFirstPublicIpAddress([
      request.headers.get('x-forwarded-for'),
      request.headers.get('x-vercel-forwarded-for'),
      request.headers.get('x-real-ip'),
      request.headers.get('cf-connecting-ip'),
      request.headers.get('true-client-ip'),
      request.headers.get('x-client-ip'),
    ]);

    return NextResponse.json({
      ipAddress,
    });
  } catch (error) {
    console.error('getServerInfo: unexpected error', error);
    return NextResponse.json(
      {
        ipAddress: '',
      },
      { status: 200 },
    );
  }
}
