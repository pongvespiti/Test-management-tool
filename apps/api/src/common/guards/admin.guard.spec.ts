import { describe, expect, it } from '@jest/globals';
import { authUser } from '../../../test/unit/fixtures.js';
import { fakeRequest, httpContext } from '../../../test/unit/http-context.js';
import { AdminGuard } from './admin.guard.js';

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('allows administrators', () => {
    expect(
      guard.canActivate(httpContext(fakeRequest({ authUser: authUser({ isAdmin: true }) }))),
    ).toBe(true);
  });

  it('forbids other users and rejects anonymous requests', () => {
    expect(() => guard.canActivate(httpContext(fakeRequest({ authUser: authUser() })))).toThrow(
      'Administrator access required',
    );
    expect(() => guard.canActivate(httpContext(fakeRequest()))).toThrow('Please sign in');
  });
});
