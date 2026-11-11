import { describe, expect, it } from '@jest/globals';
import { openApiFixture } from './openapi-fixture';
import {
  constraintsOf,
  curlFor,
  fieldsOf,
  parseOpenApi,
  sampleBody,
  sampleOf,
  searchTextOf,
  summaryFromOperationId,
  typeOf,
  urlOf,
  type ApiOperation,
} from './openapi';

const ORIGIN = 'http://tmt.local';
const doc = parseOpenApi(openApiFixture);
const op = (key: string) => doc.operations.find((o) => o.key === key)!;

const baseOp = (overrides: Partial<ApiOperation> = {}): ApiOperation => ({
  key: 'x',
  operationId: null,
  method: 'get',
  path: '/api/v1/things',
  tag: 'Other',
  summary: 'Things',
  notes: null,
  deprecated: false,
  minRole: 'viewer',
  sessionOnly: false,
  isPublic: false,
  errorCodes: [],
  parameters: [],
  requestBody: null,
  success: null,
  ...overrides,
});

describe('parseOpenApi with the generated document', () => {
  it('reads title, tags in first-use order and document extensions', () => {
    expect(doc.title).toBe('TMT — Test Management Tool API');
    expect(doc.version).toBe('2.0.0');
    expect(doc.tags.map((t) => t.name)).toEqual([
      'Health',
      'Auth',
      'API tokens',
      'Projects',
      'Automation',
    ]);
    expect(doc.commonErrorCodes).toEqual(['VALIDATION_ERROR', 'UNAUTHENTICATED']);
    expect(doc.apiPrefix).toBe('/api/v1');
    expect(doc.serverUrl).toBe('/');
    expect(doc.sessionCookieName).toBe('tmt_custom_session');
  });

  it('has no session cookie name when the document does not describe a cookie scheme', () => {
    const name = (components: unknown) =>
      parseOpenApi({ ...openApiFixture, components }).sessionCookieName;
    expect(name(undefined)).toBeNull();
    expect(
      name({ securitySchemes: { cookieAuth: { type: 'apiKey', in: 'header', name: 'x' } } }),
    ).toBeNull();
    expect(name({ securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie' } } })).toBeNull();
  });

  it('derives summaries, roles and token rules', () => {
    expect(op('ProjectsController_setMembers')).toMatchObject({
      summary: 'Set members',
      minRole: 'lead',
      sessionOnly: false,
      isPublic: false,
      errorCodes: ['LEAD_REQUIRED', 'UNKNOWN_USER'],
      success: null,
    });
    expect(op('TokensController_create')).toMatchObject({
      summary: 'Create token',
      minRole: null,
      sessionOnly: true,
      success: { status: '201', description: '', contentType: null },
    });
    expect(op('HealthController_health').summary).toBe('Health');
  });

  it('adds path parameters resolved by guards, borrowing documented schemas', () => {
    const junit = op('AutomationController_importJunit');
    expect(junit.parameters.map((p) => `${p.in}:${p.name}`)).toEqual([
      'path:projectId',
      'path:runId',
      'query:matchBy',
      'query:dryRun',
    ]);
    expect(junit.parameters[0]).toMatchObject({ required: true, schema: null });
    expect(typeOf(junit.parameters[1]!.schema)).toBe('integer');
    expect(constraintsOf(junit.parameters[1]!.schema)).toEqual(['> 0']);
    expect(typeOf(junit.parameters[3]!.schema)).toBe('boolean');
    expect(constraintsOf(junit.parameters[2]!.schema)).toEqual(['default "auto"']);
  });

  it('builds curl examples', () => {
    expect(curlFor(doc, op('ProjectsController_setMembers'), ORIGIN)).toBe(
      [
        'curl -X PUT "http://tmt.local/api/v1/projects/<projectId>/members"',
        '-H "Authorization: Bearer $TMT_TOKEN"',
        '-H "Content-Type: application/json"',
        `-d '{\n  "members": [\n    {\n      "userId": 1,\n      "role": "viewer"\n    }\n  ]\n}'`,
      ].join(' \\\n  '),
    );
    expect(curlFor(doc, op('TokensController_create'), ORIGIN)).toContain(
      '-b cookies.txt \\\n  -H "X-Requested-With: tmt"',
    );
    expect(curlFor(doc, op('AutomationController_importJunit'), ORIGIN)).toContain(
      '-F "file=@<path to file>"',
    );
  });
});

describe('parseOpenApi edge cases', () => {
  it('refuses anything that is not an OpenAPI document', () => {
    expect(() => parseOpenApi(null)).toThrow('did not return an OpenAPI document');
    expect(() => parseOpenApi({ info: {} })).toThrow();
  });

  it('handles declared tags, refs, security and odd shapes', () => {
    const parsed = parseOpenApi({
      info: {},
      tags: [{ name: 'B', description: 'Second' }, { description: 'nameless' }, 'x'],
      servers: [{ url: 'https://api.example.com/' }],
      'x-common-error-codes': { A: 'text', B: 'text' },
      components: {
        parameters: { Q: { name: 'q', in: 'query', description: 'Search' } },
        responses: { Ok: { description: 'Thing', content: { 'text/csv': {} } } },
      },
      paths: {
        '/x': {
          parameters: [{ $ref: '#/components/parameters/Q' }, { in: 'query' }],
          get: {
            operationId: 'ThingsController_list',
            tags: ['A'],
            description:
              'Any signed-in user. Session only (refused to API tokens). Lists **things**.',
            security: [{ cookieAuth: [] }],
            responses: { '200': { $ref: '#/components/responses/Ok' } },
            'x-error-codes': ['X', { code: 'Y' }, { nope: 1 }, 3],
            deprecated: true,
          },
          post: { tags: ['B'], security: [], 'x-min-role': 'public', responses: 'bad' },
          put: { operationId: 'ThingsController_list', summary: 'Explicit', tags: [] },
          delete: 'not an operation',
        },
        '/y': 'not a path item',
        '/z': { get: { requestBody: { content: {} }, operationId: 'Z_go' } },
        '/w': { get: { requestBody: { $ref: '#/nowhere' }, responses: { '200': 'x' } } },
      },
    });
    expect(parsed.title).toBe('REST API');
    expect(parsed.version).toBeNull();
    expect(parsed.serverUrl).toBe('https://api.example.com/');
    expect(parsed.apiPrefix).toBeNull();
    expect(parsed.commonErrorCodes).toEqual(['A', 'B']);
    expect(parsed.tags).toEqual([
      { name: 'B', description: 'Second' },
      { name: 'A', description: null },
      { name: 'Other', description: null },
    ]);
    const [list, post, put, z, w] = parsed.operations;
    expect(list).toMatchObject({
      key: 'ThingsController_list',
      summary: 'List things',
      notes: 'Lists **things**.',
      sessionOnly: true,
      deprecated: true,
      errorCodes: ['X', 'Y'],
      success: { status: '200', description: 'Thing', contentType: 'text/csv' },
    });
    expect(list!.parameters).toEqual([
      { name: 'q', in: 'query', required: false, description: 'Search', schema: null },
    ]);
    expect(post).toMatchObject({ key: 'post--x', isPublic: true, summary: 'POST /x', tag: 'B' });
    expect(put).toMatchObject({
      key: 'ThingsController_list-2',
      summary: 'Explicit',
      tag: 'Other',
    });
    expect(z).toMatchObject({ summary: 'Go', requestBody: null });
    expect(w!.success).toBeNull();
    expect(parseOpenApi({ paths: {}, 'x-common-error-codes': 'x' }).commonErrorCodes).toEqual([]);
  });

  it('keeps reference cycles as $ref', () => {
    const parsed = parseOpenApi({
      components: {
        schemas: {
          Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } },
        },
      },
      paths: {
        '/n': {
          post: {
            requestBody: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Node' } } },
            },
          },
        },
      },
    });
    const schema = parsed.operations[0]!.requestBody!.schema!;
    expect(schema).toEqual({
      type: 'object',
      properties: {
        next: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } },
      },
    });
  });
});

describe('summaryFromOperationId', () => {
  it.each([
    [null, null],
    ['ProjectsController_list', 'List projects'],
    ['UsersController_create', 'Create user'],
    ['ActivityController_list', 'List activity'],
    ['SharedStepsController_remove', 'Remove shared step'],
    ['ActivitiesController_get', 'Get activity'],
    ['AddressesController_get', 'Get address'],
    ['PlanExportController_export', 'Export plan'],
    ['APITokensController_revoke', 'Revoke API token'],
    ['ExportController_export', 'Export'],
    ['AuthController_changePassword', 'Change password'],
    ['HealthController_health', 'Health'],
    ['login', 'Login'],
    ['X_', null],
  ])('%s → %s', (id, summary) => {
    expect(summaryFromOperationId(id)).toBe(summary);
  });
});

describe('typeOf', () => {
  it.each([
    [null, 'any'],
    [{ const: 'x' }, '"x"'],
    [{ enum: [1, 2] }, '1 | 2'],
    [{ enum: [1, 2, 3, 4, 5, 6, 7] }, '1 | 2 | 3 | 4 | 5 | 6 | …'],
    [{ anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] }, 'string (date) | null'],
    [{ oneOf: [{ type: 'boolean' }, { enum: ['true', 'false'] }] }, 'boolean'],
    [{ allOf: [{}] }, 'object'],
    [{ type: ['string', 'null'] }, 'string | null'],
    [{ type: 'array', items: { type: 'integer' } }, 'integer[]'],
    [{ type: 'array', items: { enum: ['a', 'b'] } }, '("a" | "b")[]'],
    [{ type: 'array' }, 'any[]'],
    [{ type: 'string', format: 'binary' }, 'file'],
    [{ properties: {} }, 'object'],
    [{}, 'any'],
  ])('%j → %s', (schema, text) => {
    expect(typeOf(schema)).toBe(text);
  });

  it('stops at a depth limit', () => {
    expect(typeOf({ type: 'integer' }, 7)).toBe('any');
  });
});

describe('constraintsOf', () => {
  it.each([
    [null, []],
    [{ minLength: 1, maxLength: 100 }, ['1–100 chars']],
    [{ maxLength: 10 }, ['≤ 10 chars']],
    [{ minLength: 1 }, ['not empty']],
    [{ minLength: 3 }, ['≥ 3 chars']],
    [{ minLength: 0 }, []],
    [{ minimum: 1, maximum: 3650 }, ['≥ 1, ≤ 3650']],
    [{ exclusiveMinimum: 0 }, ['> 0']],
    [{ minimum: 0, exclusiveMinimum: true, maximum: 9007199254740991 }, ['> 0']],
    [{ maximum: 10, exclusiveMaximum: true }, ['< 10']],
    [{ maxItems: 5 }, ['≤ 5 items']],
    [
      { anyOf: [{ type: 'null' }, { type: 'string', maxLength: 4, default: 'a' }] },
      ['≤ 4 chars', 'default "a"'],
    ],
    [{ default: 2, type: 'integer' }, ['default 2']],
    [{ pattern: '^x$' }, ['pattern']],
    [{ pattern: '^x$', format: 'date' }, []],
  ])('%j', (schema, notes) => {
    expect(constraintsOf(schema)).toEqual(notes);
  });
});

describe('fieldsOf', () => {
  it('lists top-level properties', () => {
    expect(fieldsOf(null)).toEqual([]);
    expect(
      fieldsOf({
        properties: { a: { type: 'string', description: 'The A' }, b: 'bad' },
        required: ['a'],
      }),
    ).toEqual([{ name: 'a', type: 'string', required: true, notes: [], description: 'The A' }]);
  });
});

describe('sampleOf', () => {
  it.each([
    [null, null],
    [{ example: 5 }, 5],
    [{ examples: ['e'] }, 'e'],
    [{ const: 'c' }, 'c'],
    [{ enum: ['first'] }, 'first'],
    [{ anyOf: [{ const: '' }, { type: 'null' }, { type: 'integer' }] }, 1],
    [{ type: 'string', format: 'email' }, 'name@example.com'],
    [{ type: 'string', format: 'uri' }, 'https://example.com'],
    [{ type: 'string', format: 'url' }, 'https://example.com'],
    [{ type: 'string', format: 'uuid' }, '00000000-0000-0000-0000-000000000000'],
    [{ type: 'string' }, 'string'],
    [{ type: 'integer', exclusiveMinimum: 4 }, 5],
    [{ type: 'number', minimum: 2 }, 2],
    [{ type: 'integer', minimum: 0, exclusiveMinimum: true }, 1],
    [{ type: ['null', 'integer'] }, 1],
    [{ type: 'boolean', default: true }, true],
    [{ type: 'boolean' }, false],
    [{ type: 'array', items: { type: 'string' } }, ['string']],
    [{ type: 'array' }, []],
    [{ type: 'null' }, null],
    [{ properties: { a: { type: 'string' }, b: 'bad' } }, { a: 'string' }],
    [
      { properties: { a: { type: 'string' }, b: { type: 'boolean' } }, required: ['b', 'zz'] },
      { b: false },
    ],
    [{}, {}],
  ])('%j', (schema, value) => {
    expect(sampleOf(schema)).toEqual(value);
  });

  it('uses defaults of nested values and dates of today', () => {
    expect(sampleOf({ properties: { n: { type: 'integer', default: 7 } } })).toEqual({ n: 7 });
    expect(sampleOf({ type: 'string', format: 'date' })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sampleOf({ type: 'string', format: 'date-time' })).toMatch(/T/);
    expect(sampleOf({ type: 'string' }, 6)).toBeNull();
  });

  it('builds JSON bodies only for JSON requests', () => {
    expect(sampleBody(baseOp())).toBeNull();
    expect(
      sampleBody(
        baseOp({
          requestBody: { contentType: 'text/xml', required: true, description: null, schema: null },
        }),
      ),
    ).toBeNull();
    expect(
      sampleBody(
        baseOp({
          requestBody: {
            contentType: 'application/json',
            required: true,
            description: null,
            schema: null,
          },
        }),
      ),
    ).toBe('{}');
  });
});

describe('urlOf', () => {
  it('resolves paths against the server', () => {
    expect(urlOf({ serverUrl: 'https://api.example.com/', apiPrefix: null }, '/x', ORIGIN)).toBe(
      'https://api.example.com/x',
    );
    expect(urlOf({ serverUrl: '/', apiPrefix: '/api/v1' }, '/api/v1/x', ORIGIN)).toBe(
      'http://tmt.local/api/v1/x',
    );
    expect(urlOf({ serverUrl: '/', apiPrefix: 'api/v1/' }, '/projects', ORIGIN)).toBe(
      'http://tmt.local/api/v1/projects',
    );
    expect(urlOf({ serverUrl: '/base/', apiPrefix: '/api/v1' }, '/projects', ORIGIN)).toBe(
      'http://tmt.local/base/projects',
    );
    expect(urlOf({ serverUrl: '/', apiPrefix: null }, '/health', ORIGIN)).toBe(
      'http://tmt.local/health',
    );
  });
});

describe('curlFor', () => {
  const server = { serverUrl: '/', apiPrefix: null };

  it('covers public, login, downloads, query parameters and multipart fields', () => {
    expect(curlFor(server, baseOp({ isPublic: true }), ORIGIN)).toBe(
      'curl "http://tmt.local/api/v1/things"',
    );
    const login = curlFor(
      server,
      baseOp({ method: 'post', path: '/api/v1/auth/login', isPublic: true }),
      ORIGIN,
    );
    expect(login).toContain('curl -X POST -c cookies.txt "http://tmt.local/api/v1/auth/login"');
    expect(login).toContain('-H "X-Requested-With: tmt"');
    expect(
      curlFor(
        server,
        baseOp({ method: 'post', operationId: 'AuthController_login', path: '/l' }),
        ORIGIN,
      ),
    ).toContain('-c cookies.txt');
    expect(curlFor(server, baseOp({ sessionOnly: true }), ORIGIN)).toBe(
      'curl "http://tmt.local/api/v1/things" \\\n  -b cookies.txt',
    );
    const download = curlFor(
      server,
      baseOp({
        success: { status: '200', description: '', contentType: 'application/vnd.ms-excel' },
        parameters: [
          { name: 'q', in: 'query', required: true, description: null, schema: { type: 'string' } },
          { name: 'n', in: 'query', required: true, description: null, schema: null },
          { name: 'opt', in: 'query', required: false, description: null, schema: null },
        ],
      }),
      ORIGIN,
    );
    expect(download).toContain('curl -OJ "http://tmt.local/api/v1/things?q=string&n=<value>"');
    const multipart = curlFor(
      server,
      baseOp({
        method: 'post',
        requestBody: {
          contentType: 'multipart/form-data',
          required: true,
          description: null,
          schema: {
            properties: {
              file: { format: 'binary' },
              name: { type: 'string' },
              note: { type: 'string' },
              bad: 1,
            },
            required: ['name'],
          },
        },
      }),
      ORIGIN,
    );
    expect(multipart).toContain('-F "file=@<path to file>"');
    expect(multipart).toContain('-F "name=string"');
    expect(multipart).not.toContain('note');
    expect(
      curlFor(
        server,
        baseOp({
          method: 'post',
          requestBody: {
            contentType: 'multipart/form-data',
            required: true,
            description: null,
            schema: null,
          },
        }),
        ORIGIN,
      ),
    ).toContain('-F "file=@<path to file>"');
    expect(
      curlFor(
        server,
        baseOp({
          method: 'post',
          requestBody: { contentType: 'text/xml', required: true, description: null, schema: null },
        }),
        ORIGIN,
      ),
    ).toMatch(/Content-Type: application\/json"$/);
  });
});

describe('searchTextOf', () => {
  it('indexes everything a user may search for', () => {
    const text = searchTextOf(op('ProjectsController_setMembers'));
    expect(text).toContain('put /api/v1/projects/{projectid}/members');
    expect(text).toContain('set members');
    expect(text).toContain('lead_required');
    expect(
      searchTextOf(baseOp({ success: { status: '200', description: 'Thing', contentType: null } })),
    ).toContain('thing');
  });
});
