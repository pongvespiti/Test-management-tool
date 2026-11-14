import { API_PREFIX, CSRF_HEADER } from '@tmt/shared';

/** Request headers the API needs: session, CSRF header and origin, multipart boundary, size. */
const PASS_HEADERS = [
  'cookie',
  'authorization',
  'content-type',
  'content-length',
  'origin',
  'accept',
  'accept-language',
  'user-agent',
  CSRF_HEADER,
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
];

/** Response headers handed back to the browser. */
const RETURN_HEADERS = ['content-type', 'retry-after', 'set-cookie', 'cache-control'];

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Streams a multipart evidence upload to the API's attachments endpoint of `projectId` without
 * holding it in memory, and streams the answer back.
 */
export async function forwardUpload(
  request: Request,
  apiUrl: string,
  projectId: string,
  fetchImpl: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<Response> {
  if (!/^\d{1,9}$/.test(projectId)) return errorResponse(404, 'NOT_FOUND', 'Not found');
  if (!request.body)
    return errorResponse(400, 'MULTIPART_REQUIRED', 'Send the file as multipart/form-data');
  const headers = new Headers();
  for (const name of PASS_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (!headers.has('x-forwarded-host')) {
    const host = request.headers.get('host');
    if (host) headers.set('x-forwarded-host', host);
  }
  let upstream: Response;
  try {
    upstream = await fetchImpl(
      `${apiUrl.replace(/\/+$/, '')}${API_PREFIX}/projects/${projectId}/attachments`,
      {
        method: 'POST',
        headers,
        body: request.body,
        // Node's fetch needs this to send a stream as the body.
        duplex: 'half',
      } as RequestInit,
    );
  } catch {
    return errorResponse(502, 'API_UNREACHABLE', 'Upload failed — cannot reach the server.');
  }
  const out = new Headers();
  for (const name of RETURN_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) out.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
