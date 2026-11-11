/**
 * Test helpers of the library features (not shipped: only `*.test.tsx` files import this module).
 */
import { jest } from '@jest/globals';
import type {
  CommentDTO,
  MemberDTO,
  Paged,
  ProjectRole,
  SectionNode,
  SectionTreeDTO,
  SharedStepDetailDTO,
  SuiteDTO,
  TestCaseDTO,
  UserRef,
} from '@tmt/shared';
import { setNavigation } from '@/test/mocks/next-navigation';
import { jsonResponse } from '@/test/render';

export interface ApiCall {
  method: string;
  /** Path after `/api/v1`, without the query string. */
  path: string;
  query: URLSearchParams;
  body: unknown;
}

type Handler = unknown;

/** JSON error envelope of the API. */
export const apiError = (status: number, code: string, message = code, details?: unknown) =>
  jsonResponse({ error: { code, message, details } }, status);

/**
 * Stubs `fetch` with handlers keyed by `METHOD /path`. A handler is the JSON body to answer, or a
 * function of the call returning a body or a `Response`; `undefined` answers 204. Unknown routes
 * answer 404. Every call is recorded (restored after each test by `restoreMocks`).
 */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: ApiCall[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const call: ApiCall = {
      method: init?.method ?? 'GET',
      path: url.pathname.replace(/^\/api\/v1/, ''),
      query: url.searchParams,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const key = `${call.method} ${call.path}`;
    if (!(key in handlers)) return apiError(404, 'NOT_FOUND', `No stub for ${key}`);
    const handler = handlers[key];
    const result =
      typeof handler === 'function' ? await (handler as (c: ApiCall) => unknown)(call) : handler;
    if (result instanceof Response) return result;
    return result === undefined ? new Response(null, { status: 204 }) : jsonResponse(result);
  });
  return {
    calls,
    /** Recorded calls of `METHOD /path`. */
    find: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path),
  };
}

/** Current URL for `usePathname`/`useSearchParams` and the address bar. */
export function openUrl(url: string) {
  const u = new URL(url, 'http://localhost');
  setNavigation({ pathname: u.pathname, search: u.search });
  window.history.replaceState(null, '', url);
}

/** Lets the router mock follow the address bar after the page changed it (History API). */
export function followUrl() {
  setNavigation({ pathname: window.location.pathname, search: window.location.search });
}

/** Search params of the address bar. */
export const urlParams = () => Object.fromEntries(new URLSearchParams(window.location.search));

const T0 = '2026-01-01T00:00:00.000Z';

export const userRef = (id: number, displayName: string): UserRef => ({
  id,
  username: displayName.toLowerCase().replace(/\s+/g, '.'),
  displayName,
});

export const member = (id: number, displayName: string, role: ProjectRole): MemberDTO => ({
  user: userRef(id, displayName),
  role,
});

export function makeSuite(overrides: Partial<SuiteDTO> = {}): SuiteDTO {
  return {
    id: 1,
    projectId: 3,
    name: 'Unit operation test',
    prefix: 'UOT',
    description: null,
    topic: null,
    fieldDefs: [],
    envTemplate: [],
    caseCount: 2,
    sortOrder: 0,
    isArchived: false,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeSection(overrides: Partial<SectionNode> = {}): SectionNode {
  return {
    id: 11,
    suiteId: 1,
    parentId: null,
    name: 'Power',
    code: null,
    sortOrder: 0,
    caseCount: 1,
    totalCount: 1,
    children: [],
    ...overrides,
  };
}

export function makeTree(
  sections: SectionNode[] = [makeSection()],
  overrides: Partial<SectionTreeDTO> = {},
): SectionTreeDTO {
  return { suiteId: 1, unsectionedCount: 1, total: 2, sections, ...overrides };
}

export function makeCase(overrides: Partial<TestCaseDTO> = {}): TestCaseDTO {
  return {
    id: 9,
    suiteId: 1,
    sectionId: 11,
    sectionPath: ['Power'],
    seq: 1,
    displayId: 'UOT-001',
    code: '1-1',
    title: 'Power on the unit',
    caseType: 'Normal',
    status: 'ready',
    priority: 'high',
    tags: ['smoke'],
    estimateMinutes: 15,
    references: 'REQ-1',
    template: 'text',
    steps: [],
    review: {
      reviewer: null,
      requestedBy: null,
      requestedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      note: null,
    },
    precondition: 'Unit is installed',
    procedure: '1. Press ON',
    expected: '1. Unit starts',
    remark: null,
    summaryGroup: null,
    custom: {},
    version: 3,
    sortOrder: 0,
    source: null,
    createdBy: null,
    updatedBy: null,
    createdAt: T0,
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

export function makeSharedStep(overrides: Partial<SharedStepDetailDTO> = {}): SharedStepDetailDTO {
  return {
    id: 5,
    projectId: 3,
    name: 'Log in to the app',
    description: 'Use the test account',
    steps: [
      { action: 'Open the app', expected: 'Login screen' },
      { action: 'Sign in', expected: 'Home screen' },
    ],
    version: 2,
    usageCount: 0,
    createdBy: null,
    updatedBy: userRef(1, 'Alice Tester'),
    createdAt: T0,
    updatedAt: T0,
    usedBy: [],
    ...overrides,
  };
}

export function makeComment(overrides: Partial<CommentDTO> = {}): CommentDTO {
  return {
    id: 7,
    entityType: 'test_case',
    entityId: 9,
    body: 'Check the fan too',
    author: userRef(1, 'Alice Tester'),
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export const paged = <T>(items: T[], total = items.length): Paged<T> => ({
  items,
  total,
  page: 1,
  pageSize: 50,
});
