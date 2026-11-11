import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { PlanDTO, ProjectRole } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { apiError, mockApi, userRef, type ApiCall } from '@/features/cases/test-utils';
import { mockRouter, setNavigation } from '@/test/mocks/next-navigation';
import { makeProject, renderWithProviders } from '@/test/render';
import { MATRIX_GROUP_KEY } from './plan-matrix-card';
import { PlanDetailPage } from './plan-detail-page';
import { makeMatrix, makePlan, makeRun, makeTemplate } from './test-fixtures';

const completed = (overrides: Partial<PlanDTO> = {}) =>
  makePlan({
    status: 'completed',
    completedAt: '2026-10-06T09:30:00.000Z',
    completedBy: userRef(2, 'Lena Lead'),
    ...overrides,
  });

function stubPlan(plan: PlanDTO = makePlan(), extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /projects/3/plans/7': plan,
    'GET /projects/3/plans/7/runs': [makeRun()],
    'GET /projects/3/plans/7/matrix': (c: ApiCall) =>
      c.query.get('groupBy') === 'section'
        ? makeMatrix({ groupBy: 'section', groups: ['Power', 'Timer', 'Wi-Fi'] })
        : makeMatrix(),
    ...extra,
  });
}

const as = (role: ProjectRole) => ({ project: makeProject({ myRole: role }) });

describe('PlanDetailPage', () => {
  beforeEach(() => setNavigation({ pathname: '/projects/3/plans/7', params: { planId: '7' } }));

  it('shows the plan with its overview, judgement, runs and matrix', async () => {
    stubPlan();
    renderWithProviders(<PlanDetailPage />, as('tester'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Unit operation test — ACU18' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Doc no. 26TR-TEAM-10-001')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Release FW 2.4.0 · Suite: Unit operation test · Created Oct 1, 2026 by Alice Tester',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'FW 2.4.0' })).toHaveAttribute(
      'href',
      '/projects/3?release=5',
    );
    expect(screen.getByText('To confirm the unit operation')).toBeInTheDocument();
    expect(screen.getByText('N:\\TEAM\\raw')).toBeInTheDocument();
    expect(
      screen.getByText(/8 OK, 1 NG, 0 blocked, 1 untested across 1 run\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/After the plan is completed: export the report/)).toBeInTheDocument();

    const run = await screen.findByRole('link', { name: 'KR_01' });
    expect(run).toHaveAttribute('href', '/projects/3/runs/21');
    const row = run.closest('tr')!;
    expect(row).toHaveTextContent('ACU18 · 3.12.119');
    expect(row).toHaveTextContent('+1 more');
    expect(row).toHaveTextContent('88.9%');

    const matrix = screen.getByRole('region', { name: 'Summary matrix' });
    expect(await within(matrix).findByText('Pass')).toBeInTheDocument();
    expect(within(matrix).getByText('NG')).toBeInTheDocument();
    expect(within(matrix).getByRole('columnheader', { name: 'Timer' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Export report' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Complete & lock results' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More plan actions' })).not.toBeInTheDocument();
  });

  it('completes the plan after a confirmation that names what is missing', async () => {
    const api = stubPlan(makePlan(), { 'POST /projects/3/plans/7/complete': completed() });
    const { user } = renderWithProviders(<PlanDetailPage />, as('tester'));
    await user.click(await screen.findByRole('button', { name: 'Complete & lock results' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Complete the plan and lock its results?');
    expect(confirm).toHaveTextContent('1 run case is still untested.');
    expect(confirm).toHaveTextContent('No overall judgement is set (suggested: NOT PASS).');
    expect(confirm).toHaveTextContent('— only a lead can reopen it');
    await user.click(within(confirm).getByRole('button', { name: 'Complete & lock' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/plans/7/complete')).toHaveLength(1));
  });

  it('lets a lead reopen a completed plan, which stays locked until then', async () => {
    const api = stubPlan(completed(), { 'POST /projects/3/plans/7/reopen': makePlan() });
    const { user } = renderWithProviders(<PlanDetailPage />, as('lead'));
    expect(await screen.findByText('Completed — results are locked')).toBeInTheDocument();
    expect(screen.getByText(/Completed Oct 6, 2026 .* by Lena Lead/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Complete & lock results' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Overall judgement' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More plan actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Delete plan' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText('Reopen the plan to delete it.')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Reopen' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/plans/7/reopen')).toHaveLength(1));
  });

  it('deletes an open plan after confirmation and goes back to the list', async () => {
    const api = stubPlan(makePlan(), { 'DELETE /projects/3/plans/7': undefined });
    const { user } = renderWithProviders(<PlanDetailPage />, as('lead'));
    await user.click(await screen.findByRole('button', { name: 'More plan actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete plan' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Delete test plan 26TR-TEAM-10-001?');
    expect(confirm).toHaveTextContent('Its 1 run and 10 results are deleted too.');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/plans'));
    expect(api.find('DELETE', '/projects/3/plans/7')).toHaveLength(1);
  });

  it('is read-only for viewers', async () => {
    stubPlan(makePlan({ judgementNote: null }));
    renderWithProviders(<PlanDetailPage />, as('viewer'));
    await screen.findByRole('heading', { level: 1, name: 'Unit operation test — ACU18' });
    expect(screen.getByRole('button', { name: 'Export report' })).toBeInTheDocument();
    for (const name of ['Edit', 'Complete & lock results', 'More plan actions', 'New run'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit test overview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Overall judgement' })).not.toBeInTheDocument();
    expect(screen.getByText('No explanation')).toBeInTheDocument();
  });

  it('saves the overall judgement with its explanation', async () => {
    const api = stubPlan(makePlan(), {
      'PATCH /projects/3/plans/7': makePlan({ overallJudgement: 'pass' }),
    });
    const { user } = renderWithProviders(<PlanDetailPage />, as('tester'));
    const group = await screen.findByRole('group', { name: 'Overall judgement' });
    await user.click(screen.getByRole('button', { name: 'Use suggestion' }));
    expect(within(group).getByRole('button', { name: 'NOT PASS' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(group).getByRole('button', { name: 'PASS' }));
    expect(within(group).getByRole('button', { name: 'PASS' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Judgement explanation' }),
      'Agreed with QA lead',
    );
    await user.click(screen.getByRole('button', { name: 'Save judgement' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/plans/7')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/plans/7')[0]!.body).toEqual({
      overallJudgement: 'pass',
      judgementNote: 'Agreed with QA lead',
    });
  });

  it('edits the test overview in place', async () => {
    const api = stubPlan(makePlan(), { 'PATCH /projects/3/plans/7': makePlan() });
    const { user } = renderWithProviders(<PlanDetailPage />, as('tester'));
    await user.click(await screen.findByRole('button', { name: 'Edit test overview' }));
    const purpose = screen.getByRole('textbox', { name: 'Purpose' });
    await user.clear(purpose);
    await user.type(purpose, 'New purpose');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/plans/7')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/plans/7')[0]!.body).toEqual({
      purpose: 'New purpose',
      testMethod: null,
      judgementCriteria: null,
      rawDataPath: 'N:\\TEAM\\raw',
    });
    expect(await screen.findByRole('button', { name: 'Edit test overview' })).toBeInTheDocument();
  });

  it('edits the plan header fields in a dialog', async () => {
    const api = stubPlan(makePlan(), {
      'GET /projects/3/releases': [],
      'GET /projects/3/templates': [makeTemplate()],
      'PATCH /projects/3/plans/7': makePlan({ title: 'Renamed' }),
    });
    const { user } = renderWithProviders(<PlanDetailPage />, as('tester'));
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit 26TR-TEAM-10-001' });
    const title = within(dialog).getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Renamed');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/plans/7')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/plans/7')[0]!.body).toMatchObject({
      docNo: '26TR-TEAM-10-001',
      title: 'Renamed',
      releaseId: 5,
      templateId: null,
    });
  });

  it('attaches, downloads and removes the signed copy of a completed plan', async () => {
    const signedCopy = {
      id: 'abc',
      entityType: 'plan' as const,
      entityId: 7,
      fileName: 'signed.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      createdBy: userRef(1, 'Alice Tester'),
      createdAt: '2026-10-07T10:00:00.000Z',
      url: '/api/v1/projects/3/attachments/abc/download',
    };
    let plan = completed();
    const api = mockApi({
      'GET /projects/3/plans/7': () => plan,
      'GET /projects/3/plans/7/runs': [makeRun({ planStatus: 'completed' })],
      'GET /projects/3/plans/7/matrix': makeMatrix(),
      'PUT /projects/3/plans/7/signed-copy': () => {
        plan = completed({ signedCopy });
        return signedCopy;
      },
      'DELETE /projects/3/plans/7/signed-copy': () => {
        plan = completed();
        return undefined;
      },
    });
    const { user } = renderWithProviders(<PlanDetailPage />, as('tester'));
    await screen.findByRole('button', { name: 'Attach scanned signed report' });
    const file = new File(['%PDF'], 'signed.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Signed copy file'), file);
    await waitFor(() => expect(api.find('PUT', '/projects/3/plans/7/signed-copy')).toHaveLength(1));

    expect(await screen.findByRole('link', { name: 'signed.pdf' })).toHaveAttribute(
      'href',
      '/api/v1/projects/3/attachments/abc/download',
    );
    expect(screen.getByRole('link', { name: 'Download signed.pdf' })).toHaveAttribute(
      'href',
      '/api/v1/projects/3/attachments/abc/download?download=1',
    );
    expect(screen.getByText(/2\.0 KB · Alice Tester/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove signed.pdf' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('signed.pdf is deleted from this plan.');
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(api.find('DELETE', '/projects/3/plans/7/signed-copy')).toHaveLength(1),
    );
    expect(
      await screen.findByRole('button', { name: 'Attach scanned signed report' }),
    ).toBeInTheDocument();
  });

  describe('export', () => {
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    beforeEach(() => {
      URL.createObjectURL = jest.fn(() => 'blob:report');
      URL.revokeObjectURL = jest.fn();
      jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });
    afterEach(() => {
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
    });

    const templates = [
      makeTemplate(),
      makeTemplate({ id: 4, name: 'Default form', builtIn: false, isDefault: true }),
      makeTemplate({
        id: 6,
        name: 'Customer form',
        builtIn: false,
        description: 'For the customer',
        fileName: 'customer.xlsx',
      }),
    ];

    it('downloads the report with the chosen template', async () => {
      const api = stubPlan(makePlan(), {
        'GET /projects/3/templates': templates,
        'GET /projects/3/plans/7/export.xlsx': () =>
          new Response('xlsx', {
            headers: { 'content-disposition': 'attachment; filename="report.xlsx"' },
          }),
      });
      const { user } = renderWithProviders(<PlanDetailPage />, as('viewer'));
      await user.click(await screen.findByRole('button', { name: 'Export report' }));
      const dialog = await screen.findByRole('dialog', { name: 'Export test report' });
      expect(await within(dialog).findByRole('radio', { name: /Default form/ })).toBeChecked();
      expect(within(dialog).getByRole('link', { name: 'Manage templates' })).toHaveAttribute(
        'href',
        '/projects/3/settings/templates',
      );
      await user.click(within(dialog).getByRole('radio', { name: /Customer form/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Download .xlsx' }));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Export test report' }),
        ).not.toBeInTheDocument(),
      );
      const call = api.find('GET', '/projects/3/plans/7/export.xlsx')[0]!;
      expect(call.query.get('templateId')).toBe('6');
      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('explains a failed export in the dialog', async () => {
      stubPlan(makePlan(), {
        'GET /projects/3/templates': templates,
        'GET /projects/3/plans/7/export.xlsx': apiError(
          422,
          'TEMPLATE_INVALID',
          'The template has no summary sheet.',
        ),
      });
      const { user } = renderWithProviders(<PlanDetailPage />, as('viewer'));
      await user.click(await screen.findByRole('button', { name: 'Export report' }));
      const dialog = await screen.findByRole('dialog', { name: 'Export test report' });
      await within(dialog).findByRole('radio', { name: /Default form/ });
      await user.click(within(dialog).getByRole('button', { name: 'Download .xlsx' }));
      expect(
        await within(dialog).findByText('The report could not be created'),
      ).toBeInTheDocument();
      expect(within(dialog).getByText('The template has no summary sheet.')).toBeInTheDocument();
    });
  });

  it('groups the summary matrix and remembers the choice', async () => {
    const api = stubPlan();
    const { user } = renderWithProviders(<PlanDetailPage />, as('viewer'));
    const matrix = await screen.findByRole('region', { name: 'Summary matrix' });
    await within(matrix).findByText('Pass');
    await user.click(within(matrix).getByRole('combobox', { name: 'Group results by' }));
    await user.click(await screen.findByRole('option', { name: 'Section' }));
    expect(await within(matrix).findByRole('columnheader', { name: 'Wi-Fi' })).toBeInTheDocument();
    expect(
      api.find('GET', '/projects/3/plans/7/matrix').map((c) => c.query.get('groupBy')),
    ).toEqual(['summary', 'section']);
    expect(window.localStorage.getItem(MATRIX_GROUP_KEY)).toBe('section');
  });

  it('says when the plan does not exist', async () => {
    mockApi({ 'GET /projects/3/plans/7': apiError(404, 'PLAN_NOT_FOUND', 'Not found') });
    renderWithProviders(<PlanDetailPage />, as('viewer'));
    expect(await screen.findByText('Test plan not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to test plans' })).toHaveAttribute(
      'href',
      '/projects/3/plans',
    );
  });
});
