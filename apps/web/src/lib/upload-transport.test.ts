/** @jest-environment node */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { streamingFetch } from './upload-transport';

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let size = 0;
    req.on('data', (c: Buffer) => (size += c.length));
    req.on('end', () => {
      res.writeHead(req.headers['x-fail'] ? 413 : 201, {
        'content-type': 'application/json',
        'set-cookie': ['a=1', 'b=2'],
      });
      res.end(JSON.stringify({ size, method: req.method, cookie: req.headers.cookie ?? null }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function streamOf(total: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= total) return controller.close();
      const n = Math.min(64 * 1024, total - sent);
      sent += n;
      controller.enqueue(new Uint8Array(n));
    },
  });
}

describe('streamingFetch', () => {
  it('streams a web stream body and returns status, headers and body', async () => {
    const res = await streamingFetch(`${base}/x`, {
      method: 'POST',
      headers: { cookie: 's=1' },
      body: streamOf(3 * 1024 * 1024 + 5),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ size: 3 * 1024 * 1024 + 5, method: 'POST', cookie: 's=1' });
  });

  it('passes error statuses through', async () => {
    const res = await streamingFetch(`${base}/x`, {
      method: 'POST',
      headers: { 'x-fail': '1' },
      body: streamOf(10),
    });
    expect(res.status).toBe(413);
  });

  it('rejects when the server cannot be reached', async () => {
    await expect(
      streamingFetch('http://127.0.0.1:1/x', { method: 'POST', body: streamOf(1) }),
    ).rejects.toThrow();
  });
});
