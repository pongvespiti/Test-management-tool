import { describe, expect, it } from '@jest/globals';
import { FixedWindowRateLimiter } from './rate-limiter.js';

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit within one window and blocks the rest', () => {
    const limiter = new FixedWindowRateLimiter(3, 60_000);
    const results = [1, 2, 3, 4].map(() => limiter.hit('10.0.0.1', 1_000));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3]!.retryAfterSec).toBe(60);
  });

  it('counts every key separately', () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);
    expect(limiter.hit('a', 0).allowed).toBe(true);
    expect(limiter.hit('b', 0).allowed).toBe(true);
    expect(limiter.hit('a', 0).allowed).toBe(false);
  });

  it('starts a fresh window after the previous one expired', () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000);
    expect(limiter.hit('a', 0).allowed).toBe(true);
    expect(limiter.hit('a', 999).allowed).toBe(false);
    expect(limiter.hit('a', 1_000).allowed).toBe(true);
  });

  it('reports the seconds left in the window (at least 1)', () => {
    const limiter = new FixedWindowRateLimiter(1, 10_000);
    limiter.hit('a', 0);
    expect(limiter.hit('a', 2_500).retryAfterSec).toBe(8);
    expect(limiter.hit('a', 9_999).retryAfterSec).toBe(1);
  });

  it('purges expired windows once the threshold is reached', () => {
    const limiter = new FixedWindowRateLimiter(5, 1_000, 3);
    limiter.hit('a', 0);
    limiter.hit('b', 0);
    limiter.hit('c', 0);
    expect(limiter.size).toBe(3);
    limiter.hit('d', 5_000);
    expect(limiter.size).toBe(1);
  });

  it('rejects invalid settings', () => {
    expect(() => new FixedWindowRateLimiter(0, 1_000)).toThrow('limit');
    expect(() => new FixedWindowRateLimiter(1.5, 1_000)).toThrow('limit');
    expect(() => new FixedWindowRateLimiter(1, 0)).toThrow('windowMs');
  });
});
