import { REQUIREMENT_SOURCE_LABELS, RESULT_LABELS, type TraceabilityDTO } from '@tmt/shared';
import { toCsv } from '@/lib/save-file';

export type TraceFilter = 'all' | 'attention';

/** Rows that need a look: no case at all, a failed case, an open defect, or nothing run yet. */
export function needsAttention(row: TraceabilityDTO['rows'][number]): boolean {
  return (
    row.counts.total === 0 ||
    row.counts.failed > 0 ||
    row.openDefects > 0 ||
    row.counts.neverRun > 0
  );
}

/** One line per reference and case (a requirement without cases gets one line): the export. */
export function traceabilityCsv(data: TraceabilityDTO): string {
  const rows: (string | number)[][] = [
    [
      'Reference',
      'Requirement',
      'Source',
      'Jira status',
      'Case',
      'Title',
      'Suite',
      'Latest result',
      'Defects',
    ],
  ];
  for (const r of data.rows) {
    const defects = r.defects.map((d) => d.key).join(' ');
    const head = [
      r.reference,
      r.requirement?.title ?? '',
      r.requirement ? REQUIREMENT_SOURCE_LABELS[r.requirement.source] : '',
      r.requirement?.externalStatus ?? '',
    ];
    if (r.cases.length === 0) rows.push([...head, '', '', '', 'No case', defects]);
    for (const c of r.cases) {
      rows.push([
        ...head,
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
