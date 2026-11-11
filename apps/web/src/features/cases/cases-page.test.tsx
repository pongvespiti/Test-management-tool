import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import { CasesPage } from './cases-page';
import {
  apiError,
  followUrl,
  makeCase,
  makeSection,
  makeSuite,
  makeTree,
  mockApi,
  openUrl,
  paged,
  urlParams,
} from './test-utils';

const suite = makeSuite({
  fieldDefs: [{ key: 'test_id', label: 'Test ID', type: 'text', showInTable: true }],
});
const first = makeCase({ custom: { test_id: 'T-1' } });
const second = makeCase({ id: 10, displayId: 'UOT-002', title: 'Fan speed', code: null, tags: [] });

function handlers(overrides: Record<string, unknown> = {}) {
  return {
    'GET /projects/3/suites': [suite],
    'GET /projects/3/suites/1/sections': makeTree(),
    'GET /projects/3/suites/1/cases': paged([first, second]),
    'GET /projects/3/tags': [{ tag: 'smoke', count: 4 }],
    'GET /projects/3/cases/9': first,
    'GET /projects/3/comments': [],
    'GET /projects/3/members': [],
    ...overrides,
  };
}

const lead = { project: makeProject() };

describe('CasesPage', () => {
  beforeEach(() => openUrl('/projects/3/cases'));

  it('lists the cases of the first suite with the section tree and custom columns', async () => {
    const api = mockApi(handlers());
    renderWithProviders(<CasesPage />, lead);
    const row = await screen.findByRole('row', { name: 'UOT-001 Power on the unit' });
    expect(within(row).getByText('T-1')).toBeInTheDocument();
    expect(within(row).getByText('1-1')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Test ID' })).toBeInTheDocument();
    expect(screen.getByText('2 cases')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All cases 2' })).toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Power 1' })).toBeInTheDocument();
    const list = api.find('GET', '/projects/3/suites/1/cases')[0]!;
    expect(Object.fromEntries(list.query)).toEqual({ page: '1', pageSize: '50' });
  });

  it('hides the editing actions from viewers', async () => {
    mockApi(handlers());
    renderWithProviders(<CasesPage />, { project: makeProject({ myRole: 'viewer' }) });
    await screen.findByRole('row', { name: /UOT-001/ });
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New case' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Import from Excel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New section' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select UOT-001' })).not.toBeInTheDocument();
  });

  it('links the import with the current suite', async () => {
    mockApi(handlers());
    renderWithProviders(<CasesPage />, lead);
    expect(await screen.findByRole('link', { name: 'Import from Excel' })).toHaveAttribute(
      'href',
      '/projects/3/import?suite=1',
    );
  });

  it('reads the filters from the URL and writes changes back', async () => {
    openUrl(
      '/projects/3/cases?suite=1&q=power&status=draft&priority=critical,high&tag=smoke&page=2',
    );
    const api = mockApi(handlers({ 'GET /projects/3/suites/1/cases': paged([first], 120) }));
    const { user, rerender } = renderWithProviders(<CasesPage />, lead);
    await screen.findByRole('row', { name: /UOT-001/ });
    expect(Object.fromEntries(api.find('GET', '/projects/3/suites/1/cases')[0]!.query)).toEqual({
      q: 'power',
      status: 'draft',
      priority: 'critical,high',
      tag: 'smoke',
      page: '2',
      pageSize: '50',
    });
    expect(screen.getByText('51–100 of 120')).toBeInTheDocument();
    expect(screen.getByLabelText('Search cases in this suite')).toHaveValue('power');
    expect(screen.getByRole('combobox', { name: 'Filter by tag' })).toHaveTextContent('smoke');

    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(urlParams().page).toBe('3');

    await user.click(screen.getByRole('button', { name: 'Power 1' }));
    expect(urlParams()).toMatchObject({ section: '11', q: 'power' });
    expect(urlParams().page).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(urlParams()).toEqual({ suite: '1', section: '11' });

    followUrl();
    rerender(<CasesPage />);
    await waitFor(() =>
      expect(
        api
          .find('GET', '/projects/3/suites/1/cases')
          .some((c) => c.query.get('sectionId') === '11' && !c.query.has('q')),
      ).toBe(true),
    );
  });

  it('filters by type, priority and the unsectioned cases', async () => {
    mockApi(handlers());
    const { user, rerender } = renderWithProviders(<CasesPage />, lead);
    await screen.findByRole('row', { name: /UOT-001/ });
    await user.click(screen.getByRole('combobox', { name: 'Filter by type' }));
    await user.click(await screen.findByRole('option', { name: 'Abnormal' }));
    expect(urlParams().type).toBe('Abnormal');
    await user.click(screen.getByRole('button', { name: 'Filter by priority' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Low' }));
    expect(urlParams().priority).toBe('low');
    followUrl();
    rerender(<CasesPage />);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Critical' }));
    expect(urlParams().priority).toBe('critical,low');
    followUrl();
    rerender(<CasesPage />);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Low' }));
    expect(urlParams().priority).toBe('critical');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Unsectioned 1' }));
    expect(urlParams().section).toBe('none');
  });

  it('searches after typing and at once on Enter', async () => {
    mockApi(handlers());
    const { user } = renderWithProviders(<CasesPage />, lead);
    await screen.findByRole('row', { name: /UOT-001/ });
    await user.type(screen.getByLabelText('Search cases in this suite'), 'fan{Enter}');
    expect(urlParams().q).toBe('fan');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(urlParams().q).toBeUndefined();
  });

  it('opens a case in the drawer (new history entry) and closes it', async () => {
    mockApi(handlers());
    const { user, rerender } = renderWithProviders(<CasesPage />, lead);
    const length = window.history.length;
    await user.click(await screen.findByRole('row', { name: /UOT-001/ }));
    expect(urlParams()).toEqual({ case: '9' });
    expect(window.history.length).toBe(length + 1);
    followUrl();
    rerender(<CasesPage />);
    const drawer = await screen.findByRole('dialog', { name: 'Test case' });
    expect(
      await within(drawer).findByRole('heading', { name: 'Power on the unit' }),
    ).toBeInTheDocument();
    expect(within(drawer).getByText('Unit is installed')).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Close' }));
    expect(urlParams()).toEqual({});
  });

  it('switches to the suite of a case linked from elsewhere', async () => {
    openUrl('/projects/3/cases?case=20');
    mockApi(
      handlers({
        'GET /projects/3/suites': [suite, makeSuite({ id: 2, name: 'Modbus', prefix: 'MB' })],
        'GET /projects/3/cases/20': makeCase({ id: 20, suiteId: 2, displayId: 'MB-001' }),
        'GET /projects/3/suites/2/sections': makeTree([], { suiteId: 2 }),
        'GET /projects/3/suites/2/cases': paged([]),
      }),
    );
    renderWithProviders(<CasesPage />, lead);
    await waitFor(() => expect(urlParams()).toEqual({ case: '20', suite: '2' }));
  });

  it('invites to import or create a suite when the project has none', async () => {
    mockApi(handlers({ 'GET /projects/3/suites': [] }));
    renderWithProviders(<CasesPage />, lead);
    expect(await screen.findByText('No test suites yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Import from Excel' })).toHaveAttribute(
      'href',
      '/projects/3/import',
    );
    expect(screen.getByRole('link', { name: 'Create a suite' })).toHaveAttribute(
      'href',
      '/projects/3/settings/suites',
    );
  });

  it('shows an empty filtered list and a failed list with retry', async () => {
    openUrl('/projects/3/cases?q=zzz');
    let fail = false;
    mockApi(
      handlers({
        'GET /projects/3/suites/1/cases': () =>
          fail ? apiError(500, 'BOOM', 'Server down') : paged([]),
      }),
    );
    const { user } = renderWithProviders(<CasesPage />, lead);
    expect(await screen.findByText('No test cases match')).toBeInTheDocument();
    fail = true;
    await user.click(screen.getByRole('combobox', { name: 'Filter by status' }));
    await user.click(await screen.findByRole('option', { name: 'Draft' }));
    expect(urlParams().status).toBe('draft');
  });

  it('runs a bulk action on the selected cases', async () => {
    const api = mockApi(handlers({ 'POST /projects/3/suites/1/cases/bulk': { affected: 1 } }));
    const { user } = renderWithProviders(<CasesPage />, lead);
    await user.click(await screen.findByRole('checkbox', { name: 'Select UOT-001' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select UOT-002' }));
    expect(screen.getByText('2 cases selected')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select all cases on this page' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Priority' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Critical' }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/suites/1/cases/bulk')).toHaveLength(1),
    );
    expect(api.find('POST', '/projects/3/suites/1/cases/bulk')[0]!.body).toEqual({
      ids: [9, 10],
      action: 'setPriority',
      priority: 'critical',
    });
    await waitFor(() => expect(screen.queryByText('2 cases selected')).not.toBeInTheDocument());
  });

  it('moves, tags, submits and deletes the selection', async () => {
    const api = mockApi(
      handlers({
        'POST /projects/3/suites/1/cases/bulk': { affected: 2 },
        'GET /projects/3/members': [
          { user: { id: 2, username: 'bob', displayName: 'Bob Lead' }, role: 'lead' },
        ],
      }),
    );
    const bodies = () => api.find('POST', '/projects/3/suites/1/cases/bulk').map((c) => c.body);
    const { user } = renderWithProviders(<CasesPage />, lead);
    const selectAll = async () =>
      user.click(await screen.findByRole('checkbox', { name: 'Select all cases on this page' }));

    await selectAll();
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await user.click(await screen.findByRole('option', { name: 'Power' }));
    await user.click(screen.getByRole('button', { name: 'Move 2 cases' }));
    await waitFor(() => expect(bodies()).toHaveLength(1));
    expect(bodies()[0]).toEqual({ ids: [9, 10], action: 'move', sectionId: 11 });

    await selectAll();
    await user.click(screen.getByRole('button', { name: 'Tags' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Add tags…' }));
    const tagsDialog = await screen.findByRole('dialog', { name: 'Add tags to 2 cases' });
    await user.type(within(tagsDialog).getByLabelText('Tags'), 'wifi,');
    await user.click(within(tagsDialog).getByRole('button', { name: 'Add tags' }));
    await waitFor(() => expect(bodies()).toHaveLength(2));
    expect(bodies()[1]).toEqual({ ids: [9, 10], action: 'addTags', tags: ['wifi'] });

    await selectAll();
    await user.click(screen.getByRole('button', { name: 'Review' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Submit for review…' }));
    const review = await screen.findByRole('dialog', { name: 'Submit 2 cases for review' });
    await user.click(within(review).getByRole('combobox', { name: 'Reviewer' }));
    await user.click(await screen.findByRole('option', { name: 'Bob Lead' }));
    await user.click(within(review).getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(bodies()).toHaveLength(3));
    expect(bodies()[2]).toEqual({ ids: [9, 10], action: 'submitReview', reviewerId: 2 });

    await selectAll();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete 2 cases?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(bodies()).toHaveLength(4));
    expect(bodies()[3]).toEqual({ ids: [9, 10], action: 'delete' });
  });

  it('keeps Ready and deletion away from testers under review rules', async () => {
    mockApi(handlers());
    const { user } = renderWithProviders(<CasesPage />, {
      project: makeProject({ myRole: 'tester', requireCaseReview: true }),
    });
    await user.click(await screen.findByRole('checkbox', { name: 'Select UOT-001' }));
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Status' }));
    expect(await screen.findByRole('menuitem', { name: 'Ready' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText(/Ready needs a lead’s approval/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.queryByRole('menuitem', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('creates a section and selects it', async () => {
    const api = mockApi(
      handlers({ 'POST /projects/3/suites/1/sections': makeSection({ id: 12, name: 'Network' }) }),
    );
    const { user } = renderWithProviders(<CasesPage />, lead);
    await user.click(await screen.findByRole('button', { name: 'New section' }));
    const dialog = await screen.findByRole('dialog', { name: 'New section' });
    await user.type(within(dialog).getByLabelText('Name'), 'Network');
    await user.click(within(dialog).getByRole('button', { name: 'Create section' }));
    await waitFor(() => expect(urlParams().section).toBe('12'));
    expect(api.find('POST', '/projects/3/suites/1/sections')[0]!.body).toEqual({
      name: 'Network',
      code: null,
      parentId: null,
    });
  });

  it('renames a section under another parent and deletes one with its content moved up', async () => {
    const child = makeSection({ id: 13, parentId: 11, name: 'Standby' });
    const tree = makeTree([
      makeSection({ children: [child], totalCount: 3 }),
      makeSection({ id: 14, name: 'Network', totalCount: 0, caseCount: 0 }),
    ]);
    const api = mockApi(
      handlers({
        'GET /projects/3/suites/1/sections': tree,
        'PATCH /projects/3/sections/13': { ...child, parentId: 14 },
        'DELETE /projects/3/sections/11': undefined,
      }),
    );
    const { user } = renderWithProviders(<CasesPage />, lead);
    await user.click(await screen.findByRole('button', { name: 'Actions for section Standby' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename or move' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit section' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Standby');
    await user.click(within(dialog).getByRole('combobox', { name: 'Parent section' }));
    expect(screen.queryByRole('option', { name: 'Standby' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Network' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/sections/13')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/sections/13')[0]!.body).toEqual({
      name: 'Standby',
      code: null,
      parentId: 14,
    });

    await user.click(screen.getByRole('button', { name: 'Actions for section Power' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete section' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete section “Power”?' });
    expect(confirm).toHaveTextContent(
      'Its 3 test cases and 1 sub-section move to the top level. No test case is deleted.',
    );
    await user.click(within(confirm).getByRole('button', { name: 'Delete section' }));
    await waitFor(() => expect(api.find('DELETE', '/projects/3/sections/11')).toHaveLength(1));
    expect(api.find('DELETE', '/projects/3/sections/11')[0]!.query.get('moveContentToParent')).toBe(
      'true',
    );
  });

  it('creates a case from the page and opens it', async () => {
    openUrl('/projects/3/cases?section=11');
    const api = mockApi(
      handlers({
        'GET /projects/3/shared-steps': [],
        'POST /projects/3/suites/1/cases': makeCase({ id: 30, displayId: 'UOT-003' }),
      }),
    );
    const { user } = renderWithProviders(<CasesPage />, lead);
    await user.click(await screen.findByRole('button', { name: 'New case' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'New test case · Unit operation test',
    });
    await user.type(within(dialog).getByLabelText('Title'), 'Fan speed');
    await user.click(within(dialog).getByRole('button', { name: 'Create case' }));
    await waitFor(() => expect(urlParams().case).toBe('30'));
    expect(api.find('POST', '/projects/3/suites/1/cases')[0]!.body).toMatchObject({
      title: 'Fan speed',
      sectionId: 11,
    });
  });
});
