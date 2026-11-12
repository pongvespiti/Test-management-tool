import { describe, expect, it } from '@jest/globals';
import type { ReportRun } from '@tmt/excel';
import {
  dimensionRows,
  requirementRows,
  requirementStatus,
  type PlanRunCase,
} from './report-extras.js';

const counts = (c: Partial<ReportRun['counts']> = {}): ReportRun['counts'] => ({
  untested: 0,
  ok: 0,
  ng: 0,
  ok_cond: 0,
  blocked: 0,
  nt: 0,
  na: 0,
  ...c,
});
const req = (id: number, key: string, extra = {}) => ({
  id,
  key,
  title: `Title ${key}`,
  source: 'Typed in',
  externalStatus: null,
  needsReview: false,
  ...extra,
});
const rc = (id: number, extra: Partial<PlanRunCase> = {}): PlanRunCase => ({
  id,
  testCaseId: null,
  references: null,
  status: 'ok',
  ...extra,
});

describe('requirementStatus', () => {
  it('is not covered without rows, failing on any NG, in progress while undecided, else passing', () => {
    expect(requirementStatus(counts(), 0)).toBe('Not covered');
    expect(requirementStatus(counts({ ok: 3, ng: 1, untested: 1 }), 5)).toBe('Failing');
    expect(requirementStatus(counts({ ok: 3, untested: 1 }), 4)).toBe('In progress');
    expect(requirementStatus(counts({ ok: 1, blocked: 1 }), 2)).toBe('In progress');
    expect(requirementStatus(counts({ ok: 2, ok_cond: 1, na: 1 }), 4)).toBe('Passing');
  });
});

describe('requirementRows', () => {
  it('counts rows linked in the table or citing the key, once each, and skips untested requirements', () => {
    const rows = requirementRows(
      [req(1, 'REQ-1'), req(2, 'REQ-2'), req(3, 'REQ-3')],
      new Map([[1, new Set([10])]]),
      [
        rc(1, { testCaseId: 10, references: 'req 1' }), // linked and cited: one row
        rc(2, { testCaseId: 10, status: 'ng' }), // same library case in a second run
        rc(3, { references: 'REQ_2, Sec 3', status: 'untested' }),
        rc(4, { testCaseId: null, references: 'IOT-9' }),
      ],
      new Map([[2, ['BUG-3']]]),
    );
    expect(rows.map((r) => r.key)).toEqual(['REQ-1', 'REQ-2']);
    expect(rows[0]).toMatchObject({
      cases: 2,
      status: 'Failing',
      counts: { ok: 1, ng: 1 },
      defects: 'BUG-3',
    });
    expect(rows[1]).toMatchObject({ cases: 1, status: 'In progress', defects: '' });
  });

  it('marks changed requirements, carries the Jira status and sorts keys naturally', () => {
    const rows = requirementRows(
      [
        req(1, 'REQ-10'),
        req(2, 'REQ-2', { needsReview: true, source: 'Jira', externalStatus: 'In Progress' }),
      ],
      new Map(),
      [rc(1, { references: 'REQ-10, REQ-2' })],
      new Map(),
    );
    expect(rows.map((r) => r.key)).toEqual(['REQ-2', 'REQ-10']);
    expect(rows[0]).toMatchObject({ review: 'Review', source: 'Jira', jiraStatus: 'In Progress' });
    expect(rows[1]!.review).toBe('');
  });

  it('ignores a library link whose case was deleted from the plan rows', () => {
    const rows = requirementRows(
      [req(1, 'REQ-1')],
      new Map([[1, new Set([10])]]),
      [rc(1)],
      new Map(),
    );
    expect(rows).toEqual([]);
  });
});

describe('dimensionRows', () => {
  const run = (env: [string, string][], build: string | null, c: Partial<ReportRun['counts']>) =>
    ({
      envList: env.map(([label, value]) => ({ label, value })),
      build,
      counts: counts(c),
    }) as unknown as ReportRun;

  it('adds up the results of the runs that carry each value, by label then value', () => {
    const rows = dimensionRows([
      run(
        [
          ['Platform', 'iOS'],
          ['Unit', 'A'],
        ],
        '1.0',
        { ok: 3, ng: 1 },
      ),
      run(
        [
          ['Platform', 'Android'],
          ['Unit', 'A'],
        ],
        '1.1',
        { ok: 2 },
      ),
      run(
        [
          ['Platform', 'ios'],
          ['Unit', ' '],
        ],
        '1.0',
        { untested: 4 },
      ),
    ]);
    expect(rows.map((r) => `${r.dimension}=${r.value}:${r.runs}`)).toEqual([
      'Platform=Android:1',
      'Platform=iOS:2',
      'Unit=A:2',
      'Build=1.0:2',
      'Build=1.1:1',
    ]);
    expect(rows[1]!.counts).toMatchObject({ ok: 3, ng: 1, untested: 4 });
  });

  it('is empty without runs', () => {
    expect(dimensionRows([])).toEqual([]);
  });
});
