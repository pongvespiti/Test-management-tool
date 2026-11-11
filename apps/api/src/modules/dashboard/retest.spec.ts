import { beforeEach, describe, expect, it } from '@jest/globals';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import {
  RETEST_DEFECT_LIMIT,
  retestCasesOf,
  retestQueue,
  type OnBuildRow,
  type RetestDefectRow,
} from './retest.js';

type Link = RetestDefectRow['links'][number];

const link = (id: number, over: Partial<NonNullable<Link['runCase']>> = {}): Link => ({
  runCase: {
    id,
    testCaseId: 100 + id,
    status: 'ng',
    displayId: `SY-00${id}`,
    title: `Case ${id}`,
    run: { id: 3, code: 'R1', plan: { id: 7, docNo: 'D-1', status: 'in_progress' } },
    ...over,
  },
});

const defect = (over: Partial<RetestDefectRow> = {}): RetestDefectRow => ({
  id: 9,
  seq: 4,
  title: 'Times out',
  status: 'resolved',
  severity: 'major',
  externalKey: null,
  fixedInBuildId: 8,
  links: [link(1)],
  ...over,
});

const onBuild = (testCaseId: number, over: Partial<OnBuildRow> = {}): OnBuildRow => ({
  testCaseId,
  status: 'untested',
  run: { id: 20, code: 'R2', buildId: 8 },
  ...over,
});

describe('retestCasesOf', () => {
  it('needs a run when the case is not on the fix build at all', () => {
    expect(retestCasesOf(defect(), [])).toEqual([
      expect.objectContaining({
        runCaseId: 1,
        displayId: 'SY-001',
        runCode: 'R1',
        planDocNo: 'D-1',
        planStatus: 'in_progress',
        scheduledRun: null,
      }),
    ]);
  });

  it('marks a case that sits untested in a run on the fix build as scheduled', () => {
    const [c] = retestCasesOf(defect(), [onBuild(101)]);
    expect(c!.scheduledRun).toEqual({ id: 20, code: 'R2' });
  });

  it('drops a case that has a result on the fix build (verified or failed again)', () => {
    expect(retestCasesOf(defect(), [onBuild(101, { status: 'ok' })])).toEqual([]);
    expect(retestCasesOf(defect(), [onBuild(101, { status: 'ng' })])).toEqual([]);
    // Another untested copy does not bring it back.
    expect(retestCasesOf(defect(), [onBuild(101), onBuild(101, { status: 'ok' })])).toEqual([]);
  });

  it('ignores results on other builds and other cases', () => {
    const rows = [
      onBuild(101, { status: 'ok', run: { id: 21, code: 'R0', buildId: 7 } }),
      onBuild(999, { status: 'ok' }),
    ];
    expect(retestCasesOf(defect(), rows)).toHaveLength(1);
  });

  it('only follows failed run cases and counts each once', () => {
    const d = defect({
      links: [
        link(1),
        link(1),
        link(2, { status: 'ok' }),
        link(3, { status: 'blocked' }),
        { runCase: null },
        link(4, { testCaseId: null }),
      ],
    });
    expect(retestCasesOf(d, []).map((c) => c.runCaseId)).toEqual([1, 3, 4]);
  });
});

describe('retestQueue', () => {
  let mock: PrismaMock;
  beforeEach(() => {
    mock = createPrismaMock();
    mock.db.runCase.findMany.mockResolvedValue([] as never);
  });

  it('is empty without builds and does not touch the database', async () => {
    expect(await retestQueue(mock.db as never, 10, [])).toEqual({ total: 0, items: [] });
    expect(mock.db.defect.findMany).not.toHaveBeenCalled();
  });

  it('asks for resolved defects of the builds and checks the failed cases on the fix build', async () => {
    mock.db.defect.findMany.mockResolvedValue([
      defect({ links: [link(1), link(2)] }),
      defect({ id: 10, seq: 5, links: [link(3, { status: 'ok' })] }),
    ] as never);
    mock.db.runCase.findMany.mockResolvedValue([onBuild(102, { status: 'ok' })] as never);
    const r = await retestQueue(mock.db as never, 10, [
      { id: 8, name: '1.1.7(2.0.0)' },
      { id: 7, name: '1.1.7(1.0.0)' },
    ]);
    expect(mock.db.defect.findMany.mock.calls[0]![0]!.where).toEqual({
      projectId: 10,
      status: 'resolved',
      fixedInBuildId: { in: [8, 7] },
    });
    expect(mock.db.runCase.findMany.mock.calls[0]![0]!.where).toEqual({
      testCaseId: { in: [101, 102] },
      run: { buildId: { in: [8, 7] } },
    });
    expect(r.total).toBe(1);
    expect(r.items[0]).toMatchObject({
      defect: { id: 9, key: 'BUG-4', title: 'Times out', severity: 'major', externalKey: null },
      fixedInBuild: { id: 8, name: '1.1.7(2.0.0)' },
    });
    expect(r.items[0]!.cases.map((c) => c.runCaseId)).toEqual([1]);
  });

  it('lists a limited number of defects but counts all of them', async () => {
    const many = Array.from({ length: RETEST_DEFECT_LIMIT + 3 }, (_, i) =>
      defect({ id: i + 1, seq: i + 1, links: [link(i + 1)] }),
    );
    mock.db.defect.findMany.mockResolvedValue(many as never);
    const r = await retestQueue(mock.db as never, 10, [{ id: 8, name: 'B' }]);
    expect(r.total).toBe(RETEST_DEFECT_LIMIT + 3);
    expect(r.items).toHaveLength(RETEST_DEFECT_LIMIT);
  });
});
