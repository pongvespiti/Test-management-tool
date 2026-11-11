/** Test setup of the run page (only `*.test.tsx` files import this module). */
import { jest } from '@jest/globals';
import type { ProjectRole, RunCaseDTO, RunDTO } from '@tmt/shared';
import { setNavigation } from '@/test/mocks/next-navigation';
import { makeProject, renderWithProviders } from '@/test/render';
import { followUrl, member, mockApi, openUrl, type ApiCall } from '../cases/test-utils';
import { RunPage } from './run-page';
import { bob, makeDetail, makeRun, makeRunCase } from './test-fixtures';

export const run = makeRun();
export const rc1 = makeRunCase({ id: 101, status: 'ok', actualResult: 'Starts' });
export const rc2 = makeRunCase({
  id: 102,
  displayId: 'UOT-002',
  code: null,
  title: 'Fan speed',
  tags: [],
});
export const rc3 = makeRunCase({
  id: 103,
  displayId: 'UOT-003',
  code: '2-1',
  title: 'Wi-Fi pairing',
  sectionPath: ['Network', 'Wi-Fi'],
  priority: 'low',
  tags: ['wifi'],
  assignee: bob,
  status: 'ng',
  actualResult: 'Pairing fails',
});
export const rc4 = makeRunCase({
  id: 104,
  displayId: 'UOT-004',
  code: null,
  title: 'Timer schedule',
  sectionPath: ['Network', 'Wi-Fi'],
  template: 'steps',
  procedure: null,
  expected: null,
  steps: [
    { action: 'Open the timer', expected: 'Timer screen', sharedStepName: null },
    { action: 'Set 10:00', expected: 'Saved', sharedStepName: 'Timer basics' },
  ],
});
export const cases = [rc1, rc2, rc3, rc4];
export const members = [
  member(1, 'Alice Tester', 'tester'),
  member(2, 'Bob Lead', 'lead'),
  member(5, 'Vic Viewer', 'viewer'),
];

/** Answer of `PUT …/result`: the run case with the sent values. */
export function savedRow(rc: RunCaseDTO) {
  return (c: ApiCall) => {
    const body = c.body as { status: RunCaseDTO['status']; actualResult?: string; remark?: string };
    return {
      ...rc,
      status: body.status,
      actualResult: body.actualResult || null,
      resultRemark: body.remark || null,
    };
  };
}

export function runHandlers(overrides: Record<string, unknown> = {}, runDto: RunDTO = run) {
  return {
    'GET /projects/3/runs/7': runDto,
    'GET /projects/3/runs/7/cases': cases,
    'GET /projects/3/members': members,
    'GET /projects/3/integrations': { jira: null },
    'GET /projects/3/comments': [],
    ...Object.fromEntries(
      cases.map((rc) => [`GET /projects/3/run-cases/${rc.id}`, makeDetail(rc)]),
    ),
    ...overrides,
  };
}

/**
 * Wide screen: the selected case shows next to the list. Elements get a height so that the
 * virtualised case list renders its rows (jsdom has no layout).
 */
export function wideScreen(wide = true) {
  jest.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(800);
  jest.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: wide && query === '(min-width: 1200px)',
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

/** Renders the run page at `url`; `sync()` follows URL changes made by the page. */
export function renderRun(
  url = '/projects/3/runs/7?case=102',
  {
    role = 'tester',
    handlers = {},
    runDto = run,
    runId = '7',
  }: {
    role?: ProjectRole;
    handlers?: Record<string, unknown>;
    runDto?: RunDTO;
    runId?: string;
  } = {},
) {
  openUrl(url);
  setNavigation({ params: { projectId: '3', runId } });
  const api = mockApi(runHandlers(handlers, runDto));
  const utils = renderWithProviders(<RunPage />, { project: makeProject({ myRole: role }) });
  const sync = () => {
    followUrl();
    utils.rerender(<RunPage />);
  };
  return { ...utils, api, sync };
}
