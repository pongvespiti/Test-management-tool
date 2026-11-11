/**
 * Minimal outbound HTTP(S) client for integrations (ADR-008) on `node:http`/`node:https`: overall
 * timeout (15 s), response size cap (5 MB), per-request certificate checks (`verifyTls`), no
 * redirects, no connection reuse. It never logs; error messages never contain headers or URLs.
 */
import http, { type IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import { Injectable } from '@nestjs/common';

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export type HttpErrorKind = 'timeout' | 'too_large' | 'tls' | 'network' | 'bad_url';

/** The request failed below HTTP (no status): timeout, size cap, TLS, network or a bad URL. */
export class HttpClientError extends Error {
  constructor(
    readonly kind: HttpErrorKind,
    message: string,
    /** Low-level error code (e.g. ECONNREFUSED, DEPTH_ZERO_SELF_SIGNED_CERT). */
    readonly causeCode: string | null = null,
  ) {
    super(message);
    this.name = 'HttpClientError';
  }
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  /** JSON request body (sets `Content-Type: application/json`). */
  json?: unknown;
  timeoutMs?: number;
  maxBytes?: number;
  /** false = skip certificate verification for this request only (never a global setting). */
  verifyTls?: boolean;
}

export interface HttpResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  text(): string;
  /** Parsed JSON body; null when the body is empty or not JSON. */
  json<T = unknown>(): T | null;
}

export interface JsonResponse<T> {
  status: number;
  data: T | null;
  response: HttpResponse;
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_UNTRUSTED',
  'CERT_REJECTED',
  'CERT_SIGNATURE_FAILURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'EPROTO',
]);

function classify(e: unknown): HttpClientError {
  if (e instanceof HttpClientError) return e;
  const code = (e as { code?: string }).code ?? null;
  if (code && TLS_CODES.has(code)) {
    return new HttpClientError('tls', `TLS certificate check failed (${code})`, code);
  }
  return new HttpClientError('network', `Connection failed${code ? ` (${code})` : ''}`, code);
}

function makeResponse(status: number, headers: IncomingHttpHeaders, body: Buffer): HttpResponse {
  return {
    status,
    headers,
    body,
    text: () => body.toString('utf8'),
    json: <T>() => {
      if (body.length === 0) return null;
      try {
        return JSON.parse(body.toString('utf8')) as T;
      } catch {
        return null;
      }
    },
  };
}

function send(opts: HttpRequestOptions): Promise<HttpResponse> {
  let url: URL;
  try {
    url = new URL(opts.url);
  } catch {
    return Promise.reject(new HttpClientError('bad_url', 'Invalid URL'));
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return Promise.reject(new HttpClientError('bad_url', 'Only http and https URLs are supported'));
  }
  // Credentials in the URL are never sent: authentication goes through explicit headers only.
  url.username = '';
  url.password = '';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const headers: Record<string, string> = { ...opts.headers };
  let body = opts.body;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
  }
  if (body !== undefined) headers['Content-Length'] = String(Buffer.byteLength(body));

  return new Promise<HttpResponse>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (err: HttpClientError | null, res?: HttpResponse) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) reject(err);
      else resolve(res!);
    };
    const requestOptions: https.RequestOptions = {
      method: opts.method ?? 'GET',
      headers,
      agent: false,
    };
    if (url.protocol === 'https:') requestOptions.rejectUnauthorized = opts.verifyTls !== false;
    let req: http.ClientRequest;
    try {
      req = (url.protocol === 'https:' ? https : http).request(url, requestOptions);
    } catch (e) {
      finish(classify(e));
      return;
    }
    timer = setTimeout(() => {
      const err = new HttpClientError(
        'timeout',
        `No answer within ${Math.round(timeoutMs / 100) / 10} s`,
      );
      finish(err);
      req.destroy(err);
    }, timeoutMs);
    req.on('error', (e) => finish(classify(e)));
    req.on('response', (res) => {
      const tooLarge = () =>
        new HttpClientError(
          'too_large',
          `Response larger than ${Math.round(maxBytes / 1024 / 1024)} MB`,
        );
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) {
        finish(tooLarge());
        req.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          finish(tooLarge());
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () =>
        finish(null, makeResponse(res.statusCode ?? 0, res.headers, Buffer.concat(chunks))),
      );
      res.on('error', (e) => finish(classify(e)));
      res.on('close', () => {
        if (!res.complete) finish(new HttpClientError('network', 'Connection closed early'));
      });
    });
    req.end(body);
  });
}

/**
 * Outbound HTTP for integrations, injectable so services can be tested with a fake. Answers of
 * any status resolve; only transport failures reject (with HttpClientError).
 */
@Injectable()
export class HttpClient {
  request(opts: HttpRequestOptions): Promise<HttpResponse> {
    return send(opts);
  }

  /** JSON request: sends `Accept: application/json` and parses the answer (any status). */
  async requestJson<T = unknown>(opts: HttpRequestOptions): Promise<JsonResponse<T>> {
    const response = await send({
      ...opts,
      headers: { Accept: 'application/json', ...opts.headers },
    });
    return { status: response.status, data: response.json<T>(), response };
  }
}
