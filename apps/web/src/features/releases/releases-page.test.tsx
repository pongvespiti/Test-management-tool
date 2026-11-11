import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReleaseDTO } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { jsonResponse, makeProject, renderWithProviders } from '@/test/render';
import { releaseFormSchema } from './release-form-dialog';
import { ReleasesPage } from './releases-page';

type FetchMock = jest.MockedFunction<typeof fetch>;

const release = (overrides: Partial<ReleaseDTO> = {}): ReleaseDTO => ({
  id: 5,
  projectId: 3,
  name: 'FW 2.4.0',
  description: 'Spring firmware',
  startDate: '2026-11-01',
  endDate: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('ReleasesPage', () => {
  let fetchMock: FetchMock;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = jest.fn() as FetchMock;
    globalThis.fetch = fetchMock;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('shows the releases of the project', async () => {
    fetchMock.mockResolvedValue(jsonResponse([release()]));
    renderWithProviders(<ReleasesPage />, { project: makeProject() });
    expect(await screen.findByText('FW 2.4.0')).toBeInTheDocument();
    expect(screen.getByText('Spring firmware')).toBeInTheDocument();
    expect(screen.getByText('Nov 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/projects/3/releases');
  });

  it('hides editing for roles without manageReleases', async () => {
    fetchMock.mockResolvedValue(jsonResponse([release()]));
    renderWithProviders(<ReleasesPage />, { project: makeProject({ myRole: 'viewer' }) });
    await screen.findByText('FW 2.4.0');
    expect(screen.queryByRole('button', { name: 'New release' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete FW 2.4.0' })).not.toBeInTheDocument();
  });

  it('creates a release', async () => {
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === 'POST'
        ? jsonResponse(release({ id: 6, name: 'FW 3.0' }), 201)
        : jsonResponse([]),
    );
    const { user } = renderWithProviders(<ReleasesPage />, { project: makeProject() });
    await user.click((await screen.findAllByRole('button', { name: 'New release' }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'New release' });
    await user.type(within(dialog).getByLabelText('Name'), 'FW 3.0');
    await user.click(within(dialog).getByRole('button', { name: 'Create release' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(post[0]).toBe('/api/v1/projects/3/releases');
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ name: 'FW 3.0', status: 'planned' });
  });

  it('asks before deleting and explains a release in use', async () => {
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === 'DELETE'
        ? jsonResponse({ error: { code: 'RELEASE_IN_USE', message: 'used' } }, 409)
        : jsonResponse([release()]),
    );
    const { user } = renderWithProviders(<ReleasesPage />, { project: makeProject() });
    await user.click(await screen.findByRole('button', { name: 'Delete FW 2.4.0' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Delete release “FW 2.4.0”?');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true),
    );
  });
});

describe('releaseFormSchema', () => {
  it('rejects an end date before the start date', () => {
    const result = releaseFormSchema.safeParse({
      name: 'FW',
      startDate: '2026-11-10',
      endDate: '2026-11-01',
      status: 'planned',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['endDate'],
      message: 'The end date is before the start date',
    });
  });
});
