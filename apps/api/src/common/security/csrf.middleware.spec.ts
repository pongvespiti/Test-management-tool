import { describe, expect, it, jest } from '@jest/globals';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@tmt/shared';
import type { Response } from 'express';
import { fakeRequest } from '../../../test/unit/http-context.js';
import { unitConfig } from '../../../test/unit/fixtures.js';
import { AppException } from '../errors/app.exception.js';
import { CsrfMiddleware } from './csrf.middleware.js';

const res = {} as Response;

function run(
  middleware: CsrfMiddleware,
  init: { method: string; headers?: Record<string, string> },
): { passed: boolean; error?: AppException } {
  const next = jest.fn();
  try {
    middleware.use(fakeRequest({ method: init.method, headers: init.headers ?? {} }), res, next);
  } catch (e) {
    return { passed: false, error: e as AppException };
  }
  return { passed: next.mock.calls.length === 1 };
}

describe('CsrfMiddleware', () => {
  const middleware = new CsrfMiddleware(
    unitConfig({ WEB_ORIGINS: 'http://tmt.local:3000, https://tmt.example.com/' }),
  );
  const csrf = { [CSRF_HEADER]: CSRF_HEADER_VALUE };

  it('never checks safe methods', () => {
    expect(run(middleware, { method: 'GET' }).passed).toBe(true);
    expect(run(middleware, { method: 'HEAD' }).passed).toBe(true);
  });

  it('requires the custom header on unsafe methods', () => {
    const result = run(middleware, { method: 'POST' });
    expect(result.passed).toBe(false);
    expect(result.error?.code).toBe('CSRF_REJECTED');
    expect(result.error?.getStatus()).toBe(403);
    expect(run(middleware, { method: 'DELETE', headers: csrf }).passed).toBe(true);
  });

  it('skips requests authenticated with a Bearer token', () => {
    expect(
      run(middleware, { method: 'PATCH', headers: { authorization: 'Bearer tmt_abc' } }).passed,
    ).toBe(true);
  });

  it('accepts configured origins (case- and trailing-slash-insensitive)', () => {
    expect(
      run(middleware, { method: 'POST', headers: { ...csrf, origin: 'HTTPS://TMT.EXAMPLE.COM' } })
        .passed,
    ).toBe(true);
    expect(
      run(middleware, { method: 'POST', headers: { ...csrf, origin: 'http://tmt.local:3000' } })
        .passed,
    ).toBe(true);
  });

  it('accepts the API host itself and rejects foreign origins', () => {
    expect(
      run(middleware, {
        method: 'PUT',
        headers: { ...csrf, origin: 'http://10.1.1.5:4000', host: '10.1.1.5:4000' },
      }).passed,
    ).toBe(true);
    const foreign = run(middleware, {
      method: 'PUT',
      headers: { ...csrf, origin: 'https://evil.example', host: '10.1.1.5:4000' },
    });
    expect(foreign.passed).toBe(false);
    expect(foreign.error?.message).toMatch(/Cross-site/);
    expect(
      run(middleware, { method: 'PUT', headers: { ...csrf, origin: 'not a url', host: 'x' } })
        .passed,
    ).toBe(false);
  });

  it('uses X-Forwarded-Host only behind a trusted proxy', () => {
    const headers = {
      ...csrf,
      origin: 'https://tmt.corp',
      host: 'api:4000',
      'x-forwarded-host': 'tmt.corp',
    };
    expect(run(middleware, { method: 'POST', headers }).passed).toBe(false);
    const proxied = new CsrfMiddleware(unitConfig({ TRUST_PROXY: 'true' }));
    expect(run(proxied, { method: 'POST', headers }).passed).toBe(true);
  });

  it('treats an opaque "null" origin like a missing one', () => {
    expect(run(middleware, { method: 'POST', headers: { ...csrf, origin: 'null' } }).passed).toBe(
      true,
    );
  });
});
