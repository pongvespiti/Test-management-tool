import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { authUser, unitConfig } from '../../../test/unit/fixtures.js';
import { fakeRequest, httpContext } from '../../../test/unit/http-context.js';
import type { ApiTokenService } from '../../modules/auth/api-token.service.js';
import type { SessionService } from '../../modules/auth/session.service.js';
import {
  AllowPendingPasswordChange,
  Public,
  SessionOnly,
  TechnicianAllowed,
} from '../decorators/auth.decorators.js';
import { AppException } from '../errors/app.exception.js';
import { bearerToken } from '../security/bearer-token.js';
import { AuthGuard } from './auth.guard.js';

class TestController {
  @Public()
  open() {}

  @SessionOnly()
  sensitive() {}

  @AllowPendingPasswordChange()
  me() {}

  @TechnicianAllowed()
  stands() {}

  normal() {}
}

const handler = (name: keyof TestController) => TestController.prototype[name];

async function failure(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (e) {
    return e as AppException;
  }
  throw new Error('expected the guard to reject');
}

describe('AuthGuard', () => {
  const config = unitConfig({ SESSION_COOKIE_NAME: 'sid' });
  let sessions: { resolve: jest.Mock<SessionService['resolve']> };
  let tokens: { resolve: jest.Mock<ApiTokenService['resolve']> };
  let guard: AuthGuard;

  const activate = (req: Request, name: keyof TestController = 'normal') =>
    guard.canActivate(httpContext(req, undefined, handler(name), TestController));

  beforeEach(() => {
    sessions = { resolve: jest.fn<SessionService['resolve']>() };
    tokens = { resolve: jest.fn<ApiTokenService['resolve']>() };
    guard = new AuthGuard(
      new Reflector(),
      config,
      sessions as unknown as SessionService,
      tokens as unknown as ApiTokenService,
    );
  });

  it('keeps technician accounts to @TechnicianAllowed() routes', async () => {
    sessions.resolve.mockResolvedValue({
      sessionId: 's1',
      user: authUser({ isTechnician: true }),
    });
    const req = () => fakeRequest({ cookies: { sid: 'abc' } });
    await expect(activate(req(), 'stands')).resolves.toBe(true);
    const error = await failure(activate(req()));
    expect(error.getStatus()).toBe(403);
    expect(error.code).toBe('TECHNICIAN_NOT_ALLOWED');
  });

  it('lets @Public() routes through without credentials', async () => {
    await expect(activate(fakeRequest(), 'open')).resolves.toBe(true);
    expect(sessions.resolve).not.toHaveBeenCalled();
  });

  it('rejects requests without a session cookie or token', async () => {
    const error = await failure(activate(fakeRequest()));
    expect(error.getStatus()).toBe(401);
    expect(error.code).toBe('UNAUTHENTICATED');
  });

  it('authenticates with the session cookie', async () => {
    const user = authUser();
    sessions.resolve.mockResolvedValue({ sessionId: 'hash', user });
    const req = fakeRequest({ cookies: { sid: 'cookie-token' } });
    await expect(activate(req)).resolves.toBe(true);
    expect(sessions.resolve).toHaveBeenCalledWith('cookie-token');
    expect(req.authUser).toBe(user);
    expect(req.sessionId).toBe('hash');
    expect(req.authMethod).toBe('session');
  });

  it('rejects an expired session', async () => {
    sessions.resolve.mockResolvedValue(null);
    const error = await failure(activate(fakeRequest({ cookies: { sid: 'old' } })));
    expect(error.getStatus()).toBe(401);
    expect(error.message).toMatch(/expired/);
  });

  it('prefers a Bearer token over the cookie', async () => {
    const user = authUser({ id: 7 });
    tokens.resolve.mockResolvedValue(user);
    const req = fakeRequest({
      headers: { authorization: 'Bearer tmt_secret' },
      cookies: { sid: 'cookie-token' },
    });
    await expect(activate(req)).resolves.toBe(true);
    expect(tokens.resolve).toHaveBeenCalledWith('tmt_secret');
    expect(sessions.resolve).not.toHaveBeenCalled();
    expect(req.authMethod).toBe('token');
  });

  it('rejects invalid tokens with INVALID_TOKEN', async () => {
    tokens.resolve.mockResolvedValue(null);
    const error = await failure(activate(fakeRequest({ headers: { authorization: 'Bearer x' } })));
    expect(error.code).toBe('INVALID_TOKEN');
  });

  it('refuses tokens on @SessionOnly() routes', async () => {
    const error = await failure(
      activate(fakeRequest({ headers: { authorization: 'Bearer tmt_x' } }), 'sensitive'),
    );
    expect(error.getStatus()).toBe(403);
    expect(error.code).toBe('TOKEN_NOT_ALLOWED');
    expect(tokens.resolve).not.toHaveBeenCalled();
  });

  it('blocks users who must change their password, except on allowed routes', async () => {
    sessions.resolve.mockResolvedValue({
      sessionId: 's',
      user: authUser({ mustChangePassword: true }),
    });
    const req = () => fakeRequest({ cookies: { sid: 't' } });
    const error = await failure(activate(req()));
    expect(error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await expect(activate(req(), 'me')).resolves.toBe(true);
  });
});

describe('bearerToken', () => {
  const withAuth = (authorization?: string) =>
    fakeRequest({ headers: authorization === undefined ? {} : { authorization } });

  it('extracts the token of a Bearer header', () => {
    expect(bearerToken(withAuth('Bearer abc'))).toBe('abc');
    expect(bearerToken(withAuth('bearer   abc  '))).toBe('abc');
    expect(bearerToken(withAuth('Bearer '))).toBe('');
  });

  it('returns null without a Bearer header', () => {
    expect(bearerToken(withAuth())).toBeNull();
    expect(bearerToken(withAuth('Basic dXNlcjpwYXNz'))).toBeNull();
    expect(bearerToken(withAuth('Bearerabc'))).toBeNull();
  });

  it('rejects an empty Bearer header instead of falling back to the cookie', async () => {
    const tokens = { resolve: jest.fn<ApiTokenService['resolve']>().mockResolvedValue(null) };
    const sessions = { resolve: jest.fn<SessionService['resolve']>() };
    const guard = new AuthGuard(
      new Reflector(),
      unitConfig(),
      sessions as unknown as SessionService,
      tokens as unknown as ApiTokenService,
    );
    const req = fakeRequest({
      headers: { authorization: 'Bearer ' },
      cookies: { tmt_session: 'c' },
    });
    const error = await failure(
      guard.canActivate(httpContext(req, undefined, handler('normal'), TestController)),
    );
    expect(error.code).toBe('INVALID_TOKEN');
    expect(sessions.resolve).not.toHaveBeenCalled();
  });
});
