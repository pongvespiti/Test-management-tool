/**
 * React Query keys. Every key starts with the resource name and the project id so that
 * `invalidateQueries({ queryKey: [resource, projectId] })` refreshes all variants.
 */
export const qk = {
  me: ['me'] as const,
  health: ['health'] as const,
  users: ['users'] as const,
  userLookup: (q: string) => ['users', 'lookup', q] as const,

  projects: ['projects'] as const,
  project: (projectId: number) => ['projects', projectId] as const,
  members: (projectId: number) => ['members', projectId] as const,
  releases: (projectId: number) => ['releases', projectId] as const,

  suites: (projectId: number) => ['suites', projectId] as const,
  suiteList: (projectId: number, includeArchived: boolean) =>
    ['suites', projectId, 'list', includeArchived] as const,
  suite: (projectId: number, suiteId: number) => ['suites', projectId, 'one', suiteId] as const,
  sections: (projectId: number) => ['sections', projectId] as const,
  sectionTree: (projectId: number, suiteId: number) => ['sections', projectId, suiteId] as const,
  cases: (projectId: number) => ['cases', projectId] as const,
  caseList: (projectId: number, suiteId: number, params: object) =>
    ['cases', projectId, 'list', suiteId, params] as const,
  caseSearch: (projectId: number, q: string, limit: number) =>
    ['cases', projectId, 'search', q, limit] as const,
  case: (projectId: number, caseId: number) => ['cases', projectId, 'one', caseId] as const,
  caseVersions: (projectId: number, caseId: number) =>
    ['cases', projectId, 'one', caseId, 'versions'] as const,
  caseRuns: (projectId: number, caseId: number) =>
    ['cases', projectId, 'one', caseId, 'runs'] as const,

  imports: (projectId: number) => ['imports', projectId] as const,

  plans: (projectId: number) => ['plans', projectId] as const,
  planList: (projectId: number, releaseId: number | null) =>
    ['plans', projectId, 'list', releaseId] as const,
  plan: (projectId: number, planId: number) => ['plans', projectId, 'one', planId] as const,
  docNoSuggestion: (projectId: number) => ['plans', projectId, 'doc-no'] as const,
  matrix: (projectId: number, planId: number, groupBy: string) =>
    ['plans', projectId, 'one', planId, 'matrix', groupBy] as const,
  planRuns: (projectId: number, planId: number) =>
    ['plans', projectId, 'one', planId, 'runs'] as const,

  runs: (projectId: number) => ['runs', projectId] as const,
  run: (projectId: number, runId: number) => ['runs', projectId, runId] as const,
  runCases: (projectId: number, runId: number) => ['runs', projectId, runId, 'cases'] as const,
  runCase: (projectId: number, runCaseId: number) => ['run-case', projectId, runCaseId] as const,
  runCasesAll: (projectId: number) => ['run-case', projectId] as const,

  defects: (projectId: number) => ['defects', projectId] as const,
  defectList: (projectId: number, params: object) =>
    ['defects', projectId, 'list', params] as const,
  defect: (projectId: number, defectId: number) => ['defects', projectId, 'one', defectId] as const,

  comments: (projectId: number, entityType: string, entityId: number) =>
    ['comments', projectId, entityType, entityId] as const,
  attachments: (projectId: number, entityType: string, entityId: number) =>
    ['attachments', projectId, entityType, entityId] as const,
  activity: (projectId: number, params: object) => ['activity', projectId, params] as const,
  dashboard: (projectId: number, releaseId: number | null) =>
    ['dashboard', projectId, releaseId] as const,

  // ---- v1.1 (keys are shared; each API module owns its hooks)
  tags: (projectId: number) => ['tags', projectId] as const,
  sharedSteps: (projectId: number) => ['shared-steps', projectId] as const,
  sharedStep: (projectId: number, sharedStepId: number) =>
    ['shared-steps', projectId, sharedStepId] as const,
  reviews: (projectId: number, mine: boolean) => ['cases', projectId, 'reviews', mine] as const,
  runReport: (projectId: number, runId: number) => ['runs', projectId, runId, 'report'] as const,
  reports: (projectId: number) => ['reports', projectId] as const,
  report: (projectId: number, kind: string, params: object) =>
    ['reports', projectId, kind, params] as const,
  integrations: (projectId: number) => ['integrations', projectId] as const,
  jiraConfig: (projectId: number) => ['integrations', projectId, 'jira'] as const,
  tokens: ['tokens'] as const,
  openapi: ['openapi'] as const,

  templates: (projectId: number) => ['templates', projectId] as const,
  templateCheck: (projectId: number, templateId: number) =>
    ['templates', projectId, 'check', templateId] as const,
  templatePlaceholders: (projectId: number) => ['templates', projectId, 'placeholders'] as const,
};

type KeyPrefix = readonly unknown[];

/**
 * `predicate` for `invalidateQueries` that leaves the queries under the given key prefixes alone.
 * Used after a delete: the deleted entity must not be refetched (404) while its page is still open.
 */
export function exceptUnder(...prefixes: KeyPrefix[]) {
  return (query: { queryKey: KeyPrefix }): boolean =>
    !prefixes.some((prefix) => prefix.every((part, i) => Object.is(query.queryKey[i], part)));
}
