/** Project roles, lowest to highest privilege. Admins (system flag) pass every project check. */
export const PROJECT_ROLES = ['viewer', 'manager', 'tester', 'lead'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 1,
  manager: 2,
  tester: 3,
  lead: 4,
};

/** Result of one run case. Vocabulary follows the team's Excel: OK / NG / OK with condition / N/T / N/A. */
export const RESULT_STATUSES = ['untested', 'ok', 'ng', 'ok_cond', 'blocked', 'nt', 'na'] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const EXECUTED_STATUSES = ['ok', 'ng', 'ok_cond', 'blocked', 'nt', 'na'] as const;
export type ExecutedStatus = (typeof EXECUTED_STATUSES)[number];

export const CASE_TYPES = ['Normal', 'Abnormal'] as const;
export type CaseType = (typeof CASE_TYPES)[number];

/** Review workflow: draft → in_review → ready (approved); "request changes" sends it back to draft. */
export const CASE_STATUSES = ['draft', 'in_review', 'ready', 'deprecated'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

/** `text` = procedure/expected as free text (the team's Excel style); `steps` = step-by-step. */
export const CASE_TEMPLATES = ['text', 'steps'] as const;
export type CaseTemplate = (typeof CASE_TEMPLATES)[number];

export const REVIEW_DECISIONS = ['approve', 'request_changes'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const PLAN_STATUSES = ['draft', 'in_progress', 'completed'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const JUDGEMENTS = ['pass', 'pass_with_condition', 'not_pass'] as const;
export type Judgement = (typeof JUDGEMENTS)[number];

export const RELEASE_STATUSES = ['planned', 'active', 'completed'] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const SESSION_STATUSES = ['planned', 'in_progress', 'completed'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** What a timeline note of an exploratory session is. */
export const SESSION_NOTE_KINDS = ['note', 'bug', 'question', 'idea'] as const;
export type SessionNoteKind = (typeof SESSION_NOTE_KINDS)[number];

/** Where a requirement came from: typed in TMT, an Excel/CSV import, or read from Jira. */
export const REQUIREMENT_SOURCES = ['manual', 'excel', 'jira'] as const;
export type RequirementSource = (typeof REQUIREMENT_SOURCES)[number];

export const DEFECT_STATUSES = [
  'new',
  'open',
  'in_progress',
  'resolved',
  'closed',
  'reopened',
  'rejected',
] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

/** Statuses that count as "open" on dashboards. */
export const OPEN_DEFECT_STATUSES = ['new', 'open', 'in_progress', 'reopened'] as const;

export const DEFECT_TRANSITIONS: Record<DefectStatus, readonly DefectStatus[]> = {
  new: ['open', 'rejected'],
  open: ['in_progress', 'resolved', 'rejected'],
  in_progress: ['resolved', 'open'],
  resolved: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['in_progress', 'resolved'],
  rejected: ['reopened'],
};

export const DEFECT_SEVERITIES = ['critical', 'major', 'minor', 'trivial'] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export const DEFECT_PRIORITIES = ['high', 'medium', 'low'] as const;
export type DefectPriority = (typeof DEFECT_PRIORITIES)[number];

export const FIELD_TYPES = ['text', 'longtext', 'select'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const ATTACHMENT_ENTITY_TYPES = [
  'run_case',
  'defect',
  'test_case',
  'plan',
  'comment',
  'template',
] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

export const COMMENT_ENTITY_TYPES = ['defect', 'run_case', 'test_case', 'plan'] as const;
export type CommentEntityType = (typeof COMMENT_ENTITY_TYPES)[number];

export const MATRIX_GROUP_BY = ['summary', 'section', 'type'] as const;
export type MatrixGroupBy = (typeof MATRIX_GROUP_BY)[number];

/** Import column mapping targets (see spec §7). */
export const IMPORT_TARGETS = [
  'ignore',
  'section',
  'section_code',
  'code',
  'title',
  'type',
  'precondition',
  'procedure',
  'expected',
  'remark',
  'summary_group',
  // v1.1
  'priority',
  'tags',
  'estimate',
  'references',
  'custom',
  'new_custom',
] as const;
export type ImportTarget = (typeof IMPORT_TARGETS)[number];

/** Where a recorded result came from (stored on each result history row). */
export const RESULT_SOURCES = ['ui', 'bulk', 'junit', 'api'] as const;
export type ResultSource = (typeof RESULT_SOURCES)[number];

/** `pat` = Jira Server/Data Center personal access token (Bearer); `basic` = user + API token (Jira Cloud). */
export const JIRA_AUTH_TYPES = ['pat', 'basic'] as const;
export type JiraAuthType = (typeof JIRA_AUTH_TYPES)[number];

/** How JUnit test cases are matched to run cases. */
export const JUNIT_MATCH_MODES = ['auto', 'code', 'display_id', 'title'] as const;
export type JunitMatchMode = (typeof JUNIT_MATCH_MODES)[number];

/** Result used for a JUnit `<skipped/>` test case. */
export const JUNIT_SKIPPED_AS = ['nt', 'na', 'blocked'] as const;
export type JunitSkippedAs = (typeof JUNIT_SKIPPED_AS)[number];

/** Statuses a re-run can carry over from its source run. */
export const RERUN_STATUSES = ['ng', 'blocked', 'ok_cond', 'nt', 'untested'] as const;
export type RerunStatus = (typeof RERUN_STATUSES)[number];

export const IMPORT_KINDS = ['cases', 'junit'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const IMPORT_LAYOUTS = [
  'unit_operation',
  'adapter',
  'modbus_system',
  'modbus_function',
  'generic',
] as const;
export type ImportLayout = (typeof IMPORT_LAYOUTS)[number];

/** Why a notification was created. */
export const NOTIFICATION_KINDS = [
  'assigned',
  'due_soon',
  'overdue',
  'retest',
  'requirement_changed',
  'stand_request',
  'stand_request_update',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** What a test device is. */
export const DEVICE_KINDS = ['unit', 'phone', 'router', 'other'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/** `in_use` means someone holds the device (it has a holder). */
export const DEVICE_STATUSES = ['available', 'in_use', 'repair'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** What a technician is asked to do on a test stand. */
export const STAND_REQUEST_KINDS = ['install', 'uninstall', 'replace'] as const;
export type StandRequestKind = (typeof STAND_REQUEST_KINDS)[number];

/** requested → accepted → done; or rejected by the technician / cancelled by the requester. */
export const STAND_REQUEST_STATUSES = [
  'requested',
  'accepted',
  'rejected',
  'done',
  'cancelled',
] as const;
export type StandRequestStatus = (typeof STAND_REQUEST_STATUSES)[number];

/** Requests a technician still has to act on. */
export const OPEN_STAND_REQUEST_STATUSES: readonly StandRequestStatus[] = ['requested', 'accepted'];
