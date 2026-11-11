import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateRequirementInput,
  ImportAnalyzeInput,
  JiraRequirementImportInput,
  ListRequirementsQuery,
  RequirementDTO,
  RequirementImportAnalysisDTO,
  RequirementImportInput,
  RequirementImportPreviewDTO,
  RequirementImportResultDTO,
  RequirementJiraResultDTO,
  RequirementListItemDTO,
  UpdateRequirementInput,
} from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

const base = (projectId: number) => `/projects/${projectId}/requirements`;

/** Requirements of a project (by key), with the number of cases linked to or citing each. */
export function useRequirements(projectId: number, params: ListRequirementsQuery = {}) {
  return useQuery({
    queryKey: qk.requirementList(projectId, params),
    queryFn: () =>
      api.get<RequirementListItemDTO[]>(base(projectId), { q: params.q, source: params.source }),
    placeholderData: keepPreviousData,
  });
}

export function useRequirement(projectId: number, requirementId: number | null) {
  return useQuery({
    queryKey: qk.requirement(projectId, requirementId ?? 0),
    queryFn: () => api.get<RequirementDTO>(`${base(projectId)}/${requirementId}`),
    enabled: requirementId !== null && requirementId > 0,
  });
}

/** After a change the lists, the open requirement and the traceability report are stale. */
function useRefresh(projectId: number) {
  const qc = useQueryClient();
  return {
    store: (saved: RequirementDTO) => {
      qc.setQueryData(qk.requirement(projectId, saved.id), saved);
      void qc.invalidateQueries({ queryKey: [...qk.requirements(projectId), 'list'] });
      void qc.invalidateQueries({ queryKey: qk.reports(projectId) });
    },
    all: () => {
      void qc.invalidateQueries({ queryKey: qk.requirements(projectId) });
      void qc.invalidateQueries({ queryKey: qk.reports(projectId) });
    },
  };
}

export function useCreateRequirement(projectId: number) {
  const { store } = useRefresh(projectId);
  return useMutation({
    mutationFn: (body: Partial<CreateRequirementInput> & { key: string; title: string }) =>
      api.post<RequirementDTO>(base(projectId), body),
    onSuccess: store,
  });
}

export function useUpdateRequirement(projectId: number) {
  const { store } = useRefresh(projectId);
  return useMutation({
    mutationFn: ({
      requirementId,
      ...body
    }: Partial<UpdateRequirementInput> & { requirementId: number }) =>
      api.patch<RequirementDTO>(`${base(projectId)}/${requirementId}`, body),
    onSuccess: store,
  });
}

export function useDeleteRequirement(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requirementId: number) => api.delete(`${base(projectId)}/${requirementId}`),
    // The deleted requirement is not fetched again (that would be a 404): only the lists are.
    onSuccess: (_, requirementId) => {
      qc.removeQueries({ queryKey: qk.requirement(projectId, requirementId) });
      void qc.invalidateQueries({ queryKey: [...qk.requirements(projectId), 'list'] });
      void qc.invalidateQueries({ queryKey: qk.reports(projectId) });
    },
  });
}

/** Replaces the cases linked to a requirement. */
export function useSetRequirementCases(projectId: number) {
  const { store } = useRefresh(projectId);
  return useMutation({
    mutationFn: ({ requirementId, caseIds }: { requirementId: number; caseIds: number[] }) =>
      api.put<RequirementDTO>(`${base(projectId)}/${requirementId}/cases`, { caseIds }),
    onSuccess: store,
  });
}

// ---- Excel / CSV import (the file itself is uploaded with `useImportUpload`)

export function useAnalyzeRequirementImport(projectId: number) {
  return useMutation({
    mutationFn: (body: ImportAnalyzeInput) =>
      api.post<RequirementImportAnalysisDTO>(`${base(projectId)}/import/analyze`, body),
  });
}

export type RequirementImportBody = Omit<RequirementImportInput, 'onExisting'> & {
  onExisting?: RequirementImportInput['onExisting'];
};

export function usePreviewRequirementImport(projectId: number) {
  return useMutation({
    mutationFn: (body: RequirementImportBody) =>
      api.post<RequirementImportPreviewDTO>(`${base(projectId)}/import/preview`, body),
  });
}

export function useCommitRequirementImport(projectId: number) {
  const { all } = useRefresh(projectId);
  return useMutation({
    mutationFn: (body: RequirementImportBody) =>
      api.post<RequirementImportResultDTO>(`${base(projectId)}/import/commit`, body),
    onSuccess: all,
  });
}

// ---- Jira (read only)

export function useImportRequirementsFromJira(projectId: number) {
  const { all } = useRefresh(projectId);
  return useMutation({
    mutationFn: (body: JiraRequirementImportInput) =>
      api.post<RequirementJiraResultDTO>(`${base(projectId)}/jira/import`, body),
    onSuccess: all,
  });
}

export function useSyncRequirementsFromJira(projectId: number) {
  const { all } = useRefresh(projectId);
  return useMutation({
    mutationFn: () => api.post<RequirementJiraResultDTO>(`${base(projectId)}/jira/sync`),
    onSuccess: all,
  });
}
