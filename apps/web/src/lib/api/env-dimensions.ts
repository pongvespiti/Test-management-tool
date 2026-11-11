import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EnvDimensionsDTO, EnvDimensionsInput, NormalizeRunsResultDTO } from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

/** Lists of values behind the run environment labels (Platform, OS ver, Unit model …). */
export function useEnvDimensions(projectId: number | null) {
  return useQuery({
    queryKey: qk.envDimensions(projectId ?? 0),
    queryFn: () => api.get<EnvDimensionsDTO>(`/projects/${projectId}/env-dimensions`),
    enabled: projectId !== null,
    staleTime: 60_000,
  });
}

export function useSaveEnvDimensions(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EnvDimensionsInput) =>
      api.put<EnvDimensionsDTO>(`/projects/${projectId}/env-dimensions`, body),
    onSuccess: (data) => qc.setQueryData(qk.envDimensions(projectId), data),
  });
}

/** Respells the environment of every run to the lists (and adds the values found in runs). */
export function useNormalizeRuns(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<NormalizeRunsResultDTO>(`/projects/${projectId}/env-dimensions/normalize-runs`),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.envDimensions(projectId) }),
        qc.invalidateQueries({ queryKey: qk.runs(projectId) }),
        qc.invalidateQueries({ queryKey: qk.plans(projectId) }),
      ]);
    },
  });
}
