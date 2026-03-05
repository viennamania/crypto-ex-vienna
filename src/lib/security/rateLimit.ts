type RateLimitState = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitState>;

declare global {
  // eslint-disable-next-line no-var
  var __orangeXRateLimitStore: RateLimitStore | undefined;
}

const getStore = (): RateLimitStore => {
  if (!globalThis.__orangeXRateLimitStore) {
    globalThis.__orangeXRateLimitStore = new Map<string, RateLimitState>();
  }

  return globalThis.__orangeXRateLimitStore;
};

const cleanupExpiredEntries = (store: RateLimitStore, now: number) => {
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) {
      store.delete(key);
    }
  }
};

export const evaluateRateLimit = ({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}) => {
  const now = Date.now();
  const safeWindowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1;
  const store = getStore();

  cleanupExpiredEntries(store, now);

  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + safeWindowMs;
    store.set(key, {
      count: 1,
      resetAt,
    });

    return {
      allowed: true,
      remaining: safeLimit - 1,
      resetAt,
      retryAfterMs: 0,
    };
  }

  if (existing.count >= safeLimit) {
    const retryAfterMs = Math.max(existing.resetAt - now, 0);

    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterMs,
    };
  }

  existing.count += 1;
  store.set(key, existing);

  return {
    allowed: true,
    remaining: Math.max(safeLimit - existing.count, 0),
    resetAt: existing.resetAt,
    retryAfterMs: 0,
  };
};
