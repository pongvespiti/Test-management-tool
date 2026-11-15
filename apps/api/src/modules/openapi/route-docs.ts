/**
 * Human-written documentation of every REST route: its section, title, notes and success response.
 * Roles, parameters, request bodies and error codes are generated from the controllers; this table
 * adds what decorators cannot say compactly. `test/openapi.e2e-spec.ts` fails when a route has no
 * entry here, an entry has no route, or `success` differs from the status the route really sends.
 */

/** Sections of the API reference, in display order. */
export const API_TAGS = [
  { name: 'Health', description: 'Service status.' },
  { name: 'Auth', description: 'Sign-in with a session cookie.' },
  { name: 'API access', description: 'Personal API tokens.' },
  { name: 'Users', description: 'User administration.' },
  { name: 'Projects', description: 'Projects, settings and members.' },
  { name: 'Releases', description: 'Releases of a project.' },
  { name: 'Builds', description: 'Application builds of a release, selected on test runs.' },
  { name: 'Library', description: 'Suites, sections and test cases.' },
  { name: 'Reviews', description: 'Case review workflow and tags.' },
  { name: 'Shared steps', description: 'Reusable step sets.' },
  { name: 'Import', description: 'Excel/CSV import of test cases.' },
  { name: 'Plans', description: 'Test plans, judgement and Excel reports.' },
  { name: 'Runs', description: 'Runs and their cases.' },
  { name: 'Results', description: 'Recording results.' },
  { name: 'Automation', description: 'JUnit XML results from CI.' },
  { name: 'Defects', description: 'Defects and their links to results.' },
  {
    name: 'Requirements',
    description:
      'Requirements table: typed in, Excel import, read-only Jira import, links to cases.',
  },
  { name: 'Sessions', description: 'Exploratory sessions: charter, time box, notes and defects.' },
  { name: 'Devices', description: 'Test devices (units, phones, routers) and who holds them.' },
  { name: 'Notifications', description: 'In-app notifications of the signed-in user.' },
  {
    name: 'Test stands',
    description:
      'Lab-wide test stands: which model is installed where, bookings, and install / uninstall requests to technicians.',
  },
  { name: 'Collaboration', description: 'Comments, attachments and activity.' },
  { name: 'Reports', description: 'Dashboard and reports.' },
  { name: 'Report templates', description: 'Controlled Excel report templates.' },
  { name: 'Jira', description: 'Jira settings and defect ↔ Jira issue actions.' },
] as const;

export type ApiTagName = (typeof API_TAGS)[number]['name'];

export interface RouteDoc {
  tag: ApiTagName;
  /** Title of the endpoint (imperative, one line). */
  summary: string;
  /** Extra notes shown under the title. */
  notes?: string;
  /** Status code of the success response. */
  success: 200 | 201 | 204;
  /** Response DTO name from `@tmt/shared`, or a short description. */
  response: string;
  /** Content type of the success response (default: JSON). */
  produces?: 'xlsx' | 'file';
}

/** Key: `<METHOD> <OpenAPI path>`, e.g. `GET /api/v1/projects/{projectId}/suites`. */
export const ROUTE_DOCS: Record<string, RouteDoc> = {
  // ---- Health
  'GET /api/health': {
    tag: 'Health',
    summary: 'Service and database health',
    notes: '`{ status, db, version }`; 503 when the database is down.',
    success: 200,
    response: '{ status: "ok"; db: "ok" | "down"; version: string }',
  },

  // ---- Auth
  'POST /api/v1/auth/login': {
    tag: 'Auth',
    summary: 'Sign in (sets the session cookie)',
    success: 200,
    response: 'MeDTO',
  },
  'POST /api/v1/auth/logout': {
    tag: 'Auth',
    summary: 'Sign out (ends the session)',
    success: 204,
    response: 'void',
  },
  'GET /api/v1/auth/me': {
    tag: 'Auth',
    summary: 'Current user and project memberships',
    success: 200,
    response: 'MeDTO',
  },
  'POST /api/v1/auth/change-password': {
    tag: 'Auth',
    summary: 'Change my password (other sessions are revoked)',
    success: 204,
    response: 'void',
  },

  // ---- API access
  'GET /api/v1/auth/tokens': {
    tag: 'API access',
    summary: 'My API tokens (not revoked, newest first)',
    success: 200,
    response: 'ApiTokenDTO[]',
  },
  'POST /api/v1/auth/tokens': {
    tag: 'API access',
    summary: 'Create an API token (the token is shown once)',
    notes: 'Use it as `Authorization: Bearer tmt_…`; at most 20 active tokens per user.',
    success: 201,
    response: 'CreatedTokenDTO',
  },
  'DELETE /api/v1/auth/tokens/{tokenId}': {
    tag: 'API access',
    summary: 'Revoke one of my API tokens',
    success: 204,
    response: 'void',
  },
  'DELETE /api/v1/users/{userId}/tokens': {
    tag: 'API access',
    summary: 'Revoke all API tokens of a user',
    success: 204,
    response: 'void',
  },

  // ---- Users
  'GET /api/v1/users': { tag: 'Users', summary: 'All users', success: 200, response: 'UserDTO[]' },
  'POST /api/v1/users': {
    tag: 'Users',
    summary: 'Create a user (must change the password on first sign-in)',
    success: 201,
    response: 'UserDTO',
  },
  'PATCH /api/v1/users/{userId}': {
    tag: 'Users',
    summary: 'Update a user (name, e-mail, admin, active)',
    success: 200,
    response: 'UserDTO',
  },
  'POST /api/v1/users/{userId}/reset-password': {
    tag: 'Users',
    summary: 'Set a new password (sessions revoked, must change on sign-in)',
    success: 204,
    response: 'void',
  },
  'GET /api/v1/users/lookup': {
    tag: 'Users',
    summary: 'Find active users by name (max 50)',
    success: 200,
    response: 'UserRef[]',
  },

  // ---- Projects
  'GET /api/v1/projects': {
    tag: 'Projects',
    summary: 'My projects (administrators: all)',
    success: 200,
    response: 'ProjectDTO[]',
  },
  'POST /api/v1/projects': {
    tag: 'Projects',
    summary: 'Create a project (the creator becomes lead)',
    success: 201,
    response: 'ProjectDTO',
  },
  'GET /api/v1/projects/{projectId}': {
    tag: 'Projects',
    summary: 'Project details',
    success: 200,
    response: 'ProjectDTO',
  },
  'PATCH /api/v1/projects/{projectId}': {
    tag: 'Projects',
    summary: 'Update project settings (incl. requireCaseReview)',
    success: 200,
    response: 'ProjectDTO',
  },
  'GET /api/v1/projects/{projectId}/members': {
    tag: 'Projects',
    summary: 'Project members',
    success: 200,
    response: 'MemberDTO[]',
  },
  'PUT /api/v1/projects/{projectId}/members': {
    tag: 'Projects',
    summary: 'Replace the project members (at least one lead)',
    success: 200,
    response: 'MemberDTO[]',
  },

  // ---- Releases
  'GET /api/v1/projects/{projectId}/releases': {
    tag: 'Releases',
    summary: 'Releases (newest first)',
    success: 200,
    response: 'ReleaseDTO[]',
  },
  'POST /api/v1/projects/{projectId}/releases': {
    tag: 'Releases',
    summary: 'Create a release',
    success: 201,
    response: 'ReleaseDTO',
  },
  'PATCH /api/v1/projects/{projectId}/releases/{releaseId}': {
    tag: 'Releases',
    summary: 'Update a release',
    success: 200,
    response: 'ReleaseDTO',
  },
  'DELETE /api/v1/projects/{projectId}/releases/{releaseId}': {
    tag: 'Releases',
    summary: 'Delete an unused release',
    success: 204,
    response: 'void',
  },

  // ---- Builds
  'GET /api/v1/projects/{projectId}/builds': {
    tag: 'Builds',
    summary: 'Builds (newest first), optionally of one release',
    success: 200,
    response: 'BuildDTO[]',
  },
  'POST /api/v1/projects/{projectId}/releases/{releaseId}/builds': {
    tag: 'Builds',
    summary: 'Create a build of a release',
    success: 201,
    response: 'BuildDTO',
  },
  'PATCH /api/v1/projects/{projectId}/builds/{buildId}': {
    tag: 'Builds',
    summary: 'Update a build',
    success: 200,
    response: 'BuildDTO',
  },
  'DELETE /api/v1/projects/{projectId}/builds/{buildId}': {
    tag: 'Builds',
    summary: 'Delete a build that no run or defect uses',
    success: 204,
    response: 'void',
  },

  // ---- Library
  'GET /api/v1/projects/{projectId}/suites': {
    tag: 'Library',
    summary: 'Test suites',
    success: 200,
    response: 'SuiteDTO[]',
  },
  'POST /api/v1/projects/{projectId}/suites': {
    tag: 'Library',
    summary: 'Create a suite (prefix for display ids, custom fields, environment labels)',
    success: 201,
    response: 'SuiteDTO',
  },
  'GET /api/v1/projects/{projectId}/suites/{suiteId}': {
    tag: 'Library',
    summary: 'Suite details',
    success: 200,
    response: 'SuiteDTO',
  },
  'PATCH /api/v1/projects/{projectId}/suites/{suiteId}': {
    tag: 'Library',
    summary: 'Update a suite (removed field keys are stripped from case values)',
    success: 200,
    response: 'SuiteDTO',
  },
  'DELETE /api/v1/projects/{projectId}/suites/{suiteId}': {
    tag: 'Library',
    summary: 'Delete a suite without runs (archive it otherwise)',
    success: 204,
    response: 'void',
  },
  'GET /api/v1/projects/{projectId}/suites/{suiteId}/sections': {
    tag: 'Library',
    summary: 'Section tree with case counts',
    success: 200,
    response: 'SectionTreeDTO',
  },
  'POST /api/v1/projects/{projectId}/suites/{suiteId}/sections': {
    tag: 'Library',
    summary: 'Create a section',
    success: 201,
    response: 'SectionNode',
  },
  'PATCH /api/v1/projects/{projectId}/sections/{sectionId}': {
    tag: 'Library',
    summary: 'Rename or move a section',
    success: 200,
    response: 'SectionNode',
  },
  'DELETE /api/v1/projects/{projectId}/sections/{sectionId}': {
    tag: 'Library',
    summary: 'Delete a section (optionally moving its content to the parent)',
    success: 204,
    response: 'void',
  },
  'GET /api/v1/projects/{projectId}/suites/{suiteId}/cases': {
    tag: 'Library',
    summary: 'Test cases of a suite (tree order, paged)',
    success: 200,
    response: 'Paged<TestCaseDTO>',
  },
  'GET /api/v1/projects/{projectId}/cases/search': {
    tag: 'Library',
    summary: 'Search test cases in every suite of the project',
    notes:
      'Free text over titles, codes, texts, steps, tags and custom fields of all active suites; title and code matches come first. `total` counts every match, `items` holds at most `limit`.',
    success: 200,
    response: 'CaseSearchResultDTO',
  },
  'POST /api/v1/projects/{projectId}/suites/{suiteId}/cases': {
    tag: 'Library',
    summary: 'Create a test case (text or step-by-step)',
    notes: 'With `requireCaseReview`, `ready` is stored as `draft` for callers below lead.',
    success: 201,
    response: 'TestCaseDTO',
  },
  'POST /api/v1/projects/{projectId}/suites/{suiteId}/cases/bulk': {
    tag: 'Library',
    summary: 'Bulk action on cases (move, status, type, priority, tags, review, delete)',
    notes: '`delete` and `approve` need the lead role.',
    success: 200,
    response: '{ affected: number }',
  },
  'GET /api/v1/projects/{projectId}/suites/{suiteId}/export.xlsx': {
    tag: 'Library',
    summary: 'Export the suite to Excel (round-trips through import)',
    success: 200,
    response: 'xlsx workbook',
    produces: 'xlsx',
  },
  'GET /api/v1/projects/{projectId}/cases/{caseId}': {
    tag: 'Library',
    summary: 'Test case details (shared steps expanded)',
    success: 200,
    response: 'TestCaseDTO',
  },
  'PATCH /api/v1/projects/{projectId}/cases/{caseId}': {
    tag: 'Library',
    summary: 'Update a test case (optimistic concurrency with `version`)',
    notes:
      'A change of reviewable content moves a `ready` case back to `draft` under review rules.',
    success: 200,
    response: 'TestCaseDTO',
  },
  'DELETE /api/v1/projects/{projectId}/cases/{caseId}': {
    tag: 'Library',
    summary: 'Delete a test case (soft delete)',
    success: 204,
    response: 'void',
  },
  'POST /api/v1/projects/{projectId}/cases/{caseId}/clone': {
    tag: 'Library',
    summary: 'Clone a test case (code cleared, title " (copy)")',
    success: 201,
    response: 'TestCaseDTO',
  },
  'GET /api/v1/projects/{projectId}/cases/{caseId}/versions': {
    tag: 'Library',
    summary: 'Version history of a case (newest first)',
    success: 200,
    response: 'CaseVersionDTO[]',
  },
  'GET /api/v1/projects/{projectId}/cases/{caseId}/runs': {
    tag: 'Library',
    summary: 'Results of a case across runs (newest first)',
    success: 200,
    response: 'CaseRunHistoryItem[]',
  },

  // ---- Reviews
  'POST /api/v1/projects/{projectId}/cases/{caseId}/submit-review': {
    tag: 'Reviews',
    summary: 'Send a case to review (draft/ready → in review)',
    success: 200,
    response: 'TestCaseDTO',
  },
  'POST /api/v1/projects/{projectId}/cases/{caseId}/review': {
    tag: 'Reviews',
    summary: 'Approve a case or request changes',
    success: 200,
    response: 'TestCaseDTO',
  },
  'GET /api/v1/projects/{projectId}/reviews': {
    tag: 'Reviews',
    summary: 'Cases waiting for review (oldest request first, max 500)',
    success: 200,
    response: 'TestCaseDTO[]',
  },
  'GET /api/v1/projects/{projectId}/tags': {
    tag: 'Reviews',
    summary: 'Tags of live cases with counts (max 500)',
    success: 200,
    response: 'TagCountDTO[]',
  },

  // ---- Shared steps
  'GET /api/v1/projects/{projectId}/shared-steps': {
    tag: 'Shared steps',
    summary: 'Shared steps (by name)',
    success: 200,
    response: 'SharedStepDTO[]',
  },
  'POST /api/v1/projects/{projectId}/shared-steps': {
    tag: 'Shared steps',
    summary: 'Create a shared step set',
    success: 201,
    response: 'SharedStepDTO',
  },
  'GET /api/v1/projects/{projectId}/shared-steps/{sharedStepId}': {
    tag: 'Shared steps',
    summary: 'Shared step with the cases using it (max 200)',
    success: 200,
    response: 'SharedStepDetailDTO',
  },
  'PATCH /api/v1/projects/{projectId}/shared-steps/{sharedStepId}': {
    tag: 'Shared steps',
    summary: 'Update a shared step (version +1)',
    success: 200,
    response: 'SharedStepDTO',
  },
  'DELETE /api/v1/projects/{projectId}/shared-steps/{sharedStepId}': {
    tag: 'Shared steps',
    summary: 'Delete a shared step (`inline=true` copies its steps into the using cases)',
    success: 204,
    response: 'void',
  },

  // ---- Import
  'POST /api/v1/projects/{projectId}/imports/upload': {
    tag: 'Import',
    summary: 'Upload an Excel/CSV file for import',
    success: 200,
    response: '{ uploadId: string; fileName: string; sheets: ImportSheetInfo[] }',
  },
  'POST /api/v1/projects/{projectId}/imports/analyze': {
    tag: 'Import',
    summary: 'Detect header row, layout and column mapping',
    success: 200,
    response: 'ImportAnalysisDTO',
  },
  'POST /api/v1/projects/{projectId}/imports/preview': {
    tag: 'Import',
    summary: 'Preview an import with a mapping',
    success: 200,
    response: 'ImportPreviewDTO',
  },
  'POST /api/v1/projects/{projectId}/imports/commit': {
    tag: 'Import',
    summary: 'Run the import',
    success: 200,
    response: 'ImportResultDTO',
  },
  'GET /api/v1/projects/{projectId}/imports': {
    tag: 'Import',
    summary: 'Latest 50 imports (Excel and JUnit)',
    success: 200,
    response: 'ImportRecordDTO[]',
  },

  // ---- Plans
  'GET /api/v1/projects/{projectId}/plans': {
    tag: 'Plans',
    summary: 'Test plans (newest first)',
    success: 200,
    response: 'PlanDTO[]',
  },
  'POST /api/v1/projects/{projectId}/plans': {
    tag: 'Plans',
    summary: 'Create a test plan',
    success: 201,
    response: 'PlanDTO',
  },
  'GET /api/v1/projects/{projectId}/plans/doc-no-suggestion': {
    tag: 'Plans',
    summary: 'Next document number for the project pattern',
    success: 200,
    response: '{ docNo: string }',
  },
  'GET /api/v1/projects/{projectId}/plans/{planId}': {
    tag: 'Plans',
    summary: 'Test plan with runs and counts',
    success: 200,
    response: 'PlanDTO',
  },
  'PATCH /api/v1/projects/{projectId}/plans/{planId}': {
    tag: 'Plans',
    summary: 'Update a test plan (judgement, texts, release, template)',
    success: 200,
    response: 'PlanDTO',
  },
  'DELETE /api/v1/projects/{projectId}/plans/{planId}': {
    tag: 'Plans',
    summary: 'Delete a test plan',
    success: 204,
    response: 'void',
  },
  'POST /api/v1/projects/{projectId}/plans/{planId}/complete': {
    tag: 'Plans',
    summary: 'Complete a plan (locks its runs and results)',
    success: 200,
    response: 'PlanDTO',
  },
  'POST /api/v1/projects/{projectId}/plans/{planId}/reopen': {
    tag: 'Plans',
    summary: 'Reopen a completed plan',
    success: 200,
    response: 'PlanDTO',
  },
  'GET /api/v1/projects/{projectId}/plans/{planId}/matrix': {
    tag: 'Plans',
    summary: 'Summary matrix (runs × groups)',
    success: 200,
    response: 'MatrixDTO',
  },
  'GET /api/v1/projects/{projectId}/plans/{planId}/export.xlsx': {
    tag: 'Plans',
    summary: 'Test report from the Excel template (ADR-002)',
    notes: '`templateId` 0/omitted = the plan template, else the project default, else built-in.',
    success: 200,
    response: 'xlsx test report',
    produces: 'xlsx',
  },
  'PUT /api/v1/projects/{projectId}/plans/{planId}/signed-copy': {
    tag: 'Plans',
    summary: 'Attach the signed report (allowed on completed plans)',
    success: 200,
    response: 'AttachmentDTO',
  },
  'DELETE /api/v1/projects/{projectId}/plans/{planId}/signed-copy': {
    tag: 'Plans',
    summary: 'Remove the signed report',
    success: 204,
    response: 'void',
  },

  // ---- Runs
  'GET /api/v1/projects/{projectId}/plans/{planId}/runs': {
    tag: 'Runs',
    summary: 'Runs of a plan',
    success: 200,
    response: 'RunDTO[]',
  },
  'POST /api/v1/projects/{projectId}/plans/{planId}/runs': {
    tag: 'Runs',
    summary: 'Create a run from suite cases (sections, cases, priorities, tags, statuses)',
    success: 201,
    response: 'RunDTO',
  },
  'GET /api/v1/projects/{projectId}/runs/{runId}': {
    tag: 'Runs',
    summary: 'Run details with counts and estimate',
    success: 200,
    response: 'RunDTO',
  },
  'PATCH /api/v1/projects/{projectId}/runs/{runId}': {
    tag: 'Runs',
    summary: 'Update a run (code, environment, tester, judgement…)',
    success: 200,
    response: 'RunDTO',
  },
  'DELETE /api/v1/projects/{projectId}/runs/{runId}': {
    tag: 'Runs',
    summary: 'Delete a run',
    success: 204,
    response: 'void',
  },
  'POST /api/v1/projects/{projectId}/runs/{runId}/duplicate': {
    tag: 'Runs',
    summary: 'Duplicate a run (same cases, fresh results)',
    success: 201,
    response: 'RunDTO',
  },
  'GET /api/v1/projects/{projectId}/runs/{runId}/cases': {
    tag: 'Runs',
    summary: 'Run cases in execution order',
    success: 200,
    response: 'RunCaseDTO[]',
  },
  'POST /api/v1/projects/{projectId}/runs/{runId}/cases': {
    tag: 'Runs',
    summary: 'Add library cases to a run (existing ones skipped)',
    success: 200,
    response: '{ added: number }',
  },
  'POST /api/v1/projects/{projectId}/runs/{runId}/cases/remove': {
    tag: 'Runs',
    summary: 'Remove run cases (executed ones need a lead)',
    success: 200,
    response: '{ removed: number }',
  },
  'POST /api/v1/projects/{projectId}/runs/{runId}/rerun': {
    tag: 'Runs',
    summary: 'Re-run the cases of a run whose result is in `statuses`',
    notes:
      'Optional `runCaseIds` limits the re-run to those cases; `buildId` is the build to test.',
    success: 201,
    response: 'RunDTO',
  },
  'GET /api/v1/projects/{projectId}/topics': {
    tag: 'Runs',
    summary: 'Progress by topic and suite of a release (whole team or one person)',
    notes:
      'Runs of a release grouped by the topic of their suite. Without `userId` it is the whole team (managers and leads) and lists suites without a run; with `userId` only that person’s cases count (own list: any member, another person: managers and leads).',
    success: 200,
    response: 'TopicsDTO',
  },
  'POST /api/v1/projects/{projectId}/topics/assign': {
    tag: 'Runs',
    summary: 'Give the runs of suites in a release to a person',
    notes:
      'Sets the tester (null = none) and, when `dueDate` is sent, the due date of every run of the suites in the release. Runs in completed plans are left alone. Case-level assignments stay.',
    success: 200,
    response: 'AssignSuitesResultDTO',
  },
  'POST /api/v1/projects/{projectId}/runs/{runId}/assign': {
    tag: 'Runs',
    summary: 'Assign run cases (null = back to the run tester)',
    success: 200,
    response: '{ affected: number }',
  },
  'GET /api/v1/projects/{projectId}/runs/{runId}/report': {
    tag: 'Runs',
    summary: 'Run report (times in REPORT_TIMEZONE)',
    success: 200,
    response: 'RunReportDTO',
  },
  'GET /api/v1/projects/{projectId}/runs/{runId}/report.xlsx': {
    tag: 'Runs',
    summary: 'Run report workbook (Summary, Results, Steps)',
    success: 200,
    response: 'xlsx run report',
    produces: 'xlsx',
  },

  // ---- Results
  'POST /api/v1/projects/{projectId}/runs/{runId}/results/bulk': {
    tag: 'Results',
    summary: 'Set one result on many run cases',
    success: 200,
    response: '{ affected: number }',
  },
  'GET /api/v1/projects/{projectId}/run-cases/{runCaseId}': {
    tag: 'Results',
    summary: 'Run case with history, attachments, defects and other runs',
    success: 200,
    response: 'RunCaseDetailDTO',
  },
  'PUT /api/v1/projects/{projectId}/run-cases/{runCaseId}/result': {
    tag: 'Results',
    summary: 'Record a result (source `api` with a token)',
    success: 200,
    response: 'RunCaseDTO',
  },

  // ---- Automation
  'POST /api/v1/projects/{projectId}/runs/{runId}/junit': {
    tag: 'Automation',
    summary: 'Import JUnit XML results into a run',
    notes:
      'Matching `auto`: tmt_id/tmt_case/case_id/test_id property → code → display id → title. `dryRun=true` previews without writing; `createMissing=true` adds library cases.',
    success: 200,
    response: 'JunitImportResultDTO',
  },

  // ---- Defects
  'GET /api/v1/projects/{projectId}/defects': {
    tag: 'Defects',
    summary: 'Defects (newest first, paged)',
    success: 200,
    response: 'Paged<DefectListItem>',
  },
  'POST /api/v1/projects/{projectId}/defects': {
    tag: 'Defects',
    summary: 'Report a defect (optionally from an NG run case)',
    success: 201,
    response: 'DefectDTO',
  },
  'GET /api/v1/projects/{projectId}/defects/{defectId}': {
    tag: 'Defects',
    summary: 'Defect details',
    success: 200,
    response: 'DefectDTO',
  },
  'PATCH /api/v1/projects/{projectId}/defects/{defectId}': {
    tag: 'Defects',
    summary: 'Update a defect',
    success: 200,
    response: 'DefectDTO',
  },
  'POST /api/v1/projects/{projectId}/defects/{defectId}/transition': {
    tag: 'Defects',
    summary: 'Move a defect through its workflow',
    success: 200,
    response: 'DefectDTO',
  },
  'POST /api/v1/projects/{projectId}/defects/{defectId}/links': {
    tag: 'Defects',
    summary: 'Link a defect to a run case',
    success: 200,
    response: 'DefectDTO',
  },
  'DELETE /api/v1/projects/{projectId}/defects/{defectId}/links/{linkId}': {
    tag: 'Defects',
    summary: 'Remove a defect link',
    success: 204,
    response: 'void',
  },
  'DELETE /api/v1/projects/{projectId}/defects/{defectId}': {
    tag: 'Defects',
    summary: 'Delete a defect',
    success: 204,
    response: 'void',
  },

  // ---- Collaboration
  'GET /api/v1/projects/{projectId}/comments': {
    tag: 'Collaboration',
    summary: 'Comments of an entity (oldest first)',
    success: 200,
    response: 'CommentDTO[]',
  },
  'POST /api/v1/projects/{projectId}/comments': {
    tag: 'Collaboration',
    summary: 'Comment on a defect, run case, test case or plan',
    success: 201,
    response: 'CommentDTO',
  },
  'DELETE /api/v1/projects/{projectId}/comments/{commentId}': {
    tag: 'Collaboration',
    summary: 'Delete a comment (author or lead)',
    success: 204,
    response: 'void',
  },
  'GET /api/v1/projects/{projectId}/attachments': {
    tag: 'Collaboration',
    summary: 'Attachments of an entity',
    success: 200,
    response: 'AttachmentDTO[]',
  },
  'POST /api/v1/projects/{projectId}/attachments': {
    tag: 'Collaboration',
    summary: 'Upload an attachment (evidence, logs, screenshots)',
    success: 201,
    response: 'AttachmentDTO',
  },
  'GET /api/v1/projects/{projectId}/attachments/{attachmentId}/download': {
    tag: 'Collaboration',
    summary: 'Download an attachment (inline for images, PDF, video, text)',
    success: 200,
    response: 'file',
    produces: 'file',
  },
  'DELETE /api/v1/projects/{projectId}/attachments/{attachmentId}': {
    tag: 'Collaboration',
    summary: 'Delete an attachment (uploader or lead)',
    success: 204,
    response: 'void',
  },
  'GET /api/v1/projects/{projectId}/activity': {
    tag: 'Collaboration',
    summary: 'Activity log (newest first)',
    success: 200,
    response: 'ActivityDTO[]',
  },

  // ---- Reports
  'GET /api/v1/projects/{projectId}/dashboard': {
    tag: 'Reports',
    summary: 'Dashboard of a release (default: newest active, else newest)',
    success: 200,
    response: 'DashboardDTO',
  },
  'GET /api/v1/projects/{projectId}/my-work': {
    tag: 'Reports',
    summary: 'Run cases waiting for me and my results of a day or week',
    notes:
      'Waiting = assigned to me (else the run tester is me) in not-completed plans. `range` day|week (Monday–Sunday) around `date` (REPORT_TIMEZONE). `userId` = another member of the project (managers and leads; 422 BAD_USER).',
    success: 200,
    response: 'MyWorkDTO',
  },
  'GET /api/v1/projects/{projectId}/reports/trend': {
    tag: 'Reports',
    summary: 'Daily results, burndown and pass rate (REPORT_TIMEZONE days)',
    notes: 'Scope: `planId` (wins) or `releaseId` or the whole project.',
    success: 200,
    response: 'ReportTrendDTO',
  },
  'GET /api/v1/projects/{projectId}/reports/workload': {
    tag: 'Reports',
    summary: 'Run cases per effective assignee over open plans',
    success: 200,
    response: 'WorkloadRowDTO[]',
  },
  'GET /api/v1/projects/{projectId}/reports/defects': {
    tag: 'Reports',
    summary: 'Defects by status/severity, open trend, assignees, top cases',
    success: 200,
    response: 'DefectReportDTO',
  },
  'GET /api/v1/projects/{projectId}/reports/releases': {
    tag: 'Reports',
    summary: 'Release comparison (newest release first)',
    success: 200,
    response: 'ReleaseComparisonRowDTO[]',
  },
  'GET /api/v1/projects/{projectId}/reports/coverage': {
    tag: 'Reports',
    summary: 'Coverage per suite (latest run case of every library case)',
    success: 200,
    response: 'CoverageRowDTO[]',
  },
  'GET /api/v1/projects/{projectId}/reports/traceability': {
    tag: 'Reports',
    summary: 'Traceability: cases grouped by reference with latest results and defects',
    success: 200,
    response: 'TraceabilityDTO',
  },
  'GET /api/v1/projects/{projectId}/reports/reopens': {
    tag: 'Reports',
    summary: 'Defect reopen counts by release, build, platform and topic',
    notes:
      'Counted from the status changes to Reopened in the activity log; scope: `releaseId` or the whole project.',
    success: 200,
    response: 'ReopenReportDTO',
  },
  'GET /api/v1/projects/{projectId}/reports/compare/sides': {
    tag: 'Reports',
    summary: 'Runs and builds that can be compared (newest first)',
    success: 200,
    response: 'CompareSideDTO[]',
  },
  'GET /api/v1/projects/{projectId}/reports/compare': {
    tag: 'Reports',
    summary: 'What changed per test case between two runs or two builds',
    notes:
      '`base` and `target` are `run:<id>` or `build:<id>`. A build side uses the latest result of each case over the runs of that build. Cases are matched by library case.',
    success: 200,
    response: 'CompareDTO',
  },
  'GET /api/v1/projects/{projectId}/requirements': {
    tag: 'Requirements',
    summary: 'List requirements with the number of cases linked to or citing each',
    success: 200,
    response: 'RequirementListItemDTO[]',
  },
  'POST /api/v1/projects/{projectId}/requirements': {
    tag: 'Requirements',
    summary: 'Add a requirement (ID, title, description, source document)',
    success: 201,
    response: 'RequirementDTO',
  },
  'POST /api/v1/projects/{projectId}/requirements/import/analyze': {
    tag: 'Requirements',
    summary: 'Excel/CSV import of requirements: sheets, header row and column suggestions',
    success: 200,
    response: 'RequirementImportAnalysisDTO',
  },
  'POST /api/v1/projects/{projectId}/requirements/import/preview': {
    tag: 'Requirements',
    summary: 'Excel/CSV import of requirements: what each row would do (nothing is written)',
    success: 200,
    response: 'RequirementImportPreviewDTO',
  },
  'POST /api/v1/projects/{projectId}/requirements/import/commit': {
    tag: 'Requirements',
    summary: 'Excel/CSV import of requirements: create and update them',
    success: 200,
    response: 'RequirementImportResultDTO',
  },
  'POST /api/v1/projects/{projectId}/requirements/jira/import': {
    tag: 'Requirements',
    summary: 'Read issues from Jira (keys or JQL) into requirements — Jira is only read',
    success: 200,
    response: 'RequirementJiraResultDTO',
  },
  'POST /api/v1/projects/{projectId}/requirements/jira/sync': {
    tag: 'Requirements',
    summary: 'Refresh title, description and status of the requirements read from Jira',
    success: 200,
    response: 'RequirementJiraResultDTO',
  },
  'GET /api/v1/projects/{projectId}/requirements/{requirementId}': {
    tag: 'Requirements',
    summary: 'One requirement with its linked and citing cases',
    success: 200,
    response: 'RequirementDTO',
  },
  'PATCH /api/v1/projects/{projectId}/requirements/{requirementId}': {
    tag: 'Requirements',
    summary: 'Edit a requirement (a Jira requirement keeps the text Jira gave it)',
    success: 200,
    response: 'RequirementDTO',
  },
  'DELETE /api/v1/projects/{projectId}/requirements/{requirementId}': {
    tag: 'Requirements',
    summary: 'Delete a requirement and its case links',
    success: 204,
    response: 'void',
  },
  'POST /api/v1/projects/{projectId}/requirements/{requirementId}/review': {
    tag: 'Requirements',
    summary: 'Confirm that the cases still fit after the requirement text changed',
    success: 200,
    response: 'RequirementDTO',
  },
  'PUT /api/v1/projects/{projectId}/requirements/{requirementId}/cases': {
    tag: 'Requirements',
    summary: 'Replace the cases linked to a requirement',
    success: 200,
    response: 'RequirementDTO',
  },
  'GET /api/v1/projects/{projectId}/notifications': {
    tag: 'Notifications',
    summary: 'My notifications in the project (newest first) with the unread count',
    success: 200,
    response: 'NotificationListDTO',
  },
  'POST /api/v1/projects/{projectId}/notifications/read-all': {
    tag: 'Notifications',
    summary: 'Mark all my notifications as read',
    success: 204,
    response: 'void',
  },
  'POST /api/v1/projects/{projectId}/notifications/{notificationId}/read': {
    tag: 'Notifications',
    summary: 'Mark one notification as read',
    success: 204,
    response: 'void',
  },
  'GET /api/v1/projects/{projectId}/devices': {
    tag: 'Devices',
    summary: 'List test devices (filter by kind, status, holder or text)',
    success: 200,
    response: 'DeviceDTO[]',
  },
  'POST /api/v1/projects/{projectId}/devices': {
    tag: 'Devices',
    summary: 'Register a test device',
    success: 201,
    response: 'DeviceDTO',
  },
  'PATCH /api/v1/projects/{projectId}/devices/{deviceId}': {
    tag: 'Devices',
    summary: 'Change a device, or send it to repair and back',
    notes: 'A device someone holds cannot be sent to repair: it is returned first.',
    success: 200,
    response: 'DeviceDTO',
  },
  'DELETE /api/v1/projects/{projectId}/devices/{deviceId}': {
    tag: 'Devices',
    summary: 'Delete a device',
    success: 204,
    response: 'void',
  },
  'POST /api/v1/projects/{projectId}/devices/{deviceId}/check-out': {
    tag: 'Devices',
    summary: 'Take a free device (the caller becomes its holder)',
    success: 200,
    response: 'DeviceDTO',
  },
  'POST /api/v1/projects/{projectId}/devices/{deviceId}/return': {
    tag: 'Devices',
    summary: 'Give a device back (the holder, or a lead for someone else)',
    success: 200,
    response: 'DeviceDTO',
  },
  'GET /api/v1/projects/{projectId}/sessions': {
    tag: 'Sessions',
    summary: 'List exploratory sessions (newest first)',
    success: 200,
    response: 'SessionListItemDTO[]',
  },
  'POST /api/v1/projects/{projectId}/sessions': {
    tag: 'Sessions',
    summary: 'Plan an exploratory session (charter, owner, time box, release, build, references)',
    success: 201,
    response: 'SessionDTO',
  },
  'GET /api/v1/projects/{projectId}/sessions/{sessionId}': {
    tag: 'Sessions',
    summary: 'One session with its notes timeline and linked defects',
    success: 200,
    response: 'SessionDTO',
  },
  'PATCH /api/v1/projects/{projectId}/sessions/{sessionId}': {
    tag: 'Sessions',
    summary: 'Change a session (also the debrief summary)',
    success: 200,
    response: 'SessionDTO',
  },
  'DELETE /api/v1/projects/{projectId}/sessions/{sessionId}': {
    tag: 'Sessions',
    summary: 'Delete a session (owner, creator or lead)',
    success: 204,
    response: 'void',
  },
  'POST /api/v1/projects/{projectId}/sessions/{sessionId}/start': {
    tag: 'Sessions',
    summary: 'Start a planned session (the clock starts)',
    success: 200,
    response: 'SessionDTO',
  },
  'POST /api/v1/projects/{projectId}/sessions/{sessionId}/complete': {
    tag: 'Sessions',
    summary: 'Complete a session in progress (the clock stops)',
    success: 200,
    response: 'SessionDTO',
  },
  'POST /api/v1/projects/{projectId}/sessions/{sessionId}/resume': {
    tag: 'Sessions',
    summary: 'Take a completed session up again',
    success: 200,
    response: 'SessionDTO',
  },
  'POST /api/v1/projects/{projectId}/sessions/{sessionId}/notes': {
    tag: 'Sessions',
    summary: 'Add a note, bug, question or idea to the timeline',
    success: 201,
    response: 'SessionNoteDTO',
  },
  'DELETE /api/v1/projects/{projectId}/sessions/{sessionId}/notes/{noteId}': {
    tag: 'Sessions',
    summary: 'Delete a note (author or lead)',
    success: 204,
    response: 'void',
  },
  'POST /api/v1/projects/{projectId}/sessions/{sessionId}/defects': {
    tag: 'Sessions',
    summary: 'Link a defect of the project to the session',
    success: 200,
    response: 'SessionDTO',
  },
  'DELETE /api/v1/projects/{projectId}/sessions/{sessionId}/defects/{defectId}': {
    tag: 'Sessions',
    summary: 'Unlink a defect',
    success: 200,
    response: 'SessionDTO',
  },
  'GET /api/v1/projects/{projectId}/reports/schedule': {
    tag: 'Reports',
    summary: 'Runs with their planned window, topic and tester (release Gantt)',
    notes:
      'Start is the plan start date; due is the run due date, else the plan due date. Scope: `releaseId` or the whole project.',
    success: 200,
    response: 'ScheduleDTO',
  },
  'GET /api/v1/projects/{projectId}/reports/summary': {
    tag: 'Reports',
    summary: 'Result counts of the runs, filtered and grouped by environment dimensions',
    notes:
      'Scope: `planId` (wins) or `releaseId` or the whole project. `rows` / `cols` pick a dimension (an environment label, or `@topic`, `@release`, `@build`); each `f` is `key=value`, several values of one key mean any of them.',
    success: 200,
    response: 'SummaryDTO',
  },
  'GET /api/v1/projects/{projectId}/reports/views': {
    tag: 'Reports',
    summary: 'Saved summary views: your own and the shared ones',
    success: 200,
    response: 'SavedViewDTO[]',
  },
  'POST /api/v1/projects/{projectId}/reports/views': {
    tag: 'Reports',
    summary: 'Save a summary view (rows, columns, filters), private or shared',
    success: 201,
    response: 'SavedViewDTO',
  },
  'DELETE /api/v1/projects/{projectId}/reports/views/{viewId}': {
    tag: 'Reports',
    summary: 'Delete a saved view (owner or lead)',
    success: 204,
    response: 'void',
  },

  // ---- Environment lists
  'GET /api/v1/projects/{projectId}/env-dimensions': {
    tag: 'Runs',
    summary: 'Lists of values behind the run environment labels',
    success: 200,
    response: 'EnvDimensionsDTO',
  },
  'PUT /api/v1/projects/{projectId}/env-dimensions': {
    tag: 'Runs',
    summary:
      'Replace the environment lists (a list may depend on another, e.g. OS version on Platform)',
    success: 200,
    response: 'EnvDimensionsDTO',
  },
  'POST /api/v1/projects/{projectId}/env-dimensions/normalize-runs': {
    tag: 'Runs',
    summary: 'Respell the environment of every run to the lists and add the values found in runs',
    success: 200,
    response: 'NormalizeRunsResultDTO',
  },

  // ---- Report templates
  'GET /api/v1/projects/{projectId}/templates': {
    tag: 'Report templates',
    summary: 'Report templates (first item: built-in default, id 0)',
    success: 200,
    response: 'TemplateDTO[]',
  },
  'POST /api/v1/projects/{projectId}/templates': {
    tag: 'Report templates',
    summary: 'Upload a report template',
    success: 201,
    response: 'TemplateDTO',
  },
  'PATCH /api/v1/projects/{projectId}/templates/{templateId}': {
    tag: 'Report templates',
    summary: 'Update template settings',
    success: 200,
    response: 'TemplateDTO',
  },
  'DELETE /api/v1/projects/{projectId}/templates/{templateId}': {
    tag: 'Report templates',
    summary: 'Delete a template',
    success: 204,
    response: 'void',
  },
  'GET /api/v1/projects/{projectId}/templates/{templateId}/check': {
    tag: 'Report templates',
    summary: 'Placeholders and sheets found in a template',
    success: 200,
    response: 'TemplateCheckDTO',
  },
  'GET /api/v1/projects/{projectId}/templates/{templateId}/download': {
    tag: 'Report templates',
    summary: 'Download a template workbook',
    success: 200,
    response: 'xlsx template',
    produces: 'xlsx',
  },
  'GET /api/v1/projects/{projectId}/templates/placeholders': {
    tag: 'Report templates',
    summary: 'Placeholders available in templates',
    success: 200,
    response: '{ workbook: string[]; runs: string[]; run: string[]; cases: string[] }',
  },

  // ---- Jira
  'GET /api/v1/projects/{projectId}/integrations': {
    tag: 'Jira',
    summary: 'Integration status for members (no auth details)',
    success: 200,
    response: 'IntegrationsStatusDTO',
  },
  'GET /api/v1/projects/{projectId}/integrations/jira': {
    tag: 'Jira',
    summary: 'Jira settings (null when not configured; the secret is never returned)',
    success: 200,
    response: 'JiraConfigDTO | null',
  },
  'PUT /api/v1/projects/{projectId}/integrations/jira': {
    tag: 'Jira',
    summary: 'Save Jira settings (secret omitted or empty = keep the stored one)',
    notes: 'The stored secret is only reused for the same Jira server (scheme, host and port).',
    success: 200,
    response: 'JiraConfigDTO',
  },
  'DELETE /api/v1/projects/{projectId}/integrations/jira': {
    tag: 'Jira',
    summary: 'Remove the Jira settings',
    success: 204,
    response: 'void',
  },
  'POST /api/v1/projects/{projectId}/integrations/jira/test': {
    tag: 'Jira',
    summary: 'Test Jira settings (unsaved settings, or `{}` for the stored ones)',
    notes: 'Always 200: `ok: false` with a message when Jira cannot be used.',
    success: 200,
    response: 'JiraTestResultDTO',
  },
  'POST /api/v1/projects/{projectId}/defects/{defectId}/jira': {
    tag: 'Jira',
    summary: 'Create a Jira issue from the defect and link it',
    success: 200,
    response: 'DefectDTO',
  },
  'POST /api/v1/projects/{projectId}/defects/{defectId}/jira/link': {
    tag: 'Jira',
    summary: 'Link the defect to an existing Jira issue (verified in Jira)',
    success: 200,
    response: 'DefectDTO',
  },
  'POST /api/v1/projects/{projectId}/defects/{defectId}/jira/sync': {
    tag: 'Jira',
    summary: 'Refresh the Jira status of the linked issue',
    success: 200,
    response: 'DefectDTO',
  },
  'DELETE /api/v1/projects/{projectId}/defects/{defectId}/jira': {
    tag: 'Jira',
    summary: 'Unlink the Jira issue (the issue itself is kept)',
    success: 200,
    response: 'DefectDTO',
  },
  'GET /api/v1/notifications': {
    tag: 'Notifications',
    summary: 'My lab-wide notifications (test stand requests), newest first',
    success: 200,
    response: 'NotificationListDTO',
  },
  'POST /api/v1/notifications/read-all': {
    tag: 'Notifications',
    summary: 'Mark all my lab-wide notifications as read',
    success: 204,
    response: 'void',
  },
  'POST /api/v1/notifications/{notificationId}/read': {
    tag: 'Notifications',
    summary: 'Mark one lab-wide notification as read',
    success: 204,
    response: 'void',
  },
  'GET /api/v1/stands': {
    tag: 'Test stands',
    summary: "All zones and stands: model installed, today's and the next booking, open requests",
    notes: '`model` keeps only stands whose code, installed model or a coming booking matches.',
    success: 200,
    response: 'StandBoardDTO',
  },
  'GET /api/v1/stands/events': {
    tag: 'Test stands',
    summary:
      'History of the units on the stands: installs, uninstalls, replacements (newest first)',
    notes:
      'Written when a request is done, a stand model is changed by hand, or the stand sheet is imported. `q` matches model, stand or project.',
    success: 200,
    response: 'StandEventDTO[]',
  },
  'GET /api/v1/stands/work': {
    tag: 'Test stands',
    summary: "A technician's work in a year: requests done or rejected, changes by hand, per month",
    success: 200,
    response: 'TechnicianWorkDTO',
  },
  'GET /api/v1/stands/technicians': {
    tag: 'Test stands',
    summary: 'Active technicians (for requests)',
    success: 200,
    response: 'UserRef[]',
  },
  'POST /api/v1/stands/zones': {
    tag: 'Test stands',
    summary: 'Add a zone (technicians and admins)',
    success: 201,
    response: 'StandZoneDTO',
  },
  'PATCH /api/v1/stands/zones/{zoneId}': {
    tag: 'Test stands',
    summary: 'Rename or reorder a zone',
    success: 200,
    response: 'StandZoneDTO',
  },
  'DELETE /api/v1/stands/zones/{zoneId}': {
    tag: 'Test stands',
    summary: 'Delete an empty zone',
    success: 204,
    response: 'void',
  },
  'GET /api/v1/stands/bookings': {
    tag: 'Test stands',
    summary: 'Bookings overlapping a date range (default: the next 8 weeks)',
    success: 200,
    response: 'StandBookingDTO[]',
  },
  'POST /api/v1/stands/bookings': {
    tag: 'Test stands',
    summary:
      "Book a stand for a project's testing, whole days or hours (tester or lead of the project)",
    notes:
      'Overlapping days on the same stand are refused with 409 STAND_BOOKED and the booking in the way.',
    success: 201,
    response: 'StandBookingDTO',
  },
  'PATCH /api/v1/stands/bookings/{bookingId}': {
    tag: 'Test stands',
    summary: 'Change a booking (who booked, a project lead or an admin)',
    success: 200,
    response: 'StandBookingDTO',
  },
  'DELETE /api/v1/stands/bookings/{bookingId}': {
    tag: 'Test stands',
    summary: 'Cancel a booking',
    success: 204,
    response: 'void',
  },
  'GET /api/v1/stands/requests': {
    tag: 'Test stands',
    summary: 'Install / uninstall requests (`scope=mine`: sent to me or by me)',
    success: 200,
    response: 'StandRequestDTO[]',
  },
  'POST /api/v1/stands/requests': {
    tag: 'Test stands',
    summary: 'Ask a technician to install, uninstall or replace a unit on a day',
    notes: 'The technician gets a notification.',
    success: 201,
    response: 'StandRequestDTO',
  },
  'GET /api/v1/stands/requests/{requestId}': {
    tag: 'Test stands',
    summary: 'One request',
    success: 200,
    response: 'StandRequestDTO',
  },
  'POST /api/v1/stands/requests/{requestId}/accept': {
    tag: 'Test stands',
    summary: 'Technician accepts (optionally on another day)',
    notes: 'The requester gets a notification.',
    success: 200,
    response: 'StandRequestDTO',
  },
  'POST /api/v1/stands/requests/{requestId}/reject': {
    tag: 'Test stands',
    summary: 'Technician rejects with a reason',
    success: 200,
    response: 'StandRequestDTO',
  },
  'POST /api/v1/stands/requests/{requestId}/done': {
    tag: 'Test stands',
    summary: 'Technician marks the work done; the stand shows the new model',
    notes:
      "Install / replace set the stand's model to the requested one; uninstall leaves it empty.",
    success: 200,
    response: 'StandRequestDTO',
  },
  'POST /api/v1/stands/requests/{requestId}/cancel': {
    tag: 'Test stands',
    summary: 'Requester cancels an open request',
    success: 200,
    response: 'StandRequestDTO',
  },
  'POST /api/v1/stands/import': {
    tag: 'Test stands',
    summary: "Read the lab's stand sheet (.xlsx): preview, or apply with dryRun=false",
    notes:
      'Blocks with Stand No. / Model Name / In charge under a Zone heading. Request, Replace and Target go to the note.',
    success: 200,
    response: 'StandImportResultDTO',
  },
  'POST /api/v1/stands': {
    tag: 'Test stands',
    summary: 'Add a stand (technicians and admins)',
    success: 201,
    response: 'StandDTO',
  },
  'GET /api/v1/stands/{standId}': {
    tag: 'Test stands',
    summary: 'One stand',
    success: 200,
    response: 'StandDTO',
  },
  'PATCH /api/v1/stands/{standId}': {
    tag: 'Test stands',
    summary: 'Update a stand: model installed, in charge, note, zone (technicians and admins)',
    success: 200,
    response: 'StandDTO',
  },
  'DELETE /api/v1/stands/{standId}': {
    tag: 'Test stands',
    summary: 'Delete a stand with its bookings and requests',
    success: 204,
    response: 'void',
  },
};
