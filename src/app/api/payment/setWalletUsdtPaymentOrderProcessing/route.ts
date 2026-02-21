import { NextResponse, type NextRequest } from 'next/server';

import { updateWalletUsdtPaymentOrderProcessing } from '@lib/api/payment';
import { normalizeIpAddress, pickFirstPublicIpAddress } from '@/lib/ip-address';

const toText = (value: unknown) => String(value ?? '').trim();
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const getClientIp = (request: NextRequest) => {
  return pickFirstPublicIpAddress([
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-vercel-forwarded-for'),
    request.headers.get('x-real-ip'),
    request.headers.get('cf-connecting-ip'),
    request.headers.get('true-client-ip'),
    request.headers.get('x-client-ip'),
  ]);
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const paymentId = String(body?.paymentId || '').trim();
    const orderProcessing = String(body?.orderProcessing || 'COMPLETED').trim().toUpperCase();
    const orderProcessingMemo = String(body?.orderProcessingMemo || '');
    const orderProcessingUpdatedBy = isRecord(body?.orderProcessingUpdatedBy)
      ? {
          walletAddress: toText(body.orderProcessingUpdatedBy.walletAddress),
          nickname: toText(body.orderProcessingUpdatedBy.nickname),
          role: toText(body.orderProcessingUpdatedBy.role),
        }
      : undefined;
    const orderProcessingUpdatedByIp = pickFirstPublicIpAddress([
      normalizeIpAddress(body?.orderProcessingUpdatedByIp),
      getClientIp(request),
    ]);
    const orderProcessingUpdatedByUserAgent = toText(body?.orderProcessingUpdatedByUserAgent)
      || toText(request.headers.get('user-agent'));

    const result = await updateWalletUsdtPaymentOrderProcessing({
      paymentId,
      orderProcessing: orderProcessing === 'PROCESSING' ? 'PROCESSING' : 'COMPLETED',
      orderProcessingMemo,
      orderProcessingUpdatedBy,
      orderProcessingUpdatedByIp,
      orderProcessingUpdatedByUserAgent,
    });

    return NextResponse.json({
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to update order processing';
    const status = message === 'payment not found' ? 404 : message.startsWith('invalid') ? 400 : 500;

    return NextResponse.json(
      {
        error: message,
      },
      { status },
    );
  }
}
