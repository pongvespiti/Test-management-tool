import { describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_ENV_DIMENSIONS, type EnvDimension } from '@tmt/shared';
import { makeProject, renderWithProviders } from '@/test/render';
import { mockApi, type ApiCall } from '../cases/test-utils';
import { EnvListsPage } from './env-lists-page';

const lists = (): EnvDimension[] => [
  {
    label: 'Platform',
    parent: null,
    values: [
      { value: 'Android', parent: null },
      { value: 'iOS', parent: null },
    ],
  },
  { label: 'OS ver', parent: 'Platform', values: [{ value: '15', parent: 'Android' }] },
];

function renderPage(dimensions: EnvDimension[], role: 'lead' | 'tester' = 'lead') {
  const api = mockApi({
    'GET /projects/3/env-dimensions': { dimensions },
    'PUT /projects/3/env-dimensions': ({ body }: ApiCall) => body,
    'POST /projects/3/env-dimensions/normalize-runs': { updatedRuns: 2, addedValues: 1 },
  });
  return {
    ...renderWithProviders(<EnvListsPage />, { project: makeProject({ myRole: role }) }),
    api,
  };
}

describe('EnvListsPage', () => {
  it('offers the usual set when there are no lists and saves it', async () => {
    const { user, api } = renderPage([]);
    await user.click(await screen.findByRole('button', { name: 'Use the usual set' }));
    await waitFor(() => expect(api.find('PUT', '/projects/3/env-dimensions')).toHaveLength(1));
    expect(api.find('PUT', '/projects/3/env-dimensions')[0]!.body).toEqual({
      dimensions: DEFAULT_ENV_DIMENSIONS,
    });
  });

  it('edits the values of a list under its parent value and saves the change', async () => {
    const { user, api } = renderPage(lists());
    const os = within(await screen.findByRole('region', { name: 'OS ver' }));
    await user.type(os.getByLabelText('Add value to OS ver of iOS'), '18{Enter}');
    expect(os.getByText('18')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save lists' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Save lists' }));
    await waitFor(() => expect(api.find('PUT', '/projects/3/env-dimensions')).toHaveLength(1));
    const sent = api.find('PUT', '/projects/3/env-dimensions')[0]!.body as {
      dimensions: EnvDimension[];
    };
    expect(sent.dimensions[1]!.values).toEqual([
      { value: '15', parent: 'Android' },
      { value: '18', parent: 'iOS' },
    ]);
  });

  it('removes a value and adds a new list', async () => {
    const { user } = renderPage(lists());
    const os = within(await screen.findByRole('region', { name: 'OS ver' }));
    await user.click(os.getByRole('button', { name: 'Remove 15 from OS ver of Android' }));
    expect(os.queryByText('15')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('New list'), 'Region');
    await user.click(screen.getByRole('button', { name: 'Add list' }));
    expect(screen.getByRole('region', { name: 'Region' })).toBeInTheDocument();
  });

  it('tidies the existing runs and reports the result', async () => {
    const { user, api } = renderPage(lists());
    await user.click(await screen.findByRole('button', { name: 'Tidy existing runs' }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/env-dimensions/normalize-runs')).toHaveLength(1),
    );
  });

  it('is read-only for testers', async () => {
    renderPage(lists(), 'tester');
    expect(await screen.findByRole('region', { name: 'Platform' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save lists' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add value to Platform')).not.toBeInTheDocument();
  });
});
