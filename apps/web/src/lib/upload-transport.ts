import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

/**
 * A minimal `fetch` for streaming a request body to the API with node:http, so the body is pulled
 * only as fast as the API takes it (backpressure). Node's built-in fetch, given a web stream,
 * kept most of a 400 MB body in memory while forwarding it.
 */
export function streamingFetch(url: string, init: RequestInit): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const target = new URL(url);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const client = target.protocol === 'https:' ? https : http;
    const req = client.request(target, { method: init.method ?? 'GET', headers }, (res) => {
      const out = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        if (Array.isArray(value)) value.forEach((v) => out.append(key, v));
        else if (value !== undefined) out.set(key, value);
      }
      resolve(
        new Response(Readable.toWeb(res) as ReadableStream, {
          status: res.statusCode ?? 502,
          headers: out,
        }),
      );
    });
    req.on('error', reject);
    const body = init.body;
    if (body instanceof ReadableStream) {
      const source = Readable.fromWeb(body as unknown as NodeReadableStream);
      source.on('error', (e) => req.destroy(e));
      source.pipe(req);
    } else {
      req.end(body as string | Buffer | undefined);
    }
  });
}
