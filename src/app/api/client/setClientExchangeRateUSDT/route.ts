import { NextResponse, type NextRequest } from "next/server";

import { upsertOne } from "@/lib/api/client";

const clientId = process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || "";

type ExchangeRateUSDT = {
  USD: number;
  KRW: number;
  JPY: number;
  CNY: number;
  EUR: number;
};

const DEFAULT_EXCHANGE_RATE_USDT: ExchangeRateUSDT = {
  USD: 0,
  KRW: 0,
  JPY: 0,
  CNY: 0,
  EUR: 0,
};

const toPayload = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  return value as Record<string, unknown>;
};

const normalizeRate = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Number(numeric.toFixed(6));
};

const normalizeExchangeRateUSDT = (value: unknown): ExchangeRateUSDT => {
  const source = toPayload(value);
  return {
    USD: normalizeRate(source.USD ?? DEFAULT_EXCHANGE_RATE_USDT.USD),
    KRW: normalizeRate(source.KRW ?? DEFAULT_EXCHANGE_RATE_USDT.KRW),
    JPY: normalizeRate(source.JPY ?? DEFAULT_EXCHANGE_RATE_USDT.JPY),
    CNY: normalizeRate(source.CNY ?? DEFAULT_EXCHANGE_RATE_USDT.CNY),
    EUR: normalizeRate(source.EUR ?? DEFAULT_EXCHANGE_RATE_USDT.EUR),
  };
};

export async function POST(request: NextRequest) {
  try {
    if (!clientId) {
      return NextResponse.json({ error: "NEXT_PUBLIC_TEMPLATE_CLIENT_ID is not configured" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const payload = toPayload(toPayload(body).data ?? body);
    const exchangeRateUSDT = normalizeExchangeRateUSDT(payload.exchangeRateUSDT);

    const result = await upsertOne(clientId, {
      exchangeRateUSDT,
    });

    return NextResponse.json({
      result,
      exchangeRateUSDT,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to save exchangeRateUSDT";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
