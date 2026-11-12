import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ProjectRole } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import {
  apiError,
  followUrl,
  mockApi,
  openUrl,
  urlParams,
  type ApiCall,
} from '@/features/cases/test-utils';
import { makePlan, makeRelease } from '@/features/plans/test-fixtures';
import { makeProject, renderWithProviders } from '@/test/render';
import { ReportsPage } from './reports-page';
import {
  makeCompare,
  makeCoverage,
  makeReopens,
  makeSchedule,
  makeTraceability,
  makeDefectReport,
  makeReleaseRows,
  makeTrend,
  makeWorkload,
  stubChartSize,
} from './test-fixtures';

function stubReports(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /projects/3/plans': (c: ApiCall) =>
      c.query.get('releaseId') === '5'
        ? [makePlan()]
        : [makePlan(), makePlan({ id: 8, docNo: '26TR-2', title: 'Adapter test' })],
    'GET /projects/3/releases': [
      makeRelease(),
      makeRelease({ id: 6, name: 'FW 3.0', status: 'planned' }),
    ],
    'GET /projects/3/reports/trend': makeTrend(),
    'GET /projects/3/reports/workload': makeWorkload(),
    'GET /projects/3/reports/defects': makeDefectReport(),
    'GET /projects/3/reports/releases': makeReleaseRows(),
    'GET /projects/3/reports/coverage': makeCoverage(),
    'GET /projects/3/reports/traceability': makeTraceability(),
    'GET /projects/3/reports/reopens': makeReopens(),
    'GET /projects/3/reports/schedule': makeSchedule(),
    ...extra,
  });
}

const as = (role: ProjectRole = 'viewer') => ({ project: makeProject({ myRole: role }) });
/** The KPI tile with this label (label, value and footnote as one text). */
const tile = (label: string) => screen.getByText(label, { selector: 'p' }).parentElement!;
const lastQuery = (api: ReturnType<typeof stubReports>, report: string) =>
  api.find('GET', `/projects/3/reports/${report}`).at(-1)!.query.toString();

describe('ReportsPage', () => {
  beforeEach(() => {
    openUrl('/projects/3/reports');
    stubChartSize();
  });

  it('shows the execution trend of the whole project by default', async () => {
    const api = stubReports();
    const { user } = renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('Run cases in scope')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Trend' })).toHaveAttribute('aria-selected', 'true');
    expect(tile('Run cases in scope')).toHaveTextContent('40');
    expect(tile('Executed in 30 days')).toHaveTextContent('8Results recorded Oct 19 – Oct 21');
    expect(tile('Remaining untested')).toHaveTextContent('32At the end of Oct 21');
    expect(tile('Pass rate')).toHaveTextContent('87.5%');
    expect(lastQuery(api, 'trend')).toBe('days=30');
    expect(screen.getByRole('radio', { name: '30 days' })).toBeChecked();

    // Three charts with their day ticks; each has a table twin.
    await waitFor(() => expect(document.querySelectorAll('svg.recharts-surface')).toHaveLength(3));
    const executed = screen.getByRole('region', { name: 'Executed per day' });
    expect(executed).toHaveTextContent(
      'Results recorded each day, by result · Oct 19 – Oct 21 (Asia/Bangkok)',
    );
    await user.click(within(executed).getByRole('radio', { name: 'Table' }));
    const rows = within(executed).getAllByRole('row');
    expect(rows[0]).toHaveTextContent('DateExecutedOKOK w/ cond.NGBlockedN/TN/A');
    expect(rows[1]).toHaveTextContent('Oct 213300000');
    expect(rows[2]).toHaveTextContent('Oct 205401000');

    const passRate = screen.getByRole('region', { name: 'Pass rate' });
    await user.click(within(passRate).getByRole('radio', { name: 'Table' }));
    expect(within(passRate).getAllByRole('row')[1]).toHaveTextContent('Oct 21387.5%');
  });

  it('keeps the tab and the scope in the URL', async () => {
    openUrl('/projects/3/reports?release=5&plan=7&days=7');
    const api = stubReports();
    const { user, rerender } = renderWithProviders(<ReportsPage />, as());
    await screen.findByText('Run cases in scope');
    // The plan wins over the release (one cache entry per effective scope).
    expect(lastQuery(api, 'trend')).toBe('planId=7&days=7');
    expect(screen.getByRole('radio', { name: '7 days' })).toBeChecked();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Test plan' })).toHaveTextContent(
        '26TR-TEAM-10-001 · Unit operation test — ACU18',
      ),
    );

    await user.click(screen.getByRole('tab', { name: 'Workload' }));
    expect(urlParams()).toEqual({ release: '5', plan: '7', days: '7', tab: 'workload' });
    followUrl();
    rerender(<ReportsPage />);
    expect(await screen.findByText('Workload details')).toBeInTheDocument();
    expect(lastQuery(api, 'workload')).toBe('planId=7');
    expect(
      screen.getByText('Run cases of plans that are not completed, per effective assignee.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Period' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Coverage' }));
    followUrl();
    rerender(<ReportsPage />);
    expect(await screen.findByText('Coverage per suite')).toBeInTheDocument();
    expect(lastQuery(api, 'coverage')).toBe('releaseId=5');
    expect(
      screen.getByText(
        'Coverage is filtered by release only; the plan filter does not apply here.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Test plan' })).toBeDisabled();

    // Another release clears the plan.
    const release = screen.getByRole('combobox', { name: 'Release' });
    await waitFor(() => expect(release).toBeEnabled());
    await user.click(release);
    await user.click(await screen.findByRole('option', { name: 'FW 3.0' }));
    expect(urlParams()).toEqual({ release: '6', days: '7', tab: 'coverage' });
  });

  it('ignores a plan that is not in the chosen release', async () => {
    openUrl('/projects/3/reports?release=5&plan=8');
    const api = stubReports();
    renderWithProviders(<ReportsPage />, as());
    await waitFor(() => expect(lastQuery(api, 'trend')).toBe('releaseId=5&days=30'));
    expect(screen.getByRole('combobox', { name: 'Test plan' })).toHaveTextContent(
      'All plans of the release',
    );
  });

  it('shows the workload per person', async () => {
    openUrl('/projects/3/reports?tab=workload');
    stubReports();
    renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('Workload details')).toBeInTheDocument();
    expect(tile('Run cases')).toHaveTextContent('35');
    expect(tile('Untested')).toHaveTextContent('155 without an assignee or run tester');
    expect(tile('Estimated work left')).toHaveTextContent('2h');
    expect(tile('Executed in 7 days')).toHaveTextContent('14');
    const details = screen.getByRole('region', { name: 'Workload details' });
    expect(
      within(details)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual([
      'PersonRun casesExecutedNGUntestedEst. remainingLast 7 days',
      'Alice Tester2012281h 30m6',
      'Bob Lead1080230m8',
      'Unassigned5005—0',
    ]);
    await waitFor(() => expect(document.querySelectorAll('svg.recharts-surface')).toHaveLength(1));
    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent(
      'Executed (not NG)NGUntested',
    );
  });

  it('shows the defect flow and breakdowns', async () => {
    openUrl('/projects/3/reports?tab=defects');
    const api = stubReports();
    const { user } = renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('Open by severity')).toBeInTheDocument();
    expect(lastQuery(api, 'defects')).toBe('days=30');
    expect(tile('Open defects')).toHaveTextContent('3New, open, in progress or reopened');
    expect(tile('Opened in 30 days')).toHaveTextContent('3');
    expect(tile('Closed in 30 days')).toHaveTextContent('2');
    expect(tile('All defects')).toHaveTextContent('7');

    const severity = screen.getByRole('region', { name: 'Open by severity' });
    expect(within(severity).getAllByRole('listitem')[1]).toHaveTextContent('Major: 2(4)');
    const assignees = screen.getByRole('region', { name: 'Open by assignee' });
    expect(
      within(assignees)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Alice Tester: 2', 'Unassigned: 1']);
    expect(screen.getByRole('link', { name: 'UOT-001' })).toHaveAttribute(
      'href',
      '/projects/3/cases?case=9',
    );

    const flow = screen.getByRole('region', { name: 'Opened and closed per day' });
    await user.click(within(flow).getByRole('radio', { name: 'Table' }));
    expect(
      within(flow)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual(['DateOpenedClosedOpen at end of day', 'Oct 21123', 'Oct 20204']);
  });

  it('compares the releases and ignores the scope filters', async () => {
    openUrl('/projects/3/reports?tab=releases');
    stubReports();
    renderWithProviders(<ReportsPage />, as());
    const table = await screen.findByRole('region', { name: 'Release comparison' });
    expect(
      screen.getByText('Compares every release of the project — the scope filters do not apply.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Release' })).toBeDisabled();
    expect(within(table).getByRole('link', { name: 'FW 2.4.0' })).toHaveAttribute(
      'href',
      '/projects/3?release=5',
    );
    const [, newer, current] = within(table).getAllByRole('row');
    expect(newer).toHaveTextContent('FW 3.0PlannedNo dates0 plans0 runsNo run cases—0 openof 0—');
    expect(current).toHaveTextContent('Oct 1, 2026 – Oct 31, 2026');
    expect(current).toHaveTextContent('2 plans3 runs');
    expect(current).toHaveTextContent('88.9%3 openof 51 pass1 pending');
    await waitFor(() => expect(document.querySelectorAll('svg.recharts-surface')).toHaveLength(1));
    expect(screen.getByText('88.9%', { selector: 'text, tspan' })).toBeInTheDocument();
  });

  it('invites a lead to create releases', async () => {
    openUrl('/projects/3/reports?tab=releases');
    stubReports({ 'GET /projects/3/reports/releases': [] });
    renderWithProviders(<ReportsPage />, as('lead'));
    expect(await screen.findByText('No releases yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage releases' })).toHaveAttribute(
      'href',
      '/projects/3/releases',
    );
  });

  it('shows the coverage of each suite', async () => {
    openUrl('/projects/3/reports?tab=coverage&release=5');
    const api = stubReports();
    renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('Coverage per suite')).toBeInTheDocument();
    expect(lastQuery(api, 'coverage')).toBe('releaseId=5');
    expect(tile('Test cases')).toHaveTextContent('30');
    expect(tile('In scope')).toHaveTextContent('50%15 cases in at least one run');
    expect(tile('Executed')).toHaveTextContent('80%12 of the cases in scope have a result');
    expect(tile('Never run')).toHaveTextContent('15');
    const suites = screen.getByRole('region', { name: 'Suites' });
    expect(within(suites).getByRole('link', { name: 'Unit operation test' })).toHaveAttribute(
      'href',
      '/projects/3/cases?suite=1',
    );
    expect(within(suites).getAllByRole('row')[1]).toHaveTextContent(
      'Unit operation testUOT201575%12925Critical:2High:8Medium:6Low:4',
    );
    await waitFor(() => expect(document.querySelectorAll('svg.recharts-surface')).toHaveLength(1));
  });

  it('lists references with their cases and defects and exports them', async () => {
    openUrl('/projects/3/reports?tab=traceability&release=5');
    const api = stubReports();
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => 'blob:csv');
    URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      const { user } = renderWithProviders(<ReportsPage />, as());
      expect(
        await screen.findByText('Reference → cases → latest result → defects'),
      ).toBeInTheDocument();
      expect(lastQuery(api, 'traceability')).toBe('releaseId=5');
      expect(tile('References')).toHaveTextContent('2');
      expect(tile('Need attention')).toHaveTextContent('1');
      expect(tile('Cases without reference')).toHaveTextContent('3');

      const reqRow = screen.getByRole('button', { name: 'Show cases of REQ-1' }).closest('li')!;
      expect(reqRow).toHaveTextContent('Unit powers on within 3 s');
      expect(reqRow).toHaveTextContent('Typed in');
      await user.click(screen.getByRole('button', { name: 'Show cases of REQ-1' }));
      const cases = screen.getByRole('list', { name: 'Cases of REQ-1' });
      expect(within(cases).getByRole('link', { name: 'UO-001' })).toHaveAttribute(
        'href',
        '/projects/3/cases?case=11',
      );
      expect(
        within(screen.getByRole('list', { name: 'Defects of REQ-1' })).getByRole('link', {
          name: 'BUG-004',
        }),
      ).toHaveAttribute('href', '/projects/3/defects/4');

      await user.click(screen.getByRole('radio', { name: 'Needs attention' }));
      expect(screen.queryByText('PROJ-7')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Export CSV/ }));
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    } finally {
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
    }
  });

  it('flags a requirement that no case tests', async () => {
    openUrl('/projects/3/reports?tab=traceability');
    const base = makeTraceability();
    stubReports({
      'GET /projects/3/reports/traceability': makeTraceability({
        rows: [
          ...base.rows,
          {
            reference: 'REQ-5',
            requirement: {
              id: 5,
              title: 'Factory reset',
              source: 'jira',
              externalUrl: null,
              externalStatus: 'Open',
              needsReview: false,
            },
            cases: [],
            counts: { total: 0, passed: 0, failed: 0, notExecuted: 0, neverRun: 0 },
            defects: [],
            openDefects: 0,
          },
        ],
      }),
    });
    const { user } = renderWithProviders(<ReportsPage />, as());
    const row = (await screen.findByText('REQ-5')).closest('li')!;
    expect(row).toHaveTextContent('No case tests it');
    expect(row).toHaveTextContent('Factory reset');
    expect(tile('Need attention')).toHaveTextContent('2');
    await user.click(screen.getByRole('radio', { name: 'Needs attention' }));
    expect(screen.getByText('REQ-5')).toBeInTheDocument();
    expect(screen.queryByText('PROJ-7')).not.toBeInTheDocument();
  });

  it('shows reopen counts per place and the defects that keep coming back', async () => {
    openUrl('/projects/3/reports?tab=reopens&release=5&plan=7');
    const api = stubReports();
    renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('Reopened 2 or more times')).toBeInTheDocument();
    expect(lastQuery(api, 'reopens')).toBe('releaseId=5');
    expect(tile('Reopened defects')).toHaveTextContent('440% of 10 defects');
    expect(tile('Times reopened')).toHaveTextContent('7');
    expect(tile('Reopened 2+ times')).toHaveTextContent('2');
    expect(tile('Reopens per reopened defect')).toHaveTextContent('1.8');
    expect(
      screen.getByText(
        'Reopen counts are filtered by release only; the plan filter does not apply here.',
      ),
    ).toBeInTheDocument();

    const platform = screen.getByRole('region', { name: 'By platform' });
    expect(within(platform).getByText('Android')).toBeInTheDocument();
    expect(within(platform).getByText('(3 of 7)')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'By build' })).getByText('(not set)'),
    ).toBeInTheDocument();

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('BUG-004 Does not start');
    expect(rows[1]).toHaveTextContent('3');
    expect(within(rows[1]!).getByRole('link', { name: 'BUG-004' })).toHaveAttribute(
      'href',
      '/projects/3/defects/4',
    );
    expect(rows[2]).toHaveTextContent('BUG-009');
  });

  it('says so when no defect exists for the reopen counts', async () => {
    openUrl('/projects/3/reports?tab=reopens');
    stubReports({
      'GET /projects/3/reports/reopens': makeReopens({
        totals: { defects: 0, reopenedDefects: 0, reopens: 0, repeatedDefects: 0 },
        byRelease: [],
        byBuild: [],
        byPlatform: [],
        byTopic: [],
        repeated: [],
      }),
    });
    renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('No defects in this scope')).toBeInTheDocument();
  });

  it('compares two builds and filters the cases that changed', async () => {
    openUrl('/projects/3/reports?tab=compare&from=build%3A1&to=build%3A2');
    const api = stubReports({
      'GET /projects/3/reports/compare/sides': [
        { value: 'build:2', kind: 'build', id: 2, label: 'Step 1 / B2', detail: '2 runs' },
        { value: 'build:1', kind: 'build', id: 1, label: 'Step 1 / B1', detail: '1 run' },
      ],
      'GET /projects/3/reports/compare': makeCompare(),
    });
    const { user } = renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('Step 1 / B1 → Step 1 / B2')).toBeInTheDocument();
    const call = api.find('GET', '/projects/3/reports/compare').at(-1)!;
    expect(call.query.get('base')).toBe('build:1');
    expect(call.query.get('target')).toBe('build:2');
    expect(tile('Regression')).toHaveTextContent('1OK before, NG or Blocked now');
    expect(tile('Fixed')).toHaveTextContent('1');
    expect(tile('Not run again')).toHaveTextContent('1');

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    await user.click(screen.getByRole('radio', { name: 'Changed' }));
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    await user.click(screen.getByRole('radio', { name: 'Regression' }));
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('UO-001 Power on');
    expect(rows[1]).toHaveTextContent('Regression');
  });

  it('asks for two runs or builds before comparing', async () => {
    openUrl('/projects/3/reports?tab=compare');
    const api = stubReports({ 'GET /projects/3/reports/compare/sides': [] });
    renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('Pick two runs or two builds')).toBeInTheDocument();
    expect(api.find('GET', '/projects/3/reports/compare')).toHaveLength(0);
  });

  it('draws runs as bars per topic, then per person, and lists runs without dates', async () => {
    openUrl('/projects/3/reports?tab=schedule&release=5');
    const api = stubReports();
    const { user, rerender } = renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('FW 2.4 schedule')).toBeInTheDocument();
    expect(lastQuery(api, 'schedule')).toBe('releaseId=5');

    const table = screen.getByRole('table', { name: 'Schedule' });
    const headers = within(table).getAllByRole('rowheader');
    expect(headers.map((h) => h.textContent)).toEqual([
      'Adapter operation test',
      'Unit operation test',
    ]);
    expect(within(table).getByRole('link', { name: 'R1 Unit operation test' })).toHaveAttribute(
      'href',
      '/projects/3/runs/1',
    );
    const unscheduled = screen.getByRole('list', { name: 'Runs without dates' });
    expect(within(unscheduled).getByRole('link', { name: 'R3' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'By person' }));
    followUrl();
    rerender(<ReportsPage />);
    await waitFor(() =>
      expect(
        within(screen.getByRole('table', { name: 'Schedule' }))
          .getAllByRole('rowheader')
          .map((h) => h.textContent),
      ).toEqual(['Ann Tester']),
    );
  });

  it('asks for dates when nothing is scheduled', async () => {
    openUrl('/projects/3/reports?tab=schedule');
    stubReports({
      'GET /projects/3/reports/schedule': makeSchedule({
        release: null,
        items: makeSchedule().items.slice(2),
      }),
    });
    renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('Nothing on the calendar yet')).toBeInTheDocument();
  });

  it('explains how to add references when none exist', async () => {
    openUrl('/projects/3/reports?tab=traceability');
    stubReports({
      'GET /projects/3/reports/traceability': makeTraceability({
        rows: [],
        casesWithoutReference: 0,
        totalCases: 0,
      }),
    });
    renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('No references yet')).toBeInTheDocument();
  });

  it('says when the scope has no run cases and reports failures', async () => {
    stubReports({
      'GET /projects/3/reports/trend': makeTrend({
        total: 0,
        points: makeTrend().points.map((p) => ({ ...p, executed: 0 })),
      }),
    });
    const first = renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('No run cases in this scope')).toBeInTheDocument();
    first.unmount();

    stubReports({ 'GET /projects/3/reports/trend': apiError(500, 'INTERNAL', 'Boom') });
    renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
