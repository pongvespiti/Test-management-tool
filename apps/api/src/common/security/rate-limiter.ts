/** Outcome of one request against a {@link FixedWindowRateLimiter}. */
export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the window resets (for the `Retry-After` header). */
  retryAfterSec: number;
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * In-memory fixed-window counter per key (e.g. client IP). Good enough for a single on-prem API
 * instance; expired windows are purged lazily so memory stays bounded.
 */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly purgeThreshold = 10_000,
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer');
    if (!(windowMs > 0)) throw new Error('windowMs must be positive');
  }

  /** Counts one request for `key` at time `now` (ms). */
  hit(key: string, now: number = Date.now()): RateLimitResult {
    if (this.windows.size >= this.purgeThreshold) this.purge(now);
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    const allowed = window.count <= this.limit;
    return {
      allowed,
      remaining: Math.max(0, this.limit - window.count),
      retryAfterSec: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
    };
  }

  /** Number of keys currently tracked (for tests and diagnostics). */
  get size(): number {
    return this.windows.size;
  }

  private purge(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
