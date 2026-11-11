import {
  executedOf,
  formatPercent,
  progressOf,
  RESULT_LABELS,
  totalOf,
  type ResultStatus,
  type StatusCounts,
} from '@tmt/shared';
import { RESULT_BAR_ORDER, RESULT_TONES } from '@/lib/status';

/** Text like "27 OK · 2 NG · 1 N/T · 4 untested" (zero counts omitted). */
export function countsSummary(counts: StatusCounts): string {
  const parts: string[] = [];
  for (const s of RESULT_BAR_ORDER) {
    if (counts[s] === 0) continue;
    parts.push(`${counts[s]} ${s === 'untested' ? 'untested' : RESULT_LABELS[s]}`);
  }
  return parts.length ? parts.join(' · ') : 'No cases';
}

/** Stacked result bar: executed statuses in colour, untested as the remaining grey track. */
export function StackedProgress({
  counts,
  height = 8,
  showPercent = false,
  showSummary = false,
}: {
  counts: StatusCounts;
  height?: number;
  showPercent?: boolean;
  showSummary?: boolean;
}) {
  const total = totalOf(counts);
  const segments = RESULT_BAR_ORDER.filter(
    (s): s is Exclude<ResultStatus, 'untested'> => s !== 'untested',
  )
    .filter((s) => counts[s] > 0)
    .map((s) => ({ status: s, width: (counts[s] / Math.max(total, 1)) * 100 }));
  const summary = countsSummary(counts);
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <div
          role="img"
          aria-label={`${executedOf(counts)} of ${total} executed: ${summary}`}
          title={summary}
          className="flex min-w-[60px] flex-1 overflow-hidden rounded-full"
          style={{ height, background: RESULT_TONES.untested.bar }}
        >
          {segments.map((seg) => (
            <div
              key={seg.status}
              style={{
                width: `${seg.width}%`,
                minWidth: 3,
                background: RESULT_TONES[seg.status].bar,
              }}
            />
          ))}
        </div>
        {showPercent && (
          <span className="min-w-10 text-right text-sm font-semibold">
            {total === 0 ? '—' : formatPercent(progressOf(counts))}
          </span>
        )}
      </div>
      {showSummary && <p className="mt-1 text-xs text-muted-foreground">{summary}</p>}
    </div>
  );
}

/** Colour legend for result statuses. */
export function ResultLegend({ statuses = RESULT_BAR_ORDER }: { statuses?: ResultStatus[] }) {
  return (
    <div className="flex flex-wrap gap-3.5">
      {statuses.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="size-2.5 rounded-[3px]"
            style={{
              background: RESULT_TONES[s].bar,
              border: s === 'untested' ? '1px solid #CED4DA' : undefined,
            }}
          />
          {s === 'untested' ? 'Untested' : RESULT_LABELS[s]}
        </span>
      ))}
    </div>
  );
}
