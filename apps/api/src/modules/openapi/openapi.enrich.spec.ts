import { describe, expect, it } from '@jest/globals';
import type { OpenAPIObject } from '@nestjs/swagger';
import { enrichOpenApiDocument, routeKey } from './openapi.enrich.js';
import { API_TAGS, ROUTE_DOCS, type RouteDoc } from './route-docs.js';

type Op = Record<string, unknown>;

function doc(paths: Record<string, Record<string, Op>>): OpenAPIObject {
  return {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths,
  } as unknown as OpenAPIObject;
}

function opOf(d: OpenAPIObject, path: string, method: string): Op {
  return (d.paths as unknown as Record<string, Record<string, Op>>)[path]![method]!;
}

const docs: Record<string, RouteDoc> = {
  'GET /api/v1/projects/{projectId}/suites': {
    tag: 'Library',
    summary: 'Suites of the project',
    notes: 'Archived suites only on request.',
    success: 200,
    response: 'SuiteDTO[]',
  },
  'GET /api/v1/projects/{projectId}/plans/{planId}/export.xlsx': {
    tag: 'Plans',
    summary: 'Export the test report',
    success: 200,
    response: 'Excel workbook',
    produces: 'xlsx',
  },
  'DELETE /api/v1/projects/{projectId}/cases/{caseId}': {
    tag: 'Library',
    summary: 'Delete a case',
    success: 204,
    response: 'void',
  },
};

describe('routeKey', () => {
  it('joins the upper-case method and the path', () => {
    expect(routeKey('get', '/api/health')).toBe('GET /api/health');
  });
});

describe('enrichOpenApiDocument', () => {
  it('adds title, notes, section and the success response of a documented route', () => {
    const d = enrichOpenApiDocument(
      doc({
        '/api/v1/projects/{projectId}/suites': {
          get: { tags: ['Old'], 'x-min-role': 'viewer', responses: { '200': { description: '' } } },
        },
      }),
      docs,
    );
    const op = opOf(d, '/api/v1/projects/{projectId}/suites', 'get');
    expect(op).toMatchObject({
      summary: 'Suites of the project',
      description: 'Archived suites only on request.',
      tags: ['Library'],
      'x-min-role': 'viewer',
      responses: { '200': { description: 'SuiteDTO[]', content: { 'application/json': {} } } },
    });
    // Viewers are never answered with 403 (non-members get 404).
    expect(op.responses).not.toHaveProperty('403');
    expect(op).not.toHaveProperty('security');
  });

  it('documents path parameters the controller reads through custom decorators', () => {
    const d = enrichOpenApiDocument(
      doc({
        '/api/v1/projects/{projectId}/cases/{caseId}': {
          delete: {
            'x-min-role': 'lead',
            parameters: [
              { name: 'caseId', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'force', in: 'query' },
            ],
            responses: { '204': { description: '' } },
          },
        },
      }),
      docs,
    );
    const op = opOf(d, '/api/v1/projects/{projectId}/cases/{caseId}', 'delete');
    expect(op.parameters).toEqual([
      { name: 'projectId', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
      { name: 'caseId', in: 'path', required: true, schema: { type: 'integer' } },
      { name: 'force', in: 'query' },
    ]);
    expect(op.responses).toEqual({
      '204': { description: 'No content' },
      '403': { description: 'Needs the lead role in the project' },
    });
  });

  it('uses the content type of file responses and the documented status when none was generated', () => {
    const path = '/api/v1/projects/{projectId}/plans/{planId}/export.xlsx';
    const d = enrichOpenApiDocument(doc({ [path]: { get: { 'x-min-role': 'viewer' } } }), docs);
    expect(opOf(d, path, 'get').responses).toEqual({
      '200': {
        description: 'Excel workbook',
        content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {} },
      },
    });
  });

  it('keeps the status code generated from the controller', () => {
    const path = '/api/v1/projects/{projectId}/suites';
    const d = enrichOpenApiDocument(
      doc({ [path]: { get: { responses: { '201': { description: '' } } } } }),
      docs,
    );
    expect(Object.keys(opOf(d, path, 'get').responses as object)).toEqual(['201']);
  });

  it('marks access: signed-in user by default, public without security, session-only by cookie', () => {
    const d = enrichOpenApiDocument(
      doc({
        '/api/v1/auth/me': { get: {} },
        '/api/health': { get: { 'x-min-role': 'public' } },
        '/api/v1/auth/tokens': { post: { 'x-session-only': true } },
        '/api/v1/users': {
          get: { 'x-min-role': 'admin', responses: { '403': { description: 'custom' } } },
          post: { 'x-min-role': 'admin' },
        },
      }),
      docs,
    );
    expect(opOf(d, '/api/v1/auth/me', 'get')).toEqual({ 'x-min-role': 'user' });
    expect(opOf(d, '/api/health', 'get')).toEqual({ 'x-min-role': 'public', security: [] });
    expect(opOf(d, '/api/v1/auth/tokens', 'post')).toMatchObject({
      'x-min-role': 'user',
      security: [{ cookieAuth: [] }],
    });
    expect(opOf(d, '/api/v1/users', 'get').responses).toEqual({ '403': { description: 'custom' } });
    expect(opOf(d, '/api/v1/users', 'post').responses).toEqual({
      '403': { description: 'System administrators only' },
    });
  });

  it('declares the sections in display order and is idempotent', () => {
    const path = '/api/v1/projects/{projectId}/suites';
    const once = enrichOpenApiDocument(doc({ [path]: { get: { 'x-min-role': 'tester' } } }), docs);
    expect(once.tags).toEqual(API_TAGS.map((t) => ({ ...t })));
    const snapshot = JSON.stringify(once);
    expect(JSON.stringify(enrichOpenApiDocument(once, docs))).toBe(snapshot);
  });

  it('ignores path items that are not objects', () => {
    const d = doc({ '/x': null as unknown as Record<string, Op> });
    expect(() => enrichOpenApiDocument(d, docs)).not.toThrow();
  });
});

describe('ROUTE_DOCS', () => {
  it('uses declared sections and one-line titles', () => {
    const tags = new Set<string>(API_TAGS.map((t) => t.name));
    for (const [key, d] of Object.entries(ROUTE_DOCS)) {
      expect(key).toMatch(/^(GET|POST|PUT|PATCH|DELETE) \/api\//);
      expect(tags.has(d.tag)).toBe(true);
      expect(d.summary.trim()).toBe(d.summary);
      expect(d.summary).not.toMatch(/\n|\.$/);
      expect(d.response.length).toBeGreaterThan(0);
    }
  });

  it('has routes in every section', () => {
    const used = new Set(Object.values(ROUTE_DOCS).map((d) => d.tag));
    expect(API_TAGS.filter((t) => !used.has(t.name))).toEqual([]);
  });
});
