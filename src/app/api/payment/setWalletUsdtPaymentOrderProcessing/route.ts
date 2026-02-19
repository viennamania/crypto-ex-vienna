import { NextResponse, type NextRequest } from 'next/server';

import { updateWalletUsdtPaymentOrderProcessing } from '@lib/api/payment';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const paymentId = String(body?.paymentId || '').trim();
    const orderProcessing = String(body?.orderProcessing || 'COMPLETED').trim().toUpperCase();

    const result = await updateWalletUsdtPaymentOrderProcessing({
      paymentId,
      orderProcessing: orderProcessing === 'PROCESSING' ? 'PROCESSING' : 'COMPLETED',
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
