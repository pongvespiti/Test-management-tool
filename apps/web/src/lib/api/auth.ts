import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { changePasswordSchema, loginSchema, MeDTO } from '@tmt/shared';
import { api, ApiError } from './client';
import { qk } from './keys';

export type LoginBody = z.input<typeof loginSchema>;
export type ChangePasswordBody = z.input<typeof changePasswordSchema>;

/** Current user; resolves to `null` when not logged in (401). */
export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async (): Promise<MeDTO | null> => {
      try {
        return await api.get<MeDTO>('/auth/me', undefined, { skipAuthRedirect: true });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginBody) =>
      api.post<MeDTO>('/auth/login', body, { skipAuthRedirect: true }),
    onSuccess: (me) => {
      qc.clear();
      qc.setQueryData(qk.me, me);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout', undefined, { skipAuthRedirect: true }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(qk.me, null);
    },
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangePasswordBody) => api.post<void>('/auth/change-password', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useHealth() {
  return useQuery({
    queryKey: qk.health,
    queryFn: () =>
      api.get<{ status: string; db: string; version: string }>('/api/health', undefined, {
        skipAuthRedirect: true,
      }),
    staleTime: 60_000,
  });
}
