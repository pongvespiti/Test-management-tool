import { describe, expect, it } from '@jest/globals';
import type { DefectDTO, ProjectRole } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { mockRouter, setNavigation } from '@/test/mocks/next-navigation';
import { makeProject, renderWithProviders } from '@/test/render';
import { apiError, member, mockApi, type ApiCall } from '../cases/test-utils';
import { makeAttachment, makeDefect, makeRun, makeRunCase } from '../runs/test-fixtures';
import { DefectDetailPage } from './defect-detail-page';

const linked = makeDefect({
  links: [
    {
      id: 41,
      runCaseId: 103,
      testCaseId: 9,
      runId: 7,
      runCode: 'KR_01',
      planId: 2,
      planDocNo: '26TR-TEAM-11-001',
      caseDisplayId: 'UOT-003',
      caseCode: '2-1',
      caseTitle: 'Wi-Fi pairing',
      resultStatus: 'ng',
    },
  ],
  attachments: [
    makeAttachment({
      id: 'a5',
      entityType: 'defect',
      entityId: 12,
      fileName: 'log.txt',
      mimeType: 'text/plain',
    }),
  ],
  updatedAt: '2026-11-02T02:00:00.000Z',
});
const JIRA = { jira: { enabled: true, baseUrl: 'https://jira.example.com', projectKey: 'TEAM' } };

function renderDetail(
  role: ProjectRole = 'tester',
  overrides: Record<string, unknown> = {},
  defect: DefectDTO = linked,
  defectId = '12',
) {
  setNavigation({
    pathname: `/projects/3/defects/${defectId}`,
    params: { projectId: '3', defectId },
  });
  const api = mockApi({
    'GET /projects/3/defects/12': defect,
    'GET /projects/3/integrations': { jira: null },
    'GET /projects/3/comments': [],
    'GET /projects/3/activity': [
      {
        id: 1,
        entityType: 'defect',
        entityId: 12,
        action: 'defect_created',
        summary: 'Created BUG-12',
        user: null,
        createdAt: '2026-11-01T02:00:00.000Z',
      },
    ],
    'GET /projects/3/members': [member(1, 'Alice Tester', 'tester'), member(2, 'Bob Lead', 'lead')],
    'GET /projects/3/releases': [],
    ...overrides,
  });
  return {
    api,
    ...renderWithProviders(<DefectDetailPage />, { project: makeProject({ myRole: role }) }),
  };
}

describe('DefectDetailPage', () => {
  it('shows the reproduction, links, evidence, details, comments and activity', async () => {
    const { user } = renderDetail();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Fan does not start' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reported by Alice Tester/)).toHaveTextContent('updated');
    const repro = screen.getByRole('region', { name: 'Reproduction' });
    expect(repro).toHaveTextContent('Nothing happens');
    const links = screen.getByRole('region', { name: 'Linked results (1)' });
    expect(within(links).getByRole('link', { name: 'UOT-003 Wi-Fi pairing' })).toHaveAttribute(
      'href',
      '/projects/3/runs/7?case=103',
    );
    expect(within(links).getByRole('link', { name: '26TR-TEAM-11-001' })).toHaveAttribute(
      'href',
      '/projects/3/plans/2',
    );
    expect(screen.getByRole('region', { name: 'Evidence (1)' })).toHaveTextContent('log.txt');
    const details = screen.getByRole('region', { name: 'Details' });
    expect(details).toHaveTextContent('FW 2.4.0');
    expect(details).toHaveTextContent('Router: ASUS AX');
    expect(screen.getByRole('textbox', { name: 'Add a comment' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(await screen.findByText('Created BUG-12')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Jira' })).not.toBeInTheDocument();
  });

  it('edits the defect', async () => {
    const { user, api } = renderDetail('tester', {
      'PATCH /projects/3/defects/12': (c: ApiCall) => ({ ...linked, ...(c.body as object) }),
    });
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit BUG-12' });
    const title = within(dialog).getByLabelText('Title');
    expect(title).toHaveValue('Fan does not start');
    await user.clear(title);
    await user.type(title, 'Fan stays off');
    await user.clear(within(dialog).getByLabelText('Fixed in'));
    await user.type(within(dialog).getByLabelText('Fixed in'), 'FW 2.4.1');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/defects/12')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/defects/12')[0]!.body).toMatchObject({
      title: 'Fan stays off',
      fixedIn: 'FW 2.4.1',
      severity: 'major',
      assigneeId: 2,
      releaseId: 4,
      externalKey: null,
    });
  });

  it('lets a lead delete the defect after confirming', async () => {
    const { user, api } = renderDetail('lead', { 'DELETE /projects/3/defects/12': undefined });
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Delete defect BUG-12?');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/defects'));
    expect(api.find('DELETE', '/projects/3/defects/12')).toHaveLength(1);
  });

  it('moves the defect through the workflow with a comment', async () => {
    const { user, api } = renderDetail('tester', {
      'POST /projects/3/defects/12/transition': makeDefect({
        status: 'resolved',
        allowedTransitions: ['closed', 'reopened'],
      }),
    });
    const workflow = await screen.findByRole('region', { name: 'Workflow' });
    const path = within(workflow).getByRole('list', { name: 'Workflow' });
    expect(path).toHaveTextContent('New (done)2Open3In progress4Resolved5Closed');
    expect(within(path).getByText('Open').closest('li')).toHaveAttribute('aria-current', 'step');
    const buttons = within(workflow)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(buttons).toEqual(['Start progress', 'Mark resolved', 'Reject']);
    await user.click(within(workflow).getByRole('button', { name: 'Mark resolved' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark resolved — BUG-12 → Resolved' });
    await user.type(within(dialog).getByLabelText('Comment (optional)'), 'Fixed in 2.4.1');
    await user.click(within(dialog).getByRole('button', { name: 'Mark resolved' }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/defects/12/transition')[0]?.body).toEqual({
        to: 'resolved',
        comment: 'Fixed in 2.4.1',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('reloads the defect when someone else changed its status', async () => {
    const { user, api } = renderDetail('tester', {
      'POST /projects/3/defects/12/transition': apiError(
        409,
        'DEFECT_CHANGED',
        'Changed meanwhile',
      ),
    });
    const workflow = await screen.findByRole('region', { name: 'Workflow' });
    await user.click(within(workflow).getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(api.find('GET', '/projects/3/defects/12').length).toBeGreaterThan(1),
    );
  });

  it('links a test result and removes a link', async () => {
    const { user, api } = renderDetail('tester', {
      'GET /projects/3/plans': [{ id: 2, docNo: '26TR-TEAM-11-001', title: 'FW 2.4 regression' }],
      'GET /projects/3/plans/2/runs': [makeRun()],
      'GET /projects/3/runs/7/cases': [
        makeRunCase({ id: 103, displayId: 'UOT-003' }),
        makeRunCase({ id: 104, displayId: 'UOT-004', title: 'Timer schedule', status: 'ng' }),
      ],
      'POST /projects/3/defects/12/links': linked,
      'DELETE /projects/3/defects/12/links/41': undefined,
    });
    const links = await screen.findByRole('region', { name: 'Linked results (1)' });
    await user.click(within(links).getByRole('button', { name: 'Link to a test result' }));
    const dialog = await screen.findByRole('dialog', { name: 'Link to a test result' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Run' }));
    await user.click(await screen.findByRole('option', { name: 'KR_01 — Korea model' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Run case' }));
    expect(screen.queryByRole('option', { name: /UOT-003/ })).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole('option', { name: 'UOT-004 · 1-1 — Timer schedule [NG]' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Link' }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/defects/12/links')[0]?.body).toEqual({ runCaseId: 104 }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(within(links).getByRole('button', { name: 'Remove link to UOT-003' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('BUG-12 will no longer be linked to UOT-003 in run KR_01.');
    await user.click(within(confirm).getByRole('button', { name: 'Remove link' }));
    await waitFor(() =>
      expect(api.find('DELETE', '/projects/3/defects/12/links/41')).toHaveLength(1),
    );
  });

  it('creates, links, syncs and unlinks Jira issues', async () => {
    const withKey = makeDefect({ externalKey: 'TEAM-5', externalStatus: 'To Do' });
    let current: DefectDTO = makeDefect();
    const { user, api } = renderDetail('tester', {
      'GET /projects/3/integrations': JIRA,
      'GET /projects/3/defects/12': () => current,
      'POST /projects/3/defects/12/jira': apiError(502, 'JIRA_ERROR', 'Jira refused the issue', {
        messages: ['Priority is invalid'],
      }),
      'POST /projects/3/defects/12/jira/link': (c: ApiCall) => {
        if ((c.body as { key: string }).key === 'TEAM-404')
          return apiError(422, 'JIRA_ISSUE_NOT_FOUND', 'TEAM-404 does not exist');
        current = withKey;
        return withKey;
      },
    });
    const panel = await screen.findByRole('region', { name: 'Jira' });
    expect(panel).toHaveTextContent('Not linked to a Jira issue (TEAM).');
    await user.click(within(panel).getByRole('button', { name: 'Create Jira issue' }));
    expect(await within(panel).findByText('Jira action failed')).toBeInTheDocument();
    expect(panel).toHaveTextContent('Priority is invalid');
    await user.click(within(panel).getByRole('button', { name: 'Dismiss' }));
    const key = within(panel).getByLabelText('Existing Jira issue key');
    await user.type(key, 'bad key{Enter}');
    expect(within(panel).getByText('Jira issue key, e.g. TEAM-123')).toBeInTheDocument();
    await user.clear(key);
    await user.type(key, 'team-404');
    await user.click(within(panel).getByRole('button', { name: 'Link existing' }));
    expect(await within(panel).findByText('TEAM-404 does not exist')).toBeInTheDocument();
    await user.clear(key);
    await user.type(key, 'team-5');
    await user.click(within(panel).getByRole('button', { name: 'Link existing' }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/defects/12/jira/link')).toHaveLength(2),
    );
    expect(api.find('POST', '/projects/3/defects/12/jira/link')[1]!.body).toEqual({
      key: 'TEAM-5',
    });
    expect(
      await within(panel).findByRole('link', { name: 'TEAM-5 (opens Jira in a new tab)' }),
    ).toHaveAttribute('href', 'https://jira.example.com/browse/TEAM-5');
  });

  it('syncs and unlinks a linked Jira issue', async () => {
    const withKey = makeDefect({
      externalKey: 'TEAM-5',
      externalStatus: 'To Do',
      externalUrl: 'https://jira.example.com/browse/TEAM-5',
      externalSyncedAt: '2026-11-01T02:00:00.000Z',
    });
    const { user, api } = renderDetail(
      'tester',
      {
        'GET /projects/3/integrations': JIRA,
        'POST /projects/3/defects/12/jira/sync': { ...withKey, externalStatus: 'Done' },
        'DELETE /projects/3/defects/12/jira': makeDefect(),
      },
      withKey,
    );
    const panel = await screen.findByRole('region', { name: 'Jira' });
    expect(panel).toHaveTextContent(/Status synced/);
    await user.click(within(panel).getByRole('button', { name: 'Sync status' }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/defects/12/jira/sync')).toHaveLength(1),
    );
    await user.click(within(panel).getByRole('button', { name: 'Unlink' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Unlink TEAM-5?');
    await user.click(within(confirm).getByRole('button', { name: 'Unlink' }));
    await waitFor(() => expect(api.find('DELETE', '/projects/3/defects/12/jira')).toHaveLength(1));
  });

  it('hides editing from viewers and shows a manual external key', async () => {
    renderDetail('viewer', {}, makeDefect({ externalKey: 'OTHER-1', externalUrl: null }));
    expect(await screen.findByRole('region', { name: 'External issue' })).toHaveTextContent(
      'OTHER-1',
    );
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start progress' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link to a test result' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload files' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Add a comment' })).not.toBeInTheDocument();
  });

  it('explains invalid and missing defects', async () => {
    const first = renderDetail('tester', {}, linked, 'abc');
    expect(await screen.findByText('This defect address is not valid.')).toBeInTheDocument();
    first.unmount();
    renderDetail('tester', {
      'GET /projects/3/defects/12': apiError(404, 'NOT_FOUND', 'No such defect'),
    });
    expect(await screen.findByText('No such defect')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to defects' })).toHaveAttribute(
      'href',
      '/projects/3/defects',
    );
  });
});
