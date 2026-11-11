import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { z } from 'zod';
import type {
  bulkCasesSchema,
  CaseRunHistoryItem,
  CaseSearchResultDTO,
  CaseVersionDTO,
  createCaseSchema,
  createSectionSchema,
  createSuiteSchema,
  ListCasesQuery,
  Paged,
  SectionNode,
  SectionTreeDTO,
  SuiteDTO,
  TestCaseDTO,
  updateCaseSchema,
  updateSectionSchema,
  updateSuiteSchema,
} from '@tmt/shared';
import { CASE_SEARCH_MIN_LENGTH, safeFileName } from '@tmt/shared';
import { api, downloadFile } from './client';
import { exceptUnder, qk } from './keys';

export type CreateSuiteBody = z.input<typeof createSuiteSchema>;
export type UpdateSuiteBody = z.input<typeof updateSuiteSchema>;
export type CreateSectionBody = z.input<typeof createSectionSchema>;
export type UpdateSectionBody = z.input<typeof updateSectionSchema>;
export type CreateCaseBody = z.input<typeof createCaseSchema>;
export type UpdateCaseBody = z.input<typeof updateCaseSchema>;
export type BulkCasesBody = z.input<typeof bulkCasesSchema>;
export type CaseListParams = Partial<ListCasesQuery>;

/** Invalidates everything derived from the library of a project (incl. the review queue and tags). */
function useInvalidateLibrary(projectId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.suites(projectId) });
    void qc.invalidateQueries({ queryKey: qk.sections(projectId) });
    void qc.invalidateQueries({ queryKey: qk.cases(projectId) });
    void qc.invalidateQueries({ queryKey: qk.tags(projectId) });
  };
}

// ------------------------------------------------------------------ suites

export function useSuites(projectId: number, includeArchived = false) {
  return useQuery({
    queryKey: qk.suiteList(projectId, includeArchived),
    queryFn: () =>
      api.get<SuiteDTO[]>(`/projects/${projectId}/suites`, {
        includeArchived: includeArchived || undefined,
      }),
    staleTime: 30_000,
  });
}

export function useSuite(projectId: number, suiteId: number | null) {
  return useQuery({
    queryKey: qk.suite(projectId, suiteId ?? 0),
    queryFn: () => api.get<SuiteDTO>(`/projects/${projectId}/suites/${suiteId}`),
    enabled: suiteId !== null && suiteId > 0,
    staleTime: 30_000,
  });
}

export function useCreateSuite(projectId: number) {
  const invalidate = useInvalidateLibrary(projectId);
  return useMutation({
    mutationFn: (body: CreateSuiteBody) =>
      api.post<SuiteDTO>(`/projects/${projectId}/suites`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateSuite(projectId: number) {
  const invalidate = useInvalidateLibrary(projectId);
  return useMutation({
    mutationFn: ({ suiteId, ...body }: UpdateSuiteBody & { suiteId: number }) =>
      api.patch<SuiteDTO>(`/projects/${projectId}/suites/${suiteId}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteSuite(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suiteId: number) => api.delete(`/projects/${projectId}/suites/${suiteId}`),
    onSuccess: async (_res, suiteId) => {
      // Lists of the deleted suite must not be refetched (404) while its page is still open.
      const deleted = [
        [...qk.cases(projectId), 'list', suiteId],
        qk.sectionTree(projectId, suiteId),
        qk.suite(projectId, suiteId),
      ];
      await Promise.all(deleted.map((queryKey) => qc.cancelQueries({ queryKey })));
      const predicate = exceptUnder(...deleted);
      void qc.invalidateQueries({ queryKey: qk.suites(projectId), predicate });
      void qc.invalidateQueries({ queryKey: qk.sections(projectId), predicate });
      void qc.invalidateQueries({ queryKey: qk.cases(projectId), predicate });
      void qc.invalidateQueries({ queryKey: qk.tags(projectId) });
    },
  });
}

export function downloadSuiteExport(projectId: number, suite: Pick<SuiteDTO, 'id' | 'name'>) {
  return downloadFile(
    `/projects/${projectId}/suites/${suite.id}/export.xlsx`,
    undefined,
    `${safeFileName(suite.name, 'test-cases')}.xlsx`,
  );
}

// ------------------------------------------------------------------ sections

export function useSectionTree(projectId: number, suiteId: number | null) {
  return useQuery({
    queryKey: qk.sectionTree(projectId, suiteId ?? 0),
    queryFn: () => api.get<SectionTreeDTO>(`/projects/${projectId}/suites/${suiteId}/sections`),
    enabled: suiteId !== null && suiteId > 0,
    staleTime: 15_000,
  });
}

export function useCreateSection(projectId: number) {
  const invalidate = useInvalidateLibrary(projectId);
  return useMutation({
    mutationFn: ({ suiteId, ...body }: CreateSectionBody & { suiteId: number }) =>
      api.post<SectionNode>(`/projects/${projectId}/suites/${suiteId}/sections`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateSection(projectId: number) {
  const invalidate = useInvalidateLibrary(projectId);
  return useMutation({
    mutationFn: ({ sectionId, ...body }: UpdateSectionBody & { sectionId: number }) =>
      api.patch<SectionNode>(`/projects/${projectId}/sections/${sectionId}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteSection(projectId: number) {
  const invalidate = useInvalidateLibrary(projectId);
  return useMutation({
    mutationFn: ({
      sectionId,
      moveContentToParent = false,
    }: {
      sectionId: number;
      moveContentToParent?: boolean;
    }) =>
      api.delete(`/projects/${projectId}/sections/${sectionId}`, {
        moveContentToParent: moveContentToParent ? 'true' : undefined,
      }),
    onSuccess: invalidate,
  });
}

// ------------------------------------------------------------------ cases

export function useCases(projectId: number, suiteId: number | null, params: CaseListParams = {}) {
  return useQuery({
    queryKey: qk.caseList(projectId, suiteId ?? 0, params),
    queryFn: () =>
      api.get<Paged<TestCaseDTO>>(`/projects/${projectId}/suites/${suiteId}/cases`, {
        sectionId: params.sectionId,
        includeSubsections:
          params.includeSubsections === undefined ? undefined : String(params.includeSubsections),
        q: params.q,
        caseType: params.caseType,
        status: params.status,
        // `priority=critical,high` (buildUrl joins arrays with commas).
        priority: params.priority,
        tag: params.tag,
        unsectioned: params.unsectioned ? 'true' : undefined,
        page: params.page,
        pageSize: params.pageSize,
      }),
    enabled: suiteId !== null && suiteId > 0,
    placeholderData: keepPreviousData,
  });
}

/** Hits shown in the header search box. */
export const CASE_SEARCH_LIMIT = 8;

/** Project-wide case search (every active suite); idle until the text is long enough. */
export function useCaseSearch(projectId: number, text: string, limit = CASE_SEARCH_LIMIT) {
  const q = text.trim();
  return useQuery({
    queryKey: qk.caseSearch(projectId, q, limit),
    queryFn: () =>
      api.get<CaseSearchResultDTO>(`/projects/${projectId}/cases/search`, { q, limit }),
    enabled: q.length >= CASE_SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
  });
}

export function useCase(projectId: number, caseId: number | null) {
  return useQuery({
    queryKey: qk.case(projectId, caseId ?? 0),
    queryFn: () => api.get<TestCaseDTO>(`/projects/${projectId}/cases/${caseId}`),
    enabled: caseId !== null && caseId > 0,
  });
}

/** Loads the newest version of a case into the cache (e.g. after a version conflict). */
export function useFetchCase(projectId: number) {
  const qc = useQueryClient();
  return useCallback(
    (caseId: number) =>
      qc.fetchQuery({
        queryKey: qk.case(projectId, caseId),
        queryFn: () => api.get<TestCaseDTO>(`/projects/${projectId}/cases/${caseId}`),
        staleTime: 0,
      }),
    [qc, projectId],
  );
}

export function useCaseVersions(projectId: number, caseId: number | null) {
  return useQuery({
    queryKey: qk.caseVersions(projectId, caseId ?? 0),
    queryFn: () => api.get<CaseVersionDTO[]>(`/projects/${projectId}/cases/${caseId}/versions`),
    enabled: caseId !== null && caseId > 0,
  });
}

/** Results of a library case across runs (newest first). */
export function useCaseRuns(projectId: number, caseId: number | null) {
  return useQuery({
    queryKey: qk.caseRuns(projectId, caseId ?? 0),
    queryFn: () => api.get<CaseRunHistoryItem[]>(`/projects/${projectId}/cases/${caseId}/runs`),
    enabled: caseId !== null && caseId > 0,
  });
}

export function useCreateCase(projectId: number) {
  const invalidate = useInvalidateLibrary(projectId);
  return useMutation({
    mutationFn: ({ suiteId, ...body }: CreateCaseBody & { suiteId: number }) =>
      api.post<TestCaseDTO>(`/projects/${projectId}/suites/${suiteId}/cases`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateCase(projectId: number) {
  const invalidate = useInvalidateLibrary(projectId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, ...body }: UpdateCaseBody & { caseId: number }) =>
      api.patch<TestCaseDTO>(`/projects/${projectId}/cases/${caseId}`, body),
    onSuccess: (tc) => {
      qc.setQueryData(qk.case(projectId, tc.id), tc);
      invalidate();
    },
  });
}

export function useDeleteCase(projectId: number) {
  const invalidate = useInvalidateLibrary(projectId);
  return useMutation({
    mutationFn: (caseId: number) => api.delete(`/projects/${projectId}/cases/${caseId}`),
    onSuccess: invalidate,
  });
}

export function useCloneCase(projectId: number) {
  const invalidate = useInvalidateLibrary(projectId);
  return useMutation({
    mutationFn: (caseId: number) =>
      api.post<TestCaseDTO>(`/projects/${projectId}/cases/${caseId}/clone`),
    onSuccess: invalidate,
  });
}

export function useBulkCases(projectId: number) {
  const invalidate = useInvalidateLibrary(projectId);
  return useMutation({
    mutationFn: ({ suiteId, ...body }: BulkCasesBody & { suiteId: number }) =>
      api.post<{ affected: number }>(`/projects/${projectId}/suites/${suiteId}/cases/bulk`, body),
    onSuccess: invalidate,
  });
}
