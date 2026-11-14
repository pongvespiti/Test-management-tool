import type {
  CasePriority,
  CaseStatus,
  DefectPriority,
  DefectSeverity,
  DefectStatus,
  DeviceKind,
  DeviceStatus,
  Judgement,
  NotificationKind,
  StandRequestKind,
  StandRequestStatus,
  PlanStatus,
  ProjectRole,
  ReleaseStatus,
  RequirementSource,
  ResultSource,
  ResultStatus,
  SessionNoteKind,
  SessionStatus,
} from './enums';

export const RESULT_LABELS: Record<ResultStatus, string> = {
  untested: 'Untested',
  ok: 'OK',
  ng: 'NG',
  ok_cond: 'OK w/ cond.',
  blocked: 'Blocked',
  nt: 'N/T',
  na: 'N/A',
};

/** Wording used inside exported Excel reports (matches the team's existing files). */
export const RESULT_EXPORT_LABELS: Record<ResultStatus, string> = {
  untested: '',
  ok: 'OK',
  ng: 'NG',
  ok_cond: 'OK with condition',
  blocked: 'Blocked',
  nt: 'N/T',
  na: 'N/A',
};

/** Keyboard shortcut per result on the execution page. */
export const RESULT_SHORTCUTS: Record<Exclude<ResultStatus, 'untested'>, string> = {
  ok: 'O',
  ng: 'N',
  ok_cond: 'C',
  blocked: 'B',
  nt: 'T',
  na: 'A',
};

export const JUDGEMENT_LABELS: Record<Judgement, string> = {
  pass: 'PASS',
  pass_with_condition: 'PASS WITH CONDITION',
  not_pass: 'NOT PASS',
};

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  completed: 'Completed',
};

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  ready: 'Ready',
  deprecated: 'Deprecated',
};

export const CASE_PRIORITY_LABELS: Record<CasePriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Completed',
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
};

export const SESSION_NOTE_KIND_LABELS: Record<SessionNoteKind, string> = {
  note: 'Note',
  bug: 'Bug found',
  question: 'Question',
  idea: 'Idea',
};

export const REQUIREMENT_SOURCE_LABELS: Record<RequirementSource, string> = {
  manual: 'Typed in',
  excel: 'Excel',
  jira: 'Jira',
};

export const DEFECT_STATUS_LABELS: Record<DefectStatus, string> = {
  new: 'New',
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened',
  rejected: 'Rejected',
};

export const DEFECT_SEVERITY_LABELS: Record<DefectSeverity, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
  trivial: 'Trivial',
};

export const DEFECT_PRIORITY_LABELS: Record<DefectPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const ROLE_LABELS: Record<ProjectRole, string> = {
  viewer: 'Viewer',
  manager: 'Manager',
  tester: 'Tester',
  lead: 'Lead',
};

export const RESULT_SOURCE_LABELS: Record<ResultSource, string> = {
  ui: 'Manual',
  bulk: 'Bulk update',
  junit: 'JUnit import',
  api: 'API',
};

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  assigned: 'Assigned to you',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  retest: 'Ready for retest',
  requirement_changed: 'Requirement changed',
  stand_request: 'Stand request',
  stand_request_update: 'Stand request update',
};

export const DEVICE_KIND_LABELS: Record<DeviceKind, string> = {
  unit: 'AC unit',
  phone: 'Phone',
  router: 'Router',
  other: 'Other',
};

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  available: 'Available',
  in_use: 'In use',
  repair: 'In repair',
};

export const STAND_REQUEST_KIND_LABELS: Record<StandRequestKind, string> = {
  install: 'Install',
  uninstall: 'Uninstall',
  replace: 'Replace',
};

export const STAND_REQUEST_STATUS_LABELS: Record<StandRequestStatus, string> = {
  requested: 'Requested',
  accepted: 'Accepted',
  rejected: 'Rejected',
  done: 'Done',
  cancelled: 'Cancelled',
};
