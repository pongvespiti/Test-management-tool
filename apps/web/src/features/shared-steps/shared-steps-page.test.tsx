import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import {
  apiError,
  followUrl,
  makeSharedStep,
  mockApi,
  openUrl,
  urlParams,
} from '@/features/cases/test-utils';
import { SharedStepsPage } from './shared-steps-page';

const login = makeSharedStep({
  usageCount: 2,
  usedBy: [{ id: 9, suiteId: 1, displayId: 'UOT-001', code: null, title: 'Power on the unit' }],
});
const pair = makeSharedStep({
  id: 6,
  name: 'Pair the adapter',
  description: null,
  steps: [{ action: 'Hold the WPS button', expected: 'LED blinks' }],
  usageCount: 0,
  usedBy: [],
  updatedBy: null,
});

function handlers(overrides: Record<string, unknown> = {}) {
  return {
    'GET /projects/3/shared-steps': [login, pair],
    'GET /projects/3/shared-steps/5': login,
    'GET /projects/3/shared-steps/6': pair,
    ...overrides,
  };
}

describe('SharedStepsPage', () => {
  beforeEach(() => openUrl('/projects/3/shared-steps'));

  it('lists the sets and searches names and step text', async () => {
    mockApi(handlers());
    const { user } = renderWithProviders(<SharedStepsPage />, { project: makeProject() });
    const row = await screen.findByRole('row', { name: 'Log in to the app' });
    expect(within(row).getByText('Use the test account')).toBeInTheDocument();
    expect(within(row).getByText('2 cases')).toBeInTheDocument();
    expect(within(row).getByText('Alice Tester')).toBeInTheDocument();
    expect(screen.getByText('2 sets')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search shared steps'), 'wps');
    expect(screen.queryByRole('row', { name: 'Log in to the app' })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Pair the adapter' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search shared steps'), 'zzz');
    expect(screen.getByText('No shared steps match')).toBeInTheDocument();
  });

  it('invites to create the first set and hides editing from viewers', async () => {
    mockApi(handlers({ 'GET /projects/3/shared-steps': [] }));
    const { unmount } = renderWithProviders(<SharedStepsPage />, { project: makeProject() });
    expect(await screen.findByText('No shared steps yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New shared steps' })).toHaveLength(2);
    unmount();
    renderWithProviders(<SharedStepsPage />, { project: makeProject({ myRole: 'viewer' }) });
    expect(await screen.findByText('No shared steps yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New shared steps' })).not.toBeInTheDocument();
  });

  it('opens a set from the list and shows the cases that use it', async () => {
    mockApi(handlers());
    const { user, rerender } = renderWithProviders(<SharedStepsPage />, {
      project: makeProject({ myRole: 'tester' }),
    });
    await user.click(await screen.findByRole('row', { name: 'Log in to the app' }));
    expect(urlParams()).toEqual({ step: '5' });
    followUrl();
    rerender(<SharedStepsPage />);
    const drawer = await screen.findByRole('dialog', { name: 'Shared steps' });
    expect(await within(drawer).findByText('Steps (2)')).toBeInTheDocument();
    expect(within(drawer).getByText('Used by (2)')).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'UOT-001' })).toHaveAttribute(
      'href',
      '/projects/3/cases?suite=1&case=9',
    );
    expect(within(drawer).getByText('and 1 more case')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Close' }));
    expect(urlParams()).toEqual({});
  });

  it('creates a set (blank rows dropped) and opens it', async () => {
    const created = makeSharedStep({ id: 7, name: 'Reset the unit' });
    const api = mockApi(handlers({ 'POST /projects/3/shared-steps': created }));
    const { user } = renderWithProviders(<SharedStepsPage />, { project: makeProject() });
    await user.click(await screen.findByRole('button', { name: 'New shared steps' }));
    const editor = await screen.findByRole('dialog', { name: 'New shared steps' });
    await user.click(within(editor).getByRole('button', { name: 'Create shared steps' }));
    expect(await within(editor).findByText('Add at least one step')).toBeInTheDocument();
    expect(within(editor).getByText('Required')).toBeInTheDocument();
    await user.type(within(editor).getByLabelText('Name'), 'Reset the unit');
    await user.type(within(editor).getByLabelText('Step 1 action'), 'Hold RESET');
    await user.type(within(editor).getByLabelText('Step 1 expected result'), 'Unit restarts');
    await user.click(within(editor).getByRole('button', { name: 'Add step' }));
    await user.click(within(editor).getByRole('button', { name: 'Create shared steps' }));
    await waitFor(() => expect(urlParams()).toEqual({ step: '7' }));
    expect(api.find('POST', '/projects/3/shared-steps')[0]!.body).toEqual({
      name: 'Reset the unit',
      description: '',
      steps: [{ action: 'Hold RESET', expected: 'Unit restarts' }],
    });
  });

  it('edits a set with its version and handles a conflict and a taken name', async () => {
    openUrl('/projects/3/shared-steps?step=5');
    const latest = makeSharedStep({ ...login, name: 'Log in (v3)', version: 3 });
    let patches = 0;
    const api = mockApi(
      handlers({
        'PATCH /projects/3/shared-steps/5': () => {
          patches += 1;
          if (patches === 1) return apiError(409, 'VERSION_CONFLICT');
          if (patches === 2) return apiError(409, 'SHARED_STEP_NAME_TAKEN');
          return latest;
        },
        'GET /projects/3/shared-steps/5': () => (patches === 0 ? login : latest),
      }),
    );
    const { user } = renderWithProviders(<SharedStepsPage />, { project: makeProject() });
    const drawer = await screen.findByRole('dialog', { name: 'Shared steps' });
    await user.click(await within(drawer).findByRole('button', { name: 'Edit' }));
    const editor = await screen.findByRole('dialog', { name: 'Edit “Log in to the app”' });
    expect(within(editor).getByText(/Used by 2 test cases/)).toBeInTheDocument();
    await user.type(within(editor).getByLabelText('Description'), ' first');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(await within(editor).findByText('Changed by someone else')).toBeInTheDocument();
    expect(api.find('PATCH', '/projects/3/shared-steps/5')[0]!.body).toMatchObject({ version: 2 });
    await user.click(within(editor).getByRole('button', { name: 'Load latest version' }));
    await waitFor(() => expect(within(editor).getByLabelText('Name')).toHaveValue('Log in (v3)'));
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(
      await within(editor).findByText('Another shared step set has this name'),
    ).toBeInTheDocument();
    expect(api.find('PATCH', '/projects/3/shared-steps/5')[1]!.body).toMatchObject({ version: 3 });
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /^Edit/ })).not.toBeInTheDocument(),
    );
  });

  it('deletes an unused set after confirmation', async () => {
    openUrl('/projects/3/shared-steps?step=6');
    const api = mockApi(handlers({ 'DELETE /projects/3/shared-steps/6': undefined }));
    const { user } = renderWithProviders(<SharedStepsPage />, { project: makeProject() });
    const drawer = await screen.findByRole('dialog', { name: 'Shared steps' });
    expect(
      await within(drawer).findByText(/No test case uses these steps yet/),
    ).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Delete shared steps “Pair the adapter”?',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(urlParams()).toEqual({}));
    expect(api.find('DELETE', '/projects/3/shared-steps/6')[0]!.query.has('inline')).toBe(false);
  });

  it('copies the steps into the using cases before deleting a set in use', async () => {
    openUrl('/projects/3/shared-steps?step=5');
    const api = mockApi(handlers({ 'DELETE /projects/3/shared-steps/5': undefined }));
    const { user } = renderWithProviders(<SharedStepsPage />, { project: makeProject() });
    const drawer = await screen.findByRole('dialog', { name: 'Shared steps' });
    await user.click(await within(drawer).findByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: '“Log in to the app” is used by 2 test cases',
    });
    expect(confirm).toHaveTextContent('its 2 steps are first copied into those 2 cases');
    await user.click(
      within(confirm).getByRole('button', { name: 'Delete and copy steps into the 2 cases' }),
    );
    await waitFor(() => expect(api.find('DELETE', '/projects/3/shared-steps/5')).toHaveLength(1));
    expect(api.find('DELETE', '/projects/3/shared-steps/5')[0]!.query.get('inline')).toBe('true');
  });

  it('offers the copy when the server reports a set as in use', async () => {
    openUrl('/projects/3/shared-steps?step=6');
    const api = mockApi(
      handlers({
        'DELETE /projects/3/shared-steps/6': (call: { query: URLSearchParams }) =>
          call.query.get('inline') === 'true'
            ? undefined
            : apiError(409, 'SHARED_STEP_IN_USE', 'In use', { usageCount: 1 }),
      }),
    );
    const { user } = renderWithProviders(<SharedStepsPage />, { project: makeProject() });
    const drawer = await screen.findByRole('dialog', { name: 'Shared steps' });
    await user.click(await within(drawer).findByRole('button', { name: 'Delete' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    const offer = await screen.findByRole('alertdialog', {
      name: '“Pair the adapter” is used by 1 test case',
    });
    await user.click(
      within(offer).getByRole('button', { name: 'Delete and copy steps into the case' }),
    );
    await waitFor(() => expect(api.find('DELETE', '/projects/3/shared-steps/6')).toHaveLength(2));
  });

  it('shows a failed list and a failed set', async () => {
    openUrl('/projects/3/shared-steps?step=8');
    mockApi(
      handlers({
        'GET /projects/3/shared-steps': () => apiError(500, 'BOOM', 'Server down'),
        'GET /projects/3/shared-steps/8': () => apiError(404, 'NOT_FOUND', 'Set not found'),
      }),
    );
    renderWithProviders(<SharedStepsPage />, { project: makeProject() });
    expect(await screen.findByText('Shared steps could not be loaded')).toBeInTheDocument();
    expect(await screen.findByText('Set not found')).toBeInTheDocument();
  });
});
