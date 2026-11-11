import { describe, expect, it } from '@jest/globals';
import { traceabilityOf, type TraceCaseRow } from './traceability.js';

const suite = { id: 1, name: 'Unit operation', prefix: 'UO' };
const c = (id: number, refs: string | null): TraceCaseRow => ({
  id,
  seq: id,
  title: `Case ${id}`,
  refs,
  suite,
});
const key = (seq: number) => `BUG-${seq}`;

describe('traceabilityOf', () => {
  it('groups cases by canonical reference and sorts numerically', () => {
    const out = traceabilityOf(
      [c(1, 'req 10, REQ-2'), c(2, 'Req_2'), c(3, null), c(4, ' ')],
      new Map(),
      [],
      key,
    );
    expect(out.rows.map((r) => r.reference)).toEqual(['REQ-2', 'REQ-10']);
    expect(out.rows[0]!.cases.map((x) => x.displayId)).toEqual(['UO-001', 'UO-002']);
    expect(out.casesWithoutReference).toBe(2);
    expect(out.totalCases).toBe(4);
  });

  it('counts the latest results of the cases of a reference', () => {
    const latest = new Map<number, never>([
      [1, 'ok'],
      [2, 'ng'],
      [3, 'untested'],
      [4, 'ok_cond'],
    ] as never);
    const out = traceabilityOf(
      [c(1, 'R-1'), c(2, 'R-1'), c(3, 'R-1'), c(4, 'R-1'), c(5, 'R-1')],
      latest,
      [],
      key,
    );
    expect(out.rows[0]!.counts).toEqual({
      total: 5,
      passed: 2,
      failed: 1,
      notExecuted: 1,
      neverRun: 1,
    });
  });

  it('lists each linked defect once and counts the open ones', () => {
    const d = (testCaseId: number, id: number, status: 'open' | 'closed') => ({
      testCaseId,
      id,
      seq: id,
      title: `Defect ${id}`,
      status,
      severity: 'major' as const,
    });
    const out = traceabilityOf(
      [c(1, 'R-1'), c(2, 'R-1')],
      new Map(),
      [d(1, 7, 'open'), d(2, 7, 'open'), d(2, 8, 'closed')],
      key,
    );
    const row = out.rows[0]!;
    expect(row.defects.map((x) => x.key)).toEqual(['BUG-7', 'BUG-8']);
    expect(row.openDefects).toBe(1);
  });
});
