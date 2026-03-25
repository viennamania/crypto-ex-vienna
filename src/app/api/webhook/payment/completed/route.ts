import { NextResponse } from 'next/server';

import {
  buildPaymentCompletedWebhookLogDocument,
  insertPaymentCompletedWebhookLog,
} from '@/lib/paymentCompletedWebhookLog';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'POST, OPTIONS',
    },
  });
}

export async function POST(request: Request) {
  let rawBody = '';

  try {
    rawBody = await request.text();
  } catch (error) {
    console.error('Failed to read payment completed webhook request body', error);
    return NextResponse.json(
      { result: false, error: 'Failed to read request body.' },
      { status: 400 },
    );
  }

  let payload: Record<string, unknown> | null = null;
  let parseError = '';

  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      } else {
        parseError = 'JSON body must be an object.';
      }
    } catch (error) {
      parseError = error instanceof Error ? error.message : 'Invalid JSON body.';
    }
  } else {
    parseError = 'Request body is empty.';
  }

  try {
    const logDoc = buildPaymentCompletedWebhookLogDocument({
      request,
      rawBody,
      payload,
      parseError,
    });
    const result = await insertPaymentCompletedWebhookLog(logDoc);

    return NextResponse.json({
      result: true,
      id: result.insertedId,
      loggedAt: logDoc.receivedAt,
      parseError: logDoc.parseError || '',
    });
  } catch (error) {
    console.error('Failed to store payment completed webhook log', error);
    return NextResponse.json(
      {
        result: false,
        error: error instanceof Error ? error.message : 'Failed to store webhook log.',
      },
      { status: 500 },
    );
  }
}
