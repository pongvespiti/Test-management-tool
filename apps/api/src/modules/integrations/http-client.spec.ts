/** Port of the v1 server's w2-http-client tests against local HTTP and HTTPS servers. */
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo, Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { HttpClient, HttpClientError } from './http-client.js';

// ---------------------------------------------------------------- self-signed certificate (DER)

function derLength(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const der = (tag: number, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
};
const seq = (...parts: Buffer[]) => der(0x30, ...parts);
const set = (...parts: Buffer[]) => der(0x31, ...parts);
const smallInt = (n: number) => der(0x02, Buffer.from([n]));
const utf8 = (s: string) => der(0x0c, Buffer.from(s, 'utf8'));
const utcTime = (d: Date) =>
  der(0x17, Buffer.from(`${d.toISOString().replace(/[-:T]/g, '').slice(2, 14)}Z`));
function oid(dotted: string): Buffer {
  const [a, b, ...rest] = dotted.split('.').map(Number) as [number, number, ...number[]];
  const bytes = [40 * a + b];
  for (const v of rest) {
    const chunk = [v & 0x7f];
    for (let x = v >> 7; x > 0; x >>= 7) chunk.unshift((x & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return der(0x06, Buffer.from(bytes));
}

/** Self-signed ECDSA P-256 certificate for CN=localhost (test only, generated per run). */
function selfSignedCertificate(): { key: string; cert: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const name = seq(set(seq(oid('2.5.4.3'), utf8('localhost'))));
  const algorithm = seq(oid('1.2.840.10045.4.3.2')); // ecdsa-with-SHA256
  const now = Date.now();
  const tbs = seq(
    der(0xa0, smallInt(2)), // v3
    smallInt(1),
    algorithm,
    name,
    seq(utcTime(new Date(now - 3600_000)), utcTime(new Date(now + 24 * 3600_000))),
    name,
    (publicKey as KeyObject).export({ type: 'spki', format: 'der' }),
  );
  const signature = sign('sha256', tbs, privateKey);
  const certDer = seq(tbs, algorithm, der(0x03, Buffer.from([0]), signature));
  const pem = certDer
    .toString('base64')
    .match(/.{1,64}/g)!
    .join('\n');
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    cert: `-----BEGIN CERTIFICATE-----\n${pem}\n-----END CERTIFICATE-----\n`,
  };
}

// ---------------------------------------------------------------- local servers

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;
let handler: Handler = (_req, res) => res.end('{}');
let server: http.Server;
let tlsServer: https.Server;
let base: string;
let tlsBase: string;
const sockets = new Set<Socket>();
const client = new HttpClient();

function listen(s: http.Server | https.Server): Promise<string> {
  s.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  return new Promise((resolve) =>
    s.listen(0, '127.0.0.1', () => resolve(String((s.address() as AddressInfo).port))),
  );
}

const onRequest = (req: http.IncomingMessage, res: http.ServerResponse) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => handler(req, res, Buffer.concat(chunks).toString('utf8')));
};

beforeAll(async () => {
  server = http.createServer(onRequest);
  base = `http://127.0.0.1:${await listen(server)}`;
  tlsServer = https.createServer(selfSignedCertificate(), onRequest);
  tlsBase = `https://127.0.0.1:${await listen(tlsServer)}`;
});
afterAll(async () => {
  for (const s of sockets) s.destroy();
  await new Promise((r) => server.close(r));
  await new Promise((r) => tlsServer.close(r));
});

async function expectHttpError(
  p: Promise<unknown>,
  kind: HttpClientError['kind'],
): Promise<HttpClientError> {
  let error: unknown;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(HttpClientError);
  expect((error as HttpClientError).kind).toBe(kind);
  return error as HttpClientError;
}

describe('HttpClient', () => {
  it('sends JSON with headers and parses JSON answers of any status', async () => {
    let seen: { method?: string; headers?: http.IncomingHttpHeaders; body?: string } = {};
    handler = (req, res, body) => {
      seen = { method: req.method, headers: req.headers, body };
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ key: 'TEAM-1' }));
    };
    const created = await client.requestJson<{ key: string }>({
      method: 'POST',
      url: `${base}/rest/api/2/issue`,
      headers: { Authorization: 'Bearer abc' },
      json: { fields: { summary: 'ไทย' } },
    });
    expect(created.status).toBe(201);
    expect(created.data).toEqual({ key: 'TEAM-1' });
    expect(seen.method).toBe('POST');
    expect(seen.headers!['content-type']).toBe('application/json');
    expect(seen.headers!.accept).toBe('application/json');
    expect(seen.headers!.authorization).toBe('Bearer abc');
    expect(Number(seen.headers!['content-length'])).toBe(Buffer.byteLength(seen.body!));
    expect(JSON.parse(seen.body!)).toEqual({ fields: { summary: 'ไทย' } });

    handler = (_req, res) => {
      res.writeHead(500, { 'content-type': 'text/html' });
      res.end('<html>oops</html>');
    };
    const html = await client.requestJson({ url: `${base}/x` });
    expect(html.status).toBe(500);
    expect(html.data).toBeNull();
    expect(html.response.text()).toBe('<html>oops</html>');
    handler = (_req, res) => res.end();
    expect((await client.requestJson({ url: `${base}/empty` })).data).toBeNull();
  });

  it('keeps an explicit content type and sends raw bodies', async () => {
    let seen: { type?: string; body?: string } = {};
    handler = (req, res, body) => {
      seen = { type: req.headers['content-type'], body };
      res.end('ok');
    };
    await client.request({
      method: 'PUT',
      url: `${base}/raw`,
      headers: { 'content-type': 'application/vnd.api+json' },
      json: { a: 1 },
    });
    expect(seen).toEqual({ type: 'application/vnd.api+json', body: '{"a":1}' });
    await client.request({ method: 'POST', url: `${base}/raw`, body: 'plain' });
    expect(seen.body).toBe('plain');
  });

  it('does not follow redirects and never sends credentials from the URL', async () => {
    let auth: string | undefined;
    handler = (req, res) => {
      auth = req.headers.authorization;
      res.writeHead(302, { location: 'http://elsewhere.example/' });
      res.end();
    };
    const redirect = await client.request({
      url: base.replace('http://', 'http://user:pw@') + '/r',
    });
    expect(redirect.status).toBe(302);
    expect(auth).toBeUndefined();
  });

  it('times out when the server does not answer', async () => {
    handler = () => {
      /* never answers */
    };
    const started = Date.now();
    const e = await expectHttpError(
      client.request({ url: `${base}/slow`, timeoutMs: 200 }),
      'timeout',
    );
    expect(Date.now() - started).toBeLessThan(2000);
    expect(e.message).toMatch(/No answer within 0\.2 s/);
  });

  it('caps the response size (declared and streamed)', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-length': String(2048) });
      res.end('x'.repeat(2048));
    };
    await expectHttpError(client.request({ url: `${base}/big`, maxBytes: 1024 }), 'too_large');
    handler = (_req, res) => {
      res.writeHead(200, { 'transfer-encoding': 'chunked' });
      for (let i = 0; i < 8; i++) res.write('y'.repeat(512));
      res.end();
    };
    await expectHttpError(client.request({ url: `${base}/stream`, maxBytes: 1024 }), 'too_large');
    // Exactly at the limit is fine.
    handler = (_req, res) => res.end('z'.repeat(1024));
    expect((await client.request({ url: `${base}/ok`, maxBytes: 1024 })).body.length).toBe(1024);
  });

  it('classifies connection and URL errors', async () => {
    const closed = http.createServer();
    const port = await new Promise<number>((r) =>
      closed.listen(0, '127.0.0.1', () => r((closed.address() as AddressInfo).port)),
    );
    await new Promise((r) => closed.close(r));
    const e = await expectHttpError(
      client.request({ url: `http://127.0.0.1:${port}/` }),
      'network',
    );
    expect(e.causeCode).toBe('ECONNREFUSED');
    expect(e.message).toBe('Connection failed (ECONNREFUSED)');
    await expectHttpError(client.request({ url: 'not a url' }), 'bad_url');
    await expectHttpError(client.request({ url: 'ftp://example.com/x' }), 'bad_url');
  });

  it('verifies certificates unless verifyTls is false for this request', async () => {
    handler = (_req, res) => res.end('{"ok":true}');
    const e = await expectHttpError(client.request({ url: `${tlsBase}/serverInfo` }), 'tls');
    expect(e.causeCode).toBe('DEPTH_ZERO_SELF_SIGNED_CERT');
    const insecure = await client.requestJson<{ ok: boolean }>({
      url: `${tlsBase}/serverInfo`,
      verifyTls: false,
    });
    expect(insecure.data).toEqual({ ok: true });
    // The exception is per request: the next verified call fails again.
    await expectHttpError(client.request({ url: `${tlsBase}/serverInfo` }), 'tls');
  });
});
