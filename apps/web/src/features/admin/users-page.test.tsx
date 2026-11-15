import { describe, expect, it } from '@jest/globals';
import type { UserDTO } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { makeUser, renderWithProviders } from '@/test/render';
import { apiError, mockApi, type ApiCall } from '../cases/test-utils';
import { filterUsers, UsersPage } from './users-page';

const me = makeUser({ id: 1, username: 'admin', displayName: 'Ada Admin', isAdmin: true });
const bob = makeUser({
  id: 2,
  username: 'bob',
  displayName: 'Bob Tester',
  email: 'bob@example.com',
  mustChangePassword: true,
  lastLoginAt: '2026-11-01T00:00:00.000Z',
});
const carol = makeUser({ id: 3, username: 'carol', displayName: 'Carol Gone', isActive: false });

function renderPage(overrides: Record<string, unknown> = {}) {
  const api = mockApi({
    'GET /users': [carol, bob, me],
    'POST /users': ({ body }: ApiCall) =>
      makeUser({ id: 9, ...(body as Partial<UserDTO>), mustChangePassword: true }),
    'PATCH /users/2': ({ body }: ApiCall) => ({ ...bob, ...(body as object) }),
    'PATCH /users/3': ({ body }: ApiCall) => ({ ...carol, ...(body as object) }),
    'POST /users/2/reset-password': undefined,
    'DELETE /users/2/tokens': undefined,
    ...overrides,
  });
  const view = renderWithProviders(<UsersPage />, { auth: { user: me, isAdmin: true } });
  return { ...view, api };
}

async function openMenu(user: ReturnType<typeof renderPage>['user'], name: string, item: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('UsersPage', () => {
  it('lists active users, filters them and shows inactive ones on request', async () => {
    const { user } = renderPage();
    const bobRow = (await screen.findByText('Bob Tester')).closest('tr')!;
    expect(within(bobRow).getByText('Password change due')).toBeInTheDocument();
    expect(within(bobRow).getByText('bob@example.com')).toBeInTheDocument();
    expect(within(bobRow).getByText('Project roles')).toBeInTheDocument();
    const meRow = screen.getByText('Ada Admin').closest('tr')!;
    expect(within(meRow).getByText('(you)')).toBeInTheDocument();
    expect(within(meRow).getByText('Administrator')).toBeInTheDocument();
    expect(within(meRow).getByText('Never')).toBeInTheDocument();
    expect(screen.queryByText('Carol Gone')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Show inactive (1)' }));
    expect(screen.getByText('Carol Gone')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Search users' }), 'EXAMPLE');
    expect(screen.getByText('Bob Tester')).toBeInTheDocument();
    expect(screen.queryByText('Ada Admin')).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Search users' }), 'zzz');
    expect(screen.getByText('No users found')).toBeInTheDocument();
  });

  it('creates a user and shows the initial credentials once', async () => {
    const { user, api } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'New user' }));
    const dialog = await screen.findByRole('dialog', { name: 'New user' });
    const password = within(dialog).getByLabelText('Initial password') as HTMLInputElement;
    const generated = password.value;
    expect(generated).toHaveLength(12);
    await user.click(within(dialog).getByRole('button', { name: 'Generate' }));
    expect(password.value).not.toBe(generated);

    await user.type(within(dialog).getByLabelText('Username'), 'dan.t');
    await user.type(within(dialog).getByLabelText('Display name'), 'Dan Tester');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Administrator' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    expect(await within(dialog).findByText('User created')).toBeInTheDocument();
    expect(api.find('POST', '/users')[0]!.body).toEqual({
      username: 'dan.t',
      displayName: 'Dan Tester',
      email: null,
      isAdmin: true,
      isTechnician: false,
      password: password.value,
    });
    expect(within(dialog).getByText('dan.t')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Copy password' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('validates the new user and explains a taken username', async () => {
    const { user } = renderPage({
      'POST /users': apiError(409, 'USERNAME_TAKEN', 'taken'),
    });
    await user.click(await screen.findByRole('button', { name: 'New user' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Username'), 'x');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));
    expect(
      await within(dialog).findByText('3–50 characters: letters, digits, dot, dash, underscore'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Username'), 'yz');
    await user.type(within(dialog).getByLabelText('Display name'), 'Somebody');
    await user.type(within(dialog).getByLabelText('Email'), 'not-an-email');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));
    expect(await within(dialog).findByText('Enter a valid email address')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Email'));
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));
    expect(await within(dialog).findByText('This username is already taken')).toBeInTheDocument();
  });

  it('edits a user; administrators cannot demote or deactivate themselves', async () => {
    const { user, api } = renderPage();
    await openMenu(user, 'Bob Tester', 'Edit details');
    const dialog = await screen.findByRole('dialog', { name: 'Edit user' });
    expect(within(dialog).getByLabelText('Username')).toBeDisabled();
    const name = within(dialog).getByLabelText('Display name');
    await user.clear(name);
    await user.type(name, 'Bob T.');
    await user.click(within(dialog).getByRole('switch', { name: 'Administrator' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.find('PATCH', '/users/2')).toHaveLength(1));
    expect(api.find('PATCH', '/users/2')[0]!.body).toEqual({
      displayName: 'Bob T.',
      email: 'bob@example.com',
      isAdmin: true,
      isTechnician: false,
      isActive: true,
    });

    await openMenu(user, 'Ada Admin', 'Edit details');
    const own = await screen.findByRole('dialog', { name: 'Edit user' });
    expect(within(own).getByRole('switch', { name: 'Administrator' })).toBeDisabled();
    expect(within(own).getByRole('switch', { name: 'Active' })).toBeDisabled();
    expect(within(own).getByText('You cannot deactivate your own account')).toBeInTheDocument();
  });

  it('resets a password', async () => {
    const { user, api } = renderPage();
    await openMenu(user, 'Bob Tester', 'Reset password');
    const dialog = await screen.findByRole('dialog', { name: 'Reset password' });
    expect(within(dialog).getByText(/will be signed out on every device/)).toBeInTheDocument();
    const password = within(dialog).getByLabelText('Temporary password') as HTMLInputElement;
    await user.clear(password);
    await user.type(password, 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Reset password' }));
    expect(await within(dialog).findByText('Use at least 8 characters')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Generate' }));
    const newPassword = password.value;
    await user.click(within(dialog).getByRole('button', { name: 'Reset password' }));
    expect(await within(dialog).findByText('Password reset')).toBeInTheDocument();
    expect(api.find('POST', '/users/2/reset-password')[0]!.body).toEqual({ newPassword });
    expect(within(dialog).getByText(newPassword)).toBeInTheDocument();
  });

  it('revokes all API tokens of a user after a confirmation', async () => {
    const { user, api } = renderPage();
    await openMenu(user, 'Bob Tester', 'Revoke API tokens');
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Revoke all API tokens of Bob Tester?');
    await user.click(within(confirm).getByRole('button', { name: 'Revoke tokens' }));
    await waitFor(() => expect(api.find('DELETE', '/users/2/tokens')).toHaveLength(1));
  });

  it('grants administrator rights and deactivates after confirmations', async () => {
    const { user, api } = renderPage();
    await openMenu(user, 'Bob Tester', 'Make administrator');
    let confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Make Bob Tester an administrator?');
    await user.click(within(confirm).getByRole('button', { name: 'Make administrator' }));
    await waitFor(() => expect(api.find('PATCH', '/users/2')).toHaveLength(1));
    expect(api.find('PATCH', '/users/2')[0]!.body).toEqual({ isAdmin: true });

    await openMenu(user, 'Bob Tester', 'Deactivate');
    confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Deactivate Bob Tester?');
    await user.click(within(confirm).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(api.find('PATCH', '/users/2')).toHaveLength(2));
    expect(api.find('PATCH', '/users/2')[1]!.body).toEqual({ isActive: false });
  });

  it('reactivates and removes administrator rights', async () => {
    const { user, api } = renderPage({
      'GET /users': [me, bob, { ...carol, isAdmin: true }],
    });
    await user.click(await screen.findByRole('switch', { name: 'Show inactive (1)' }));
    await openMenu(user, 'Carol Gone', 'Reactivate');
    await waitFor(() => expect(api.find('PATCH', '/users/3')).toHaveLength(1));
    expect(api.find('PATCH', '/users/3')[0]!.body).toEqual({ isActive: true });
    await openMenu(user, 'Carol Gone', 'Remove administrator rights');
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Carol Gone keeps only the roles given in each project.');
    await user.click(within(confirm).getByRole('button', { name: 'Remove rights' }));
    await waitFor(() => expect(api.find('PATCH', '/users/3')).toHaveLength(2));
    expect(api.find('PATCH', '/users/3')[1]!.body).toEqual({ isAdmin: false });
  });

  it('offers no self-demotion in the row menu', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Actions for Ada Admin' }));
    expect(await screen.findByRole('menuitem', { name: 'Edit details' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /administrator/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Deactivate' })).not.toBeInTheDocument();
  });
});

describe('filterUsers', () => {
  it('matches name, username and email and sorts by name', () => {
    const users = [carol, bob, me];
    expect(filterUsers(users, '', false).map((u) => u.id)).toEqual([1, 2]);
    expect(filterUsers(users, '', true).map((u) => u.id)).toEqual([1, 2, 3]);
    expect(filterUsers(users, ' CAROL ', true).map((u) => u.id)).toEqual([3]);
    expect(filterUsers(users, 'admin', false).map((u) => u.id)).toEqual([1]);
  });
});
