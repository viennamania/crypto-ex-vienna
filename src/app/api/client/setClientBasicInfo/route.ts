import { NextResponse, type NextRequest } from "next/server";

import { upsertOne } from "@/lib/api/client";

const clientId = process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || "";

const toPayload = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  return value as Record<string, unknown>;
};

const toTrimmedString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

export async function POST(request: NextRequest) {
  try {
    if (!clientId) {
      return NextResponse.json({ error: "NEXT_PUBLIC_TEMPLATE_CLIENT_ID is not configured" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const payload = toPayload(toPayload(body).data ?? body);

    const name = toTrimmedString(payload.name);
    const description = toTrimmedString(payload.description);

    const result = await upsertOne(clientId, {
      name,
      description,
    });

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to save client basic info";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
