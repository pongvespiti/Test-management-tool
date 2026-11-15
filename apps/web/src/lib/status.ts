/**
 * Single source of status colours (mockup palette, WCAG AA text contrast) and labels.
 * `fg` text on `bg` ≥ 4.5:1; `solid` takes white text; `bar` is used in stacked progress bars
 * where neighbouring colours also differ in lightness.
 */
import {
  CASE_PRIORITY_LABELS,
  CASE_STATUS_LABELS,
  DEFECT_PRIORITY_LABELS,
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  DEVICE_STATUS_LABELS,
  JUDGEMENT_LABELS,
  MATRIX_CELL_LABELS,
  PLAN_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  RESULT_LABELS,
  type CasePriority,
  type CaseStatus,
  type DefectPriority,
  type DefectSeverity,
  type DefectStatus,
  type DeviceStatus,
  type Judgement,
  type MatrixCell,
  type PlanStatus,
  type ReleaseStatus,
  type ResultStatus,
  type StandRequestStatus,
} from '@tmt/shared';

export interface Tone {
  fg: string;
  bg: string;
  border?: string;
  dashed?: boolean;
}

export interface ResultTone extends Tone {
  solid: string;
  bar: string;
}

export const GREEN: Tone = { fg: '#237032', bg: '#EBFBEE' };
export const RED: Tone = { fg: '#C92A2A', bg: '#FFF5F5' };
export const TEAL: Tone = { fg: '#0B7285', bg: '#E3FAFC' };
export const ORANGE: Tone = { fg: '#B45309', bg: '#FFF4E6' };
export const GRAY: Tone = { fg: '#495057', bg: '#F1F3F5' };
export const BLUE: Tone = { fg: '#1864AB', bg: '#E7F5FF' };
export const VIOLET: Tone = { fg: '#6741D9', bg: '#F3F0FF' };
export const OUTLINE: Tone = { fg: '#5C6670', bg: '#FFFFFF', border: '#ADB5BD', dashed: true };

export const RESULT_TONES: Record<ResultStatus, ResultTone> = {
  untested: { ...OUTLINE, solid: '#5C6670', bar: '#E9ECEF' },
  ok: { ...GREEN, solid: '#237032', bar: '#40C057' },
  ng: { ...RED, solid: '#C92A2A', bar: '#C92A2A' },
  ok_cond: { ...TEAL, solid: '#0B7285', bar: '#0C8599' },
  blocked: { ...ORANGE, solid: '#B45309', bar: '#F08C00' },
  nt: { ...GRAY, solid: '#495057', bar: '#868E96' },
  na: { ...GRAY, solid: '#495057', bar: '#ADB5BD' },
};

/** Order used in legends and stacked bars (untested last = remaining track). */
export const RESULT_BAR_ORDER: ResultStatus[] = [
  'ok',
  'ok_cond',
  'ng',
  'blocked',
  'nt',
  'na',
  'untested',
];

export const JUDGEMENT_TONES: Record<Judgement, Tone & { solid: string }> = {
  pass: { ...GREEN, solid: '#237032' },
  pass_with_condition: { ...TEAL, solid: '#0B7285' },
  not_pass: { ...RED, solid: '#C92A2A' },
};

export const PLAN_STATUS_TONES: Record<PlanStatus, Tone> = {
  draft: GRAY,
  in_progress: BLUE,
  completed: GREEN,
};

export const RELEASE_STATUS_TONES: Record<ReleaseStatus, Tone> = {
  planned: GRAY,
  active: BLUE,
  completed: GREEN,
};

export const STAND_REQUEST_STATUS_TONES: Record<StandRequestStatus, Tone> = {
  requested: ORANGE,
  accepted: BLUE,
  done: GREEN,
  rejected: RED,
  cancelled: GRAY,
};

export const DEVICE_STATUS_TONES: Record<DeviceStatus, Tone> = {
  available: GREEN,
  in_use: BLUE,
  repair: ORANGE,
};

export const CASE_STATUS_TONES: Record<CaseStatus, Tone> = {
  draft: GRAY,
  in_review: VIOLET,
  ready: GREEN,
  deprecated: { fg: '#868E96', bg: '#F8F9FA', border: '#DEE2E6' },
};

export const DEFECT_STATUS_TONES: Record<DefectStatus, Tone> = {
  new: GRAY,
  open: BLUE,
  in_progress: ORANGE,
  resolved: GREEN,
  closed: GRAY,
  reopened: RED,
  rejected: { fg: '#868E96', bg: '#F8F9FA', border: '#DEE2E6' },
};

/** Case priority: coloured dot + text, same visual language as defect severity. */
export const CASE_PRIORITY_DOTS: Record<CasePriority, string> = {
  critical: '#C92A2A',
  high: '#E8590C',
  medium: '#1C7ED6',
  low: '#ADB5BD',
};

/** Severity is shown as a coloured dot + dark text (different visual language from statuses). */
export const SEVERITY_DOTS: Record<DefectSeverity, string> = {
  critical: '#C92A2A',
  major: '#E8590C',
  minor: '#FAB005',
  trivial: '#ADB5BD',
};

export const PRIORITY_COLORS: Record<DefectPriority, string> = {
  high: '#C92A2A',
  medium: '#1971C2',
  low: '#868E96',
};

export const MATRIX_TONES: Record<MatrixCell, Tone> = {
  pass: GREEN,
  pass_cond: TEAL,
  ng: RED,
  blocked: ORANGE,
  in_progress: BLUE,
  untested: OUTLINE,
  na: GRAY,
  nt: GRAY,
};

export const ROLE_TONES = { lead: VIOLET, manager: TEAL, tester: BLUE, viewer: GRAY } as const;

export const labels = {
  result: RESULT_LABELS,
  judgement: JUDGEMENT_LABELS,
  planStatus: PLAN_STATUS_LABELS,
  releaseStatus: RELEASE_STATUS_LABELS,
  caseStatus: CASE_STATUS_LABELS,
  defectStatus: DEFECT_STATUS_LABELS,
  deviceStatus: DEVICE_STATUS_LABELS,
  severity: DEFECT_SEVERITY_LABELS,
  priority: DEFECT_PRIORITY_LABELS,
  casePriority: CASE_PRIORITY_LABELS,
  matrix: MATRIX_CELL_LABELS,
};
