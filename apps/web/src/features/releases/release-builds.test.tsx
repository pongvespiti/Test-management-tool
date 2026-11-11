import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { BuildDTO, ReleaseDTO } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { jsonResponse, makeProject, renderWithProviders } from '@/test/render';
import { ReleasesPage } from './releases-page';

type FetchMock = jest.MockedFunction<typeof fetch>;

const T = '2026-11-01T00:00:00.000Z';
const release = (id: number, name: string): ReleaseDTO => ({
  id,
  projectId: 3,
  name,
  description: null,
  startDate: null,
  endDate: null,
  status: 'active',
  createdAt: T,
  updatedAt: T,
});
const build = (overrides: Partial<BuildDTO> = {}): BuildDTO => ({
  id: 8,
  releaseId: 5,
  name: '1.1.7(2.0.0)',
  notes: 'Fixes the timer bug',
  builtDate: '2026-11-08',
  runCount: 2,
  defectCount: 1,
  createdAt: T,
  updatedAt: T,
  ...overrides,
});

describe('builds on the releases page', () => {
  let fetchMock: FetchMock;
  const realFetch = globalThis.fetch;
  let builds: BuildDTO[];

  const respond = (writes: Record<string, Response> = {}) => {
    fetchMock.mockImplementation(async (input, init) => {
      const key = `${init?.method ?? 'GET'} ${String(input)}`;
      if (writes[key]) return writes[key]!;
      if (key === 'GET /api/v1/projects/3/releases') {
        return jsonResponse([release(5, 'Step 1.1.7'), release(6, 'Step 1.1.8')]);
      }
      if (key === 'GET /api/v1/projects/3/builds') return jsonResponse(builds);
      return jsonResponse({ error: { code: 'NOT_FOUND', message: key } }, 404);
    });
  };
  const sent = (method: string) =>
    fetchMock.mock.calls.filter(([, init]) => init?.method === method);

  beforeEach(() => {
    fetchMock = jest.fn() as FetchMock;
    globalThis.fetch = fetchMock;
    builds = [
      build(),
      build({ id: 9, name: '1.1.7(1.0.0)', notes: null, runCount: 0, defectCount: 0 }),
    ];
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('lists the builds under their own release', async () => {
    respond();
    renderWithProviders(<ReleasesPage />, { project: makeProject() });
    const first = await screen.findByRole('region', { name: 'Builds of Step 1.1.7' });
    expect(within(first).getByText('1.1.7(2.0.0)')).toBeInTheDocument();
    expect(within(first).getByText('Fixes the timer bug')).toBeInTheDocument();
    expect(within(first).getByText('2 runs · 1 defect')).toBeInTheDocument();
    expect(within(first).getByText('Builds (2)')).toBeInTheDocument();
    const second = screen.getByRole('region', { name: 'Builds of Step 1.1.8' });
    expect(within(second).getByText(/No builds yet/)).toBeInTheDocument();
  });

  it('lets a tester add a build to a release', async () => {
    respond({ 'POST /api/v1/projects/3/releases/6/builds': jsonResponse(build({ id: 10 }), 201) });
    const { user } = renderWithProviders(<ReleasesPage />, {
      project: makeProject({ myRole: 'tester' }),
    });
    await user.click(await screen.findByRole('button', { name: 'Add build to Step 1.1.8' }));
    const dialog = await screen.findByRole('dialog', { name: 'New build' });
    await user.type(within(dialog).getByLabelText('Build'), '1.1.8(1.0.0)');
    await user.click(within(dialog).getByRole('button', { name: 'Add build' }));
    await waitFor(() => expect(sent('POST')).toHaveLength(1));
    expect(JSON.parse(String(sent('POST')[0]![1]?.body))).toMatchObject({ name: '1.1.8(1.0.0)' });
  });

  it('says so when the release already has the build', async () => {
    respond({
      'POST /api/v1/projects/3/releases/5/builds': jsonResponse(
        { error: { code: 'BUILD_NAME_TAKEN', message: 'taken' } },
        409,
      ),
    });
    const { user } = renderWithProviders(<ReleasesPage />, { project: makeProject() });
    await user.click(await screen.findByRole('button', { name: 'Add build to Step 1.1.7' }));
    const dialog = await screen.findByRole('dialog', { name: 'New build' });
    await user.type(within(dialog).getByLabelText('Build'), '1.1.7(2.0.0)');
    await user.click(within(dialog).getByRole('button', { name: 'Add build' }));
    expect(
      await within(dialog).findByText('This release already has this build'),
    ).toBeInTheDocument();
  });

  it('edits a build', async () => {
    respond({ 'PATCH /api/v1/projects/3/builds/8': jsonResponse(build({ notes: 'x' })) });
    const { user } = renderWithProviders(<ReleasesPage />, { project: makeProject() });
    await user.click(await screen.findByRole('button', { name: 'Edit build 1.1.7(2.0.0)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit build' });
    expect(within(dialog).getByLabelText('Build')).toHaveValue('1.1.7(2.0.0)');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent('PATCH')).toHaveLength(1));
  });

  it('asks before deleting and explains a build in use', async () => {
    respond({
      'DELETE /api/v1/projects/3/builds/8': jsonResponse(
        { error: { code: 'BUILD_IN_USE', message: 'used' } },
        409,
      ),
    });
    const { user } = renderWithProviders(<ReleasesPage />, { project: makeProject() });
    await user.click(await screen.findByRole('button', { name: 'Delete build 1.1.7(2.0.0)' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Delete build “1.1.7(2.0.0)”?');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent('DELETE')).toHaveLength(1));
  });

  it('shows builds read-only to viewers', async () => {
    respond();
    renderWithProviders(<ReleasesPage />, { project: makeProject({ myRole: 'viewer' }) });
    await screen.findByText('1.1.7(2.0.0)');
    expect(screen.queryByRole('button', { name: /Add build/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit build/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete build/ })).not.toBeInTheDocument();
  });
});
