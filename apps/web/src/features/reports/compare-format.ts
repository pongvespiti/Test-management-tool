import { COMPARE_CHANGES, type CompareChange, type CompareRowDTO } from '@tmt/shared';

export const CHANGE_LABELS: Record<CompareChange, string> = {
  regression: 'Regression',
  still_failing: 'Still failing',
  not_run: 'Not run again',
  newly_run: 'Newly run',
  fixed: 'Fixed',
  only_base: 'Only in “from”',
  only_target: 'Only in “to”',
  unchanged: 'Unchanged',
};

/** One line under each KPI / filter: what the change means. */
export const CHANGE_HINTS: Record<CompareChange, string> = {
  regression: 'OK before, NG or Blocked now',
  still_failing: 'NG or Blocked on both sides',
  not_run: 'Had a verdict, not run on the “to” side',
  newly_run: 'No verdict before, has one now',
  fixed: 'NG or Blocked before, OK now',
  only_base: 'The case is not in the “to” run or build',
  only_target: 'The case is not in the “from” run or build',
  unchanged: 'Same kind of result on both sides',
};

export type CompareFilter = CompareChange | 'all' | 'changed';

export const FILTER_OPTIONS: { value: CompareFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'changed', label: 'Changed' },
  { value: 'regression', label: CHANGE_LABELS.regression },
  { value: 'fixed', label: CHANGE_LABELS.fixed },
  { value: 'still_failing', label: CHANGE_LABELS.still_failing },
];

export function parseFilter(value: string): CompareFilter {
  return value === 'all' ||
    value === 'changed' ||
    (COMPARE_CHANGES as readonly string[]).includes(value)
    ? (value as CompareFilter)
    : 'all';
}

export function filterRows(rows: readonly CompareRowDTO[], filter: CompareFilter): CompareRowDTO[] {
  if (filter === 'all') return [...rows];
  if (filter === 'changed') return rows.filter((r) => r.change !== 'unchanged');
  return rows.filter((r) => r.change === filter);
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Rows as CSV (case, suite, result on each side, what changed). */
export function compareCsv(rows: readonly CompareRowDTO[]): string {
  const lines = [['Case', 'Title', 'Suite', 'From', 'To', 'Change']];
  for (const r of rows) {
    lines.push([
      r.displayId,
      r.title,
      r.suite,
      r.base ?? '',
      r.target ?? '',
      CHANGE_LABELS[r.change],
    ]);
  }
  return lines.map((l) => l.map(esc).join(',')).join('\n') + '\n';
}
