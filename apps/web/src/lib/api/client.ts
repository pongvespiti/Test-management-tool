import { API_PREFIX, CSRF_HEADER, CSRF_HEADER_VALUE, type ApiErrorBody } from '@tmt/shared';
import { STREAM_UPLOAD_PREFIX } from '../upload-path';

/** Error thrown for every non-2xx API response (shape of the server's error envelope). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export const API_BASE = API_PREFIX;

export type QueryValue =
  string | number | boolean | null | undefined | readonly (string | number)[];
export type QueryParams = Record<string, QueryValue>;

export function buildUrl(path: string, query?: QueryParams): string {
  // `/upload/…` is the streamed evidence upload (src/app/upload), outside the `/api` proxy.
  const base =
    path.startsWith('/api/') || path.startsWith(`${STREAM_UPLOAD_PREFIX}/`)
      ? path
      : `${API_BASE}${path}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Registered by the AuthProvider: called when any request (except probes) returns 401. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  /** Do not trigger the global 401 handler (used by the `/auth/me` probe and login). */
  skipAuthRedirect?: boolean;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  if (res.headers.get('content-type')?.includes('application/json')) {
    body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
  }
  const err = body?.error;
  return new ApiError(
    res.status,
    err?.code ?? `HTTP_${res.status}`,
    err?.message ?? (res.statusText || 'Request failed'),
    err?.details,
  );
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET' && method !== 'HEAD') headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body,
      credentials: 'same-origin',
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.');
  }
  if (!res.ok) {
    const err = await parseError(res);
    if (res.status === 401 && !opts.skipAuthRedirect) onUnauthorized?.();
    throw err;
  }
  if (res.status === 204 || res.status === 205) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Upload with progress (XMLHttpRequest); resolves with the parsed JSON body. */
function uploadWithProgress<T>(
  method: 'POST' | 'PUT',
  path: string,
  formData: FormData,
  onProgress: (fraction: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, buildUrl(path));
    xhr.setRequestHeader(CSRF_HEADER, CSRF_HEADER_VALUE);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () =>
      reject(new ApiError(0, 'NETWORK_ERROR', 'Upload failed — cannot reach the server.'));
    xhr.onload = () => {
      let json: unknown = null;
      try {
        json = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        json = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(json as T);
        return;
      }
      const err = (json as Partial<ApiErrorBody> | null)?.error;
      if (xhr.status === 401) onUnauthorized?.();
      reject(
        new ApiError(
          xhr.status,
          err?.code ?? `HTTP_${xhr.status}`,
          err?.message ?? 'Upload failed',
          err?.details,
        ),
      );
    };
    xhr.send(formData);
  });
}

export const api = {
  get: <T>(path: string, query?: QueryParams, opts?: Omit<RequestOptions, 'query' | 'body'>) =>
    request<T>('GET', path, { ...opts, query }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('PATCH', path, { ...opts, body }),
  delete: <T = void>(path: string, query?: QueryParams) => request<T>('DELETE', path, { query }),
  /** Multipart upload; pass `onProgress` to get upload progress (0..1). */
  upload: <T>(
    path: string,
    formData: FormData,
    opts: { method?: 'POST' | 'PUT'; onProgress?: (fraction: number) => void } = {},
  ): Promise<T> => {
    const method = opts.method ?? 'POST';
    if (opts.onProgress) return uploadWithProgress<T>(method, path, formData, opts.onProgress);
    return request<T>(method, path, { formData });
  },
};

/** Extracts the file name from a Content-Disposition header (RFC 5987 aware). */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

/** Downloads a file from the API (cookie auth) and saves it via a temporary link. */
export async function downloadFile(
  path: string,
  query?: QueryParams,
  fallbackName = 'download',
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), { credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.');
  }
  if (!res.ok) {
    const err = await parseError(res);
    if (res.status === 401) onUnauthorized?.();
    throw err;
  }
  const blob = await res.blob();
  const name = fileNameFromDisposition(res.headers.get('content-disposition')) ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
