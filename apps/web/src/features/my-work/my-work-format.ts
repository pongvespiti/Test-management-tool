import { DEFECT_SEVERITY_LABELS, type MyWorkDTO, type MyWorkRange } from '@tmt/shared';
import { addDays, format, parseISO } from 'date-fns';
import { countsSummary } from '@/components/common/stacked-progress';
import { formatDuration } from '@/features/runs/time';

/** `YYYY-MM-DD` moved by `n` calendar days (local calendar, no time zone involved). */
export function shiftDate(date: string, n: number): string {
  return format(addDays(parseISO(date), n), 'yyyy-MM-dd');
}

/** Days to step when paging: one day or one week. */
export function stepOf(range: MyWorkRange): number {
  return range === 'week' ? 7 : 1;
}

/** `Thu, Oct 22, 2026` for a day; `Oct 19 – Oct 25, 2026` for a week. */
export function periodTitle(range: MyWorkRange, from: string, to: string): string {
  if (range === 'day') return format(parseISO(from), 'EEE, MMM d, yyyy');
  const start = parseISO(from);
  const end = parseISO(to);
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${format(start, sameYear ? 'MMM d' : 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Plain text for a work report: what was tested, by release / build, defects, what is left. */
export function summaryText(data: MyWorkDTO, projectName: string): string {
  const { summary, assigned } = data;
  const lines = [
    `Work summary — ${periodTitle(data.range, data.from, data.to)} — ${data.user.displayName}`,
    `Project: ${projectName}`,
    '',
  ];
  if (summary.executed === 0) {
    lines.push('No test results recorded in this period.');
  } else {
    lines.push(
      `Tested ${plural(summary.executed, 'case')}: ${countsSummary(summary.counts)}`,
      `Time spent: ${formatDuration(summary.elapsedSec)}`,
    );
    if (summary.groups.length > 0) {
      lines.push('', 'By release / build:');
      for (const g of summary.groups) {
        const where = [g.release?.name ?? 'No release', g.build?.name].filter(Boolean).join(' · ');
        lines.push(`- ${where}: ${plural(g.executed, 'case')} (${countsSummary(g.counts)})`);
      }
    }
  }
  if (summary.defects.length > 0) {
    lines.push('', `Defects reported (${summary.defects.length}):`);
    for (const d of summary.defects) {
      lines.push(`- ${d.key} ${d.title} [${DEFECT_SEVERITY_LABELS[d.severity]}]`);
    }
  }
  lines.push(
    '',
    `Still waiting: ${assigned.untested} untested, ${assigned.ng} NG, ${assigned.blocked} blocked`,
  );
  return lines.join('\n');
}
