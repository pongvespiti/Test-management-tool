import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import type { RetestCaseDTO, RetestItemDTO } from '@tmt/shared';
import { apiError, mockApi, openUrl } from '@/features/cases/test-utils';
import { makeRun } from '@/features/plans/test-fixtures';
import { mockRouter } from '@/test/mocks/next-navigation';
import { makeProject, renderWithProviders } from '@/test/render';
import { groupBySourceRun, RetestCard } from './retest-card';

const failed = (over: Partial<RetestCaseDTO> = {}): RetestCaseDTO => ({
  runCaseId: 51,
  displayId: 'SY-001',
  title: 'Power on',
  runId: 3,
  runCode: 'KR_01',
  planId: 7,
  planDocNo: 'D-1',
  planStatus: 'in_progress',
  scheduledRun: null,
  ...over,
});

const item = (cases: RetestCaseDTO[], over: Partial<RetestItemDTO> = {}): RetestItemDTO => ({
  defect: {
    id: 9,
    key: 'BUG-4',
    title: 'Does not power on',
    status: 'resolved',
    severity: 'critical',
    externalKey: null,
  },
  fixedInBuild: { id: 8, name: '1.1.7(2.0.0)' },
  cases,
  ...over,
});

const project = makeProject({ myRole: 'tester' });

describe('groupBySourceRun', () => {
  it('groups cases by the run they failed in, keeping order', () => {
    const g = groupBySourceRun([
      failed({ runCaseId: 1, runId: 3 }),
      failed({ runCaseId: 2, runId: 4 }),
      failed({ runCaseId: 3, runId: 3 }),
    ]);
    expect([...g.keys()]).toEqual([3, 4]);
    expect(g.get(3)!.map((c) => c.runCaseId)).toEqual([1, 3]);
  });
});

describe('RetestCard', () => {
  beforeEach(() => openUrl('/projects/3'));

  it('explains the feature when nothing waits', () => {
    renderWithProviders(<RetestCard projectId={3} total={0} items={[]} canCreate />, { project });
    expect(screen.getByText('No fixes are waiting for a retest')).toBeInTheDocument();
  });

  it('lists the defect, its fix build and the failed cases with links', () => {
    renderWithProviders(
      <RetestCard
        projectId={3}
        total={1}
        canCreate
        items={[item([failed(), failed({ runCaseId: 52, displayId: 'SY-002' })])]}
      />,
      { project },
    );
    const card = screen.getByRole('region', { name: 'Waiting for retest' });
    expect(within(card).getByRole('link', { name: 'Does not power on' })).toHaveAttribute(
      'href',
      '/projects/3/defects/9',
    );
    expect(card).toHaveTextContent('fixed in 1.1.7(2.0.0)');
    expect(card).toHaveTextContent('2 cases failed in KR_01 (D-1)');
    expect(within(card).getByRole('link', { name: 'KR_01' })).toHaveAttribute(
      'href',
      '/projects/3/runs/3',
    );
  });

  it('creates a retest run of the failed cases on the fix build and opens it', async () => {
    const api = mockApi({
      'POST /projects/3/runs/3/rerun': makeRun({ id: 12, code: 'KR_02' }),
    });
    const { user } = renderWithProviders(
      <RetestCard
        projectId={3}
        total={1}
        canCreate
        items={[item([failed(), failed({ runCaseId: 52, displayId: 'SY-002' })])]}
      />,
      { project },
    );
    await user.click(screen.getByRole('button', { name: 'Create retest run' }));
    const dialog = await screen.findByRole('dialog', { name: 'Retest on 1.1.7(2.0.0)' });
    const code = within(dialog).getByLabelText('Test ID of the retest run');
    expect(code).toHaveValue('KR_01_R2');
    await user.click(within(dialog).getByRole('button', { name: 'Create retest run' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/runs/3/rerun')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/runs/3/rerun')[0]!.body).toEqual({
      code: 'KR_01_R2',
      buildId: 8,
      runCaseIds: [51, 52],
      statuses: ['ng', 'blocked'],
    });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/runs/12'));
  });

  it('shows a taken Test ID next to the field and keeps the dialog open', async () => {
    mockApi({ 'POST /projects/3/runs/3/rerun': apiError(409, 'RUN_CODE_TAKEN') });
    const { user } = renderWithProviders(
      <RetestCard projectId={3} total={1} canCreate items={[item([failed()])]} />,
      { project },
    );
    await user.click(screen.getByRole('button', { name: 'Create retest run' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create retest run' }));
    expect(
      await within(dialog).findByText('Another run of this plan uses this Test ID'),
    ).toBeInTheDocument();
  });

  it('links a case already scheduled in a run and offers no button for it', () => {
    renderWithProviders(
      <RetestCard
        projectId={3}
        total={1}
        canCreate
        items={[item([failed({ scheduledRun: { id: 20, code: 'KR_02' } })])]}
      />,
      { project },
    );
    expect(screen.getByRole('link', { name: 'in KR_02' })).toHaveAttribute(
      'href',
      '/projects/3/runs/20',
    );
    expect(screen.queryByRole('button', { name: 'Create retest run' })).not.toBeInTheDocument();
    expect(screen.getByText(/record their results to close this/)).toBeInTheDocument();
  });

  it('asks to reopen a completed plan and hides the button from viewers', () => {
    const { unmount } = renderWithProviders(
      <RetestCard
        projectId={3}
        total={1}
        canCreate
        items={[item([failed({ planStatus: 'completed' })])]}
      />,
      { project },
    );
    expect(screen.getByText('Plan completed — reopen it to add a retest run')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create retest run' })).not.toBeInTheDocument();
    unmount();
    renderWithProviders(
      <RetestCard projectId={3} total={1} canCreate={false} items={[item([failed()])]} />,
      { project: makeProject({ myRole: 'viewer' }) },
    );
    expect(screen.queryByRole('button', { name: 'Create retest run' })).not.toBeInTheDocument();
  });

  it('says how many defects are not shown', () => {
    renderWithProviders(
      <RetestCard projectId={3} total={14} canCreate items={[item([failed()])]} />,
      { project },
    );
    expect(screen.getByText('Showing 1 of 14 defects (most severe first).')).toBeInTheDocument();
  });
});
