import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  UserDTO,
  UserRef,
} from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

export type CreateUserBody = z.input<typeof createUserSchema>;
export type UpdateUserBody = z.input<typeof updateUserSchema>;
export type ResetPasswordBody = z.input<typeof resetPasswordSchema>;

/** All users (admin only). */
export function useUsers(enabled = true) {
  return useQuery({
    queryKey: qk.users,
    queryFn: () => api.get<UserDTO[]>('/users'),
    enabled,
  });
}

/** Active users matching `q` — for member pickers (any logged-in user). */
export function useUserLookup(q: string, enabled = true) {
  return useQuery({
    queryKey: qk.userLookup(q),
    queryFn: () => api.get<UserRef[]>('/users/lookup', { q }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserBody) => api.post<UserDTO>('/users', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...body }: UpdateUserBody & { userId: number }) =>
      api.patch<UserDTO>(`/users/${userId}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.users });
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ userId, ...body }: ResetPasswordBody & { userId: number }) =>
      api.post<void>(`/users/${userId}/reset-password`, body),
  });
}

/** Admin: revokes every API token of a user (leaked token, person leaving the team). */
export function useRevokeUserTokens() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => api.delete(`/users/${userId}/tokens`),
    // The admin's own token list changes when they revoke their own tokens.
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.tokens }),
  });
}
