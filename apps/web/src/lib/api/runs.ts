import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  bulkResultSchema,
  createRunSchema,
  duplicateRunSchema,
  RunCaseDetailDTO,
  RunCaseDTO,
  RunDTO,
  setResultSchema,
  updateRunSchema,
} from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

export type CreateRunBody = z.input<typeof createRunSchema>;
export type UpdateRunBody = z.input<typeof updateRunSchema>;
export type DuplicateRunBody = z.input<typeof duplicateRunSchema>;
export type SetResultBody = z.input<typeof setResultSchema>;
export type BulkResultBody = z.input<typeof bulkResultSchema>;

/** Results change counts everywhere: runs, plans (counts/matrix), dashboard, reports. */
function useInvalidateExecution(projectId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.runs(projectId) });
    void qc.invalidateQueries({ queryKey: qk.plans(projectId) });
    void qc.invalidateQueries({ queryKey: ['dashboard', projectId] });
    void qc.invalidateQueries({ queryKey: qk.reports(projectId) });
  };
}

export function useRuns(projectId: number, planId: number | null) {
  return useQuery({
    queryKey: qk.planRuns(projectId, planId ?? 0),
    queryFn: () => api.get<RunDTO[]>(`/projects/${projectId}/plans/${planId}/runs`),
    enabled: planId !== null && planId > 0,
  });
}

export function useRun(projectId: number, runId: number | null) {
  return useQuery({
    queryKey: qk.run(projectId, runId ?? 0),
    queryFn: () => api.get<RunDTO>(`/projects/${projectId}/runs/${runId}`),
    enabled: runId !== null && runId > 0,
  });
}

export function useCreateRun(projectId: number) {
  const invalidate = useInvalidateExecution(projectId);
  return useMutation({
    mutationFn: ({ planId, ...body }: CreateRunBody & { planId: number }) =>
      api.post<RunDTO>(`/projects/${projectId}/plans/${planId}/runs`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateRun(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, ...body }: UpdateRunBody & { runId: number }) =>
      api.patch<RunDTO>(`/projects/${projectId}/runs/${runId}`, body),
    onSuccess: (run) => {
      qc.setQueryData(qk.run(projectId, run.id), run);
      // Run fields (code, env, tester, judgement) appear in plan pages, reports and the run report.
      void qc.invalidateQueries({ queryKey: qk.runReport(projectId, run.id) });
      void qc.invalidateQueries({ queryKey: qk.plans(projectId) });
      void qc.invalidateQueries({ queryKey: ['dashboard', projectId] });
      void qc.invalidateQueries({ queryKey: qk.reports(projectId) });
    },
  });
}

export function useDeleteRun(projectId: number) {
  const invalidate = useInvalidateExecution(projectId);
  return useMutation({
    mutationFn: (runId: number) => api.delete(`/projects/${projectId}/runs/${runId}`),
    onSuccess: invalidate,
  });
}

/** Same cases with fresh results — for another configuration (Test ID). */
export function useDuplicateRun(projectId: number) {
  const invalidate = useInvalidateExecution(projectId);
  return useMutation({
    mutationFn: ({ runId, ...body }: DuplicateRunBody & { runId: number }) =>
      api.post<RunDTO>(`/projects/${projectId}/runs/${runId}/duplicate`, body),
    onSuccess: invalidate,
  });
}

export function useRunCases(projectId: number, runId: number | null) {
  return useQuery({
    queryKey: qk.runCases(projectId, runId ?? 0),
    queryFn: () => api.get<RunCaseDTO[]>(`/projects/${projectId}/runs/${runId}/cases`),
    enabled: runId !== null && runId > 0,
  });
}

export function useRunCase(projectId: number, runCaseId: number | null) {
  return useQuery({
    queryKey: qk.runCase(projectId, runCaseId ?? 0),
    queryFn: () => api.get<RunCaseDetailDTO>(`/projects/${projectId}/run-cases/${runCaseId}`),
    enabled: runCaseId !== null && runCaseId > 0,
  });
}

/** Text the server stores for an optional text field (`''` → null, omitted → keep). */
function nextText(value: string | null | undefined, current: string | null): string | null {
  if (value === undefined) return current;
  return value === null || value.trim() === '' ? null : value;
}

/**
 * Records a result. The run-case row in the run's case list is updated optimistically (and then
 * replaced by the server's row) so the execution page stays fast even with hundreds of cases: the
 * case list is not refetched, only the run (counts), the case detail (history) and summaries.
 * A failed save restores only its own row, so overlapping "save & next" calls do not undo each other.
 */
export function useSetResult(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      runCaseId,
      runId: _runId,
      ...body
    }: SetResultBody & { runCaseId: number; runId: number }) =>
      api.put<RunCaseDTO>(`/projects/${projectId}/run-cases/${runCaseId}/result`, body),
    onMutate: async (vars) => {
      const key = qk.runCases(projectId, vars.runId);
      await qc.cancelQueries({ queryKey: key, exact: true });
      const previousRow = qc
        .getQueryData<RunCaseDTO[]>(key)
        ?.find((rc) => rc.id === vars.runCaseId);
      qc.setQueryData<RunCaseDTO[]>(key, (list) =>
        list?.map((rc) =>
          rc.id === vars.runCaseId
            ? {
                ...rc,
                status: vars.status,
                actualResult: nextText(vars.actualResult, rc.actualResult),
                resultRemark: nextText(vars.remark, rc.resultRemark),
                elapsedSec: vars.elapsedSec === undefined ? rc.elapsedSec : vars.elapsedSec,
                stepResults:
                  vars.stepResults === undefined
                    ? rc.stepResults
                    : vars.stepResults === null || vars.stepResults.length === 0
                      ? null
                      : vars.stepResults.map((s) => ({ status: s.status, actual: s.actual ?? '' })),
              }
            : rc,
        ),
      );
      return { previousRow, key };
    },
    onError: (_err, _vars, ctx) => {
      const previousRow = ctx?.previousRow;
      if (ctx && previousRow) {
        qc.setQueryData<RunCaseDTO[]>(ctx.key, (list) =>
          list?.map((rc) => (rc.id === previousRow.id ? previousRow : rc)),
        );
      }
    },
    onSuccess: (rc, vars) => {
      qc.setQueryData<RunCaseDTO[]>(qk.runCases(projectId, vars.runId), (list) =>
        list?.map((x) => (x.id === rc.id ? rc : x)),
      );
      void qc.invalidateQueries({ queryKey: qk.runCase(projectId, rc.id) });
      void qc.invalidateQueries({ queryKey: qk.run(projectId, vars.runId), exact: true });
      void qc.invalidateQueries({ queryKey: qk.runReport(projectId, vars.runId) });
      void qc.invalidateQueries({ queryKey: qk.plans(projectId) });
      void qc.invalidateQueries({ queryKey: ['dashboard', projectId] });
      void qc.invalidateQueries({ queryKey: qk.reports(projectId) });
    },
  });
}

export function useBulkResults(projectId: number) {
  const invalidate = useInvalidateExecution(projectId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, ...body }: BulkResultBody & { runId: number }) =>
      api.post<{ affected: number }>(`/projects/${projectId}/runs/${runId}/results/bulk`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.runCasesAll(projectId) });
      invalidate();
    },
  });
}
