import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClientProvider } from '@tanstack/react-query';
import type { MeDTO } from '@tmt/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useChangePassword, useHealth } from '@/lib/api/auth';
import { api, ApiError } from '@/lib/api/client';
import { createTestQueryClient, jsonResponse, makeUser } from '@/test/render';
import { AuthProvider, useAuth } from './auth-provider';

type FetchMock = jest.MockedFunction<typeof fetch>;

const me = (overrides: Partial<MeDTO> = {}): MeDTO => ({
  user: makeUser(),
  memberships: [{ projectId: 3, role: 'tester' }] as MeDTO['memberships'],
  ...overrides,
});

const unauthorized = () =>
  jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'Sign in' } }, 401);

function Probe() {
  const auth = useAuth();
  const health = useHealth();
  const changePassword = useChangePassword();
  const [failure, setFailure] = useState('');
  return (
    <div>
      <p data-testid="state">
        {auth.loading ? 'loading' : auth.error ? 'error' : (auth.user?.username ?? 'signed out')}
      </p>
      <p data-testid="admin">{String(auth.isAdmin)}</p>
      <p data-testid="roles">
        {String(auth.roleIn(3))}/{String(auth.roleIn(9))}
      </p>
      <p data-testid="health">{health.data?.version ?? ''}</p>
      <p data-testid="failure">{failure}</p>
      <button
        type="button"
        onClick={() =>
          void auth
            .login({ username: 'alice', password: 'secret-123' })
            .catch((e: unknown) => setFailure(e instanceof ApiError ? e.code : 'unknown'))
        }
      >
        login
      </button>
      <button type="button" onClick={() => void auth.logout()}>
        logout
      </button>
      <button
        type="button"
        onClick={() =>
          void changePassword.mutateAsync({ currentPassword: 'a', newPassword: 'New-pass-123' })
        }
      >
        change password
      </button>
      <button type="button" onClick={() => void api.get('/projects').catch(() => undefined)}>
        call api
      </button>
    </div>
  );
}

function renderProvider() {
  const queryClient = createTestQueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient, user: userEvent.setup() };
}

const state = () => screen.getByTestId('state').textContent;
const urlOf = (call: Parameters<typeof fetch>) => String(call[0]);

describe('AuthProvider', () => {
  let fetchMock: FetchMock;
  const realFetch = globalThis.fetch;
  /** Responses by request path; `/auth/me` can be changed during a test. */
  let routes: Record<string, () => Response>;

  beforeEach(() => {
    routes = {
      '/api/v1/auth/me': unauthorized,
      '/api/health': () => jsonResponse({ status: 'ok', db: 'ok', version: '2.0.0' }),
    };
    fetchMock = jest.fn(async (input: Parameters<typeof fetch>[0]) => {
      const handler = routes[String(input)];
      return handler
        ? handler()
        : jsonResponse({ error: { code: 'NOT_FOUND', message: '?' } }, 404);
    }) as FetchMock;
    globalThis.fetch = fetchMock;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('refuses to be used outside the provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow('useAuth() used outside AuthProvider');
    spy.mockRestore();
  });

  it('probes the session: loading, then signed out on 401 without treating it as an error', async () => {
    renderProvider();
    expect(state()).toBe('loading');
    await waitFor(() => expect(state()).toBe('signed out'));
    expect(screen.getByTestId('roles')).toHaveTextContent('null/null');
    expect(screen.getByTestId('admin')).toHaveTextContent('false');
    await waitFor(() => expect(screen.getByTestId('health')).toHaveTextContent('2.0.0'));
  });

  it('reports a failed probe (server down) as an error', async () => {
    routes['/api/v1/auth/me'] = () =>
      jsonResponse({ error: { code: 'DB_UNAVAILABLE', message: 'down' } }, 503);
    renderProvider();
    await waitFor(() => expect(state()).toBe('error'));
  });

  it('exposes the user and the project roles of a member', async () => {
    routes['/api/v1/auth/me'] = () => jsonResponse(me());
    renderProvider();
    await waitFor(() => expect(state()).toBe('alice'));
    expect(screen.getByTestId('roles')).toHaveTextContent('tester/null');
  });

  it('treats administrators as lead of every project', async () => {
    routes['/api/v1/auth/me'] = () =>
      jsonResponse(me({ user: makeUser({ isAdmin: true }), memberships: [] }));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('admin')).toHaveTextContent('true'));
    expect(screen.getByTestId('roles')).toHaveTextContent('lead/lead');
  });

  it('signs in: stores the user and drops data cached for the previous visitor', async () => {
    routes['/api/v1/auth/login'] = () => jsonResponse(me());
    const { user, queryClient } = renderProvider();
    await waitFor(() => expect(state()).toBe('signed out'));
    queryClient.setQueryData(['projects'], ['stale']);

    await user.click(screen.getByRole('button', { name: 'login' }));
    await waitFor(() => expect(state()).toBe('alice'));
    expect(queryClient.getQueryData(['projects'])).toBeUndefined();
    const call = fetchMock.mock.calls.find((c) => urlOf(c) === '/api/v1/auth/login')!;
    expect(call[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(call[1]!.body))).toEqual({
      username: 'alice',
      password: 'secret-123',
    });
  });

  it('hands a refused sign-in to the caller and stays signed out', async () => {
    routes['/api/v1/auth/login'] = () =>
      jsonResponse({ error: { code: 'INVALID_CREDENTIALS', message: 'Wrong' } }, 401);
    const { user } = renderProvider();
    await waitFor(() => expect(state()).toBe('signed out'));
    await user.click(screen.getByRole('button', { name: 'login' }));
    await waitFor(() =>
      expect(screen.getByTestId('failure')).toHaveTextContent('INVALID_CREDENTIALS'),
    );
    expect(state()).toBe('signed out');
  });

  it('signs out even when the server call fails', async () => {
    routes['/api/v1/auth/me'] = () => jsonResponse(me());
    routes['/api/v1/auth/logout'] = () =>
      jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }, 500);
    const { user, queryClient } = renderProvider();
    await waitFor(() => expect(state()).toBe('alice'));
    queryClient.setQueryData(['projects'], ['mine']);
    routes['/api/v1/auth/me'] = unauthorized;
    await user.click(screen.getByRole('button', { name: 'logout' }));
    await waitFor(() => expect(state()).toBe('signed out'));
    expect(queryClient.getQueryData(['projects'])).toBeUndefined();
  });

  it('forgets the user when any API call answers 401 (expired session)', async () => {
    routes['/api/v1/auth/me'] = () => jsonResponse(me());
    routes['/api/v1/projects'] = unauthorized;
    const { user } = renderProvider();
    await waitFor(() => expect(state()).toBe('alice'));
    await user.click(screen.getByRole('button', { name: 'call api' }));
    await waitFor(() => expect(state()).toBe('signed out'));
  });

  it('stops listening for 401 after unmount', async () => {
    routes['/api/v1/auth/me'] = () => jsonResponse(me());
    routes['/api/v1/projects'] = unauthorized;
    const { unmount, queryClient } = renderProvider();
    await waitFor(() => expect(state()).toBe('alice'));
    unmount();
    await act(async () => {
      await api.get('/projects').catch(() => undefined);
    });
    expect(queryClient.getQueryData(['me'])).toMatchObject({ user: { username: 'alice' } });
  });

  it('re-reads the user after a password change', async () => {
    routes['/api/v1/auth/me'] = () =>
      jsonResponse(me({ user: makeUser({ mustChangePassword: true }) }));
    routes['/api/v1/auth/change-password'] = () => new Response(null, { status: 204 });
    const { user } = renderProvider();
    await waitFor(() => expect(state()).toBe('alice'));
    const probes = () => fetchMock.mock.calls.filter((c) => urlOf(c) === '/api/v1/auth/me').length;
    const before = probes();
    await user.click(screen.getByRole('button', { name: 'change password' }));
    await waitFor(() => expect(probes()).toBe(before + 1));
  });
});
