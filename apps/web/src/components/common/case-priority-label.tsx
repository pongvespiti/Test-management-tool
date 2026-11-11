import type { CasePriority } from '@tmt/shared';
import { CASE_PRIORITY_DOTS, labels } from '@/lib/status';

/** Test case priority: coloured dot + label (same language as defect severity). */
export function CasePriorityLabel({
  priority,
  compact = false,
}: {
  priority: CasePriority;
  /** Dot only, label in the tooltip (dense tables). */
  compact?: boolean;
}) {
  const label = labels.casePriority[priority];
  return (
    <span
      title={compact ? `Priority: ${label}` : undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: CASE_PRIORITY_DOTS[priority],
        }}
      />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
