import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { mockRouter } from '@/test/mocks/next-navigation';
import { jsonResponse, makeProject, makeUser, renderWithProviders } from '@/test/render';
import { ProjectsPage, sortProjects } from './projects-page';

type FetchMock = jest.MockedFunction<typeof fetch>;
const admin = { user: makeUser({ isAdmin: true }), isAdmin: true };

describe('ProjectsPage', () => {
  let fetchMock: FetchMock;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = jest.fn() as FetchMock;
    globalThis.fetch = fetchMock;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('lists the projects as cards linking to their dashboards', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        makeProject({ id: 1, key: 'ACS', name: 'ACS Smart', myRole: 'tester' }),
        makeProject({ id: 2, key: 'OLD', name: 'Legacy', isArchived: true }),
      ]),
    );
    renderWithProviders(<ProjectsPage />);
    const card = await screen.findByRole('link', { name: 'Open project ACS Smart' });
    expect(card).toHaveAttribute('href', '/projects/1');
    expect(within(card).getByText('Tester')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
  });

  it('invites members without projects to ask for access', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText('You are not a member of any project yet')).toBeInTheDocument();
  });

  it('lets administrators create a project and opens it', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'POST') return jsonResponse(makeProject({ id: 9, key: 'AB' }), 201);
      return jsonResponse([]);
    });
    const { user } = renderWithProviders(<ProjectsPage />, { auth: admin });
    expect(await screen.findByText('Create your first project')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'New project' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await user.type(within(dialog).getByLabelText('Key'), 'ab');
    expect(within(dialog).getByLabelText('Key')).toHaveValue('AB');
    await user.type(within(dialog).getByLabelText('Name'), 'Air box');
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/projects/9'));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ key: 'AB', name: 'Air box' });
  });

  it('shows a taken key next to the field', async () => {
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === 'POST'
        ? jsonResponse({ error: { code: 'PROJECT_KEY_TAKEN', message: 'taken' } }, 409)
        : jsonResponse([]),
    );
    const { user } = renderWithProviders(<ProjectsPage />, { auth: admin });
    await user.click((await screen.findAllByRole('button', { name: 'New project' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Key'), 'ACS');
    await user.type(within(dialog).getByLabelText('Name'), 'Dup');
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));
    expect(
      await within(dialog).findByText('This key is already used by another project'),
    ).toBeInTheDocument();
  });
});

describe('sortProjects', () => {
  it('puts archived projects last and keeps the server order otherwise', () => {
    const list = sortProjects([
      makeProject({ id: 1, isArchived: true }),
      makeProject({ id: 2 }),
      makeProject({ id: 3 }),
    ]);
    expect(list.map((p) => p.id)).toEqual([2, 3, 1]);
  });
});
