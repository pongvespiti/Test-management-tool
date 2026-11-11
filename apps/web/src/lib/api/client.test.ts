import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { jsonResponse } from '@/test/render';
import {
  api,
  ApiError,
  buildUrl,
  fileNameFromDisposition,
  isApiError,
  setUnauthorizedHandler,
} from './client';

type FetchMock = jest.MockedFunction<typeof fetch>;

describe('buildUrl', () => {
  it('prefixes API paths and serialises the query', () => {
    expect(
      buildUrl('/projects/3/cases', { suiteId: 2, q: 'x y', tags: ['a', 'b'], empty: '' }),
    ).toBe('/api/v1/projects/3/cases?suiteId=2&q=x+y&tags=a%2Cb');
    expect(buildUrl('/api/health')).toBe('/api/health');
    expect(buildUrl('/x', { list: [], none: null, flag: false })).toBe('/api/v1/x?flag=false');
  });
});

describe('fileNameFromDisposition', () => {
  it('prefers the RFC 5987 file name', () => {
    expect(
      fileNameFromDisposition(
        `attachment; filename="report.xlsx"; filename*=UTF-8''%E0%B8%A3%E0%B8%B2%E0%B8%A2%E0%B8%87%E0%B8%B2%E0%B8%99.xlsx`,
      ),
    ).toBe('รายงาน.xlsx');
    expect(fileNameFromDisposition('attachment; filename="plan.xlsx"')).toBe('plan.xlsx');
    expect(fileNameFromDisposition(null)).toBeNull();
  });
});

describe('api requests', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = jest.fn() as FetchMock;
    globalThis.fetch = fetchMock;
  });

  afterEach(() => setUnauthorizedHandler(null));

  it('sends JSON with the CSRF header on unsafe methods only', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }, 201));
    await expect(api.post('/projects', { key: 'ACS' })).resolves.toEqual({ id: 1 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/projects');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'x-requested-with': 'tmt',
      'Content-Type': 'application/json',
    });
    expect(init?.body).toBe('{"key":"ACS"}');

    fetchMock.mockResolvedValue(jsonResponse([]));
    await api.get('/projects');
    expect(fetchMock.mock.calls[1]![1]?.headers).not.toHaveProperty('x-requested-with');
  });

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.delete('/projects/3/releases/1')).resolves.toBeUndefined();
  });

  it('turns the error envelope into an ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'RELEASE_IN_USE', message: 'In use', details: { n: 2 } } },
        409,
      ),
    );
    const error = await api.delete('/x').catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    expect(error).toMatchObject({
      status: 409,
      code: 'RELEASE_IN_USE',
      message: 'In use',
      details: { n: 2 },
    });
  });

  it('falls back to the HTTP status for non-JSON errors', async () => {
    fetchMock.mockResolvedValue(
      new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' }),
    );
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'HTTP_502', message: 'Bad Gateway' });
  });

  it('reports network failures as NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.get('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('calls the unauthorized handler on 401 unless the request opts out', async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, 401),
    );
    await expect(api.get('/projects')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await expect(api.get('/auth/me', undefined, { skipAuthRedirect: true })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
