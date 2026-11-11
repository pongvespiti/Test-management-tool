import { describe, expect, it, jest } from '@jest/globals';
import type { RunReportDTO } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { setNavigation } from '@/test/mocks/next-navigation';
import { makeProject, renderWithProviders } from '@/test/render';
import { apiError, mockApi } from '../cases/test-utils';
import { inZone, pairs, RunReportPage } from './run-report-page';
import { alice, bob, counts } from './test-fixtures';

const report: RunReportDTO = {
  generatedAt: '2026-11-03T07:05:00.000Z',
  generatedBy: alice,
  timezone: 'Asia/Bangkok',
  project: { id: 3, key: 'ACS', name: 'ACS Smart control' },
  plan: {
    id: 2,
    docNo: '26TR-TEAM-11-001',
    title: 'FW 2.4 regression',
    status: 'in_progress',
    release: { id: 4, name: 'FW 2.4.0' },
  },
  run: {
    id: 7,
    code: 'KR_01',
    scenario: 'Korea model',
    suite: { id: 1, name: 'Unit operation test', prefix: 'UOT' },
    environment: [
      { label: 'FW version', value: '2.4.0' },
      { label: 'Router', value: 'ASUS AX' },
      { label: 'Phone', value: '' },
    ],
    tester: alice,
    testedDate: '2026-11-01',
    judgement: null,
    judgementNote: 'Pairing issue open',
    suggestedJudgement: 'not_pass',
    remark: null,
    sourceRun: null,
    createdAt: '2026-11-01T02:00:00.000Z',
  },
  firstExecutedAt: '2026-11-01T03:00:00.000Z',
  lastExecutedAt: null,
  estimate: { totalMinutes: 90, remainingMinutes: 0 },
  actualDurationSec: 3725,
  counts: counts({ ok: 2, ng: 1, untested: 1 }),
  passRate: 2 / 3,
  progress: 0.75,
  sections: [
    { path: ['Power'], counts: counts({ ok: 2, untested: 1 }) },
    { path: [], counts: counts({ ng: 1 }) },
  ],
  cases: [
    {
      runCaseId: 101,
      displayId: 'UOT-001',
      code: '1-1',
      title: 'Power on the unit',
      sectionPath: ['Power'],
      caseType: 'Normal',
      priority: 'high',
      status: 'ok',
      assignee: null,
      executedBy: alice,
      executedAt: '2026-11-01T03:00:00.000Z',
      elapsedSec: 60,
      actualResult: 'Starts',
      resultRemark: null,
      steps: [],
      defects: [],
    },
    {
      runCaseId: 103,
      displayId: 'UOT-003',
      code: null,
      title: 'Wi-Fi pairing',
      sectionPath: [],
      caseType: 'Normal',
      priority: 'low',
      status: 'ng',
      assignee: bob,
      executedBy: bob,
      executedAt: '2026-11-01T04:00:00.000Z',
      elapsedSec: 420,
      actualResult: 'Pairing fails',
      resultRemark: 'Seen 3/3 times',
      steps: [
        {
          action: 'Open pairing',
          expected: 'Pairing screen',
          sharedStepName: null,
          status: 'ng',
          actual: 'Timeout',
        },
      ],
      defects: [
        {
          id: 12,
          key: 'BUG-12',
          title: 'Fan does not start',
          status: 'open',
          severity: 'major',
          externalKey: 'TEAM-5',
        },
      ],
    },
  ],
  defects: [
    {
      id: 12,
      key: 'BUG-12',
      title: 'Fan does not start',
      status: 'open',
      severity: 'major',
      externalKey: 'TEAM-5',
      externalStatus: 'In Progress',
    },
  ],
};

function renderReport(runId = '7', handlers: Record<string, unknown> = {}) {
  setNavigation({
    pathname: `/projects/3/runs/${runId}/report`,
    params: { projectId: '3', runId },
  });
  const api = mockApi({ 'GET /projects/3/runs/7/report': report, ...handlers });
  return { api, ...renderWithProviders(<RunReportPage />, { project: makeProject() }) };
}

describe('RunReportPage', () => {
  it('renders the run information, counts, sections, defects and details', async () => {
    renderReport();
    const sheet = await screen.findByRole('article', { name: 'Run report' });
    expect(within(sheet).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Run KR_01 — Korea model (suggested: NOT PASS)',
    );
    expect(sheet).toHaveTextContent('Generated Nov 3, 2026, 14:05 (Asia/Bangkok)');
    expect(sheet).toHaveTextContent('1h 30m (remaining 0m)');
    expect(sheet).toHaveTextContent('1h 2m');
    expect(sheet).toHaveTextContent('Pairing issue open');
    const summary = within(sheet).getByRole('table', { name: 'Status summary' });
    expect(within(summary).getByRole('row', { name: /OK 2 50.0%/ })).toBeInTheDocument();
    expect(within(summary).getByRole('row', { name: 'Total 4 100%' })).toBeInTheDocument();
    expect(sheet).toHaveTextContent('Executed 75.0% (3 of 4) · Pass rate 66.7%');
    const sections = within(sheet).getByRole('table', { name: 'Summary by section' });
    expect(within(sections).getByText('(No section)')).toBeInTheDocument();
    expect(within(sections).getByRole('row', { name: /^Total 4/ })).toBeInTheDocument();
    const defects = within(sheet).getByRole('table', { name: 'Defects' });
    expect(defects).toHaveTextContent('TEAM-5 · In Progress');
    const instances = within(sheet).getByRole('table', { name: 'Test instances' });
    expect(within(instances).getAllByRole('row')).toHaveLength(3);
    const detail = within(sheet).getByRole('region', { name: 'UOT-003 details' });
    expect(detail).toHaveTextContent('Seen 3/3 times');
    expect(detail).toHaveTextContent('Defects: BUG-12');
    expect(detail).toHaveTextContent('Timeout');
    expect(screen.queryByRole('region', { name: 'UOT-001 details' })).not.toBeInTheDocument();
    expect(document.title).toBe('26TR-TEAM-11-001 KR_01 run report');
  });

  it('prints and marks the page for the print layout while open', async () => {
    const print = jest.spyOn(window, 'print').mockImplementation(() => undefined);
    const { user, unmount } = renderReport();
    await screen.findByRole('article', { name: 'Run report' });
    expect(document.body).toHaveClass('printReport');
    await user.click(screen.getByRole('button', { name: 'Print / Save as PDF' }));
    expect(print).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Back to run' })).toHaveAttribute(
      'href',
      '/projects/3/runs/7',
    );
    unmount();
    expect(document.body).not.toHaveClass('printReport');
  });

  it('reports a failed Excel download', async () => {
    const error = jest.spyOn(toast, 'error');
    const { user, api } = renderReport('7', {
      'GET /projects/3/runs/7/report.xlsx': apiError(500, 'EXPORT_FAILED', 'Export failed'),
    });
    await screen.findByRole('article', { name: 'Run report' });
    await user.click(screen.getByRole('button', { name: 'Download Excel' }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Could not download the Excel report', expect.anything()),
    );
    expect(api.find('GET', '/projects/3/runs/7/report.xlsx')).toHaveLength(1);
  });

  it('explains invalid and missing reports', async () => {
    const first = renderReport('x');
    expect(await screen.findByText('This report address is not valid.')).toBeInTheDocument();
    first.unmount();
    renderReport('8', {
      'GET /projects/3/runs/8/report': apiError(404, 'NOT_FOUND', 'Run not found'),
    });
    expect(await screen.findByText('Run not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the run' })).toHaveAttribute(
      'href',
      '/projects/3/runs/8',
    );
  });
});

describe('report helpers', () => {
  it('formats times in the report time zone', () => {
    expect(inZone(null, 'UTC')).toBe('—');
    expect(inZone('nope', 'UTC')).toBe('—');
    expect(inZone('2026-11-03T07:05:00.000Z', 'UTC')).toBe('Nov 3, 2026, 07:05');
    expect(inZone('2026-11-03T07:05:00.000Z', 'Not/AZone')).toContain('2026');
  });

  it('pairs label/value rows', () => {
    expect(
      pairs([
        ['a', '1'],
        ['b', '2'],
        ['c', '3'],
      ]),
    ).toEqual([
      ['a', '1', 'b', '2'],
      ['c', '3'],
    ]);
    expect(pairs([])).toEqual([]);
  });
});
