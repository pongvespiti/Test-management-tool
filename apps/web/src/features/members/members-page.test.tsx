import { describe, expect, it, jest } from '@jest/globals';
import type { MemberDTO, ProjectRole } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { makeProject, makeUser, renderWithProviders } from '@/test/render';
import { apiError, member, mockApi, userRef, type ApiCall } from '../cases/test-utils';
import { MembersPage, sortMembers } from './members-page';

const alice = member(1, 'Alice Tester', 'lead');
const bob = member(2, 'Bob Lead', 'lead');
const dan = member(3, 'Dan Tester', 'tester');
const eve = member(4, 'Eve Viewer', 'viewer');

function renderPage(
  members: MemberDTO[] = [dan, eve, bob, alice],
  {
    role = 'lead',
    admin = false,
    overrides = {},
  }: { role?: ProjectRole; admin?: boolean; overrides?: Record<string, unknown> } = {},
) {
  const api = mockApi({
    'GET /projects/3/members': members,
    'PUT /projects/3/members': ({ body }: ApiCall) =>
      (body as { members: { userId: number; role: MemberDTO['role'] }[] }).members.map((m) => ({
        user: userRef(m.userId, `User ${m.userId}`),
        role: m.role,
      })),
    'GET /users/lookup': ({ query }: ApiCall) =>
      query.get('q') === 'car'
        ? [userRef(5, 'Carol New'), userRef(3, 'Dan Tester')]
        : [userRef(5, 'Carol New'), userRef(6, 'Frank Other'), userRef(4, 'Eve Viewer')],
    ...overrides,
  });
  const view = renderWithProviders(<MembersPage />, {
    project: makeProject({ myRole: role }),
    auth: { user: makeUser({ id: 1, isAdmin: admin }), isAdmin: admin },
  });
  return { ...view, api };
}

const putBody = (api: ReturnType<typeof renderPage>['api'], i = 0) =>
  api.find('PUT', '/projects/3/members')[i]!.body;

describe('MembersPage', () => {
  it('lists leads first and marks the signed-in user', async () => {
    renderPage();
    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(rows.map((r) => within(r).getAllByText(/\w/)[0]!.textContent)).toEqual([
      'Alice Tester (you)',
      'Bob Lead',
      'Dan Tester',
      'Eve Viewer',
    ]);
    expect(screen.getByText('Roles')).toBeInTheDocument();
  });

  it('adds a person found by the user search', async () => {
    const { user, api } = renderPage();
    await user.click(await screen.findByRole('combobox', { name: 'Add a person' }));
    // Existing members are not offered.
    expect(await screen.findByRole('option', { name: 'Frank Other (frank.other)' })).toBeVisible();
    expect(screen.queryByRole('option', { name: /Eve Viewer/ })).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Type a name or username'), 'car');
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: /Frank Other/ })).not.toBeInTheDocument(),
    );
    expect(api.calls.some((c) => c.path === '/users/lookup' && c.query.get('q') === 'car')).toBe(
      true,
    );
    await user.click(screen.getByRole('option', { name: 'Carol New (carol.new)' }));
    expect(screen.getByRole('combobox', { name: 'Add a person' })).toHaveTextContent(
      'Carol New (carol.new)',
    );

    await user.click(screen.getByRole('combobox', { name: 'Role' }));
    await user.click(await screen.findByRole('option', { name: 'Viewer' }));
    await user.click(screen.getByRole('button', { name: 'Add member' }));
    await waitFor(() => expect(api.find('PUT', '/projects/3/members')).toHaveLength(1));
    expect(putBody(api)).toEqual({
      members: [
        { userId: 1, role: 'lead' },
        { userId: 2, role: 'lead' },
        { userId: 3, role: 'tester' },
        { userId: 4, role: 'viewer' },
        { userId: 5, role: 'viewer' },
      ],
    });
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Add a person' })).toHaveTextContent(
        'Type a name or username',
      ),
    );
  });

  it('clears the picked person', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('combobox', { name: 'Add a person' }));
    await user.click(await screen.findByRole('option', { name: /Carol New/ }));
    expect(screen.getByRole('button', { name: 'Add member' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Clear the selected person' }));
    expect(screen.getByRole('button', { name: 'Add member' })).toBeDisabled();
  });

  it('changes the role of a member', async () => {
    const { user, api } = renderPage();
    await user.click(await screen.findByRole('combobox', { name: 'Role of Dan Tester' }));
    await user.click(await screen.findByRole('option', { name: 'Lead' }));
    await waitFor(() => expect(api.find('PUT', '/projects/3/members')).toHaveLength(1));
    expect(putBody(api)).toMatchObject({
      members: expect.arrayContaining([{ userId: 3, role: 'lead' }]),
    });
  });

  it('asks before leads demote themselves (administrators keep lead access)', async () => {
    const { user, api } = renderPage();
    await user.click(await screen.findByRole('combobox', { name: 'Role of Alice Tester' }));
    await user.click(await screen.findByRole('option', { name: 'Tester' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Change your own role?');
    await user.click(within(confirm).getByRole('button', { name: 'Change my role' }));
    await waitFor(() => expect(api.find('PUT', '/projects/3/members')).toHaveLength(1));
    expect(putBody(api)).toMatchObject({
      members: expect.arrayContaining([{ userId: 1, role: 'tester' }]),
    });
  });

  it('lets administrators change their own role without asking', async () => {
    const { user, api } = renderPage(undefined, { admin: true });
    await user.click(await screen.findByRole('combobox', { name: 'Role of Alice Tester' }));
    await user.click(await screen.findByRole('option', { name: 'Viewer' }));
    await waitFor(() => expect(api.find('PUT', '/projects/3/members')).toHaveLength(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps the last lead: role and removal are locked', async () => {
    renderPage([alice, dan]);
    expect(await screen.findByRole('combobox', { name: 'Role of Alice Tester' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Alice Tester' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Role of Dan Tester' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove Dan Tester' })).toBeEnabled();
  });

  it('removes a member after a confirmation', async () => {
    const { user, api } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Remove Eve Viewer' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Remove Eve Viewer?');
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.find('PUT', '/projects/3/members')).toHaveLength(1));
    expect(putBody(api)).toEqual({
      members: [
        { userId: 1, role: 'lead' },
        { userId: 2, role: 'lead' },
        { userId: 3, role: 'tester' },
      ],
    });
  });

  it('reports a refused change', async () => {
    const error = jest.spyOn(toast, 'error');
    const { user } = renderPage(undefined, {
      overrides: {
        'PUT /projects/3/members': apiError(422, 'LEAD_REQUIRED', 'A lead is required'),
      },
    });
    await user.click(await screen.findByRole('combobox', { name: 'Role of Bob Lead' }));
    await user.click(await screen.findByRole('option', { name: 'Viewer' }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Could not update members', {
        description: 'A lead is required',
        duration: 8000,
      }),
    );
  });

  it('shows roles read-only to testers', async () => {
    renderPage(undefined, { role: 'tester' });
    expect(await screen.findByText('Bob Lead')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Lead').length).toBeGreaterThanOrEqual(2);
  });

  it('says when there are no members', async () => {
    renderPage([]);
    expect(await screen.findByText('No members yet.')).toBeInTheDocument();
  });
});

describe('sortMembers', () => {
  it('orders by role, then by name', () => {
    expect(sortMembers([eve, dan, bob, alice]).map((m) => m.user.id)).toEqual([1, 2, 3, 4]);
  });
});
