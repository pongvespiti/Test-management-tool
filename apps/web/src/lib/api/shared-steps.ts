/** Owner: W5 (shared steps page, step editor, tags, review workflow). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { z } from 'zod';
import type {
  createSharedStepSchema,
  reviewDecisionSchema,
  SharedStepDetailDTO,
  SharedStepDTO,
  submitReviewSchema,
  TagCountDTO,
  TestCaseDTO,
  updateSharedStepSchema,
} from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

export type CreateSharedStepBody = z.input<typeof createSharedStepSchema>;
export type UpdateSharedStepBody = z.input<typeof updateSharedStepSchema>;
export type SubmitReviewBody = z.input<typeof submitReviewSchema>;
export type ReviewDecisionBody = z.input<typeof reviewDecisionSchema>;

// ------------------------------------------------------------------ shared steps

export function useSharedSteps(projectId: number, enabled = true) {
  return useQuery({
    queryKey: qk.sharedSteps(projectId),
    queryFn: () => api.get<SharedStepDTO[]>(`/projects/${projectId}/shared-steps`),
    enabled,
    staleTime: 15_000,
  });
}

export function useSharedStep(projectId: number, sharedStepId: number | null) {
  return useQuery({
    queryKey: qk.sharedStep(projectId, sharedStepId ?? 0),
    queryFn: () =>
      api.get<SharedStepDetailDTO>(`/projects/${projectId}/shared-steps/${sharedStepId}`),
    enabled: sharedStepId !== null && sharedStepId > 0,
  });
}

/** Loads the newest version of a shared step set into the cache (e.g. after a version conflict). */
export function useFetchSharedStep(projectId: number) {
  const qc = useQueryClient();
  return useCallback(
    (sharedStepId: number) =>
      qc.fetchQuery({
        queryKey: qk.sharedStep(projectId, sharedStepId),
        queryFn: () =>
          api.get<SharedStepDetailDTO>(`/projects/${projectId}/shared-steps/${sharedStepId}`),
        staleTime: 0,
      }),
    [qc, projectId],
  );
}

function useInvalidateShared(projectId: number) {
  const qc = useQueryClient();
  return () => {
    // List and details share the `['shared-steps', projectId]` prefix.
    void qc.invalidateQueries({ queryKey: qk.sharedSteps(projectId) });
    // Cases embed expanded shared steps.
    void qc.invalidateQueries({ queryKey: qk.cases(projectId) });
  };
}

export function useCreateSharedStep(projectId: number) {
  const invalidate = useInvalidateShared(projectId);
  return useMutation({
    mutationFn: (body: CreateSharedStepBody) =>
      api.post<SharedStepDTO>(`/projects/${projectId}/shared-steps`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateSharedStep(projectId: number) {
  const invalidate = useInvalidateShared(projectId);
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateSharedStepBody & { id: number }) =>
      api.patch<SharedStepDTO>(`/projects/${projectId}/shared-steps/${id}`, body),
    onSuccess: invalidate,
  });
}

/**
 * Deletes a shared step. A step that is still used answers 409 `SHARED_STEP_IN_USE`
 * (`details.usageCount`); `inline: true` first copies its steps into every using case.
 */
export function useDeleteSharedStep(projectId: number) {
  const invalidate = useInvalidateShared(projectId);
  return useMutation({
    mutationFn: ({ id, inline = false }: { id: number; inline?: boolean }) =>
      api.delete(`/projects/${projectId}/shared-steps/${id}`, {
        inline: inline ? 'true' : undefined,
      }),
    onSuccess: invalidate,
  });
}

// ------------------------------------------------------------------ tags

export function useTags(projectId: number) {
  return useQuery({
    queryKey: qk.tags(projectId),
    queryFn: () => api.get<TagCountDTO[]>(`/projects/${projectId}/tags`),
    staleTime: 30_000,
  });
}

// ------------------------------------------------------------------ review workflow

/** Cases in review, oldest request first; `mine` = reviewer is me or unassigned. */
export function useReviewQueue(projectId: number, mine = false) {
  return useQuery({
    queryKey: qk.reviews(projectId, mine),
    queryFn: () => api.get<TestCaseDTO[]>(`/projects/${projectId}/reviews`, { mine }),
  });
}

/** After a review transition: fresh case, lists, queue, comments (a note becomes a comment). */
function useAfterReview(projectId: number) {
  const qc = useQueryClient();
  return (tc: TestCaseDTO) => {
    qc.setQueryData(qk.case(projectId, tc.id), tc);
    void qc.invalidateQueries({ queryKey: qk.cases(projectId) });
    void qc.invalidateQueries({ queryKey: qk.sections(projectId) });
    void qc.invalidateQueries({ queryKey: qk.comments(projectId, 'test_case', tc.id) });
    void qc.invalidateQueries({ queryKey: ['activity', projectId] });
  };
}

export function useSubmitReview(projectId: number) {
  const after = useAfterReview(projectId);
  return useMutation({
    mutationFn: ({ caseId, ...body }: SubmitReviewBody & { caseId: number }) =>
      api.post<TestCaseDTO>(`/projects/${projectId}/cases/${caseId}/submit-review`, body),
    onSuccess: after,
  });
}

export function useReviewDecision(projectId: number) {
  const after = useAfterReview(projectId);
  return useMutation({
    mutationFn: ({ caseId, ...body }: ReviewDecisionBody & { caseId: number }) =>
      api.post<TestCaseDTO>(`/projects/${projectId}/cases/${caseId}/review`, body),
    onSuccess: after,
  });
}
