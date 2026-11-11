/** Owner: W4 (run page: JUnit upload, re-run, assignment, add/remove cases, run report). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  addRunCasesSchema,
  assignRunCasesSchema,
  JunitImportQuery,
  JunitImportResultDTO,
  removeRunCasesSchema,
  rerunSchema,
  RunDTO,
  RunReportDTO,
} from '@tmt/shared';
import { safeFileName } from '@tmt/shared';
import { api, downloadFile } from './client';
import { exceptUnder, qk } from './keys';

export type RerunBody = z.input<typeof rerunSchema>;
export type AssignRunCasesBody = z.input<typeof assignRunCasesSchema>;
export type AddRunCasesBody = z.input<typeof addRunCasesSchema>;
export type RemoveRunCasesBody = z.input<typeof removeRunCasesSchema>;

function useInvalidateExecution(projectId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.runs(projectId) });
    void qc.invalidateQueries({ queryKey: qk.runCasesAll(projectId) });
    void qc.invalidateQueries({ queryKey: qk.plans(projectId) });
    void qc.invalidateQueries({ queryKey: ['dashboard', projectId] });
    void qc.invalidateQueries({ queryKey: qk.reports(projectId) });
  };
}

export function useRerun(projectId: number) {
  const invalidate = useInvalidateExecution(projectId);
  return useMutation({
    mutationFn: ({ runId, ...body }: RerunBody & { runId: number }) =>
      api.post<RunDTO>(`/projects/${projectId}/runs/${runId}/rerun`, body),
    onSuccess: invalidate,
  });
}

export function useAssignRunCases(projectId: number) {
  const invalidate = useInvalidateExecution(projectId);
  return useMutation({
    mutationFn: ({ runId, ...body }: AssignRunCasesBody & { runId: number }) =>
      api.post<{ affected: number }>(`/projects/${projectId}/runs/${runId}/assign`, body),
    onSuccess: invalidate,
  });
}

export function useAddRunCases(projectId: number) {
  const invalidate = useInvalidateExecution(projectId);
  return useMutation({
    mutationFn: ({ runId, ...body }: AddRunCasesBody & { runId: number }) =>
      api.post<{ added: number }>(`/projects/${projectId}/runs/${runId}/cases`, body),
    onSuccess: invalidate,
  });
}

export function useRemoveRunCases(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, ...body }: RemoveRunCasesBody & { runId: number }) =>
      api.post<{ removed: number }>(`/projects/${projectId}/runs/${runId}/cases/remove`, body),
    onSuccess: async (_res, { runCaseIds }) => {
      // An open detail panel must not refetch a run case that was just removed (404).
      const removed = runCaseIds.map((id) => qk.runCase(projectId, Number(id)));
      await Promise.all(removed.map((queryKey) => qc.cancelQueries({ queryKey })));
      void qc.invalidateQueries({ queryKey: qk.runs(projectId) });
      void qc.invalidateQueries({
        queryKey: qk.runCasesAll(projectId),
        predicate: exceptUnder(...removed),
      });
      void qc.invalidateQueries({ queryKey: qk.plans(projectId) });
      void qc.invalidateQueries({ queryKey: ['dashboard', projectId] });
      void qc.invalidateQueries({ queryKey: qk.reports(projectId) });
    },
  });
}

/** Uploads a JUnit XML file into a run (`dryRun` previews without saving). */
export function useJunitImport(projectId: number) {
  const invalidate = useInvalidateExecution(projectId);
  return useMutation({
    mutationFn: ({
      runId,
      file,
      options,
      onProgress,
    }: {
      runId: number;
      file: File;
      options: Partial<JunitImportQuery>;
      onProgress?: (fraction: number) => void;
    }) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(options)) if (v !== undefined) qs.set(k, String(v));
      const query = qs.toString();
      return api.upload<JunitImportResultDTO>(
        `/projects/${projectId}/runs/${runId}/junit${query ? `?${query}` : ''}`,
        fd,
        { onProgress },
      );
    },
    onSuccess: (res) => {
      if (!res.dryRun) invalidate();
    },
  });
}

export function useRunReport(projectId: number, runId: number | null) {
  return useQuery({
    queryKey: qk.runReport(projectId, runId ?? 0),
    queryFn: () => api.get<RunReportDTO>(`/projects/${projectId}/runs/${runId}/report`),
    enabled: runId !== null && runId > 0,
  });
}

export function downloadRunReport(
  projectId: number,
  run: Pick<RunDTO, 'id' | 'code' | 'planDocNo'>,
) {
  return downloadFile(
    `/projects/${projectId}/runs/${run.id}/report.xlsx`,
    undefined,
    `${safeFileName(`${run.planDocNo} ${run.code} run report`, 'run-report')}.xlsx`,
  );
}
