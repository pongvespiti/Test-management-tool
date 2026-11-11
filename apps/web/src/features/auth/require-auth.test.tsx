import { describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/client';
import { mockRouter, setNavigation } from '@/test/mocks/next-navigation';
import { makeUser, renderWithProviders } from '@/test/render';
import { RequireAdmin } from './require-admin';
import { RequireAuth } from './require-auth';

describe('RequireAuth', () => {
  it('renders the page for a signed-in user', () => {
    renderWithProviders(<RequireAuth>secret page</RequireAuth>);
    expect(screen.getByText('secret page')).toBeInTheDocument();
  });

  it('shows a spinner while the session is checked', () => {
    renderWithProviders(<RequireAuth>secret page</RequireAuth>, { auth: { loading: true } });
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
  });

  it('sends anonymous visitors to the login page with a back-link', async () => {
    window.history.pushState({}, '', '/projects/3/cases?suite=2');
    renderWithProviders(<RequireAuth>secret page</RequireAuth>, { auth: { user: null, me: null } });
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith(
        '/login?next=%2Fprojects%2F3%2Fcases%3Fsuite%3D2',
      ),
    );
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
  });

  it('forces a password change first', async () => {
    setNavigation({ pathname: '/projects' });
    renderWithProviders(<RequireAuth>secret page</RequireAuth>, {
      auth: { user: makeUser({ mustChangePassword: true }) },
    });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/change-password'));
  });

  it('explains when the server cannot be reached', () => {
    renderWithProviders(<RequireAuth>secret page</RequireAuth>, {
      auth: {
        user: null,
        me: null,
        error: new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server.'),
      },
    });
    expect(screen.getByText('Cannot reach the server')).toBeInTheDocument();
  });
});

describe('RequireAdmin', () => {
  it('shows admin pages to administrators only', () => {
    const { unmount } = renderWithProviders(<RequireAdmin>users</RequireAdmin>, {
      auth: { user: makeUser({ isAdmin: true }), isAdmin: true },
    });
    expect(screen.getByText('users')).toBeInTheDocument();
    unmount();
    renderWithProviders(<RequireAdmin>users</RequireAdmin>);
    expect(screen.getByText('You do not have access')).toBeInTheDocument();
  });
});
