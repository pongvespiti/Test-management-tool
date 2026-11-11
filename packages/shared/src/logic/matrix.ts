import type { StatusCounts } from '../dto';
import { totalOf } from './metrics';

/** Value of one "Summary by unit type" cell (spec §4). */
export type MatrixCell =
  'pass' | 'pass_cond' | 'ng' | 'blocked' | 'in_progress' | 'untested' | 'na' | 'nt';

export const MATRIX_CELL_LABELS: Record<MatrixCell, string> = {
  pass: 'Pass',
  pass_cond: 'Pass w/ cond.',
  ng: 'NG',
  blocked: 'Blocked',
  in_progress: 'In progress',
  untested: 'Untested',
  na: 'N/A',
  nt: 'N/T',
};

/** Wording for exported reports (the team's summary sheets use Pass / NG / N/A). */
export const MATRIX_CELL_EXPORT_LABELS: Record<MatrixCell, string> = {
  pass: 'Pass',
  pass_cond: 'Pass with condition',
  ng: 'NG',
  blocked: 'Blocked',
  in_progress: 'In progress',
  untested: '',
  na: 'N/A',
  nt: 'N/T',
};

/** Aggregates the results of one group of run cases into a single matrix cell. */
export function matrixCell(c: StatusCounts): MatrixCell | null {
  const total = totalOf(c);
  if (total === 0) return null;
  if (c.ng > 0) return 'ng';
  if (c.blocked > 0) return 'blocked';
  if (c.untested > 0) return c.untested === total ? 'untested' : 'in_progress';
  if (c.na === total) return 'na';
  if (c.na + c.nt === total) return 'nt';
  if (c.ok_cond > 0) return 'pass_cond';
  return 'pass';
}

/** Group key used for a run case when building the matrix. */
export function groupKeyOf(
  groupBy: 'summary' | 'section' | 'type',
  rc: { summaryGroup: string | null; sectionPath: string[]; caseType: string },
): string {
  if (groupBy === 'type') return rc.caseType || 'Normal';
  if (groupBy === 'summary' && rc.summaryGroup) return rc.summaryGroup;
  // Fallback for summary when a case has no summary group: its top-level section.
  if (groupBy === 'section') return rc.sectionPath[rc.sectionPath.length - 1] ?? '(No section)';
  return rc.sectionPath[0] ?? '(No section)';
}
