import { NextResponse, type NextRequest } from "next/server";

import { getOne } from "@/lib/api/client";

const clientId = process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || "";
const DEFAULT_LOGO_PATH = "/logo.png";

const resolveLogoUrl = (origin: string, rawLogo: unknown) => {
  const value = typeof rawLogo === "string" ? rawLogo.trim() : "";
  if (!value) {
    return `${origin}${DEFAULT_LOGO_PATH}`;
  }
  if (value === "/api/client/logo") {
    return `${origin}${DEFAULT_LOGO_PATH}`;
  }
  if (value === `${origin}/api/client/logo`) {
    return `${origin}${DEFAULT_LOGO_PATH}`;
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (value.startsWith("/")) {
    return `${origin}${value}`;
  }
  return `${origin}${DEFAULT_LOGO_PATH}`;
};

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  try {
    if (!clientId) {
      return NextResponse.redirect(`${origin}${DEFAULT_LOGO_PATH}`, { status: 307 });
    }

    const clientInfo = await getOne(clientId);
    const logoUrl = resolveLogoUrl(origin, clientInfo?.logo);

    const response = NextResponse.redirect(logoUrl, { status: 307 });
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  } catch (error) {
    const response = NextResponse.redirect(`${origin}${DEFAULT_LOGO_PATH}`, { status: 307 });
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  }
}
