import { describe, expect, it } from '@jest/globals';
import { caseRow, runCaseRow, sectionRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import { buildSectionTree } from '../library/section-tree.js';
import {
  copyRunSnapshot,
  insertRunCases,
  nextRunCaseSortOrder,
  selectCases,
  snapshotCases,
  snapshotFromRunCase,
  snapshotOf,
  type RunCaseInsert,
} from './snapshot.js';

const sections = [
  sectionRow({ id: 1, name: 'A', sortOrder: 1 }),
  sectionRow({ id: 2, name: 'A.1', parentId: 1, sortOrder: 1 }),
  sectionRow({ id: 3, name: 'B', sortOrder: 2 }),
];
const tree = buildSectionTree(sections);

describe('run case snapshots', () => {
  it('copies a library case with its section path and flattened steps', () => {
    const shared = new Map([[9, { name: 'Login', steps: [{ action: 'Open', expected: 'Page' }] }]]);
    const snap = snapshotOf(
      caseRow({
        sectionId: 2,
        template: 'steps',
        version: 3,
        steps: [
          { kind: 'shared', sharedStepId: 9 },
          { kind: 'step', action: 'Tap', expected: 'On' },
        ],
        remark: 'note',
        tags: ['Smoke'],
        custom: { reg: '1' },
      }),
      { prefix: 'MBS' },
      tree,
      shared,
    );
    expect(snap).toMatchObject({
      testCaseId: 100,
      caseVersion: 3,
      displayId: 'MBS-036',
      sectionPath: ['A', 'A.1'],
      caseRemark: 'note',
      tags: ['Smoke'],
      custom: { reg: '1' },
    });
    expect(snap.steps).toEqual([
      { action: 'Open', expected: 'Page', sharedStepName: 'Login' },
      { action: 'Tap', expected: 'On', sharedStepName: null },
    ]);
    expect(
      snapshotOf(
        caseRow({ steps: [{ kind: 'step', action: 'x' }] }),
        { prefix: 'X' },
        tree,
        new Map(),
      ).steps,
    ).toEqual([]);
  });

  it('copies the snapshot of an existing run case', () => {
    const snap = snapshotFromRunCase(
      runCaseRow({
        title: 'Old',
        sectionPath: ['B'],
        steps: [{ action: 'a', expected: '', sharedStepName: null }],
      }),
    );
    expect(snap).toMatchObject({ title: 'Old', sectionPath: ['B'], testCaseId: 100 });
    expect(snap.steps).toHaveLength(1);
    expect(snap).not.toHaveProperty('status');
  });

  it('selects live cases in tree order with ANDed filters', async () => {
    const { db } = createPrismaMock();
    db.section.findMany.mockResolvedValue(sections);
    db.testCase.findMany.mockResolvedValue([
      caseRow({ id: 1, sectionId: 3, seq: 1, tags: ['smoke'] }),
      caseRow({ id: 2, sectionId: 2, seq: 2, tags: ['UI'] }),
      caseRow({ id: 3, sectionId: null, seq: 3, tags: ['SMOKE'] }),
      caseRow({ id: 4, sectionId: 1, seq: 5, sortOrder: 2 }),
      caseRow({ id: 5, sectionId: 1, seq: 4, sortOrder: 2 }),
    ]);
    const all = await selectCases(db, { id: 2 }, { caseStatuses: ['ready'] });
    expect(all.rows.map((c) => c.id)).toEqual([3, 5, 4, 2, 1]);
    expect(db.testCase.findMany.mock.calls[0]![0]!.where).toEqual({
      suiteId: 2,
      isDeleted: false,
      status: { in: ['ready'] },
    });
    const tagged = await selectCases(db, { id: 2 }, { caseStatuses: ['ready'], tags: ['Smoke'] });
    expect(tagged.rows.map((c) => c.id)).toEqual([3, 1]);
    const inA = await selectCases(
      db,
      { id: 2 },
      { caseStatuses: ['draft', 'ready'], sectionIds: [1], priorities: ['high'] },
    );
    expect(inA.rows.map((c) => c.id)).toEqual([5, 4, 2]);
    expect(db.testCase.findMany.mock.calls[2]![0]!.where).toMatchObject({
      status: { in: ['draft', 'ready'] },
      priority: { in: ['high'] },
    });
  });

  it('rejects sections and cases outside the suite', async () => {
    const { db } = createPrismaMock();
    db.section.findMany.mockResolvedValue(sections);
    await expect(
      selectCases(db, { id: 2 }, { caseStatuses: ['ready'], sectionIds: [99] }),
    ).rejects.toMatchObject({ code: 'BAD_SECTION' });
    db.testCase.count.mockResolvedValue(1);
    await expect(
      selectCases(db, { id: 2 }, { caseStatuses: ['ready'], caseIds: [1, 2, 2] }),
    ).rejects.toMatchObject({ code: 'BAD_CASE' });
    expect(db.testCase.count.mock.calls[0]![0]!.where).toEqual({
      suiteId: 2,
      isDeleted: false,
      id: { in: [1, 2] },
    });
    db.testCase.count.mockResolvedValue(2);
    db.testCase.findMany.mockResolvedValue([caseRow({ id: 2 }), caseRow({ id: 1 })]);
    const picked = await selectCases(db, { id: 2 }, { caseStatuses: ['ready'], caseIds: [1, 2] });
    expect(picked.rows).toHaveLength(2);
    expect(db.testCase.findMany.mock.calls[0]![0]!.where).toMatchObject({ id: { in: [1, 2] } });
  });

  it('numbers snapshots from a start position', async () => {
    const { db } = createPrismaMock();
    db.section.findMany.mockResolvedValue([]);
    db.testCase.findMany.mockResolvedValue([
      caseRow({ id: 1, seq: 1 }),
      caseRow({ id: 2, seq: 2 }),
    ]);
    const rows = await snapshotCases(db, { id: 2, prefix: 'MBS' }, { caseStatuses: ['ready'] }, 5);
    expect(rows.map((r) => [r.displayId, r.sortOrder])).toEqual([
      ['MBS-001', 5],
      ['MBS-002', 6],
    ]);
  });

  it('inserts run cases in chunks and keeps the id order', async () => {
    const { db } = createPrismaMock();
    let next = 1;
    db.runCase.createManyAndReturn.mockImplementation((async (args: { data: unknown[] }) =>
      args.data.map(() => ({ id: next++ }))) as never);
    const base = snapshotFromRunCase(runCaseRow());
    const rows: RunCaseInsert[] = Array.from({ length: 501 }, (_, i) => ({
      ...base,
      sortOrder: i + 1,
    }));
    const ids = await insertRunCases(db, 8, rows);
    expect(ids).toHaveLength(501);
    expect(ids[500]).toBe(501);
    expect(db.runCase.createManyAndReturn).toHaveBeenCalledTimes(2);
    const first = db.runCase.createManyAndReturn.mock.calls[0]![0]!.data as Record<
      string,
      unknown
    >[];
    expect(first[0]).toMatchObject({ runId: 8, sortOrder: 1, assigneeId: null, steps: [] });
    expect(await insertRunCases(db, 8, [])).toEqual([]);
  });

  it('computes the next sort order and copies snapshots with SQL', async () => {
    const { db } = createPrismaMock();
    db.runCase.aggregate.mockResolvedValue({ _max: { sortOrder: 7 } } as never);
    expect(await nextRunCaseSortOrder(db, 3)).toBe(8);
    await copyRunSnapshot(db, 3, 4);
    const [, ...values] = db.$executeRaw.mock.calls[0]!;
    expect(values).toEqual([4, 3]);
  });
});
