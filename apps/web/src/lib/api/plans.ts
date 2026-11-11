import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  AttachmentDTO,
  createPlanSchema,
  MatrixDTO,
  MatrixGroupBy,
  PlanDTO,
  updatePlanSchema,
} from '@tmt/shared';
import { safeFileName } from '@tmt/shared';
import { api, downloadFile } from './client';
import { exceptUnder, qk } from './keys';

export type CreatePlanBody = z.input<typeof createPlanSchema>;
export type UpdatePlanBody = z.input<typeof updatePlanSchema>;

/** Refreshes plan lists/details, runs, the dashboard and reports after plan-level changes. */
function invalidatePlans(
  qc: QueryClient,
  projectId: number,
  /** Leaves some plan queries alone (see `exceptUnder`). */
  predicate?: ReturnType<typeof exceptUnder>,
): void {
  void qc.invalidateQueries({ queryKey: qk.plans(projectId), predicate });
  void qc.invalidateQueries({ queryKey: qk.runs(projectId) });
  void qc.invalidateQueries({ queryKey: ['dashboard', projectId] });
  void qc.invalidateQueries({ queryKey: qk.reports(projectId) });
}

export function useInvalidatePlans(projectId: number) {
  const qc = useQueryClient();
  return () => invalidatePlans(qc, projectId);
}

/** Plans of the project, newest first; `releaseId` filters (the previous list stays while loading). */
export function usePlans(projectId: number, releaseId: number | null = null) {
  return useQuery({
    queryKey: qk.planList(projectId, releaseId),
    queryFn: () =>
      api.get<PlanDTO[]>(`/projects/${projectId}/plans`, { releaseId: releaseId ?? undefined }),
    placeholderData: keepPreviousData,
  });
}

export function usePlan(projectId: number, planId: number | null) {
  return useQuery({
    queryKey: qk.plan(projectId, planId ?? 0),
    queryFn: () => api.get<PlanDTO>(`/projects/${projectId}/plans/${planId}`),
    enabled: planId !== null && planId > 0,
  });
}

/** Next free document number for the current month (pattern from the project settings). */
export function useDocNoSuggestion(projectId: number, enabled = true) {
  return useQuery({
    queryKey: qk.docNoSuggestion(projectId),
    queryFn: () => api.get<{ docNo: string }>(`/projects/${projectId}/plans/doc-no-suggestion`),
    enabled,
    staleTime: 0,
  });
}

export function useCreatePlan(projectId: number) {
  const invalidate = useInvalidatePlans(projectId);
  return useMutation({
    mutationFn: (body: CreatePlanBody) => api.post<PlanDTO>(`/projects/${projectId}/plans`, body),
    onSuccess: invalidate,
  });
}

export function useUpdatePlan(projectId: number) {
  const invalidate = useInvalidatePlans(projectId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, ...body }: UpdatePlanBody & { planId: number }) =>
      api.patch<PlanDTO>(`/projects/${projectId}/plans/${planId}`, body),
    onSuccess: (plan) => {
      qc.setQueryData(qk.plan(projectId, plan.id), plan);
      invalidate();
    },
  });
}

export function useDeletePlan(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: number) => api.delete(`/projects/${projectId}/plans/${planId}`),
    onSuccess: async (_res, planId) => {
      // The open plan page must not refetch the plan it just deleted (404): its queries stop
      // here and are skipped by the refresh below.
      const deleted = qk.plan(projectId, planId);
      await qc.cancelQueries({ queryKey: deleted });
      invalidatePlans(qc, projectId, exceptUnder(deleted));
    },
  });
}

/** Marks the plan completed — results become read-only until a lead reopens it. */
export function useCompletePlan(projectId: number) {
  const invalidate = useInvalidatePlans(projectId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: number) =>
      api.post<PlanDTO>(`/projects/${projectId}/plans/${planId}/complete`),
    onSuccess: (plan) => {
      qc.setQueryData(qk.plan(projectId, plan.id), plan);
      invalidate();
    },
  });
}

export function useReopenPlan(projectId: number) {
  const invalidate = useInvalidatePlans(projectId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: number) =>
      api.post<PlanDTO>(`/projects/${projectId}/plans/${planId}/reopen`),
    onSuccess: (plan) => {
      qc.setQueryData(qk.plan(projectId, plan.id), plan);
      invalidate();
    },
  });
}

/** "Summary by unit type": runs × groups (the previous grouping stays visible while loading). */
export function useMatrix(projectId: number, planId: number | null, groupBy: MatrixGroupBy) {
  return useQuery({
    queryKey: qk.matrix(projectId, planId ?? 0, groupBy),
    queryFn: () => api.get<MatrixDTO>(`/projects/${projectId}/plans/${planId}/matrix`, { groupBy }),
    enabled: planId !== null && planId > 0,
    placeholderData: keepPreviousData,
  });
}

/** Downloads the test report (controlled Excel form). `templateId` 0/undefined = default. */
export function downloadPlanExport(
  projectId: number,
  plan: Pick<PlanDTO, 'id' | 'docNo' | 'title'>,
  templateId?: number,
) {
  return downloadFile(
    `/projects/${projectId}/plans/${plan.id}/export.xlsx`,
    { templateId },
    `${safeFileName(`${plan.docNo} ${plan.title}`, 'test-report')}.xlsx`,
  );
}

/** Attaches (or replaces) the scanned, hand-signed report of a completed plan (pdf/png/jpg). */
export function useUploadSignedCopy(projectId: number) {
  const invalidate = useInvalidatePlans(projectId);
  return useMutation({
    mutationFn: ({ planId, file }: { planId: number; file: File }) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      return api.upload<AttachmentDTO>(`/projects/${projectId}/plans/${planId}/signed-copy`, fd, {
        method: 'PUT',
      });
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSignedCopy(projectId: number) {
  const invalidate = useInvalidatePlans(projectId);
  return useMutation({
    mutationFn: (planId: number) =>
      api.delete(`/projects/${projectId}/plans/${planId}/signed-copy`),
    onSuccess: invalidate,
  });
}
