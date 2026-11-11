import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  createDefectSchema,
  DefectDTO,
  DefectListItem,
  DefectStatus,
  ListDefectsQuery,
  Paged,
  updateDefectSchema,
} from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

export type CreateDefectBody = z.input<typeof createDefectSchema>;
export type UpdateDefectBody = z.input<typeof updateDefectSchema>;
export type DefectListParams = Partial<ListDefectsQuery>;

function useInvalidateDefects(projectId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.defects(projectId) });
    void qc.invalidateQueries({ queryKey: qk.runCasesAll(projectId) });
    void qc.invalidateQueries({ queryKey: qk.runs(projectId) });
    void qc.invalidateQueries({ queryKey: ['dashboard', projectId] });
    void qc.invalidateQueries({ queryKey: ['activity', projectId] });
  };
}

export function useDefects(projectId: number, params: DefectListParams = {}) {
  return useQuery({
    queryKey: qk.defectList(projectId, params),
    queryFn: () =>
      api.get<Paged<DefectListItem>>(`/projects/${projectId}/defects`, {
        status: params.status,
        severity: params.severity,
        releaseId: params.releaseId,
        planId: params.planId,
        runId: params.runId,
        assigneeId: params.assigneeId,
        q: params.q,
        page: params.page,
        pageSize: params.pageSize,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useDefect(projectId: number, defectId: number | null) {
  return useQuery({
    queryKey: qk.defect(projectId, defectId ?? 0),
    queryFn: () => api.get<DefectDTO>(`/projects/${projectId}/defects/${defectId}`),
    enabled: defectId !== null && defectId > 0,
  });
}

/** Creates a defect; pass `runCaseId` to link it to an NG result. */
export function useCreateDefect(projectId: number) {
  const invalidate = useInvalidateDefects(projectId);
  return useMutation({
    mutationFn: (body: CreateDefectBody) =>
      api.post<DefectDTO>(`/projects/${projectId}/defects`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateDefect(projectId: number) {
  const invalidate = useInvalidateDefects(projectId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ defectId, ...body }: UpdateDefectBody & { defectId: number }) =>
      api.patch<DefectDTO>(`/projects/${projectId}/defects/${defectId}`, body),
    onSuccess: (d) => {
      qc.setQueryData(qk.defect(projectId, d.id), d);
      invalidate();
    },
  });
}

export function useTransitionDefect(projectId: number) {
  const invalidate = useInvalidateDefects(projectId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      defectId,
      to,
      comment,
    }: {
      defectId: number;
      to: DefectStatus;
      comment?: string | null;
    }) =>
      api.post<DefectDTO>(`/projects/${projectId}/defects/${defectId}/transition`, { to, comment }),
    onSuccess: (d) => {
      qc.setQueryData(qk.defect(projectId, d.id), d);
      invalidate();
      void qc.invalidateQueries({ queryKey: ['comments', projectId] });
    },
  });
}

export function useLinkDefect(projectId: number) {
  const invalidate = useInvalidateDefects(projectId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ defectId, runCaseId }: { defectId: number; runCaseId: number }) =>
      api.post<DefectDTO>(`/projects/${projectId}/defects/${defectId}/links`, { runCaseId }),
    onSuccess: (d) => {
      qc.setQueryData(qk.defect(projectId, d.id), d);
      invalidate();
    },
  });
}

export function useUnlinkDefect(projectId: number) {
  const invalidate = useInvalidateDefects(projectId);
  return useMutation({
    mutationFn: ({ defectId, linkId }: { defectId: number; linkId: number }) =>
      api.delete(`/projects/${projectId}/defects/${defectId}/links/${linkId}`),
    onSuccess: invalidate,
  });
}

export function useDeleteDefect(projectId: number) {
  const invalidate = useInvalidateDefects(projectId);
  return useMutation({
    mutationFn: (defectId: number) => api.delete(`/projects/${projectId}/defects/${defectId}`),
    onSuccess: invalidate,
  });
}

// ------------------------------------------------------------------ Jira (ADR-008)

/** Every Jira action answers with the updated defect: store it and refresh lists/summaries. */
function useJiraMutation<V extends { defectId: number }>(
  projectId: number,
  request: (vars: V) => Promise<DefectDTO>,
) {
  const invalidate = useInvalidateDefects(projectId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (d) => {
      qc.setQueryData(qk.defect(projectId, d.id), d);
      invalidate();
    },
  });
}

/** Creates a Jira issue from the defect (422 JIRA_NOT_CONFIGURED, 409 ALREADY_LINKED, 502 JIRA_ERROR). */
export function useCreateJiraIssue(projectId: number) {
  return useJiraMutation(projectId, ({ defectId }: { defectId: number }) =>
    api.post<DefectDTO>(`/projects/${projectId}/defects/${defectId}/jira`),
  );
}

/** Links an existing Jira issue by key (422 JIRA_ISSUE_NOT_FOUND, 409 ALREADY_LINKED). */
export function useLinkJiraIssue(projectId: number) {
  return useJiraMutation(projectId, ({ defectId, key }: { defectId: number; key: string }) =>
    api.post<DefectDTO>(`/projects/${projectId}/defects/${defectId}/jira/link`, { key }),
  );
}

/** Refreshes the external status from Jira (422 NOT_LINKED). */
export function useSyncJiraIssue(projectId: number) {
  return useJiraMutation(projectId, ({ defectId }: { defectId: number }) =>
    api.post<DefectDTO>(`/projects/${projectId}/defects/${defectId}/jira/sync`),
  );
}

/** Clears the external key/status (the Jira issue itself is kept). */
export function useUnlinkJiraIssue(projectId: number) {
  return useJiraMutation(projectId, ({ defectId }: { defectId: number }) =>
    api.delete<DefectDTO>(`/projects/${projectId}/defects/${defectId}/jira`),
  );
}
