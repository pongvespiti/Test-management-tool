/**
 * Response shapes of the REST API (`/api/v1`). Plain types only — the server maps DB rows to these,
 * the web app consumes them. Dates are ISO-8601 strings; date-only values are `YYYY-MM-DD`.
 */
import type {
  AttachmentEntityType,
  CasePriority,
  CaseStatus,
  CaseTemplate,
  CaseType,
  CommentEntityType,
  DefectPriority,
  DefectSeverity,
  DefectStatus,
  FieldType,
  ImportKind,
  ImportLayout,
  ImportTarget,
  JiraAuthType,
  Judgement,
  MatrixGroupBy,
  PlanStatus,
  ProjectRole,
  ReleaseStatus,
  ResultSource,
  ResultStatus,
} from './enums';
import type { MatrixCell } from './logic/matrix';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type StatusCounts = Record<ResultStatus, number>;

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

// ---------------------------------------------------------------- users & projects

export interface UserRef {
  id: number;
  username: string;
  displayName: string;
}

export interface UserDTO extends UserRef {
  email: string | null;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface MembershipDTO {
  projectId: number;
  projectKey: string;
  projectName: string;
  role: ProjectRole;
}

export interface MeDTO {
  user: UserDTO;
  memberships: MembershipDTO[];
}

export interface ProjectDTO {
  id: number;
  key: string;
  name: string;
  description: string | null;
  docNoPattern: string;
  isArchived: boolean;
  /** Only leads can make cases `ready` (see review workflow). */
  requireCaseReview: boolean;
  /** Effective role of the caller (admins act as lead). */
  myRole: ProjectRole;
  createdAt: string;
  updatedAt: string;
}

export interface MemberDTO {
  user: UserRef;
  role: ProjectRole;
}

export interface ReleaseDTO {
  id: number;
  projectId: number;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: ReleaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BuildDTO {
  id: number;
  releaseId: number;
  name: string;
  notes: string | null;
  builtDate: string | null;
  /** Test runs and defects (found in or fixed in) that point at the build. */
  runCount: number;
  defectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NamedRef {
  id: number;
  name: string;
}

// ---------------------------------------------------------------- library

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  showInTable: boolean;
}

export interface SuiteDTO {
  id: number;
  projectId: number;
  name: string;
  prefix: string;
  description: string | null;
  fieldDefs: FieldDef[];
  envTemplate: string[];
  caseCount: number;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SectionNode {
  id: number;
  suiteId: number;
  parentId: number | null;
  name: string;
  code: string | null;
  sortOrder: number;
  /** Cases directly in this section. */
  caseCount: number;
  /** Cases in this section and all descendants. */
  totalCount: number;
  children: SectionNode[];
}

export interface SectionTreeDTO {
  suiteId: number;
  /** Cases not in any section. */
  unsectionedCount: number;
  total: number;
  sections: SectionNode[];
}

/** One step: what to do and what should happen. */
export interface PlainStepDTO {
  action: string;
  expected: string;
}

/**
 * Step of a library case: written inline, or a reference to a shared step set — expanded here for
 * display (`missing: true` when the shared step was deleted; it then contributes no steps).
 */
export type CaseStepDTO =
  | ({ kind: 'step' } & PlainStepDTO)
  | {
      kind: 'shared';
      sharedStepId: number;
      name: string;
      steps: PlainStepDTO[];
      missing?: boolean;
    };

export interface CaseReviewDTO {
  /** Reviewer asked for (null = any lead). */
  reviewer: UserRef | null;
  requestedBy: UserRef | null;
  requestedAt: string | null;
  reviewedBy: UserRef | null;
  reviewedAt: string | null;
  /** Latest submit or decision note. */
  note: string | null;
}

export interface CaseRefDTO {
  id: number;
  suiteId: number;
  displayId: string;
  code: string | null;
  title: string;
}

/** One hit of the project-wide case search. */
export interface CaseSearchHit {
  id: number;
  displayId: string;
  code: string | null;
  title: string;
  status: CaseStatus;
  priority: CasePriority;
  suiteId: number;
  suiteName: string;
}

/** Best matches (title/code matches first) and the number of matching cases in the project. */
export interface CaseSearchResultDTO {
  items: CaseSearchHit[];
  total: number;
}

export interface TestCaseDTO {
  id: number;
  suiteId: number;
  sectionId: number | null;
  sectionPath: string[];
  seq: number;
  /** System id, e.g. `MBS-036`. */
  displayId: string;
  /** Team's own case code (Excel "No." / "Case ID"). */
  code: string | null;
  title: string;
  caseType: CaseType;
  status: CaseStatus;
  priority: CasePriority;
  tags: string[];
  estimateMinutes: number | null;
  /** Requirement ids / Jira keys / spec references (free text). */
  references: string | null;
  /** `text`: procedure/expected are free text; `steps`: use `steps`. */
  template: CaseTemplate;
  steps: CaseStepDTO[];
  review: CaseReviewDTO;
  precondition: string | null;
  procedure: string | null;
  expected: string | null;
  remark: string | null;
  summaryGroup: string | null;
  custom: Record<string, string>;
  version: number;
  sortOrder: number;
  source: { fileName?: string; sheet?: string; row?: number } | null;
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface SharedStepDTO {
  id: number;
  projectId: number;
  name: string;
  description: string | null;
  steps: PlainStepDTO[];
  version: number;
  /** Library cases (not deleted) that reference this shared step. */
  usageCount: number;
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface SharedStepDetailDTO extends SharedStepDTO {
  usedBy: CaseRefDTO[];
}

export interface TagCountDTO {
  tag: string;
  count: number;
}

export interface CaseVersionDTO {
  version: number;
  data: Record<string, unknown>;
  changedBy: UserRef | null;
  changedAt: string;
}

export interface CaseRunHistoryItem {
  runCaseId: number;
  runId: number;
  runCode: string;
  planId: number;
  planDocNo: string;
  planTitle: string;
  releaseName: string | null;
  status: ResultStatus;
  actualResult: string | null;
  executedBy: UserRef | null;
  executedAt: string | null;
}

// ---------------------------------------------------------------- plans & runs

export interface EnvEntryDTO {
  label: string;
  value: string;
}

export interface AttachmentDTO {
  id: string;
  entityType: AttachmentEntityType;
  entityId: number | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdBy: UserRef | null;
  createdAt: string;
  /** Relative download URL. */
  url: string;
}

export interface RunRef {
  id: number;
  code: string;
}

export interface RunSummaryDTO {
  id: number;
  code: string;
  scenario: string | null;
  suiteName: string;
  environment: EnvEntryDTO[];
  counts: StatusCounts;
  judgement: Judgement | null;
  /** Set when this run is a re-run of another run. */
  sourceRun: RunRef | null;
}

export interface PlanDTO {
  id: number;
  projectId: number;
  release: NamedRef | null;
  docNo: string;
  title: string;
  purpose: string | null;
  testMethod: string | null;
  judgementCriteria: string | null;
  rawDataPath: string | null;
  overallJudgement: Judgement | null;
  judgementNote: string | null;
  suggestedJudgement: Judgement | null;
  status: PlanStatus;
  completedAt: string | null;
  completedBy: UserRef | null;
  templateId: number | null;
  signedCopy: AttachmentDTO | null;
  counts: StatusCounts;
  runs: RunSummaryDTO[];
  createdBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunDTO {
  id: number;
  planId: number;
  planDocNo: string;
  planTitle: string;
  planStatus: PlanStatus;
  /** Release of the plan: the run's build is chosen among its builds. */
  planReleaseId: number | null;
  suite: { id: number; name: string; prefix: string; fieldDefs: FieldDef[] };
  code: string;
  scenario: string | null;
  environment: EnvEntryDTO[];
  tester: UserRef | null;
  testedDate: string | null;
  judgement: Judgement | null;
  judgementNote: string | null;
  remark: string | null;
  sortOrder: number;
  counts: StatusCounts;
  suggestedJudgement: Judgement | null;
  sourceRun: RunRef | null;
  build: NamedRef | null;
  /** Sum of case estimates; remaining = untested run cases only. */
  estimate: { totalMinutes: number; remainingMinutes: number };
  createdAt: string;
  updatedAt: string;
}

/** Step of a run case snapshot (shared steps flattened in place). */
export interface RunStepDTO {
  action: string;
  expected: string;
  /** Name of the shared step this step came from. */
  sharedStepName: string | null;
}

export interface StepResultDTO {
  status: ResultStatus;
  actual: string;
}

export interface RunCaseDTO {
  id: number;
  runId: number;
  testCaseId: number | null;
  displayId: string;
  code: string | null;
  title: string;
  caseType: CaseType;
  sectionPath: string[];
  priority: CasePriority;
  tags: string[];
  estimateMinutes: number | null;
  references: string | null;
  template: CaseTemplate;
  precondition: string | null;
  procedure: string | null;
  expected: string | null;
  /** Snapshot steps (empty for `text` cases). */
  steps: RunStepDTO[];
  caseRemark: string | null;
  summaryGroup: string | null;
  custom: Record<string, string>;
  sortOrder: number;
  /** Explicit assignee; null = the run's tester. */
  assignee: UserRef | null;
  status: ResultStatus;
  actualResult: string | null;
  resultRemark: string | null;
  executedBy: UserRef | null;
  executedAt: string | null;
  elapsedSec: number | null;
  /** Index-aligned with `steps`; null when no step results were recorded. */
  stepResults: StepResultDTO[] | null;
  defectCount: number;
  attachmentCount: number;
}

export interface ResultHistoryDTO {
  id: number;
  status: ResultStatus;
  actualResult: string | null;
  remark: string | null;
  elapsedSec: number | null;
  stepResults: StepResultDTO[] | null;
  source: ResultSource;
  executedBy: UserRef | null;
  executedAt: string;
}

export interface DefectRef {
  id: number;
  key: string;
  title: string;
  status: DefectStatus;
  severity: DefectSeverity;
}

export interface RunCaseDetailDTO extends RunCaseDTO {
  history: ResultHistoryDTO[];
  attachments: AttachmentDTO[];
  defects: DefectRef[];
  /** The same library case in other runs (newest first). */
  otherRuns: CaseRunHistoryItem[];
}

export interface MatrixRowDTO {
  run: { id: number; code: string; scenario: string | null; environment: EnvEntryDTO[] };
  cells: (MatrixCell | null)[];
}

export interface MatrixDTO {
  groupBy: MatrixGroupBy;
  groups: string[];
  rows: MatrixRowDTO[];
}

// ---------------------------------------------------------------- defects & collaboration

export interface DefectLinkDTO {
  id: number;
  runCaseId: number | null;
  testCaseId: number | null;
  runId: number | null;
  runCode: string | null;
  planId: number | null;
  planDocNo: string | null;
  caseDisplayId: string | null;
  caseCode: string | null;
  caseTitle: string | null;
  resultStatus: ResultStatus | null;
}

export interface DefectListItem {
  id: number;
  key: string;
  title: string;
  severity: DefectSeverity;
  priority: DefectPriority;
  status: DefectStatus;
  assignee: UserRef | null;
  release: NamedRef | null;
  foundInBuild: NamedRef | null;
  fixedInBuild: NamedRef | null;
  linkSummary: string | null;
  /** Linked Jira issue key and its last synced status. */
  externalKey: string | null;
  externalStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DefectDTO extends DefectListItem {
  projectId: number;
  description: string | null;
  steps: string | null;
  expected: string | null;
  actual: string | null;
  reporter: UserRef | null;
  foundIn: string | null;
  fixedIn: string | null;
  environment: string | null;
  externalUrl: string | null;
  externalSyncedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  links: DefectLinkDTO[];
  attachments: AttachmentDTO[];
  allowedTransitions: DefectStatus[];
}

export interface CommentDTO {
  id: number;
  entityType: CommentEntityType;
  entityId: number;
  body: string;
  author: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityDTO {
  id: number;
  entityType: string;
  entityId: number | null;
  action: string;
  summary: string;
  user: UserRef | null;
  createdAt: string;
}

// ---------------------------------------------------------------- dashboard

export interface AttentionItemDTO {
  runCaseId: number;
  status: 'ng' | 'ok_cond';
  displayId: string;
  code: string | null;
  title: string;
  actualResult: string | null;
  resultRemark: string | null;
  runId: number;
  runCode: string;
  planId: number;
  planDocNo: string;
  executedBy: UserRef | null;
  executedAt: string | null;
  defect: DefectRef | null;
}

/** Results of the runs tested on one build of the dashboard's release. */
export interface BuildSummaryDTO {
  build: NamedRef;
  runCount: number;
  counts: StatusCounts;
  /** Open defects found in the build. */
  openDefects: number;
}

/** A failed case of a resolved defect that is not yet tested on the build with the fix. */
export interface RetestCaseDTO {
  runCaseId: number;
  displayId: string;
  title: string;
  runId: number;
  runCode: string;
  planId: number;
  planDocNo: string;
  planStatus: PlanStatus;
  /** A run on the fix build that holds this case but has no result yet. */
  scheduledRun: { id: number; code: string } | null;
}

/** A resolved defect whose fix build has not been tested on its failed cases. */
export interface RetestItemDTO {
  defect: DefectRef & { externalKey: string | null };
  fixedInBuild: NamedRef;
  cases: RetestCaseDTO[];
}

export interface DashboardDTO {
  release: ReleaseDTO | null;
  releases: ReleaseDTO[];
  /** Builds of the release with their results, newest first (empty without a release). */
  builds: BuildSummaryDTO[];
  /** Resolved defects with a fix build in this release that still await a retest there. */
  retest: { total: number; items: RetestItemDTO[] };
  kpis: {
    planCount: number;
    plansByStatus: Record<PlanStatus, number>;
    counts: StatusCounts;
    openDefects: number;
    openDefectsBySeverity: Record<DefectSeverity, number>;
  };
  plans: PlanDTO[];
  attention: AttentionItemDTO[];
  openDefects: DefectListItem[];
}

// ---------------------------------------------------------------- my work

/** A run case waiting for me (open plans only). */
export interface MyWorkItemDTO {
  runCaseId: number;
  displayId: string;
  code: string | null;
  title: string;
  status: Extract<ResultStatus, 'untested' | 'ng' | 'blocked'>;
  priority: CasePriority;
  estimateMinutes: number | null;
  runId: number;
  runCode: string;
  planId: number;
  planDocNo: string;
  release: NamedRef | null;
  build: NamedRef | null;
}

/** Results I recorded in the period for one release / build. */
export interface MyWorkGroupDTO {
  release: NamedRef | null;
  build: NamedRef | null;
  /** Run cases with a result in the period (each counted once, by its latest result). */
  executed: number;
  counts: StatusCounts;
  elapsedSec: number;
}

export interface MyWorkDayDTO {
  /** `YYYY-MM-DD` in the report timezone. */
  date: string;
  executed: number;
  elapsedSec: number;
}

export interface MyWorkDTO {
  user: UserRef;
  timezone: string;
  range: 'day' | 'week';
  /** First and last day of the period (inclusive, `YYYY-MM-DD`). */
  from: string;
  to: string;
  assigned: {
    untested: number;
    ng: number;
    blocked: number;
    total: number;
    remainingEstimateMinutes: number;
    /** NG first, then blocked, then untested; by priority inside each. */
    items: MyWorkItemDTO[];
    truncated: boolean;
  };
  summary: {
    executed: number;
    counts: StatusCounts;
    elapsedSec: number;
    days: MyWorkDayDTO[];
    groups: MyWorkGroupDTO[];
    /** Defects I reported in the period. */
    defects: DefectRef[];
  };
}

// ---------------------------------------------------------------- import

export interface ImportSheetInfo {
  name: string;
  state: 'visible' | 'hidden' | 'veryHidden';
  rowCount: number;
  columnCount: number;
}

export interface ImportColumnInfo {
  col: number;
  letter: string;
  header: string;
  /** Number of sheet columns covered by a merged header cell. */
  span: number;
  samples: string[];
  suggested: { target: ImportTarget; customKey?: string; newFieldLabel?: string };
}

export interface ImportEnvBlock {
  labels: string[];
  /** One entry per value column found next to the labels (several devices side by side). */
  columns: string[][];
}

export interface ImportAnalysisDTO {
  uploadId: string;
  fileName: string;
  sheets: ImportSheetInfo[];
  sheet: string;
  headerRow: number;
  headerCandidates: number[];
  layout: ImportLayout;
  columns: ImportColumnInfo[];
  envBlock: ImportEnvBlock | null;
  dataRowCount: number;
}

export interface ImportWarningDTO {
  kind:
    | 'section_filled_down'
    | 'type_defaulted'
    | 'unknown_type'
    | 'unknown_priority'
    | 'unknown_estimate'
    | 'continuation_row'
    | 'duplicate_code_in_file'
    | 'existing_code'
    | 'empty_title'
    | 'truncated';
  message: string;
  count: number;
  rows: number[];
}

export interface ImportPreviewCaseDTO {
  row: number;
  sectionPath: string[];
  code: string | null;
  title: string;
  caseType: CaseType;
  priority: CasePriority;
  tags: string[];
  estimateMinutes: number | null;
  references: string | null;
  precondition: string | null;
  procedure: string | null;
  expected: string | null;
  remark: string | null;
  summaryGroup: string | null;
  custom: Record<string, string>;
  action: 'create' | 'update' | 'skip';
}

export interface ImportPreviewDTO {
  counts: {
    cases: number;
    create: number;
    update: number;
    skip: number;
    sections: number;
    newSections: number;
    newFields: number;
  };
  newFields: { key: string; label: string }[];
  warnings: ImportWarningDTO[];
  sample: ImportPreviewCaseDTO[];
}

export interface ImportResultDTO {
  importId: number;
  suiteId: number;
  created: number;
  updated: number;
  skipped: number;
  sectionsCreated: number;
  fieldsCreated: number;
  warnings: ImportWarningDTO[];
}

export interface ImportRecordDTO {
  id: number;
  kind: ImportKind;
  suite: NamedRef | null;
  /** Target run of a JUnit import. */
  run: RunRef | null;
  fileName: string;
  sheet: string;
  /** null for JUnit imports. */
  layout: ImportLayout | null;
  stats: Record<string, number>;
  createdBy: UserRef | null;
  createdAt: string;
}

// ---------------------------------------------------------------- report templates

export interface TemplateDTO {
  id: number;
  projectId: number;
  suiteId: number | null;
  name: string;
  description: string | null;
  fileName: string;
  runSheet: string | null;
  isDefault: boolean;
  builtIn: boolean;
  createdBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateCheckDTO {
  placeholders: string[];
  unknown: string[];
  sheets: string[];
  runSheetFound: boolean;
}

// ---------------------------------------------------------------- run report (PractiTest-style)

export interface RunReportCaseDTO {
  runCaseId: number;
  displayId: string;
  code: string | null;
  title: string;
  sectionPath: string[];
  caseType: CaseType;
  priority: CasePriority;
  status: ResultStatus;
  assignee: UserRef | null;
  executedBy: UserRef | null;
  executedAt: string | null;
  elapsedSec: number | null;
  actualResult: string | null;
  resultRemark: string | null;
  /** Steps with their results (step-by-step cases only). */
  steps: (RunStepDTO & { status: ResultStatus; actual: string })[];
  defects: (DefectRef & { externalKey: string | null })[];
}

export interface RunReportDTO {
  generatedAt: string;
  generatedBy: UserRef;
  timezone: string;
  project: { id: number; key: string; name: string };
  plan: { id: number; docNo: string; title: string; status: PlanStatus; release: NamedRef | null };
  run: {
    id: number;
    code: string;
    scenario: string | null;
    build: NamedRef | null;
    suite: { id: number; name: string; prefix: string };
    environment: EnvEntryDTO[];
    tester: UserRef | null;
    testedDate: string | null;
    judgement: Judgement | null;
    judgementNote: string | null;
    suggestedJudgement: Judgement | null;
    remark: string | null;
    sourceRun: RunRef | null;
    createdAt: string;
  };
  firstExecutedAt: string | null;
  lastExecutedAt: string | null;
  estimate: { totalMinutes: number; remainingMinutes: number };
  /** Sum of recorded elapsed seconds. */
  actualDurationSec: number;
  counts: StatusCounts;
  passRate: number | null;
  progress: number;
  /** Counts per top-level section path (in tree order). */
  sections: { path: string[]; counts: StatusCounts }[];
  cases: RunReportCaseDTO[];
  /** Distinct defects linked to this run's cases. */
  defects: (DefectRef & { externalKey: string | null; externalStatus: string | null })[];
}

// ---------------------------------------------------------------- automation (JUnit)

export interface JunitImportItemDTO {
  runCaseId: number;
  displayId: string;
  title: string;
  previous: ResultStatus;
  status: ResultStatus;
  /** Number of JUnit test cases mapped onto this run case (worst status wins). */
  tests: number;
  /** The library case was created by this import (`createMissing`). */
  created: boolean;
}

export interface JunitUnmatchedDTO {
  name: string;
  classname: string | null;
  status: ResultStatus;
  reason: 'no_match' | 'ambiguous';
}

export interface JunitImportResultDTO {
  dryRun: boolean;
  /** Import record id (null on dry runs). */
  importId: number | null;
  fileName: string;
  totals: {
    tests: number;
    matched: number;
    unmatched: number;
    updatedRunCases: number;
    createdCases: number;
  };
  /** Statuses applied, counted per run case. */
  counts: StatusCounts;
  /** First 2000 affected run cases. */
  items: JunitImportItemDTO[];
  /** First 500 unmatched tests. */
  unmatched: JunitUnmatchedDTO[];
}

// ---------------------------------------------------------------- reports

export interface TrendPointDTO {
  /** `YYYY-MM-DD` in the report timezone. */
  date: string;
  /** Results recorded that day (untested excluded). */
  executed: number;
  byStatus: StatusCounts;
  /** Untested run cases in scope at the end of the day. */
  remaining: number;
  /** Pass rate of the latest result per run case at the end of the day. */
  passRate: number | null;
}

export interface ReportTrendDTO {
  from: string;
  to: string;
  timezone: string;
  /** Run cases in scope now. */
  total: number;
  points: TrendPointDTO[];
}

export interface WorkloadRowDTO {
  /** null = unassigned (no assignee and no run tester). */
  user: UserRef | null;
  runCases: number;
  untested: number;
  executed: number;
  ng: number;
  remainingEstimateMinutes: number;
  executedLast7Days: number;
}

export interface DefectReportDTO {
  byStatus: Record<DefectStatus, number>;
  bySeverity: Record<DefectSeverity, number>;
  openBySeverity: Record<DefectSeverity, number>;
  trend: { date: string; opened: number; closed: number; open: number }[];
  byAssignee: { user: UserRef | null; open: number }[];
  /** Library cases with the most linked defects (top 10). */
  topCases: { testCaseId: number; displayId: string; title: string; defectCount: number }[];
}

export interface ReleaseComparisonRowDTO {
  release: {
    id: number;
    name: string;
    status: ReleaseStatus;
    startDate: string | null;
    endDate: string | null;
  };
  planCount: number;
  runCount: number;
  counts: StatusCounts;
  passRate: number | null;
  progress: number;
  defectsTotal: number;
  defectsOpen: number;
  judgements: Record<Judgement | 'none', number>;
}

export interface CoverageRowDTO {
  suite: { id: number; name: string; prefix: string };
  /** Library cases that are not deprecated. */
  cases: number;
  byPriority: Record<CasePriority, number>;
  /** Cases with at least one run case in scope. */
  inScope: number;
  /** Latest run case in scope is executed. */
  executed: number;
  /** Latest result OK / OK w/ cond. */
  passed: number;
  /** Latest result NG / Blocked. */
  failed: number;
  /** No run case in scope. */
  neverRun: number;
}

// ---------------------------------------------------------------- API tokens & integrations

export interface ApiTokenDTO {
  id: number;
  name: string;
  /** First characters of the token, for recognising it (e.g. `tmt_3fA9`). */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

/** Returned once, on creation. */
export interface CreatedTokenDTO extends ApiTokenDTO {
  token: string;
}

export interface JiraConfigDTO {
  enabled: boolean;
  baseUrl: string;
  projectKey: string;
  issueType: string;
  authType: JiraAuthType;
  username: string | null;
  hasSecret: boolean;
  verifyTls: boolean;
  updatedBy: UserRef | null;
  updatedAt: string;
}

export interface JiraTestResultDTO {
  ok: boolean;
  message: string;
  /** Jira server title / deployment type when reachable. */
  serverTitle: string | null;
  projectName: string | null;
}

/** What any member may know about the project's integrations (no secrets, no auth details). */
export interface IntegrationsStatusDTO {
  jira: { enabled: boolean; baseUrl: string; projectKey: string } | null;
}
