/** Owner: W3 (reports page, dashboard charts). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  filtersToParams,
  type CompareDTO,
  type CompareSideDTO,
  type CoverageRowDTO,
  type DefectReportDTO,
  type ReleaseComparisonRowDTO,
  type ReopenReportDTO,
  type ReportTrendDTO,
  type SavedViewDTO,
  type ScheduleDTO,
  type SavedViewInput,
  type SummaryDTO,
  type SummaryFilters,
  type TraceabilityDTO,
  type WorkloadRowDTO,
} from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

export interface ReportScope {
  releaseId?: number | null;
  planId?: number | null;
}

/**
 * Scope as sent to the server: `planId` wins over `releaseId` (api.md § Reports), so a plan scope
 * drops the release — one cache entry per effective scope. Empty = whole project.
 */
export function reportScopeParams(scope: ReportScope): { releaseId?: number; planId?: number } {
  if (scope.planId) return { planId: scope.planId };
  if (scope.releaseId) return { releaseId: scope.releaseId };
  return {};
}

/** Report data is refreshed in the background when the scope changes (the old chart stays). */
const keepFrame = { placeholderData: keepPreviousData } as const;

export function useTrendReport(projectId: number, scope: ReportScope & { days?: number }) {
  const params = { ...reportScopeParams(scope), days: scope.days };
  return useQuery({
    queryKey: qk.report(projectId, 'trend', params),
    queryFn: () => api.get<ReportTrendDTO>(`/projects/${projectId}/reports/trend`, params),
    ...keepFrame,
  });
}

export function useWorkloadReport(projectId: number, scope: ReportScope) {
  const params = reportScopeParams(scope);
  return useQuery({
    queryKey: qk.report(projectId, 'workload', params),
    queryFn: () => api.get<WorkloadRowDTO[]>(`/projects/${projectId}/reports/workload`, params),
    ...keepFrame,
  });
}

export function useDefectReport(
  projectId: number,
  scope: { releaseId?: number | null; days?: number },
) {
  const params = { releaseId: scope.releaseId ?? undefined, days: scope.days };
  return useQuery({
    queryKey: qk.report(projectId, 'defects', params),
    queryFn: () => api.get<DefectReportDTO>(`/projects/${projectId}/reports/defects`, params),
    ...keepFrame,
  });
}

export function useReleaseComparison(projectId: number) {
  return useQuery({
    queryKey: qk.report(projectId, 'releases', {}),
    queryFn: () => api.get<ReleaseComparisonRowDTO[]>(`/projects/${projectId}/reports/releases`),
  });
}

export function useCoverageReport(projectId: number, scope: { releaseId?: number | null }) {
  const params = { releaseId: scope.releaseId ?? undefined };
  return useQuery({
    queryKey: qk.report(projectId, 'coverage', params),
    queryFn: () => api.get<CoverageRowDTO[]>(`/projects/${projectId}/reports/coverage`, params),
    ...keepFrame,
  });
}

/** Marks every report of the project stale (after plan/run changes made outside the run page). */
export function useInvalidateReports(projectId: number) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: qk.reports(projectId) });
}

export function useTraceabilityReport(projectId: number, scope: { releaseId?: number | null }) {
  const params = { releaseId: scope.releaseId ?? undefined };
  return useQuery({
    queryKey: qk.report(projectId, 'traceability', params),
    queryFn: () => api.get<TraceabilityDTO>(`/projects/${projectId}/reports/traceability`, params),
    ...keepFrame,
  });
}

/** What the summary shows: a dimension down the rows and across, and the values kept. */
export interface SummaryView {
  rows: string | null;
  cols: string | null;
  filters: SummaryFilters;
}

/** Query string of the summary: `f` is repeated (`f=Platform=Android&f=Platform=iOS`). */
export function summaryQuery(scope: ReportScope, view: SummaryView): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(reportScopeParams(scope))) params.set(k, String(v));
  if (view.rows) params.set('rows', view.rows);
  if (view.cols) params.set('cols', view.cols);
  for (const f of filtersToParams(view.filters)) params.append('f', f);
  return params.toString();
}

export function useSummaryReport(projectId: number, scope: ReportScope, view: SummaryView) {
  const qs = summaryQuery(scope, view);
  return useQuery({
    queryKey: qk.report(projectId, 'summary', { qs }),
    queryFn: () =>
      api.get<SummaryDTO>(`/projects/${projectId}/reports/summary${qs ? `?${qs}` : ''}`),
    ...keepFrame,
  });
}

export function useSavedViews(projectId: number) {
  return useQuery({
    queryKey: qk.report(projectId, 'views', {}),
    queryFn: () => api.get<SavedViewDTO[]>(`/projects/${projectId}/reports/views`),
  });
}

export function useSaveView(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SavedViewInput) =>
      api.post<SavedViewDTO>(`/projects/${projectId}/reports/views`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.report(projectId, 'views', {}) }),
  });
}

export function useDeleteView(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (viewId: number) => api.delete(`/projects/${projectId}/reports/views/${viewId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.report(projectId, 'views', {}) }),
  });
}

export function useReopenReport(projectId: number, scope: { releaseId?: number | null }) {
  const params = { releaseId: scope.releaseId ?? undefined };
  return useQuery({
    queryKey: qk.report(projectId, 'reopens', params),
    queryFn: () => api.get<ReopenReportDTO>(`/projects/${projectId}/reports/reopens`, params),
    ...keepFrame,
  });
}

/** Runs and builds that can be compared. */
export function useCompareSides(projectId: number) {
  return useQuery({
    queryKey: qk.report(projectId, 'compare-sides', {}),
    queryFn: () => api.get<CompareSideDTO[]>(`/projects/${projectId}/reports/compare/sides`),
    staleTime: 30_000,
  });
}

/** What changed per case from `base` to `target` (`run:<id>` / `build:<id>`); waits for both. */
export function useCompareReport(projectId: number, base: string | null, target: string | null) {
  const params = { base: base ?? undefined, target: target ?? undefined };
  return useQuery({
    queryKey: qk.report(projectId, 'compare', params),
    queryFn: () => api.get<CompareDTO>(`/projects/${projectId}/reports/compare`, params),
    enabled: base !== null && target !== null,
    ...keepFrame,
  });
}

export function useScheduleReport(projectId: number, scope: { releaseId?: number | null }) {
  const params = { releaseId: scope.releaseId ?? undefined };
  return useQuery({
    queryKey: qk.report(projectId, 'schedule', params),
    queryFn: () => api.get<ScheduleDTO>(`/projects/${projectId}/reports/schedule`, params),
    ...keepFrame,
  });
}
