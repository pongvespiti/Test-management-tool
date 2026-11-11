import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssignSuitesInput, AssignSuitesResultDTO, TopicsDTO } from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

/**
 * Progress by topic and suite in a release. `userId` null = the whole team (managers and leads);
 * a number = that person's own cases. `releaseId` null = the newest active release.
 */
export function useTopics(projectId: number, releaseId: number | null, userId: number | null) {
  return useQuery({
    queryKey: qk.topics(projectId, releaseId, userId),
    queryFn: () =>
      api.get<TopicsDTO>(`/projects/${projectId}/topics`, {
        releaseId: releaseId ?? undefined,
        userId: userId ?? undefined,
      }),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Gives the runs of some suites of a release to a person (managers and leads). */
export function useAssignSuites(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AssignSuitesInput) =>
      api.post<AssignSuitesResultDTO>(`/projects/${projectId}/topics/assign`, body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['topics', projectId] }),
        qc.invalidateQueries({ queryKey: ['dashboard', projectId] }),
        qc.invalidateQueries({ queryKey: ['my-work', projectId] }),
        qc.invalidateQueries({ queryKey: qk.plans(projectId) }),
        qc.invalidateQueries({ queryKey: qk.runs(projectId) }),
        qc.invalidateQueries({ queryKey: qk.reports(projectId) }),
      ]);
    },
  });
}
