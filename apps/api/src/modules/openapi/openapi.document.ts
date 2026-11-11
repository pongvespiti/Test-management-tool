import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { API_PREFIX } from '@tmt/shared';
import { AppConfig } from '../../config/app-config.js';
import { API_VERSION } from '../health/health.controller.js';
import { enrichOpenApiDocument } from './openapi.enrich.js';

/** Error codes every endpoint may return (documented once at document level). */
export const COMMON_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_TOKEN',
  'FORBIDDEN',
  'PASSWORD_CHANGE_REQUIRED',
  'CSRF_REJECTED',
  'NOT_FOUND',
  'PROJECT_NOT_FOUND',
  'PLAN_LOCKED',
  'RATE_LIMITED',
  'DB_UNAVAILABLE',
  'INTERNAL_ERROR',
];

/**
 * OpenAPI 3.1 document generated from the controllers; request schemas come straight from the
 * shared Zod schemas (Standard Schema → JSON Schema). Roles are in `x-min-role`; titles, sections
 * and success responses come from `route-docs.ts` (see `enrichOpenApiDocument`).
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = app.get(AppConfig);
  const builder = new DocumentBuilder()
    .setTitle('TMT — Test Management Tool API')
    .setDescription(
      [
        'REST API of the Test Management Tool.',
        '',
        `Authenticate with the session cookie (\`${config.sessionCookieName}\`, browser) or a personal`,
        'API token: `Authorization: Bearer tmt_…` (create one under Account → API tokens).',
        'Cookie-authenticated POST/PUT/PATCH/DELETE requests need the header `X-Requested-With: tmt`.',
        '',
        'Errors use the envelope `{ "error": { "code", "message", "details?" } }`.',
      ].join('\n'),
    )
    .setVersion(API_VERSION)
    .setOpenAPIVersion('3.1.0')
    .addCookieAuth(config.sessionCookieName, { type: 'apiKey', in: 'cookie' }, 'cookieAuth')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'tmt_…' }, 'bearerAuth')
    .addSecurityRequirements('cookieAuth')
    .addSecurityRequirements('bearerAuth')
    .addServer('/', 'This server')
    .build();
  const document = enrichOpenApiDocument(SwaggerModule.createDocument(app, builder));
  (document as OpenAPIObject & Record<string, unknown>)['x-common-error-codes'] =
    COMMON_ERROR_CODES;
  (document as OpenAPIObject & Record<string, unknown>)['x-api-prefix'] = API_PREFIX;
  return document;
}
