import { NextResponse, type NextRequest } from 'next/server';

import { updateStorePaymentCompletedCallbackUrl } from '@lib/api/store';

const normalizeCallbackUrl = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const storecode = String(body?.storecode || '').trim();
  const callbackUrlInput = String(body?.paymentCompletedCallbackUrl || '').trim();
  const paymentCompletedCallbackUrl = callbackUrlInput ? normalizeCallbackUrl(callbackUrlInput) : '';

  if (!storecode) {
    return NextResponse.json(
      { error: 'storecode is required' },
      { status: 400 },
    );
  }

  if (callbackUrlInput && !paymentCompletedCallbackUrl) {
    return NextResponse.json(
      { error: 'paymentCompletedCallbackUrl must be a valid http or https URL' },
      { status: 400 },
    );
  }

  const result = await updateStorePaymentCompletedCallbackUrl({
    storecode,
    paymentCompletedCallbackUrl,
  });

  if (!result) {
    return NextResponse.json(
      { error: 'failed to update payment completed callback url' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    result: true,
    paymentCompletedCallbackUrl,
  });
}
