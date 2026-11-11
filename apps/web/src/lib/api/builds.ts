import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { buildSchema, BuildDTO, updateBuildSchema } from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

export type BuildBody = z.input<typeof buildSchema>;
export type UpdateBuildBody = z.input<typeof updateBuildSchema>;

/** Builds of one release, or of every release of the project (`releaseId` = null). */
export function useBuilds(projectId: number, releaseId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.buildList(projectId, releaseId),
    queryFn: () =>
      api.get<BuildDTO[]>(
        `/projects/${projectId}/builds${releaseId === null ? '' : `?releaseId=${releaseId}`}`,
      ),
    enabled,
    staleTime: 30_000,
  });
}

/** Builds appear on runs, defects, the dashboard and reports: all of them are refreshed. */
function useInvalidateBuilds(projectId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.builds(projectId) });
    void qc.invalidateQueries({ queryKey: qk.plans(projectId) });
    void qc.invalidateQueries({ queryKey: qk.runs(projectId) });
    void qc.invalidateQueries({ queryKey: qk.defects(projectId) });
    void qc.invalidateQueries({ queryKey: ['dashboard', projectId] });
  };
}

export function useCreateBuild(projectId: number) {
  const invalidate = useInvalidateBuilds(projectId);
  return useMutation({
    mutationFn: ({ releaseId, ...body }: BuildBody & { releaseId: number }) =>
      api.post<BuildDTO>(`/projects/${projectId}/releases/${releaseId}/builds`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateBuild(projectId: number) {
  const invalidate = useInvalidateBuilds(projectId);
  return useMutation({
    mutationFn: ({ buildId, ...body }: UpdateBuildBody & { buildId: number }) =>
      api.patch<BuildDTO>(`/projects/${projectId}/builds/${buildId}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteBuild(projectId: number) {
  const invalidate = useInvalidateBuilds(projectId);
  return useMutation({
    mutationFn: (buildId: number) => api.delete(`/projects/${projectId}/builds/${buildId}`),
    onSuccess: invalidate,
  });
}
