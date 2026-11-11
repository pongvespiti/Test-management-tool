import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { mockRouter } from '@/test/mocks/next-navigation';
import { makeProject, renderWithProviders } from '@/test/render';
import { followUrl, member, mockApi, openUrl, paged, urlParams } from '../cases/test-utils';
import { makeDefect, makeDefectItem } from '../runs/test-fixtures';
import { DefectsPage } from './defects-page';

const jiraDefect = makeDefectItem({
  id: 13,
  key: 'BUG-13',
  title: 'App crashes on pairing',
  severity: 'critical',
  status: 'new',
  assignee: null,
  release: null,
  linkSummary: null,
  externalKey: 'TEAM-7',
  externalStatus: 'To Do',
});

function handlers(overrides: Record<string, unknown> = {}) {
  return {
    'GET /projects/3/defects': paged([makeDefectItem(), jiraDefect]),
    'GET /projects/3/integrations': {
      jira: { enabled: true, baseUrl: 'https://jira.example.com', projectKey: 'TEAM' },
    },
    'GET /projects/3/members': [member(1, 'Alice Tester', 'tester'), member(2, 'Bob Lead', 'lead')],
    'GET /projects/3/releases': [],
    'GET /projects/3/builds': [
      {
        id: 8,
        releaseId: 5,
        name: '1.1.7(2.0.0)',
        notes: null,
        builtDate: null,
        runCount: 0,
        defectCount: 0,
        createdAt: '',
        updatedAt: '',
      },
    ],
    ...overrides,
  };
}

function renderPage(role: 'lead' | 'tester' | 'viewer' = 'tester', overrides = {}) {
  const api = mockApi(handlers(overrides));
  const utils = renderWithProviders(<DefectsPage />, { project: makeProject({ myRole: role }) });
  const sync = () => {
    followUrl();
    utils.rerender(<DefectsPage />);
  };
  return { ...utils, api, sync };
}

const listCalls = (api: ReturnType<typeof mockApi>) =>
  api.find('GET', '/projects/3/defects').filter((c) => c.query.get('pageSize') === '50');

describe('DefectsPage', () => {
  beforeEach(() => openUrl('/projects/3/defects'));

  it('filters the defects by build', async () => {
    const { user } = renderPage();
    await screen.findByRole('row', { name: /BUG-12/ });
    await user.click(screen.getByRole('combobox', { name: 'Filter by build' }));
    await user.click(await screen.findByRole('option', { name: '1.1.7(2.0.0)' }));
    expect(urlParams().build).toBe('8');
  });

  it('sends the build of the URL with the list request and offers to clear the filters', async () => {
    openUrl('/projects/3/defects?build=8');
    const { api } = renderPage();
    await screen.findByRole('row', { name: /BUG-12/ });
    expect(listCalls(api)[0]!.query.get('buildId')).toBe('8');
    expect(screen.getByRole('combobox', { name: 'Filter by build' })).toHaveTextContent(
      '1.1.7(2.0.0)',
    );
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('lists the defects with Jira keys, the open count and links to the detail', async () => {
    const { user, api } = renderPage();
    const row = await screen.findByRole('row', { name: /BUG-12/ });
    expect(row).toHaveTextContent('Fan does not start');
    expect(row).toHaveTextContent('UOT-001 in KR_01');
    expect(row).toHaveTextContent('Bob Lead');
    expect(screen.getByRole('link', { name: 'BUG-12' })).toHaveAttribute(
      'href',
      '/projects/3/defects/12',
    );
    expect(screen.getByRole('link', { name: 'TEAM-7 (opens Jira in a new tab)' })).toHaveAttribute(
      'href',
      'https://jira.example.com/browse/TEAM-7',
    );
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('2 defects')).toBeInTheDocument();
    expect(screen.getByText(/ACS Smart control · 2 open/)).toBeInTheDocument();
    expect(Object.fromEntries(listCalls(api)[0]!.query)).toEqual({ page: '1', pageSize: '50' });
    const open = api
      .find('GET', '/projects/3/defects')
      .find((c) => c.query.get('pageSize') === '1')!;
    expect(open.query.get('status')).toBe('new,open,in_progress,reopened');
    await user.click(
      within(screen.getByRole('row', { name: /BUG-13/ })).getByText('App crashes on pairing'),
    );
    expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/defects/13');
  });

  it('sends the URL filters to the API and pages', async () => {
    openUrl('/projects/3/defects?status=open&severity=major&release=4&assignee=me&q=fan&page=2');
    const { user, api, sync } = renderPage('tester', {
      'GET /projects/3/defects': paged([makeDefectItem()], 120),
    });
    await screen.findByRole('row', { name: /BUG-12/ });
    expect(Object.fromEntries(listCalls(api)[0]!.query)).toEqual({
      status: 'open',
      severity: 'major',
      releaseId: '4',
      assigneeId: '1',
      q: 'fan',
      page: '2',
      pageSize: '50',
    });
    expect(screen.getByLabelText('Search defects')).toHaveValue('fan');
    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(urlParams().page).toBe('3');
    sync();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(urlParams()).toEqual({});
    sync();
    expect(screen.getByLabelText('Search defects')).toHaveValue('');
  });

  it('updates the URL from the search box and the filters', async () => {
    const { user, sync } = renderPage();
    await screen.findByRole('row', { name: /BUG-12/ });
    await user.type(screen.getByLabelText('Search defects'), 'pairing{Enter}');
    expect(urlParams().q).toBe('pairing');
    sync();
    await user.click(screen.getByRole('button', { name: 'Open defects only' }));
    expect(urlParams().status).toBe('new,open,in_progress,reopened');
    sync();
    expect(screen.getByRole('button', { name: 'Open defects only' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Open defects only' }));
    expect(urlParams().status).toBeUndefined();
    sync();
    await user.click(screen.getByRole('combobox', { name: 'Filter by severity' }));
    await user.click(await screen.findByRole('option', { name: 'Critical' }));
    await user.keyboard('{Escape}');
    expect(urlParams().severity).toBe('critical');
    sync();
    await user.click(screen.getByRole('combobox', { name: 'Filter by assignee' }));
    await user.click(await screen.findByRole('option', { name: 'Bob Lead' }));
    expect(urlParams().assignee).toBe('2');
    sync();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(urlParams().q).toBeUndefined();
  });

  it('creates a defect and opens it', async () => {
    const { user, api } = renderPage('tester', {
      'GET /projects/3/integrations': { jira: null },
      'POST /projects/3/defects': makeDefect({ id: 30, key: 'BUG-30' }),
    });
    await screen.findByRole('row', { name: /BUG-12/ });
    await user.click(screen.getByRole('button', { name: 'New defect' }));
    const dialog = await screen.findByRole('dialog', { name: 'New defect' });
    await user.click(within(dialog).getByRole('button', { name: 'Create defect' }));
    expect(await within(dialog).findByText('Required')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Title'), 'Timer resets');
    await user.type(within(dialog).getByLabelText('External key'), 'TEAM-9');
    await user.click(within(dialog).getByRole('combobox', { name: 'Severity' }));
    await user.click(await screen.findByRole('option', { name: 'Minor' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create defect' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/defects/30'));
    expect(api.find('POST', '/projects/3/defects')[0]!.body).toEqual({
      title: 'Timer resets',
      description: null,
      steps: null,
      expected: null,
      actual: null,
      severity: 'minor',
      priority: 'medium',
      assigneeId: null,
      releaseId: null,
      foundIn: null,
      fixedIn: null,
      foundInBuildId: null,
      fixedInBuildId: null,
      environment: null,
      externalKey: 'TEAM-9',
    });
  });

  it('hides creation from viewers and explains empty lists', async () => {
    renderPage('viewer', { 'GET /projects/3/defects': paged([]) });
    expect(await screen.findByText('No defects yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New defect' })).not.toBeInTheDocument();
  });

  it('explains a filtered empty list', async () => {
    openUrl('/projects/3/defects?q=zzz');
    renderPage('tester', { 'GET /projects/3/defects': paged([]) });
    expect(await screen.findByText('No defects match')).toBeInTheDocument();
  });
});
