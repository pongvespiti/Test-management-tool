'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { MeDTO, ProjectRole, UserDTO } from '@tmt/shared';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLogin, useLogout, useMe, type LoginBody } from '@/lib/api/auth';
import { setUnauthorizedHandler } from '@/lib/api/client';
import { qk } from '@/lib/api/keys';

export interface AuthContextValue {
  me: MeDTO | null;
  user: UserDTO | null;
  isAdmin: boolean;
  /** True until the first `/auth/me` probe has finished. */
  loading: boolean;
  /** Probe failed for a reason other than 401 (server down). */
  error: unknown;
  login: (body: LoginBody) => Promise<MeDTO>;
  logout: () => Promise<void>;
  /** Role in a project from the memberships (admins: lead). */
  roleIn: (projectId: number) => ProjectRole | null;
}

/** Exported for tests, which provide a fixed value instead of the real session probe. */
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQuery = useMe();
  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  // Any 401 from the API (expired session) → forget the user; RequireAuth redirects to /login.
  useEffect(() => {
    setUnauthorizedHandler(() => qc.setQueryData(qk.me, null));
    return () => setUnauthorizedHandler(null);
  }, [qc]);

  const me = meQuery.data ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      user: me?.user ?? null,
      isAdmin: me?.user.isAdmin ?? false,
      loading: meQuery.isPending,
      error: meQuery.isError ? meQuery.error : null,
      login: (body) => loginMutation.mutateAsync(body),
      logout: async () => {
        await logoutMutation.mutateAsync().catch(() => undefined);
      },
      roleIn: (projectId) => {
        if (!me) return null;
        if (me.user.isAdmin) return 'lead';
        return me.memberships.find((m) => m.projectId === projectId)?.role ?? null;
      },
    }),
    [me, meQuery.isPending, meQuery.isError, meQuery.error, loginMutation, logoutMutation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() used outside AuthProvider');
  return ctx;
}
