import { RESULT_LABELS, type TraceabilityDTO } from '@tmt/shared';
import { toCsv } from '@/lib/save-file';

export type TraceFilter = 'all' | 'attention';

/** Rows that need a look: a failed case, an open defect, or nothing run yet. */
export function needsAttention(row: TraceabilityDTO['rows'][number]): boolean {
  return row.counts.failed > 0 || row.openDefects > 0 || row.counts.neverRun > 0;
}

/** One line per reference and case: the table as it is exported. */
export function traceabilityCsv(data: TraceabilityDTO): string {
  const rows: (string | number)[][] = [
    ['Reference', 'Case', 'Title', 'Suite', 'Latest result', 'Defects'],
  ];
  for (const r of data.rows) {
    const defects = r.defects.map((d) => d.key).join(' ');
    for (const c of r.cases) {
      rows.push([
        r.reference,
        c.displayId,
        c.title,
        c.suite.name,
        c.status ? RESULT_LABELS[c.status] : 'Never run',
        defects,
      ]);
    }
  }
  return toCsv(rows);
}
