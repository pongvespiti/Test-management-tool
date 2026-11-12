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

  describe('with the requirements table', () => {
    const req = (id: number, key: string, linked: number[] = []) => ({
      id,
      key,
      title: `Requirement ${key}`,
      source: 'manual' as const,
      externalUrl: null,
      externalStatus: null,
      needsReview: false,
      linkedCaseIds: new Set(linked),
    });

    it('shows a requirement without cases as a row with none', () => {
      const out = traceabilityOf([c(1, null)], new Map(), [], key, [req(1, 'REQ-5')]);
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0]).toMatchObject({
        reference: 'REQ-5',
        requirement: { id: 1, title: 'Requirement REQ-5', source: 'manual' },
        counts: { total: 0 },
      });
      expect(out.casesWithoutReference).toBe(1);
    });

    it('joins linked cases with the cases that cite the key', () => {
      const out = traceabilityOf([c(1, 'req 5'), c(2, null), c(3, 'REQ-5')], new Map(), [], key, [
        req(1, 'REQ-5', [2, 3]),
      ]);
      const row = out.rows[0]!;
      expect(row.cases.map((x) => [x.displayId, x.via])).toEqual([
        ['UO-001', 'refs'],
        ['UO-002', 'linked'],
        ['UO-003', 'both'],
      ]);
      expect(row.counts.total).toBe(3);
      // A linked case has a requirement, so it is not "without reference".
      expect(out.casesWithoutReference).toBe(0);
    });

    it('matches keys without regard to case and ignores links to cases that no longer count', () => {
      const out = traceabilityOf([c(1, 'sec a')], new Map(), [], key, [req(1, 'Sec A', [99])]);
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0]!.reference).toBe('Sec A');
      expect(out.rows[0]!.cases.map((x) => x.via)).toEqual(['refs']);
    });

    it('keeps references that are not requirements as plain rows', () => {
      const out = traceabilityOf([c(1, 'JIRA-9')], new Map(), [], key, [req(1, 'REQ-1')]);
      expect(out.rows.map((r) => [r.reference, r.requirement?.id ?? null])).toEqual([
        ['JIRA-9', null],
        ['REQ-1', 1],
      ]);
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
