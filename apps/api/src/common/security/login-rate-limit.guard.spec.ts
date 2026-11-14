import { describe, expect, it } from '@jest/globals';
import { fakeRequest, fakeResponse, httpContext } from '../../../test/unit/http-context.js';
import { unitConfig } from '../../../test/unit/fixtures.js';
import { AppException } from '../errors/app.exception.js';
import { CLIENT_LIMIT_FACTOR, LoginRateLimitGuard } from './login-rate-limit.guard.js';

/** A sign-in of `username` from the web app's proxy address. */
const viaProxy = (username: string) =>
  httpContext(fakeRequest({ ip: '172.18.0.3', body: { username } }));

describe('LoginRateLimitGuard', () => {
  it('lets LOGIN_RATE_LIMIT_PER_MIN attempts per username and IP through, then answers 429 with Retry-After', () => {
    const guard = new LoginRateLimitGuard(unitConfig({ LOGIN_RATE_LIMIT_PER_MIN: '2' }));
    const req = fakeRequest({ ip: '192.168.1.20', body: { username: 'ann' } });
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

  it('counts per username, so a team behind one proxy address is not one bucket', () => {
    const guard = new LoginRateLimitGuard(unitConfig({ LOGIN_RATE_LIMIT_PER_MIN: '1' }));
    expect(guard.canActivate(viaProxy('ann'))).toBe(true);
    expect(guard.canActivate(viaProxy('tom'))).toBe(true);
    // The same name in another spelling is the same account.
    expect(() => guard.canActivate(viaProxy(' ANN '))).toThrow(AppException);
  });

  it('still caps one address over all usernames (guessing across accounts)', () => {
    const guard = new LoginRateLimitGuard(unitConfig({ LOGIN_RATE_LIMIT_PER_MIN: '2' }));
    const ceiling = 2 * CLIENT_LIMIT_FACTOR;
    for (let i = 0; i < ceiling; i++) {
      expect(
        guard.canActivate(
          httpContext(fakeRequest({ ip: '10.9.9.9', body: { username: `u${i}` } })),
        ),
      ).toBe(true);
    }
    expect(() =>
      guard.canActivate(httpContext(fakeRequest({ ip: '10.9.9.9', body: { username: 'new' } }))),
    ).toThrow(AppException);
    expect(
      guard.canActivate(httpContext(fakeRequest({ ip: '10.9.9.8', body: { username: 'new' } }))),
    ).toBe(true);
  });
});
