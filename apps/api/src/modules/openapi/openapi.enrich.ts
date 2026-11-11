/**
 * Completes the document generated from the controllers with what the API reference needs:
 * titles, sections and success responses (from `route-docs.ts`), the role of routes without a role
 * decorator, security of public and session-only routes, path parameters read by custom
 * decorators (`:projectId`) and the 403 response of role-protected routes. Pure and idempotent.
 */
import type { OpenAPIObject } from '@nestjs/swagger';
import { API_TAGS, ROUTE_DOCS, type RouteDoc } from './route-docs.js';

type Json = Record<string, unknown>;

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const MEDIA: Record<NonNullable<RouteDoc['produces']> | 'json', string> = {
  json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  file: 'application/octet-stream',
};

/** Roles that can be refused with 403 (viewers and non-members get 404 instead). */
const FORBIDDEN_NOTE: Record<string, string> = {
  tester: 'Needs the tester role in the project',
  lead: 'Needs the lead role in the project',
  admin: 'System administrators only',
};

/** `GET /api/v1/x` — the key of `ROUTE_DOCS`. */
export function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Adds an integer path parameter for every `{name}` of the path that is not documented yet. */
function completePathParameters(path: string, op: Json): void {
  const parameters = Array.isArray(op.parameters) ? [...(op.parameters as unknown[])] : [];
  const documented = new Set(
    parameters.filter(isObj).flatMap((p) => (p.in === 'path' ? [String(p.name)] : [])),
  );
  const missing = [...path.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1]!)
    .filter((name) => !documented.has(name))
    .map((name) => ({
      name,
      in: 'path',
      required: true,
      schema: { type: 'integer', minimum: 1 },
    }));
  if (missing.length > 0) op.parameters = [...missing, ...parameters];
}

function applyAccess(op: Json): void {
  const role = typeof op['x-min-role'] === 'string' ? op['x-min-role'] : 'user';
  op['x-min-role'] = role;
  if (role === 'public') op.security = [];
  else if (op['x-session-only'] === true) op.security = [{ cookieAuth: [] }];
  const forbidden = FORBIDDEN_NOTE[role];
  if (forbidden) {
    const responses = isObj(op.responses) ? op.responses : {};
    op.responses = { ...responses, '403': responses['403'] ?? { description: forbidden } };
  }
}

function applyRouteDoc(op: Json, doc: RouteDoc): void {
  op.summary = doc.summary;
  if (doc.notes) op.description = doc.notes;
  op.tags = [doc.tag];
  const responses = isObj(op.responses) ? { ...op.responses } : {};
  // The status code stays the one generated from the controller; only its description is ours.
  const status = Object.keys(responses).find((s) => /^2\d\d$/.test(s)) ?? String(doc.success);
  responses[status] =
    status === '204'
      ? { description: 'No content' }
      : { description: doc.response, content: { [MEDIA[doc.produces ?? 'json']]: {} } };
  op.responses = responses;
}

export function enrichOpenApiDocument(
  document: OpenAPIObject,
  docs: Record<string, RouteDoc> = ROUTE_DOCS,
): OpenAPIObject {
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    if (!isObj(item)) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isObj(op)) continue;
      completePathParameters(path, op);
      applyAccess(op);
      const doc = docs[routeKey(method, path)];
      if (doc) applyRouteDoc(op, doc);
    }
  }
  document.tags = API_TAGS.map((t) => ({ ...t }));
  return document;
}
