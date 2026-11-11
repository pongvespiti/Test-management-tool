/**
 * The generated OpenAPI document is the API reference shown in the web app: every route must be
 * documented (title, section, role, success response, path parameters) and `route-docs.ts` must
 * match the real routes.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { HTTP_METHODS, routeKey } from '../src/modules/openapi/openapi.enrich.js';
import { API_TAGS, ROUTE_DOCS } from '../src/modules/openapi/route-docs.js';
import { createTestApp, createUser, login, type TestApp } from './helpers.js';

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: { name: string; in: string }[];
  responses?: Record<string, { description?: string; content?: Record<string, unknown> }>;
  security?: Record<string, unknown>[];
  'x-min-role'?: string;
  'x-session-only'?: boolean;
}

interface Document {
  tags: { name: string; description: string }[];
  paths: Record<string, Record<string, Operation>>;
}

let t: TestApp;
let document: Document;
let operations: { key: string; path: string; op: Operation }[];

beforeAll(async () => {
  t = await createTestApp();
  await createUser(t.prisma, 'alice');
  const alice = await login(t, 'alice');
  const res = await alice.get('/openapi.json');
  expect(res.status).toBe(200);
  document = res.body as Document;
  operations = Object.entries(document.paths).flatMap(([path, item]) =>
    HTTP_METHODS.flatMap((method) =>
      item[method] ? [{ key: routeKey(method, path), path, op: item[method] }] : [],
    ),
  );
});
afterAll(() => t.close());

const successOf = (op: Operation) =>
  Object.keys(op.responses ?? {}).filter((s) => s.startsWith('2'));

describe('OpenAPI document', () => {
  it('documents exactly the routes of the API', () => {
    const real = operations.map((o) => o.key).toSorted();
    expect(real.filter((k) => !ROUTE_DOCS[k])).toEqual([]); // routes without documentation
    expect(
      Object.keys(ROUTE_DOCS)
        .filter((k) => !real.includes(k))
        .toSorted(),
    ).toEqual([]); // documentation of routes that no longer exist
    expect(real.length).toBeGreaterThan(100);
  });

  it('gives every route a title, a declared section and a role', () => {
    const sections = document.tags.map((s) => s.name);
    expect(sections).toEqual(API_TAGS.map((s) => s.name));
    const roles = ['public', 'user', 'viewer', 'manager', 'tester', 'lead', 'admin'];
    for (const { key, op } of operations) {
      expect([key, op.summary]).toEqual([key, ROUTE_DOCS[key]!.summary]);
      expect([key, op.tags]).toEqual([key, [ROUTE_DOCS[key]!.tag]]);
      expect([key, sections.includes(op.tags![0]!)]).toEqual([key, true]);
      expect([key, roles.includes(op['x-min-role'] ?? '')]).toEqual([key, true]);
    }
  });

  it('documents one success response with the status the route really sends', () => {
    for (const { key, op } of operations) {
      const doc = ROUTE_DOCS[key]!;
      expect([key, successOf(op)]).toEqual([key, [String(doc.success)]]);
      const response = op.responses![String(doc.success)]!;
      if (doc.success === 204) {
        expect([key, response.content]).toEqual([key, undefined]);
      } else {
        expect([key, response.description]).toEqual([key, doc.response]);
        expect([key, Object.keys(response.content ?? {}).length]).toEqual([key, 1]);
      }
    }
  });

  it('documents every path parameter', () => {
    for (const { key, path, op } of operations) {
      const inPath = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).toSorted();
      const documented = (op.parameters ?? [])
        .filter((p) => p.in === 'path')
        .map((p) => p.name)
        .toSorted();
      expect([key, documented]).toEqual([key, inPath]);
    }
  });

  it('marks public, signed-in, session-only and role-protected routes', () => {
    const op = (key: string) => operations.find((o) => o.key === key)!.op;
    for (const key of ['GET /api/health', 'POST /api/v1/auth/login', 'POST /api/v1/auth/logout']) {
      expect([key, op(key)['x-min-role'], op(key).security]).toEqual([key, 'public', []]);
    }
    expect(op('GET /api/v1/auth/me')['x-min-role']).toBe('user');
    expect(op('GET /api/v1/projects')['x-min-role']).toBe('user');
    expect(op('POST /api/v1/auth/tokens')).toMatchObject({
      'x-session-only': true,
      security: [{ cookieAuth: [] }],
    });
    expect(op('GET /api/v1/projects/{projectId}/suites')['x-min-role']).toBe('viewer');
    expect(op('GET /api/v1/projects/{projectId}/suites').responses).not.toHaveProperty('403');
    expect(op('PATCH /api/v1/projects/{projectId}').responses!['403']).toEqual({
      description: 'Needs the lead role in the project',
    });
    expect(op('GET /api/v1/users').responses!['403']).toEqual({
      description: 'System administrators only',
    });
    // No public route besides the three above.
    expect(operations.filter((o) => o.op['x-min-role'] === 'public')).toHaveLength(3);
  });

  it('describes file downloads with their content type', () => {
    const xlsx = operations.find(
      (o) => o.key === 'GET /api/v1/projects/{projectId}/plans/{planId}/export.xlsx',
    )!.op;
    expect(Object.keys(xlsx.responses!['200']!.content ?? {})).toEqual([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);
  });
});
