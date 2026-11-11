import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  createProjectSchema,
  MemberDTO,
  PlanDTO,
  ProjectDTO,
  releaseSchema,
  ReleaseDTO,
  setMembersSchema,
  updateProjectSchema,
  updateReleaseSchema,
} from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

export type CreateProjectBody = z.input<typeof createProjectSchema>;
export type UpdateProjectBody = z.input<typeof updateProjectSchema>;
export type SetMembersBody = z.input<typeof setMembersSchema>;
export type ReleaseBody = z.input<typeof releaseSchema>;
export type UpdateReleaseBody = z.input<typeof updateReleaseSchema>;

// ------------------------------------------------------------------ projects

export function useProjects(enabled = true) {
  return useQuery({
    queryKey: qk.projects,
    queryFn: () => api.get<ProjectDTO[]>('/projects'),
    enabled,
    staleTime: 30_000,
  });
}

export function useProjectById(projectId: number | null) {
  return useQuery({
    queryKey: qk.project(projectId ?? 0),
    queryFn: () => api.get<ProjectDTO>(`/projects/${projectId}`),
    enabled: projectId !== null && projectId > 0,
    staleTime: 30_000,
    retry: (count, err) => count < 2 && !(err as { status?: number }).status,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProjectBody) => api.post<ProjectDTO>('/projects', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.projects });
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useUpdateProject(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProjectBody) => api.patch<ProjectDTO>(`/projects/${projectId}`, body),
    onSuccess: (project) => {
      qc.setQueryData(qk.project(projectId), project);
      void qc.invalidateQueries({ queryKey: qk.projects, exact: true });
      // Memberships carry the project name; the doc-no suggestion follows the pattern.
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: qk.docNoSuggestion(projectId) });
    },
  });
}

/**
 * Document numbers of all plans of the project, for the live preview of a doc-no pattern
 * (own key under `plans`, so plan changes refresh it).
 */
export function usePlanDocNos(projectId: number) {
  return useQuery({
    queryKey: [...qk.plans(projectId), 'doc-nos'] as const,
    queryFn: async () =>
      (await api.get<PlanDTO[]>(`/projects/${projectId}/plans`)).map((p) => p.docNo),
    staleTime: 30_000,
  });
}

// ------------------------------------------------------------------ members

export function useMembers(projectId: number) {
  return useQuery({
    queryKey: qk.members(projectId),
    queryFn: () => api.get<MemberDTO[]>(`/projects/${projectId}/members`),
    staleTime: 30_000,
  });
}

/** Replaces the member list (send the full list). */
export function useSetMembers(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetMembersBody) =>
      api.put<MemberDTO[]>(`/projects/${projectId}/members`, body),
    onSuccess: (members) => {
      qc.setQueryData(qk.members(projectId), members);
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

// ------------------------------------------------------------------ releases

export function useReleases(projectId: number) {
  return useQuery({
    queryKey: qk.releases(projectId),
    queryFn: () => api.get<ReleaseDTO[]>(`/projects/${projectId}/releases`),
    staleTime: 30_000,
  });
}

function useInvalidateReleases(projectId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.releases(projectId) });
    void qc.invalidateQueries({ queryKey: qk.plans(projectId) });
    void qc.invalidateQueries({ queryKey: ['dashboard', projectId] });
  };
}

export function useCreateRelease(projectId: number) {
  const invalidate = useInvalidateReleases(projectId);
  return useMutation({
    mutationFn: (body: ReleaseBody) =>
      api.post<ReleaseDTO>(`/projects/${projectId}/releases`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateRelease(projectId: number) {
  const invalidate = useInvalidateReleases(projectId);
  return useMutation({
    mutationFn: ({ releaseId, ...body }: UpdateReleaseBody & { releaseId: number }) =>
      api.patch<ReleaseDTO>(`/projects/${projectId}/releases/${releaseId}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteRelease(projectId: number) {
  const invalidate = useInvalidateReleases(projectId);
  return useMutation({
    mutationFn: (releaseId: number) => api.delete(`/projects/${projectId}/releases/${releaseId}`),
    onSuccess: invalidate,
  });
}
