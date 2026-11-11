/**
 * Traceability (phase 1): groups library cases by the references written in their `refs` text and
 * adds the latest result and the linked defects of each case. Pure — the service feeds it rows.
 */
import {
  OPEN_DEFECT_STATUSES,
  displayId,
  parseReferences,
  type DefectSeverity,
  type DefectStatus,
  type ResultStatus,
  type TraceabilityDTO,
  type TraceabilityRowDTO,
  type TraceDefectDTO,
} from '@tmt/shared';

export interface TraceCaseRow {
  id: number;
  seq: number;
  title: string;
  refs: string | null;
  suite: { id: number; name: string; prefix: string };
}

export interface TraceDefectRow {
  testCaseId: number;
  id: number;
  seq: number;
  title: string;
  status: DefectStatus;
  severity: DefectSeverity;
}

const PASSED: readonly string[] = ['ok', 'ok_cond'];
const FAILED: readonly string[] = ['ng', 'blocked'];

/** `REQ-2` before `REQ-10`; ids before plain notes. */
function compareReferences(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

export function traceabilityOf(
  cases: readonly TraceCaseRow[],
  latest: ReadonlyMap<number, ResultStatus>,
  defects: readonly TraceDefectRow[],
  defectKey: (seq: number) => string,
): TraceabilityDTO {
  const defectsOfCase = new Map<number, TraceDefectRow[]>();
  for (const d of defects) {
    const list = defectsOfCase.get(d.testCaseId) ?? [];
    list.push(d);
    defectsOfCase.set(d.testCaseId, list);
  }

  const rows = new Map<string, TraceabilityRowDTO>();
  let casesWithoutReference = 0;
  for (const c of cases) {
    const refs = parseReferences(c.refs);
    if (refs.length === 0) {
      casesWithoutReference += 1;
      continue;
    }
    const status = latest.get(c.id) ?? null;
    for (const ref of refs) {
      let row = rows.get(ref);
      if (!row) {
        row = {
          reference: ref,
          cases: [],
          counts: { total: 0, passed: 0, failed: 0, notExecuted: 0, neverRun: 0 },
          defects: [],
          openDefects: 0,
        };
        rows.set(ref, row);
      }
      row.cases.push({
        id: c.id,
        displayId: displayId(c.suite.prefix, c.seq),
        title: c.title,
        suite: { id: c.suite.id, name: c.suite.name },
        status,
      });
      row.counts.total += 1;
      if (status === null) row.counts.neverRun += 1;
      else if (PASSED.includes(status)) row.counts.passed += 1;
      else if (FAILED.includes(status)) row.counts.failed += 1;
      else row.counts.notExecuted += 1;
      for (const d of defectsOfCase.get(c.id) ?? []) {
        if (row.defects.some((x) => x.id === d.id)) continue;
        const dto: TraceDefectDTO = {
          id: d.id,
          key: defectKey(d.seq),
          title: d.title,
          status: d.status,
          severity: d.severity,
        };
        row.defects.push(dto);
        if ((OPEN_DEFECT_STATUSES as readonly string[]).includes(d.status)) row.openDefects += 1;
      }
    }
  }
  return {
    rows: [...rows.values()].toSorted((a, b) => compareReferences(a.reference, b.reference)),
    casesWithoutReference,
    totalCases: cases.length,
  };
}
