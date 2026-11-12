import { beforeEach, describe, expect, it } from '@jest/globals';
import type { ProjectRole } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import { followUrl, mockApi, openUrl, urlParams } from '../cases/test-utils';
import { makeRequirement, makeRequirementItem } from './test-fixtures';
import { RequirementsPage } from './requirements-page';

const as = (role: ProjectRole = 'tester') => ({ project: makeProject({ myRole: role }) });

function stub(extra: Record<string, unknown> = {}, jira = false) {
  return mockApi({
    'GET /projects/3/requirements': [
      makeRequirementItem(),
      makeRequirementItem({
        id: 22,
        key: 'IOT-12',
        title: 'Pair over Bluetooth',
        source: 'jira',
        externalStatus: 'In Progress',
        externalUrl: 'https://jira.example.com/browse/IOT-12',
        caseCount: 0,
      }),
    ],
    'GET /projects/3/integrations': {
      jira: jira ? { enabled: true, baseUrl: 'https://jira.example.com', projectKey: 'IOT' } : null,
    },
    'GET /projects/3/requirements/21': makeRequirement(),
    ...extra,
  });
}

describe('Requirements page', () => {
  beforeEach(() => openUrl('/projects/3/requirements'));

  it('lists requirements with source, Jira status and the number of cases', async () => {
    stub();
    renderWithProviders(<RequirementsPage />, as());
    const manual = (await screen.findByText('Unit powers on within 3 s')).closest('tr')!;
    expect(manual).toHaveTextContent('REQ-1');
    expect(manual).toHaveTextContent('Typed in');
    expect(manual).toHaveTextContent('2');
    const jira = screen.getByText('Pair over Bluetooth').closest('tr')!;
    expect(jira).toHaveTextContent('Jira');
    expect(jira).toHaveTextContent('In Progress');
    expect(within(jira).getByTitle('No case tests this requirement')).toHaveTextContent('0');
  });

  it('filters by source through the address and the query', async () => {
    const api = stub();
    const { user, rerender } = renderWithProviders(<RequirementsPage />, as());
    await screen.findByText('Pair over Bluetooth');
    await user.click(screen.getByRole('radio', { name: 'Jira' }));
    expect(urlParams()).toEqual({ source: 'jira' });
    followUrl();
    rerender(<RequirementsPage />);
    await waitFor(() =>
      expect(api.find('GET', '/projects/3/requirements').at(-1)!.query.get('source')).toBe('jira'),
    );
  });

  it('opens the details with the cases that test the requirement', async () => {
    stub();
    const { user } = renderWithProviders(<RequirementsPage />, as());
    await user.click(await screen.findByText('REQ-1'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/From plug-in to the ready tone/)).toBeInTheDocument();
    const cases = within(dialog).getByRole('list', { name: 'Cases of REQ-1' });
    expect(within(cases).getByRole('link', { name: 'UO-001' })).toHaveAttribute(
      'href',
      '/projects/3/cases?case=11',
    );
    expect(cases).toHaveTextContent('Linked');
    expect(cases).toHaveTextContent('Cites the ID');
  });

  it('links cases found by search and saves the list of linked cases', async () => {
    const api = stub({
      'GET /projects/3/cases/search': {
        items: [
          {
            id: 14,
            displayId: 'UO-004',
            code: null,
            title: 'Cold start',
            status: 'active',
            priority: 'medium',
            suiteId: 1,
            suiteName: 'Unit operation test',
          },
        ],
        total: 1,
      },
      'PUT /projects/3/requirements/21/cases': makeRequirement(),
    });
    const { user } = renderWithProviders(<RequirementsPage />, as());
    await user.click(await screen.findByText('REQ-1'));
    await user.click(await screen.findByRole('button', { name: /Link cases/ }));
    const link = (await screen.findAllByRole('dialog')).at(-1)!;
    await user.type(within(link).getByLabelText('Search cases'), 'cold');
    await user.click(await within(link).findByRole('checkbox', { name: /UO-004/ }));
    // Only the linked case is kept: UO-002 only cites the ID in its References.
    await user.click(within(link).getByRole('button', { name: 'Unlink UO-001' }));
    await user.click(within(link).getByRole('button', { name: 'Save links' }));
    await waitFor(() =>
      expect(api.find('PUT', '/projects/3/requirements/21/cases')[0]!.body).toEqual({
        caseIds: [14],
      }),
    );
  });

  it('creates a requirement by hand and shows it', async () => {
    const api = stub({
      'POST /projects/3/requirements': (c: { body: unknown }) =>
        makeRequirement({ id: 30, ...(c.body as object) }),
      'GET /projects/3/requirements/30': makeRequirement({ id: 30, key: 'REQ-9', cases: [] }),
    });
    const { user } = renderWithProviders(<RequirementsPage />, as());
    await user.click(await screen.findByRole('button', { name: /New requirement/ }));
    await user.click(screen.getByRole('button', { name: /^(Add|Create|Save)/ }));
    expect(await screen.findAllByText(/required|enter/i)).not.toHaveLength(0);
    expect(api.find('POST', '/projects/3/requirements')).toHaveLength(0);

    await user.type(screen.getByLabelText('ID'), 'req 9');
    await user.type(screen.getByLabelText('Title'), 'Reset to factory settings');
    await user.click(screen.getByRole('button', { name: /^(Add|Create|Save)/ }));
    await waitFor(() => expect(api.find('POST', '/projects/3/requirements')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/requirements')[0]!.body).toMatchObject({
      key: 'req 9',
      title: 'Reset to factory settings',
    });
  });

  it('shows the Jira buttons only when Jira is enabled and the user may import', async () => {
    stub({}, true);
    const { unmount } = renderWithProviders(<RequirementsPage />, as('tester'));
    expect(await screen.findByRole('button', { name: 'Read from Jira' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh from Jira/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import Excel/ })).toBeInTheDocument();
    unmount();

    stub({}, false);
    renderWithProviders(<RequirementsPage />, as('tester'));
    await screen.findByText('Pair over Bluetooth');
    expect(screen.queryByRole('button', { name: 'Read from Jira' })).not.toBeInTheDocument();
  });

  it('refreshes from Jira and reports the outcome', async () => {
    const api = stub(
      {
        'POST /projects/3/requirements/jira/sync': {
          created: 0,
          updated: 1,
          missing: ['IOT-9'],
        },
      },
      true,
    );
    const { user } = renderWithProviders(<RequirementsPage />, as());
    await user.click(await screen.findByRole('button', { name: /Refresh from Jira/ }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/requirements/jira/sync')).toHaveLength(1),
    );
  });

  it('deletes a requirement without fetching it again', async () => {
    const api = stub({ 'DELETE /projects/3/requirements/21': undefined });
    const { user } = renderWithProviders(<RequirementsPage />, as());
    await user.click(await screen.findByText('REQ-1'));
    await user.click(await screen.findByRole('button', { name: 'Delete requirement' }));
    await user.click(await screen.findByRole('button', { name: /^Delete$/ }));
    await waitFor(() => expect(api.find('DELETE', '/projects/3/requirements/21')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.find('GET', '/projects/3/requirements/21')).toHaveLength(1);
  });

  it('marks a changed requirement and lets a tester confirm its cases', async () => {
    const changed = makeRequirement({
      needsReview: true,
      textChangedAt: '2026-11-11T09:00:00.000Z',
    });
    const api = stub({
      'GET /projects/3/requirements': [makeRequirementItem({ needsReview: true })],
      'GET /projects/3/requirements/21': changed,
      'POST /projects/3/requirements/21/review': makeRequirement(),
    });
    const { user } = renderWithProviders(<RequirementsPage />, as());
    expect(await screen.findByText('Review')).toBeInTheDocument();
    await user.click(screen.getByText('REQ-1'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('status')).toHaveTextContent(/Check that the 2 cases/);
    await user.click(within(dialog).getByRole('button', { name: 'Cases are still correct' }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/requirements/21/review')).toHaveLength(1),
    );
  });

  it('hides every change from viewers', async () => {
    stub({}, true);
    renderWithProviders(<RequirementsPage />, as('viewer'));
    await screen.findByText('Pair over Bluetooth');
    expect(screen.queryByRole('button', { name: /New requirement/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import Excel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /from Jira/ })).not.toBeInTheDocument();
  });

  it('explains an empty list', async () => {
    stub({ 'GET /projects/3/requirements': [] });
    renderWithProviders(<RequirementsPage />, as());
    expect(await screen.findByText('No requirements yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /New requirement/ })).toHaveLength(2);
  });
});
