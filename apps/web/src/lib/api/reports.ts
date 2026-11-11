/** Owner: W3 (reports page, dashboard charts). */
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CoverageRowDTO,
  DefectReportDTO,
  ReleaseComparisonRowDTO,
  ReportTrendDTO,
  WorkloadRowDTO,
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
