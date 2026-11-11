import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { emptyCounts, type MyWorkDTO } from '@tmt/shared';
import { followUrl, mockApi, openUrl, urlParams } from '@/features/cases/test-utils';
import { makeProject, renderWithProviders } from '@/test/render';
import { MyWorkPage } from './my-work-page';

function makeMyWork(over: Partial<MyWorkDTO> = {}): MyWorkDTO {
  return {
    user: { id: 5, username: 'tom', displayName: 'Tom' },
    timezone: 'Asia/Bangkok',
    range: 'day',
    from: '2026-10-22',
    to: '2026-10-22',
    assigned: {
      untested: 1,
      ng: 1,
      blocked: 0,
      total: 2,
      remainingEstimateMinutes: 20,
      truncated: false,
      items: [
        {
          runCaseId: 51,
          displayId: 'SY-002',
          code: null,
          title: 'Power off',
          status: 'ng',
          priority: 'high',
          estimateMinutes: 10,
          runId: 3,
          runCode: 'R1',
          planId: 7,
          planDocNo: 'D-1',
          release: { id: 5, name: 'Step 1.1.7' },
          build: { id: 8, name: '1.1.7(2.0.0)' },
        },
        {
          runCaseId: 50,
          displayId: 'SY-001',
          code: null,
          title: 'Power on',
          status: 'untested',
          priority: 'critical',
          estimateMinutes: 10,
          runId: 3,
          runCode: 'R1',
          planId: 7,
          planDocNo: 'D-1',
          release: null,
          build: null,
        },
      ],
    },
    summary: {
      executed: 2,
      counts: { ...emptyCounts(), ok: 1, ng: 1 },
      elapsedSec: 150,
      days: [{ date: '2026-10-22', executed: 2, elapsedSec: 150 }],
      groups: [
        {
          release: { id: 5, name: 'Step 1.1.7' },
          build: { id: 8, name: '1.1.7(2.0.0)' },
          executed: 2,
          counts: { ...emptyCounts(), ok: 1, ng: 1 },
          elapsedSec: 150,
        },
      ],
      defects: [{ id: 9, key: 'BUG-4', title: 'Times out', status: 'new', severity: 'major' }],
    },
    ...over,
  };
}

const project = makeProject({ myRole: 'tester' });

describe('MyWorkPage', () => {
  beforeEach(() => {
    openUrl('/projects/3/my-work');
  });

  it('lists what is waiting, linking each case to its run', async () => {
    mockApi({ 'GET /projects/3/my-work': makeMyWork() });
    renderWithProviders(<MyWorkPage />, { project });
    const waiting = await screen.findByRole('region', { name: 'Waiting for me' });
    const ng = within(waiting).getByRole('row', { name: /SY-002/ });
    expect(within(ng).getByRole('link', { name: 'Power off' })).toHaveAttribute(
      'href',
      '/projects/3/runs/3?case=51',
    );
    expect(ng).toHaveTextContent('1.1.7(2.0.0)');
    expect(waiting).toHaveTextContent('1 NG · 0 blocked · 1 untested · about 20m left');
  });

  it('summarises the period by release and build, with time and reported defects', async () => {
    mockApi({ 'GET /projects/3/my-work': makeMyWork() });
    renderWithProviders(<MyWorkPage />, { project });
    const byBuild = await screen.findByRole('region', { name: 'Results by release and build' });
    expect(within(byBuild).getByRole('row', { name: /1\.1\.7\(2\.0\.0\)/ })).toHaveTextContent(
      '3m',
    );
    expect(await screen.findByText('Thu, Oct 22, 2026')).toBeInTheDocument();
    const defects = screen.getByRole('region', { name: 'Defects I reported' });
    expect(within(defects).getByRole('link', { name: 'Times out' })).toHaveAttribute(
      'href',
      '/projects/3/defects/9',
    );
  });

  it('shows empty states when nothing waits and nothing was recorded', async () => {
    const empty = makeMyWork();
    mockApi({
      'GET /projects/3/my-work': makeMyWork({
        assigned: { ...empty.assigned, untested: 0, ng: 0, total: 0, items: [] },
        summary: { ...empty.summary, executed: 0, counts: emptyCounts(), groups: [], defects: [] },
      }),
    });
    renderWithProviders(<MyWorkPage />, { project });
    expect(await screen.findByText('Nothing is waiting for you')).toBeInTheDocument();
    expect(screen.getByText('No results recorded in this period')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Defects I reported' })).not.toBeInTheDocument();
  });

  it('switches to the week and pages through periods using the URL', async () => {
    const api = mockApi({
      'GET /projects/3/my-work': (c: { query: URLSearchParams }) =>
        c.query.get('range') === 'week'
          ? makeMyWork({ range: 'week', from: '2026-10-19', to: '2026-10-25' })
          : makeMyWork(),
    });
    const { user, rerender } = renderWithProviders(<MyWorkPage />, { project });
    await user.click(await screen.findByRole('radio', { name: 'Week' }));
    expect(urlParams()).toEqual({ range: 'week', date: '2026-10-22' });
    followUrl();
    rerender(<MyWorkPage />);
    expect(await screen.findByText('Oct 19 – Oct 25, 2026')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'By day' })).toBeInTheDocument();
    expect(api.find('GET', '/projects/3/my-work').at(-1)!.query.get('range')).toBe('week');

    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(urlParams()).toEqual({ range: 'week', date: '2026-10-12' });
    followUrl();
    rerender(<MyWorkPage />);
    await waitFor(() =>
      expect(api.find('GET', '/projects/3/my-work').at(-1)!.query.get('date')).toBe('2026-10-12'),
    );

    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(urlParams()).toEqual({ range: 'week' });
  });

  it('copies the summary as text', async () => {
    mockApi({ 'GET /projects/3/my-work': makeMyWork() });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    const { user } = renderWithProviders(<MyWorkPage />, { project });
    // user-event installs its own clipboard stub when it is set up.
    const writeText = jest.spyOn(navigator.clipboard, 'writeText');
    await user.click(await screen.findByRole('button', { name: /Copy summary/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = String(writeText.mock.calls[0]![0]);
    expect(text).toContain('Work summary — Thu, Oct 22, 2026 — Tom');
    expect(text).toContain('Tested 2 cases: 1 OK · 1 NG');
    expect(text).toContain('BUG-4 Times out [Major]');
  });

  it('shows the work of the member named in the URL', async () => {
    openUrl('/projects/3/my-work?user=8');
    const api = mockApi({
      'GET /projects/3/members': [],
      'GET /projects/3/my-work': makeMyWork({
        user: { id: 8, username: 'ann', displayName: 'Ann' },
      }),
    });
    renderWithProviders(<MyWorkPage />, { project: makeProject({ myRole: 'lead' }) });
    expect(await screen.findByRole('region', { name: 'Waiting for Ann' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Defects Ann reported' })).toBeInTheDocument();
    expect(screen.getByText(/work of another member/)).toBeInTheDocument();
    expect(api.find('GET', '/projects/3/my-work').at(-1)!.query.get('userId')).toBe('8');
  });
});
