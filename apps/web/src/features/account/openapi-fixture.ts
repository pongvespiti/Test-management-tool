/**
 * Small OpenAPI 3.1 document shaped like the one @nestjs/swagger generates for the API (no
 * summaries, no document tags, roles in `x-min-role`, `{projectId}` resolved by a guard and not
 * documented). Only test files import this module.
 */
export const openApiFixture = {
  openapi: '3.1.0',
  info: { title: 'TMT — Test Management Tool API', version: '2.0.0' },
  tags: [],
  servers: [{ url: '/', description: 'This server' }],
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  'x-common-error-codes': ['VALIDATION_ERROR', 'UNAUTHENTICATED'],
  'x-api-prefix': '/api/v1',
  components: {
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'tmt_custom_session' },
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
    schemas: {
      Member: {
        type: 'object',
        properties: {
          userId: { type: 'integer', minimum: 0, exclusiveMinimum: true },
          role: { type: 'string', enum: ['viewer', 'manager', 'tester', 'lead'] },
        },
        required: ['userId', 'role'],
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        operationId: 'HealthController_health',
        responses: { '200': { description: '' } },
        tags: ['Health'],
      },
    },
    '/api/v1/auth/me': {
      get: {
        operationId: 'AuthController_me',
        responses: { '200': { description: '' } },
        tags: ['Auth'],
      },
    },
    '/api/v1/auth/tokens': {
      post: {
        operationId: 'TokensController_create',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100 },
                  expiresInDays: { type: ['integer', 'null'], minimum: 1, maximum: 3650 },
                },
                required: ['name'],
              },
            },
          },
        },
        responses: { '201': { description: '' } },
        tags: ['API tokens'],
        'x-error-codes': ['TOO_MANY_TOKENS'],
        'x-session-only': true,
      },
    },
    '/api/v1/projects/{projectId}/members': {
      put: {
        operationId: 'ProjectsController_setMembers',
        parameters: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  members: {
                    type: 'array',
                    maxItems: 500,
                    items: { $ref: '#/components/schemas/Member' },
                  },
                },
                required: ['members'],
              },
            },
          },
        },
        responses: { '403': { description: 'Needs the lead role' } },
        tags: ['Projects'],
        'x-error-codes': ['LEAD_REQUIRED', 'UNKNOWN_USER'],
        'x-min-role': 'lead',
      },
    },
    '/api/v1/projects/{projectId}/runs/{runId}/junit': {
      post: {
        operationId: 'AutomationController_importJunit',
        parameters: [
          {
            name: 'runId',
            required: true,
            in: 'path',
            schema: { type: 'integer', minimum: 0, exclusiveMinimum: true, maximum: 2147483647 },
          },
          {
            name: 'matchBy',
            required: false,
            in: 'query',
            schema: {
              default: 'auto',
              type: 'string',
              enum: ['auto', 'code', 'display_id', 'title'],
            },
          },
          {
            name: 'dryRun',
            required: false,
            in: 'query',
            schema: {
              anyOf: [{ type: 'boolean' }, { type: 'string', enum: ['0', '1', 'true', 'false'] }],
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: { '403': { description: 'Needs the tester role' } },
        tags: ['Automation'],
        'x-error-codes': ['BAD_XML', 'PLAN_LOCKED'],
        'x-min-role': 'tester',
      },
    },
  },
};
