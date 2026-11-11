import { describe, expect, it } from '@jest/globals';
import { fakeRequest, fakeResponse, httpContext } from '../../../test/unit/http-context.js';
import { unitConfig } from '../../../test/unit/fixtures.js';
import { AppException } from '../errors/app.exception.js';
import { LoginRateLimitGuard } from './login-rate-limit.guard.js';

describe('LoginRateLimitGuard', () => {
  it('lets LOGIN_RATE_LIMIT_PER_MIN attempts per IP through, then answers 429 with Retry-After', () => {
    const guard = new LoginRateLimitGuard(unitConfig({ LOGIN_RATE_LIMIT_PER_MIN: '2' }));
    const req = fakeRequest({ ip: '192.168.1.20' });
    const res = fakeResponse();
    const ctx = httpContext(req, res);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    let error: unknown;
    try {
      guard.canActivate(ctx);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(429);
    expect((error as AppException).code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not let one client block another', () => {
    const guard = new LoginRateLimitGuard(unitConfig({ LOGIN_RATE_LIMIT_PER_MIN: '1' }));
    expect(guard.canActivate(httpContext(fakeRequest({ ip: '10.0.0.1' })))).toBe(true);
    expect(guard.canActivate(httpContext(fakeRequest({ ip: '10.0.0.2' })))).toBe(true);
    expect(() => guard.canActivate(httpContext(fakeRequest({ ip: '10.0.0.1' })))).toThrow(
      AppException,
    );
  });
});
