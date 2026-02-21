import { NextResponse, type NextRequest } from 'next/server';

const toText = (value: unknown) => String(value ?? '').trim();

const extractForwardedIp = (value: string) => {
  const normalized = toText(value);
  if (!normalized) return '';
  const [first] = normalized.split(',');
  return toText(first);
};

export async function GET(request: NextRequest) {
  try {
    const headerCandidates = [
      extractForwardedIp(toText(request.headers.get('x-forwarded-for'))),
      extractForwardedIp(toText(request.headers.get('x-vercel-forwarded-for'))),
      toText(request.headers.get('x-real-ip')),
      toText(request.headers.get('cf-connecting-ip')),
      toText(request.headers.get('true-client-ip')),
      toText(request.headers.get('x-client-ip')),
    ].filter(Boolean);

    let ipAddress = headerCandidates[0] || '';

    // Fallback for local/proxy environments where forwarding headers are unavailable.
    if (!ipAddress) {
      try {
        const response = await fetch('https://api64.ipify.org?format=json', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        ipAddress = toText(data?.ip);
      } catch (ipLookupError) {
        console.error('getServerInfo: failed to resolve external ip', ipLookupError);
      }
    }

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
