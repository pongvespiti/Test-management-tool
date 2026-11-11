/**
 * Traceability: groups library cases by requirement — the keys of the requirements table and the
 * references written in the cases' `refs` text — and adds the latest result and the linked
 * defects of each case. A case counts for a requirement when it is linked in the table, cites the
 * key, or both. Pure — the service feeds it rows.
 */
import {
  OPEN_DEFECT_STATUSES,
  displayId,
  parseReferences,
  type DefectSeverity,
  type DefectStatus,
  type RequirementSource,
  type RequirementVia,
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

/** A requirement of the table with the cases linked to it. */
export interface TraceRequirementRow {
  id: number;
  key: string;
  title: string;
  source: RequirementSource;
  externalUrl: string | null;
  externalStatus: string | null;
  linkedCaseIds: ReadonlySet<number>;
}

const PASSED: readonly string[] = ['ok', 'ok_cond'];
const FAILED: readonly string[] = ['ng', 'blocked'];

/** `REQ-2` before `REQ-10`; ids before plain notes. */
function compareReferences(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

const emptyRow = (reference: string): TraceabilityRowDTO => ({
  reference,
  requirement: null,
  cases: [],
  counts: { total: 0, passed: 0, failed: 0, notExecuted: 0, neverRun: 0 },
  defects: [],
  openDefects: 0,
});

export function traceabilityOf(
  cases: readonly TraceCaseRow[],
  latest: ReadonlyMap<number, ResultStatus>,
  defects: readonly TraceDefectRow[],
  defectKey: (seq: number) => string,
  requirements: readonly TraceRequirementRow[] = [],
): TraceabilityDTO {
  const defectsOfCase = new Map<number, TraceDefectRow[]>();
  for (const d of defects) {
    const list = defectsOfCase.get(d.testCaseId) ?? [];
    list.push(d);
    defectsOfCase.set(d.testCaseId, list);
  }

  // Rows by lower-case reference; a requirement of the table names its row.
  const rows = new Map<string, TraceabilityRowDTO>();
  const via = new Map<string, Map<number, RequirementVia>>();
  const rowFor = (reference: string): TraceabilityRowDTO => {
    const k = reference.toLowerCase();
    let row = rows.get(k);
    if (!row) {
      row = emptyRow(reference);
      rows.set(k, row);
      via.set(k, new Map());
    }
    return row;
  };

  const caseById = new Map(cases.map((c) => [c.id, c]));
  const linkedCases = new Set<number>();
  for (const r of requirements) {
    const row = rowFor(r.key);
    row.reference = r.key;
    row.requirement = {
      id: r.id,
      title: r.title,
      source: r.source,
      externalUrl: r.externalUrl,
      externalStatus: r.externalStatus,
    };
    for (const id of r.linkedCaseIds) {
      if (!caseById.has(id)) continue;
      via.get(r.key.toLowerCase())!.set(id, 'linked');
      linkedCases.add(id);
    }
  }

  let casesWithoutReference = 0;
  for (const c of cases) {
    const refs = parseReferences(c.refs);
    if (refs.length === 0 && !linkedCases.has(c.id)) casesWithoutReference += 1;
    for (const ref of refs) {
      rowFor(ref);
      const map = via.get(ref.toLowerCase())!;
      map.set(c.id, map.has(c.id) ? 'both' : 'refs');
    }
  }

  const order = new Map(cases.map((c, i) => [c.id, i]));
  for (const [k, row] of rows) {
    for (const [caseId, how] of via.get(k)!) {
      const c = caseById.get(caseId)!;
      const status = latest.get(c.id) ?? null;
      row.cases.push({
        id: c.id,
        displayId: displayId(c.suite.prefix, c.seq),
        title: c.title,
        suite: { id: c.suite.id, name: c.suite.name },
        status,
        via: how,
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
    // Cases in the order of the library (suite, then number), whichever way they were found.
    row.cases.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }
  return {
    rows: [...rows.values()].toSorted((a, b) => compareReferences(a.reference, b.reference)),
    casesWithoutReference,
    totalCases: cases.length,
  };
}
