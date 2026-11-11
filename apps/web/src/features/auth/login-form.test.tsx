import { describe, expect, it, jest } from '@jest/globals';
import type { MeDTO } from '@tmt/shared';
import { screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/client';
import { mockRouter, setNavigation } from '@/test/mocks/next-navigation';
import { makeUser, renderWithProviders } from '@/test/render';
import { LoginForm, loginErrorMessage } from './login-form';

const signedOut = { user: null, me: null } as const;

describe('LoginForm', () => {
  it('validates required fields before calling the API', async () => {
    const login = jest.fn<(b: { username: string; password: string }) => Promise<MeDTO>>();
    const { user } = renderWithProviders(<LoginForm />, { auth: { ...signedOut, login } });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findAllByText('Required')).toHaveLength(2);
    expect(login).not.toHaveBeenCalled();
  });

  it('signs in and returns to the requested page', async () => {
    setNavigation({ search: '?next=%2Fprojects%2F3%2Fcases' });
    const login = jest
      .fn<(b: { username: string; password: string }) => Promise<MeDTO>>()
      .mockResolvedValue({ user: makeUser(), memberships: [] });
    const { user } = renderWithProviders(<LoginForm />, { auth: { ...signedOut, login } });
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'Secret123!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/projects/3/cases'));
    expect(login).toHaveBeenCalledWith({ username: 'alice', password: 'Secret123!' });
  });

  it('never redirects to another site', async () => {
    setNavigation({ search: '?next=https%3A%2F%2Fevil.example' });
    const login = jest
      .fn<(b: { username: string; password: string }) => Promise<MeDTO>>()
      .mockResolvedValue({ user: makeUser(), memberships: [] });
    const { user } = renderWithProviders(<LoginForm />, { auth: { ...signedOut, login } });
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });

  it('sends users who must change their password to the password page', async () => {
    const login = jest
      .fn<(b: { username: string; password: string }) => Promise<MeDTO>>()
      .mockResolvedValue({ user: makeUser({ mustChangePassword: true }), memberships: [] });
    const { user } = renderWithProviders(<LoginForm />, { auth: { ...signedOut, login } });
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/change-password'));
  });

  it('shows a readable message when sign-in fails', async () => {
    const login = jest
      .fn<(b: { username: string; password: string }) => Promise<MeDTO>>()
      .mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong username or password'));
    const { user } = renderWithProviders(<LoginForm />, { auth: { ...signedOut, login } });
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.');
  });

  it('redirects right away when already signed in', async () => {
    renderWithProviders(<LoginForm />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });
});

describe('loginErrorMessage', () => {
  it('explains locked, disabled and rate-limited accounts', () => {
    expect(loginErrorMessage(new ApiError(423, 'ACCOUNT_LOCKED', 'x'))).toMatch(/locked/);
    expect(loginErrorMessage(new ApiError(403, 'ACCOUNT_DISABLED', 'x'))).toMatch(/disabled/);
    expect(loginErrorMessage(new ApiError(429, 'RATE_LIMITED', 'x'))).toMatch(/Wait a minute/);
    expect(loginErrorMessage(new Error('Server down'))).toBe('Server down');
  });
});
