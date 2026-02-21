

import { NextResponse, type NextRequest } from "next/server";



export async function GET(request: NextRequest) {

  const xForwardedFor = request.headers.get("x-forwarded-for");
  const xRealIp = request.headers.get("x-real-ip");
  const forwardedIp = xForwardedFor?.split(",")[0]?.trim();
  const directIp = xRealIp?.trim();

  let ipAddress = forwardedIp || directIp || "";

  // Fallback for local/proxy environments where forwarding headers are unavailable.
  if (!ipAddress) {
    const myIpAddressUrl = "https://api.ipify.org?format=json";
    const response = await fetch(myIpAddressUrl, { cache: "no-store" });
    const data = await response.json();
    ipAddress = data?.ip || "";
  }

  return NextResponse.json({
    ipAddress,
  });

}
