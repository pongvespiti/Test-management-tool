/** Owner: W6 (API tokens page, REST API docs page). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { ApiTokenDTO, CreatedTokenDTO, createTokenSchema } from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

export type CreateTokenBody = z.input<typeof createTokenSchema>;

export function useTokens() {
  return useQuery({
    queryKey: qk.tokens,
    queryFn: () => api.get<ApiTokenDTO[]>('/auth/tokens'),
  });
}

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTokenBody) => api.post<CreatedTokenDTO>('/auth/tokens', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.tokens }),
  });
}

export function useRevokeToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: number) => api.delete(`/auth/tokens/${tokenId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.tokens }),
  });
}

/** OpenAPI 3.1 document of the server (any signed-in user). */
export function useOpenApi() {
  return useQuery({
    queryKey: qk.openapi,
    queryFn: () => api.get<Record<string, unknown>>('/openapi.json'),
    staleTime: Infinity,
  });
}
