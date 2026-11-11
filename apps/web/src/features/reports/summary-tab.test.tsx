import { beforeEach, describe, expect, it } from '@jest/globals';
import type { ProjectRole } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { followUrl, mockApi, openUrl, urlParams, type ApiCall } from '@/features/cases/test-utils';
import { counts, makePlan, makeRelease } from '@/features/plans/test-fixtures';
import { makeProject, renderWithProviders } from '@/test/render';
import { ReportsPage } from './reports-page';
import { makeSavedView, makeSummary, stubChartSize } from './test-fixtures';

/** The KPI tile with this label. */
const tile = (label: string) => screen.getByText(label, { selector: 'p' }).parentElement!;
const run = (id: number) => ({ id, planId: 7, code: `R${id}` });

function stub(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /projects/3/plans': [makePlan()],
    'GET /projects/3/releases': [makeRelease()],
    'GET /projects/3/reports/summary': (c: ApiCall) =>
      c.query.get('cols') === 'Unit model'
        ? makeSummary({
            rows: 'Platform',
            cols: 'Unit model',
            rowValues: ['Android', 'iOS'],
            colValues: ['A', 'B'],
            cells: [
              { row: 'Android', col: 'A', counts: counts({ ok: 3, ng: 1 }), runs: [run(1)] },
              { row: 'Android', col: 'B', counts: counts({ ok: 4 }), runs: [run(3)] },
              { row: 'iOS', col: 'A', counts: counts({ ok: 2, blocked: 1 }), runs: [run(2)] },
            ],
          })
        : makeSummary({ rows: c.query.get('rows') }),
    'GET /projects/3/reports/views': [],
    ...extra,
  });
}

const as = (role: ProjectRole = 'viewer') => ({ project: makeProject({ myRole: role }) });
const lastQuery = (api: ReturnType<typeof stub>) =>
  api.find('GET', '/projects/3/reports/summary').at(-1)!.query;

describe('Summary tab', () => {
  beforeEach(() => {
    openUrl('/projects/3/reports?tab=summary');
    stubChartSize();
  });

  it('shows the totals of every run until something is chosen', async () => {
    const api = stub();
    renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('Results of all runs')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
    expect(tile('Runs')).toHaveTextContent('3All runs in the scope');
    expect(tile('Pass rate')).toHaveTextContent('80%');
    expect(tile('Run cases')).toHaveTextContent('16');
    expect(lastQuery(api).toString()).toBe('');
  });

  it('groups by a row and a column dimension and keeps the choice in the address', async () => {
    const api = stub();
    const { user, rerender } = renderWithProviders(<ReportsPage />, as());
    await screen.findByText('Results of all runs');

    await user.click(screen.getByRole('combobox', { name: 'Group rows by' }));
    await user.click(await screen.findByRole('option', { name: 'Platform' }));
    followUrl();
    rerender(<ReportsPage />);
    await screen.findByText('Results by Platform');
    expect(urlParams()).toEqual({ tab: 'summary', rows: 'Platform' });
    expect(lastQuery(api).get('rows')).toBe('Platform');

    await user.click(screen.getByRole('combobox', { name: 'Group columns by' }));
    await user.click(await screen.findByRole('option', { name: 'Unit model' }));
    followUrl();
    rerender(<ReportsPage />);
    expect(await screen.findByText('Platform × Unit model')).toBeInTheDocument();

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows[0]).toHaveTextContent('Platform \\ Unit model');
    expect(rows[1]).toHaveTextContent('Android75%');
    expect(rows[1]).toHaveTextContent('100%');
    expect(rows[2]).toHaveTextContent('iOS67%');
    expect(within(rows[2]!).getByRole('link', { name: 'R2' })).toHaveAttribute(
      'href',
      '/projects/3/runs/2',
    );
  });

  it('filters by the values picked and can clear them', async () => {
    openUrl('/projects/3/reports?tab=summary');
    const api = stub();
    const { user, rerender } = renderWithProviders(<ReportsPage />, as());
    await screen.findByText('Results of all runs');

    await user.click(screen.getByRole('combobox', { name: 'Filter Platform' }));
    await user.click(await screen.findByRole('option', { name: /Android/ }));
    await user.keyboard('{Escape}');
    followUrl();
    rerender(<ReportsPage />);
    await waitFor(() => expect(lastQuery(api).getAll('f')).toEqual(['Platform=Android']));
    expect(urlParams()).toMatchObject({ f: 'Platform=Android' });

    await user.click(await screen.findByRole('button', { name: 'Clear filters' }));
    followUrl();
    rerender(<ReportsPage />);
    await waitFor(() => expect(lastQuery(api).getAll('f')).toEqual([]));
  });

  it('says so when no run matches the filters', async () => {
    openUrl('/projects/3/reports?tab=summary&f=Platform%3DWindows');
    stub({
      'GET /projects/3/reports/summary': makeSummary({
        cells: [],
        rowValues: [],
        colValues: [],
        totals: { counts: counts(), runs: 0 },
      }),
    });
    renderWithProviders(<ReportsPage />, as());
    expect(await screen.findByText('No run matches these filters')).toBeInTheDocument();
    expect(screen.getByText(/3 runs are in the scope/)).toBeInTheDocument();
  });

  it('applies a saved view and deletes it as its owner', async () => {
    const api = stub({
      'GET /projects/3/reports/views': [makeSavedView()],
      'DELETE /projects/3/reports/views/21': undefined,
    });
    const { user, rerender } = renderWithProviders(<ReportsPage />, as('tester'));
    await screen.findByText('Results of all runs');

    await user.click(screen.getByRole('combobox', { name: 'Saved views' }));
    await user.click(await screen.findByRole('option', { name: 'Android by unit' }));
    followUrl();
    rerender(<ReportsPage />);
    expect(await screen.findByText('Platform × Unit model')).toBeInTheDocument();
    expect(urlParams()).toMatchObject({ rows: 'Platform', cols: 'Unit model' });

    await user.click(screen.getByRole('button', { name: 'Delete view Android by unit' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.find('DELETE', '/projects/3/reports/views/21')).toHaveLength(1));
  });

  it('saves what is on screen under a name, optionally shared', async () => {
    openUrl('/projects/3/reports?tab=summary&rows=Platform&f=Unit%20model%3DA');
    const api = stub({ 'POST /projects/3/reports/views': makeSavedView({ id: 22 }) });
    const { user } = renderWithProviders(<ReportsPage />, as('tester'));
    await screen.findByText('Results by Platform');

    await user.click(screen.getByRole('button', { name: 'Save view…' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Unit A by platform');
    await user.click(within(dialog).getByRole('switch', { name: /Share with everyone/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save view' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/reports/views')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/reports/views')[0]!.body).toEqual({
      name: 'Unit A by platform',
      shared: true,
      config: { rows: 'Platform', cols: null, filters: { 'Unit model': ['A'] } },
    });
  });
});
