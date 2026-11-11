/**
 * Every page path of the web app in one place — features build links with these helpers instead of
 * hard-coding URLs. Keep in sync with the folders under `src/app`.
 */
type Id = number | string;

/** Query string from defined, non-empty values (`?a=1&b=x`, or '' when empty). */
export function toQueryString(
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

const project = (projectId: Id) => `/projects/${projectId}`;

export const routes = {
  home: '/',
  login: (next?: string) =>
    `/login${toQueryString({ next: next && next !== '/' ? next : undefined })}`,
  changePassword: '/change-password',
  projects: '/projects',
  apiTokens: '/account/tokens',
  apiDocs: '/api-docs',
  adminUsers: '/admin/users',

  project,
  dashboard: project,
  plans: (projectId: Id) => `${project(projectId)}/plans`,
  plan: (projectId: Id, planId: Id) => `${project(projectId)}/plans/${planId}`,
  runs: (projectId: Id) => `${project(projectId)}/runs`,
  run: (projectId: Id, runId: Id, query?: { case?: Id | null }) =>
    `${project(projectId)}/runs/${runId}${toQueryString({ case: query?.case ?? undefined })}`,
  runReport: (projectId: Id, runId: Id) => `${project(projectId)}/runs/${runId}/report`,
  cases: (
    projectId: Id,
    query?: { suite?: Id | null; section?: Id | 'none' | null; case?: Id | null; q?: string },
  ) =>
    `${project(projectId)}/cases${toQueryString({
      suite: query?.suite ?? undefined,
      section: query?.section ?? undefined,
      case: query?.case ?? undefined,
      q: query?.q,
    })}`,
  reviews: (projectId: Id) => `${project(projectId)}/reviews`,
  sharedSteps: (projectId: Id, query?: { step?: Id | null }) =>
    `${project(projectId)}/shared-steps${toQueryString({ step: query?.step ?? undefined })}`,
  import: (projectId: Id, query?: { suite?: Id | null }) =>
    `${project(projectId)}/import${toQueryString({ suite: query?.suite ?? undefined })}`,
  defects: (projectId: Id) => `${project(projectId)}/defects`,
  defect: (projectId: Id, defectId: Id) => `${project(projectId)}/defects/${defectId}`,
  team: (projectId: Id, query?: { release?: Id | null }) =>
    `${project(projectId)}/team${toQueryString({ release: query?.release ?? undefined })}`,
  myWork: (projectId: Id, query?: { user?: Id | null }) =>
    `${project(projectId)}/my-work${toQueryString({ user: query?.user ?? undefined })}`,
  sessions: (projectId: Id) => `${project(projectId)}/sessions`,
  session: (projectId: Id, sessionId: Id) => `${project(projectId)}/sessions/${sessionId}`,
  reports: (projectId: Id) => `${project(projectId)}/reports`,
  releases: (projectId: Id) => `${project(projectId)}/releases`,
  members: (projectId: Id) => `${project(projectId)}/members`,
  settingsGeneral: (projectId: Id) => `${project(projectId)}/settings/general`,
  settingsSuites: (projectId: Id, query?: { suite?: Id | null }) =>
    `${project(projectId)}/settings/suites${toQueryString({ suite: query?.suite ?? undefined })}`,
  settingsEnvLists: (projectId: Id) => `${project(projectId)}/settings/environment`,
  settingsTemplates: (projectId: Id) => `${project(projectId)}/settings/templates`,
  settingsIntegrations: (projectId: Id) => `${project(projectId)}/settings/integrations`,
} as const;

/** Paths reachable without a session (also used by `src/proxy.ts`). */
export const PUBLIC_PATHS = ['/login'] as const;

/** True when `pathname` is `prefix` or below it. */
export function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
