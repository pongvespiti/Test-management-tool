/** Owner: W6 (integrations page). Defect pages use `useIntegrationsStatus` to show Jira actions. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  IntegrationsStatusDTO,
  JiraConfigDTO,
  jiraConfigSchema,
  JiraTestResultDTO,
} from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

export type JiraConfigBody = z.input<typeof jiraConfigSchema>;

/** Integration status any member may see (no secrets). */
export function useIntegrationsStatus(projectId: number) {
  return useQuery({
    queryKey: qk.integrations(projectId),
    queryFn: () => api.get<IntegrationsStatusDTO>(`/projects/${projectId}/integrations`),
    staleTime: 60_000,
  });
}

/** Lead only. `null` when Jira is not configured. */
export function useJiraConfig(projectId: number, enabled = true) {
  return useQuery({
    queryKey: qk.jiraConfig(projectId),
    queryFn: () => api.get<JiraConfigDTO | null>(`/projects/${projectId}/integrations/jira`),
    enabled,
  });
}

export function useSaveJiraConfig(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: JiraConfigBody) =>
      api.put<JiraConfigDTO>(`/projects/${projectId}/integrations/jira`, body),
    onSuccess: (config) => {
      qc.setQueryData(qk.jiraConfig(projectId), config);
      void qc.invalidateQueries({ queryKey: qk.integrations(projectId), exact: true });
    },
  });
}

export function useDeleteJiraConfig(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/integrations/jira`),
    onSuccess: () => {
      qc.setQueryData(qk.jiraConfig(projectId), null);
      void qc.invalidateQueries({ queryKey: qk.integrations(projectId), exact: true });
    },
  });
}

/**
 * Tests the given (unsaved) settings — a blank secret uses the stored one for the same server —
 * or the stored settings when `body` is omitted. Always 200: `ok: false` + message on failure.
 */
export function useTestJira(projectId: number) {
  return useMutation({
    mutationFn: (body?: JiraConfigBody) =>
      api.post<JiraTestResultDTO>(`/projects/${projectId}/integrations/jira/test`, body ?? {}),
  });
}
