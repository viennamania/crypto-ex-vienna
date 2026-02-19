import { NextResponse, type NextRequest } from 'next/server';

import { updateStoreBranding } from '@lib/api/store';
import { normalizeHexColor } from '@lib/storeBranding';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const storecode = String(body?.storecode || '').trim();
  const storeName = String(body?.storeName || '').trim();
  const storeLogo = String(body?.storeLogo || '').trim();
  const backgroundColorInput = String(body?.backgroundColor || '').trim();
  const backgroundColor = backgroundColorInput ? normalizeHexColor(backgroundColorInput) : '';

  if (!storecode || !storeName) {
    return NextResponse.json(
      { error: 'storecode and storeName are required' },
      { status: 400 },
    );
  }

  if (backgroundColorInput && !backgroundColor) {
    return NextResponse.json(
      { error: 'backgroundColor must be a 6-digit hex color' },
      { status: 400 },
    );
  }

  const result = await updateStoreBranding({
    storecode,
    storeName,
    storeLogo,
    backgroundColor,
  });

  if (!result) {
    return NextResponse.json(
      { error: 'failed to update store branding' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    result: true,
  });
}
