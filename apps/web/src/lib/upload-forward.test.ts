import { describe, expect, it, jest } from '@jest/globals';
import { forwardUpload } from './upload-forward';

function uploadRequest(headers: Record<string, string> = {}) {
  return new Request('http://web.local/upload/projects/7/attachments', {
    method: 'POST',
    headers: {
      host: 'web.local',
      cookie: 'tmt_session=abc',
      'content-type': 'multipart/form-data; boundary=x',
      'x-requested-with': 'XMLHttpRequest',
      origin: 'http://web.local',
      'x-other': 'dropped',
      ...headers,
    },
    body: 'payload',
  });
}

describe('forwardUpload', () => {
  it('streams the body to the API attachments endpoint with the session and CSRF headers', async () => {
    const fetchImpl = jest.fn<typeof fetch>(async () =>
      Response.json({ id: 'a1' }, { status: 201, headers: { 'x-internal': 'no' } }),
    );
    const res = await forwardUpload(uploadRequest(), 'http://api:4000/', '7', fetchImpl);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'a1' });
    expect(res.headers.get('x-internal')).toBeNull();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('http://api:4000/api/v1/projects/7/attachments');
    const sent = init!.headers as Headers;
    expect(sent.get('cookie')).toBe('tmt_session=abc');
    expect(sent.get('x-requested-with')).toBe('XMLHttpRequest');
    expect(sent.get('origin')).toBe('http://web.local');
    expect(sent.get('x-other')).toBeNull();
    expect(init!.body).toBeInstanceOf(ReadableStream);
    expect((init as { duplex?: string }).duplex).toBe('half');
  });

  it('passes API errors through (413 too large, 403 no access)', async () => {
    const fetchImpl = jest.fn<typeof fetch>(async () =>
      Response.json({ error: { code: 'FILE_TOO_LARGE', message: 'too big' } }, { status: 413 }),
    );
    const res = await forwardUpload(uploadRequest(), 'http://api:4000', '7', fetchImpl);
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('FILE_TOO_LARGE');
  });

  it('answers 404 for a malformed project id without calling the API', async () => {
    const fetchImpl = jest.fn<typeof fetch>();
    const res = await forwardUpload(uploadRequest(), 'http://api:4000', '../x', fetchImpl);
    expect(res.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers 502 when the API cannot be reached', async () => {
    const fetchImpl = jest.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    const res = await forwardUpload(uploadRequest(), 'http://api:4000', '7', fetchImpl);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('API_UNREACHABLE');
  });
});
