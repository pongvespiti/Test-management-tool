import type {
  CaseStatus,
  DefectPriority,
  DefectSeverity,
  DefectStatus,
  Judgement,
  MatrixCell,
  PlanStatus,
  ProjectRole,
  ReleaseStatus,
  ResultStatus,
} from '@tmt/shared';
import { ROLE_LABELS } from '@tmt/shared';
import { StatusPill } from './status-pill';
import {
  CASE_STATUS_TONES,
  DEFECT_STATUS_TONES,
  JUDGEMENT_TONES,
  labels,
  MATRIX_TONES,
  PLAN_STATUS_TONES,
  PRIORITY_COLORS,
  RELEASE_STATUS_TONES,
  RESULT_TONES,
  ROLE_TONES,
  SEVERITY_DOTS,
} from '@/lib/status';

export function ResultBadge({ status, size }: { status: ResultStatus; size?: 'sm' | 'md' }) {
  return (
    <StatusPill tone={RESULT_TONES[status]} size={size} minWidth={64}>
      {labels.result[status]}
    </StatusPill>
  );
}

export function JudgementBadge({
  judgement,
  size,
}: {
  judgement: Judgement | null;
  size?: 'sm' | 'md';
}) {
  if (!judgement)
    return (
      <span style={{ fontSize: 13, color: '#5C6670' }} title="No judgement yet">
        Pending
      </span>
    );
  return (
    <StatusPill tone={JUDGEMENT_TONES[judgement]} size={size}>
      <span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>
        {labels.judgement[judgement]}
      </span>
    </StatusPill>
  );
}

export function PlanStatusBadge({ status }: { status: PlanStatus }) {
  return <StatusPill tone={PLAN_STATUS_TONES[status]}>{labels.planStatus[status]}</StatusPill>;
}

export function ReleaseStatusBadge({ status }: { status: ReleaseStatus }) {
  return (
    <StatusPill tone={RELEASE_STATUS_TONES[status]}>{labels.releaseStatus[status]}</StatusPill>
  );
}

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return <StatusPill tone={CASE_STATUS_TONES[status]}>{labels.caseStatus[status]}</StatusPill>;
}

export function DefectStatusBadge({ status }: { status: DefectStatus }) {
  return <StatusPill tone={DEFECT_STATUS_TONES[status]}>{labels.defectStatus[status]}</StatusPill>;
}

export function MatrixCellBadge({ cell }: { cell: MatrixCell | null }) {
  if (!cell) return <span style={{ color: '#ADB5BD' }}>—</span>;
  return (
    <StatusPill tone={MATRIX_TONES[cell]} minWidth={56}>
      {labels.matrix[cell]}
    </StatusPill>
  );
}

export function RoleBadge({ role }: { role: ProjectRole | 'admin' }) {
  if (role === 'admin')
    return <StatusPill tone={{ fg: '#C92A2A', bg: '#FFF5F5' }}>Admin</StatusPill>;
  return <StatusPill tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</StatusPill>;
}

/** Coloured dot + label (severity is not a status pill on purpose). */
export function SeverityLabel({ severity }: { severity: DefectSeverity }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span
        aria-hidden="true"
        style={{ width: 9, height: 9, borderRadius: '50%', background: SEVERITY_DOTS[severity] }}
      />
      {labels.severity[severity]}
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: DefectPriority }) {
  return (
    <span style={{ color: PRIORITY_COLORS[priority], fontWeight: 600, whiteSpace: 'nowrap' }}>
      {labels.priority[priority]}
    </span>
  );
}

export function CaseTypeBadge({ type }: { type: string }) {
  const abnormal = type === 'Abnormal';
  return (
    <StatusPill
      tone={abnormal ? { fg: '#B45309', bg: '#FFF4E6' } : { fg: '#495057', bg: '#F1F3F5' }}
    >
      {type || 'Normal'}
    </StatusPill>
  );
}
