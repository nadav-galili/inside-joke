import type { Context, MiddlewareHandler } from 'hono';

/** How many requests one caller may make in a window. */
export type RateLimit = { requests: number; windowMs: number };

export type RateLimits = {
  /** The invite and manage pages, per IP: anyone holding a link can reach them. */
  public: RateLimit;
  /** Signed-in routes, per user. */
  user: RateLimit;
};

export const DEFAULT_RATE_LIMITS: RateLimits = {
  public: { requests: 60, windowMs: 10 * 60_000 },
  user: { requests: 120, windowMs: 60_000 },
};

/**
 * Railway's edge sets `X-Real-IP` to the caller's address. Callers without it share one bucket,
 * which only ever makes the limit stricter.
 */
export const clientIp = (c: Context) => c.req.header('x-real-ip') ?? 'unknown';

/**
 * A fixed-window limiter kept in memory. The API runs as one replica, so this is the whole count;
 * a restart forgets it, which is fine for a limiter whose job is to stop floods, not to bill.
 */
export function rateLimit(limit: RateLimit, keyOf: (c: Context) => string): MiddlewareHandler {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = 0;
  return async (c, next) => {
    const now = Date.now();
    if (now >= nextSweep) {
      nextSweep = now + limit.windowMs;
      for (const [key, { resetAt }] of windows) if (resetAt <= now) windows.delete(key);
    }
    const key = keyOf(c);
    let bucket = windows.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + limit.windowMs };
      windows.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit.requests) {
      c.header('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return c.json({ error: 'rate_limited' }, 429);
    }
    await next();
  };
}
