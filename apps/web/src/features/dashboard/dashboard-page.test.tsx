import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import {
  apiError,
  followUrl,
  mockApi,
  openUrl,
  urlParams,
  type ApiCall,
} from '@/features/cases/test-utils';
import {
  makeDashboard,
  makeTrend,
  makeWorkload,
  stubChartSize,
} from '@/features/reports/test-fixtures';
import { makeProject, renderWithProviders } from '@/test/render';
import { DashboardPage } from './dashboard-page';

function stubDashboard(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /projects/3/dashboard': (c: ApiCall) =>
      c.query.get('releaseId') === '6'
        ? makeDashboard({
            release: makeDashboard().releases[1]!,
            plans: [],
            attention: [],
            openDefects: [],
          })
        : makeDashboard(),
    'GET /projects/3/reports/trend': makeTrend(),
    'GET /projects/3/reports/workload': makeWorkload(),
    ...extra,
  });
}

const tester = { project: makeProject({ myRole: 'tester' }) };

describe('DashboardPage', () => {
  beforeEach(() => {
    openUrl('/projects/3');
    stubChartSize();
  });

  it('shows the key figures, plans, results to look at and open defects', async () => {
    stubDashboard();
    renderWithProviders(<DashboardPage />, tester);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Release overview — FW 2.4.0' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Test period Oct 1, 2026 – Oct 31, 2026')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Release' })).toHaveTextContent(
      'FW 2.4.0 (active)',
    );

    const kpis = screen.getByRole('region', { name: 'Key figures' });
    expect(kpis).toHaveTextContent('Test plans2');
    expect(kpis).toHaveTextContent('1 in progress · 1 completed');
    expect(kpis).toHaveTextContent('Execution progress90%');
    expect(kpis).toHaveTextContent('9 of 10 run cases executed');
    expect(kpis).toHaveTextContent('Pass rate88.9%');
    expect(kpis).toHaveTextContent('Open defects4');
    expect(kpis).toHaveTextContent('1 critical');
    expect(kpis).toHaveTextContent('2 major');

    const plans = screen.getByRole('region', { name: 'Test plans in this release' });
    expect(within(plans).getByText('KR_01')).toBeInTheDocument();
    expect(within(plans).getByText('+1 more')).toBeInTheDocument();
    expect(within(plans).getByRole('link', { name: 'All plans' })).toHaveAttribute(
      'href',
      '/projects/3/plans?release=5',
    );

    const attention = screen.getByRole('region', {
      name: 'Needs attention — NG & conditional results',
    });
    expect(within(attention).getByRole('link', { name: 'Power on the unit' })).toHaveAttribute(
      'href',
      '/projects/3/runs/21?case=101',
    );
    expect(attention).toHaveTextContent(
      '1-1 · Run KR_01 · 26TR-TEAM-10-001 · Alice Tester · Oct 20, 2026',
    );
    expect(within(attention).getByText('Unit does not start')).toBeInTheDocument();
    expect(within(attention).getByText('No defect linked')).toBeInTheDocument();
    // OK with condition: the remark explains the condition.
    expect(within(attention).getByText('Within tolerance')).toBeInTheDocument();
    expect(within(attention).getByRole('link', { name: 'BUG-12' })).toHaveAttribute(
      'href',
      '/projects/3/defects/12',
    );

    const defects = screen.getByRole('region', { name: 'Open defects' });
    expect(within(defects).getByRole('link', { name: 'View all 4' })).toHaveAttribute(
      'href',
      '/projects/3/defects',
    );
    expect(defects).toHaveTextContent('BUG-12 · Major · Unassigned · ACS-77');

    const trend = screen.getByRole('region', { name: 'Execution — last 14 days' });
    expect(within(trend).getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'href',
      '/projects/3/reports?tab=trend&release=5',
    );
    expect(await within(trend).findByText(/40 run cases in scope/)).toBeInTheDocument();
  });

  it('asks the reports for the release of the dashboard', async () => {
    const api = stubDashboard();
    renderWithProviders(<DashboardPage />, tester);
    const workload = await screen.findByRole('region', { name: 'Workload' });
    const rows = await within(workload).findAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual([
      'PersonUntestedEst. left7 days',
      'Alice Tester12 of 20 executed81h 30m6',
      'Bob Lead8 of 10 executed230m8',
      'Unassigned0 of 5 executed5—0',
    ]);
    expect(api.find('GET', '/projects/3/reports/trend')[0]!.query.toString()).toBe(
      'releaseId=5&days=14',
    );
    expect(api.find('GET', '/projects/3/reports/workload')[0]!.query.get('releaseId')).toBe('5');
  });

  it('shows the trend as a table', async () => {
    stubDashboard();
    const { user } = renderWithProviders(<DashboardPage />, tester);
    const trend = await screen.findByRole('region', { name: 'Execution — last 14 days' });
    await within(trend).findByText(/40 run cases in scope/);
    // Both charts are drawn (executed per day + burndown) with the day ticks.
    await waitFor(() => expect(trend.querySelectorAll('svg.recharts-surface')).toHaveLength(2));
    expect(within(trend).getAllByText('Oct 21').length).toBeGreaterThan(0);
    await user.click(within(trend).getByRole('radio', { name: 'Table' }));
    const rows = within(trend).getAllByRole('row');
    expect(rows[0]).toHaveTextContent('DateExecutedOKOK w/ cond.NGBlockedN/TN/ARemaining');
    expect(rows[1]).toHaveTextContent('Oct 21330000032');
    expect(rows).toHaveLength(4);
  });

  it('switches the release through the URL', async () => {
    const api = stubDashboard();
    const { user, rerender } = renderWithProviders(<DashboardPage />, tester);
    await user.click(await screen.findByRole('combobox', { name: 'Release' }));
    await user.click(await screen.findByRole('option', { name: 'FW 3.0' }));
    expect(urlParams()).toEqual({ release: '6' });
    followUrl();
    rerender(<DashboardPage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Release overview — FW 3.0' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No test plans in this release yet')).toBeInTheDocument();
    expect(screen.getByText('Nothing needs attention')).toBeInTheDocument();
    expect(screen.getByText('No open defects')).toBeInTheDocument();
    expect(api.find('GET', '/projects/3/dashboard').at(-1)!.query.get('releaseId')).toBe('6');
  });

  it('says when nothing happened in the last two weeks', async () => {
    stubDashboard({
      'GET /projects/3/reports/trend': makeTrend({
        total: 0,
        points: [
          {
            date: '2026-10-21',
            executed: 0,
            byStatus: makeTrend().points[0]!.byStatus,
            remaining: 0,
            passRate: null,
          },
        ],
      }),
      'GET /projects/3/reports/workload': [],
    });
    renderWithProviders(<DashboardPage />, tester);
    expect(await screen.findByText('No run cases yet')).toBeInTheDocument();
    expect(await screen.findByText('No open work')).toBeInTheDocument();
  });

  it('shows a project without releases and plans', async () => {
    stubDashboard({
      'GET /projects/3/dashboard': makeDashboard({
        release: null,
        releases: [],
        plans: [],
        kpis: {
          planCount: 0,
          plansByStatus: { draft: 0, in_progress: 0, completed: 0 },
          counts: makeTrend().points[0]!.byStatus,
          openDefects: 0,
          openDefectsBySeverity: { critical: 0, major: 0, minor: 0, trivial: 0 },
        },
        attention: [],
        openDefects: [],
      }),
    });
    renderWithProviders(<DashboardPage />, { project: makeProject({ myRole: 'viewer' }) });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Project overview' }),
    ).toBeInTheDocument();
    expect(screen.getByText('All test plans of the project (no releases yet)')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Release' })).not.toBeInTheDocument();
    expect(screen.getByText('No test plans yet', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText('No run cases yet', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('No open defects', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New test plan' })).not.toBeInTheDocument();
  });

  it('offers the current release when the chosen one cannot be loaded', async () => {
    openUrl('/projects/3?release=99');
    stubDashboard({
      'GET /projects/3/dashboard': (c: ApiCall) =>
        c.query.get('releaseId') === '99'
          ? apiError(404, 'RELEASE_NOT_FOUND', 'Release not found')
          : makeDashboard(),
    });
    const { user } = renderWithProviders(<DashboardPage />, tester);
    expect(await screen.findByText('Release not found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show the current release' }));
    expect(urlParams()).toEqual({});
    await waitFor(() => expect(window.location.search).toBe(''));
  });
});
