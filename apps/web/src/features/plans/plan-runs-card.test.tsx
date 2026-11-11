import { describe, expect, it } from '@jest/globals';
import type { PlanDTO, ProjectRole } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { apiError, makeSuite, makeTree, member, mockApi } from '@/features/cases/test-utils';
import { makeProject, renderWithProviders } from '@/test/render';
import { PlanRunsCard } from './plan-runs-card';
import { counts, makeBuild, makePlan, makeRun } from './test-fixtures';

function stubRuns(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /projects/3/plans/7/runs': [makeRun({ counts: counts({ ok: 8, ng: 1, untested: 1 }) })],
    'GET /projects/3/suites': [
      makeSuite({ id: 1, prefix: 'UOT', envTemplate: ['Unit model', 'Phone'], caseCount: 12 }),
    ],
    'GET /projects/3/suites/1/sections': makeTree(),
    'GET /projects/3/tags': [{ tag: 'smoke', count: 3 }],
    'GET /projects/3/members': [member(1, 'Alice Tester', 'tester')],
    ...extra,
  });
}

function renderCard(role: ProjectRole = 'tester', plan: PlanDTO = makePlan()) {
  const locked = plan.status === 'completed';
  const canWrite = role !== 'viewer';
  return renderWithProviders(
    <PlanRunsCard
      plan={plan}
      editable={canWrite && !locked}
      canWrite={canWrite}
      canDelete={role === 'lead'}
    />,
    { project: makeProject({ myRole: role }) },
  );
}

async function openRunAction(user: ReturnType<typeof renderCard>['user'], item: string) {
  await user.click(await screen.findByRole('button', { name: 'Actions for run KR_01' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('PlanRunsCard', () => {
  it('shows the build of each run', async () => {
    stubRuns({
      'GET /projects/3/plans/7/runs': [makeRun({ build: { id: 8, name: '1.1.7(2.0.0)' } })],
    });
    renderCard();
    expect(await screen.findByText('1.1.7(2.0.0)')).toBeInTheDocument();
  });

  it('chooses a build of the plan release when creating and editing a run', async () => {
    const api = stubRuns({
      'GET /projects/3/builds': [
        makeBuild(),
        makeBuild({ id: 7, name: '1.1.7(1.0.0)', builtDate: '2026-11-01' }),
      ],
      'POST /projects/3/plans/7/runs': makeRun({ id: 30, code: 'UOT_01' }),
      'PATCH /projects/3/runs/21': makeRun({ build: { id: 7, name: '1.1.7(1.0.0)' } }),
    });
    const { user } = renderCard();
    await user.click(await screen.findByRole('button', { name: 'New run' }));
    const dialog = await screen.findByRole('dialog', { name: 'New run · 26TR-TEAM-10-001' });
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Run code (Test ID)' })).toHaveValue(
        'UOT_01',
      ),
    );
    await user.click(within(dialog).getByRole('combobox', { name: 'Build' }));
    await user.click(await screen.findByRole('option', { name: '1.1.7(2.0.0)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create run' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/plans/7/runs')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/plans/7/runs')[0]!.body).toMatchObject({ buildId: 8 });
    // The builds offered are those of the plan's release.
    expect(api.find('GET', '/projects/3/builds')[0]!.query.get('releaseId')).toBe('5');
  });

  it('changes the build of a run', async () => {
    const api = stubRuns({
      'GET /projects/3/builds': [
        makeBuild(),
        makeBuild({ id: 7, name: '1.1.7(1.0.0)', builtDate: '2026-11-01' }),
      ],
      'PATCH /projects/3/runs/21': makeRun({ build: { id: 7, name: '1.1.7(1.0.0)' } }),
    });
    const { user } = renderCard();
    await openRunAction(user, 'Edit run…');
    const edit = await screen.findByRole('dialog', { name: 'Edit run KR_01' });
    await user.click(within(edit).getByRole('combobox', { name: 'Build' }));
    await user.click(await screen.findByRole('option', { name: '1.1.7(1.0.0)' }));
    await user.click(within(edit).getByRole('button', { name: 'Save run' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/runs/21')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/runs/21')[0]!.body).toMatchObject({ buildId: 7 });
  });

  it('creates a run from the only suite with the chosen filters', async () => {
    let attempts = 0;
    const api = stubRuns({
      'POST /projects/3/plans/7/runs': () =>
        ++attempts === 1
          ? apiError(422, 'NO_CASES')
          : makeRun({ id: 30, code: 'UOT_01', counts: counts({ untested: 4 }) }),
    });
    const { user } = renderCard();
    await user.click(await screen.findByRole('button', { name: 'New run' }));
    const dialog = await screen.findByRole('dialog', { name: 'New run · 26TR-TEAM-10-001' });

    // The only suite is preselected: its prefix gives the code, its template the environment.
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Run code (Test ID)' })).toHaveValue(
        'UOT_01',
      ),
    );
    expect(within(dialog).getByText(/12 cases in the suite/)).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: 'Tester' })).toHaveTextContent(
        'Alice Tester',
      ),
    );
    await user.type(within(dialog).getByRole('textbox', { name: 'Value of Unit model' }), 'ACU18');
    await user.click(within(dialog).getByRole('button', { name: 'High' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Tags' }));
    await user.click(await screen.findByRole('option', { name: /smoke/ }));
    await user.keyboard('{Escape}');

    await user.click(within(dialog).getByRole('button', { name: 'Create run' }));
    expect(
      await within(dialog).findByText(/No test cases match these filters/),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Create run' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.find('POST', '/projects/3/plans/7/runs')[1]!.body).toEqual({
      suiteId: 1,
      code: 'UOT_01',
      scenario: '',
      testerId: 1,
      buildId: null,
      testedDate: '',
      // Template items keep their label even without a value (as in the old app).
      environment: [
        { label: 'Unit model', value: 'ACU18' },
        { label: 'Phone', value: '' },
      ],
      priorities: ['high'],
      tags: ['smoke'],
      caseStatuses: ['ready'],
    });
  });

  it('needs at least one review status and a free code', async () => {
    const api = stubRuns({
      'POST /projects/3/plans/7/runs': apiError(409, 'RUN_CODE_TAKEN'),
    });
    const { user } = renderCard();
    await user.click(await screen.findByRole('button', { name: 'New run' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Run code (Test ID)' })).toHaveValue(
        'UOT_01',
      ),
    );
    await user.click(within(dialog).getByRole('checkbox', { name: 'Ready' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create run' }));
    expect(await within(dialog).findByText('Choose at least one status')).toBeInTheDocument();
    expect(api.find('POST', '/projects/3/plans/7/runs')).toHaveLength(0);

    await user.click(within(dialog).getByRole('checkbox', { name: 'In review' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create run' }));
    expect(
      await within(dialog).findByText('Another run in this plan uses this code'),
    ).toBeInTheDocument();
    expect(api.find('POST', '/projects/3/plans/7/runs')[0]!.body).toMatchObject({
      caseStatuses: ['in_review'],
    });
  });

  it('edits a run and sets its judgement', async () => {
    const api = stubRuns({ 'PATCH /projects/3/runs/21': makeRun({ judgement: 'pass' }) });
    const { user } = renderCard();
    expect(await screen.findByText('Suggested: NOT PASS')).toBeInTheDocument();
    await openRunAction(user, 'Edit run…');
    const dialog = await screen.findByRole('dialog', { name: 'Edit run KR_01' });
    await user.click(within(dialog).getByRole('button', { name: 'Use' }));
    expect(
      within(within(dialog).getByRole('group', { name: 'Run judgement' })).getByRole('button', {
        name: 'NOT PASS',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'PASS' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Remark' }), 'Fan noise checked');
    await user.click(within(dialog).getByRole('button', { name: 'Save run' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/runs/21')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/runs/21')[0]!.body).toEqual({
      code: 'KR_01',
      scenario: 'AP mode · iOS',
      testerId: 1,
      buildId: null,
      testedDate: '2026-10-02',
      environment: makeRun().environment,
      judgement: 'pass',
      judgementNote: '',
      remark: 'Fan noise checked',
    });
  });

  it('duplicates a run for the next configuration', async () => {
    const api = stubRuns({
      'POST /projects/3/runs/21/duplicate': makeRun({ id: 31, code: 'KR_02' }),
    });
    const { user } = renderCard();
    await openRunAction(user, 'Duplicate for a new configuration…');
    const dialog = await screen.findByRole('dialog', { name: 'Duplicate run KR_01' });
    expect(within(dialog).getByText(/same 10 cases as/)).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'New run code (Test ID)' })).toHaveValue(
      'KR_02',
    );
    const phone = within(dialog).getByRole('textbox', { name: 'Value of Phone' });
    await user.clear(phone);
    await user.type(phone, 'Pixel 9');
    await user.click(within(dialog).getByRole('button', { name: 'Duplicate run' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/runs/21/duplicate')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/runs/21/duplicate')[0]!.body).toEqual({
      code: 'KR_02',
      scenario: 'AP mode · iOS',
      testerId: 1,
      buildId: null,
      environment: [
        { label: 'Unit model', value: 'ACU18' },
        { label: 'Adapter FW', value: '3.12.119' },
        { label: 'Phone', value: 'Pixel 9' },
      ],
    });
  });

  it('re-runs the NG and blocked cases', async () => {
    const api = stubRuns({
      'POST /projects/3/runs/21/rerun': makeRun({ id: 32, code: 'KR_01_R1' }),
    });
    const { user } = renderCard();
    await openRunAction(user, 'Re-run NG / blocked…');
    const dialog = await screen.findByRole('dialog', { name: 'Re-run KR_01' });
    expect(within(dialog).getByRole('textbox', { name: 'Re-run code (Test ID)' })).toHaveValue(
      'KR_01_R1',
    );
    expect(within(dialog).getByText('1 case will be copied into the re-run.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'NG (1)' }));
    expect(within(dialog).getByText('No case currently has these results.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create re-run' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Untested (1)' }));
    await user.click(within(dialog).getByRole('switch', { name: "Keep each case's assignee" }));
    await user.click(within(dialog).getByRole('button', { name: 'Create re-run' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/runs/21/rerun')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/runs/21/rerun')[0]!.body).toEqual({
      code: 'KR_01_R1',
      scenario: 'AP mode · iOS',
      statuses: ['blocked', 'untested'],
      copyEnvironment: true,
      testerId: 1,
      buildId: null,
      keepAssignees: false,
      refreshFromLibrary: false,
    });
  });

  it('lets a lead delete a run after confirmation', async () => {
    const api = stubRuns({ 'DELETE /projects/3/runs/21': undefined });
    const { user } = renderCard('lead');
    await openRunAction(user, 'Delete run');
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Its 10 cases and 9 recorded results are deleted with it.');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.find('DELETE', '/projects/3/runs/21')).toHaveLength(1));
  });

  it('locks the run actions of a completed plan', async () => {
    stubRuns();
    const { user } = renderCard('lead', makePlan({ status: 'completed' }));
    expect(await screen.findByRole('button', { name: 'New run' })).toBeDisabled();
    await user.click(await screen.findByRole('button', { name: 'Actions for run KR_01' }));
    expect(await screen.findByRole('menuitem', { name: 'Edit run…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Delete run' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Run report' })).toHaveAttribute(
      'href',
      '/projects/3/runs/21/report',
    );
    expect(
      screen.getByText('The plan is completed — reopen it to change runs'),
    ).toBeInTheDocument();
  });

  it('shows the actions viewers may use and an empty state', async () => {
    stubRuns({ 'GET /projects/3/plans/7/runs': [] });
    renderCard('viewer');
    expect(await screen.findByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New run' })).not.toBeInTheDocument();
  });
});
