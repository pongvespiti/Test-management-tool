/** Every table, in an order safe for `TRUNCATE … CASCADE` (used by integration tests). */
export const ALL_TABLES = [
  'activity_log',
  'project_integrations',
  'api_tokens',
  'imports',
  'comments',
  'defect_links',
  'defects',
  'run_case_results',
  'run_cases',
  'test_runs',
  'builds',
  'test_plans',
  'report_templates',
  'attachments',
  'test_case_versions',
  'test_cases',
  'shared_steps',
  'sections',
  'suites',
  'releases',
  'project_members',
  'projects',
  'sessions',
  'users',
] as const;

export type TableName = (typeof ALL_TABLES)[number];
