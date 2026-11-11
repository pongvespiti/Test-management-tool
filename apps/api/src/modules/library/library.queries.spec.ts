import { describe, expect, it } from '@jest/globals';
import { caseRow, suiteRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import {
  allocateSeq,
  getCaseInProject,
  getSuite,
  insertCase,
  loadSharedStepLookup,
  nextCaseSortOrder,
} from './library.queries.js';

describe('library queries', () => {
  it('finds suites and cases only inside the project', async () => {
    const { db } = createPrismaMock();
    db.suite.findFirst.mockResolvedValue(null);
    await expect(getSuite(db, 10, 2)).rejects.toMatchObject({ code: 'SUITE_NOT_FOUND' });
    expect(db.suite.findFirst).toHaveBeenCalledWith({ where: { id: 2, projectId: 10 } });

    db.testCase.findFirst.mockResolvedValue({ ...caseRow(), suite: suiteRow() } as never);
    const { c, suite } = await getCaseInProject(db, 10, 100);
    expect(c).not.toHaveProperty('suite');
    expect(suite.prefix).toBe('MBS');
    expect(db.testCase.findFirst.mock.calls[0]![0]!.where).toEqual({
      id: 100,
      isDeleted: false,
      suite: { projectId: 10 },
    });
    db.testCase.findFirst.mockResolvedValue(null);
    await expect(getCaseInProject(db, 10, 1)).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
  });

  it('loads only the shared steps the cases reference', async () => {
    const { db } = createPrismaMock();
    await expect(loadSharedStepLookup(db, [caseRow()])).resolves.toEqual(new Map());
    expect(db.sharedStep.findMany).not.toHaveBeenCalled();

    db.sharedStep.findMany.mockResolvedValue([
      { id: 3, name: 'Login', steps: [{ action: 'a', expected: 'b' }] },
    ] as never);
    const lookup = await loadSharedStepLookup(db, [
      caseRow({ steps: [{ kind: 'shared', sharedStepId: 3 }] as never }),
      caseRow({
        steps: [
          { kind: 'shared', sharedStepId: 3 },
          { kind: 'step', action: 'x' },
        ] as never,
      }),
    ]);
    expect(db.sharedStep.findMany.mock.calls[0]![0]!.where).toEqual({ id: { in: [3] } });
    expect(lookup.get(3)).toEqual({ name: 'Login', steps: [{ action: 'a', expected: 'b' }] });
  });

  it('reserves case numbers atomically', async () => {
    const { db } = createPrismaMock();
    db.suite.update.mockResolvedValue({ nextSeq: 15 } as never);
    await expect(allocateSeq(db, 2, 5)).resolves.toBe(10);
    expect(db.suite.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { nextSeq: { increment: 5 } },
      select: { nextSeq: true },
    });
  });

  it('appends new cases at the end of their section', async () => {
    const { db } = createPrismaMock();
    db.testCase.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } } as never);
    await expect(nextCaseSortOrder(db, 2, null)).resolves.toBe(5);
    db.testCase.aggregate.mockResolvedValue({ _max: { sortOrder: null } } as never);
    await expect(nextCaseSortOrder(db, 2, 7)).resolves.toBe(1);
  });

  it('inserts a case with normalised content and version 1', async () => {
    const { db } = createPrismaMock();
    db.suite.update.mockResolvedValue({ nextSeq: 37 } as never);
    db.testCase.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } } as never);
    db.testCase.create.mockImplementation((async (args: { data: Record<string, unknown> }) =>
      caseRow({ ...(args.data as object), id: 101 })) as never);
    const created = await insertCase(
      db,
      suiteRow({
        fieldDefs: [{ key: 'reg', label: 'Register', type: 'text', showInTable: true }] as never,
      }),
      {
        title: 'Power ON',
        caseType: 'Normal',
        status: 'ready',
        priority: 'high',
        tags: ['smoke'],
        template: 'steps',
        steps: [{ kind: 'step', action: ' Tap power ', expected: 'Unit starts' }],
        precondition: ' Paired \r\n',
        custom: { reg: ' 40001 ' },
      },
      1,
      { source: { fileName: 'cases.xlsx', sheet: 'ACS', row: 5 } },
    );
    const data = db.testCase.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      suiteId: 2,
      seq: 36,
      sortOrder: 3,
      precondition: ' Paired',
      custom: { reg: '40001' },
      steps: [{ kind: 'step', action: ' Tap power', expected: 'Unit starts' }],
      createdById: 1,
      source: { fileName: 'cases.xlsx', sheet: 'ACS', row: 5 },
    });
    expect(db.testCaseVersion.create.mock.calls[0]![0].data).toMatchObject({
      testCaseId: 101,
      version: 1,
      changedById: 1,
    });
    expect(created.id).toBe(101);
  });

  it('uses pre-allocated numbers and sort orders for bulk inserts', async () => {
    const { db } = createPrismaMock();
    db.testCase.create.mockResolvedValue(caseRow({ id: 5 }));
    await insertCase(
      db,
      suiteRow(),
      {
        title: 't',
        caseType: 'Normal',
        status: 'draft',
        priority: 'low',
        tags: [],
        template: 'text',
        steps: [],
        custom: {},
      },
      1,
      { seq: 90, sortOrder: 4 },
    );
    expect(db.suite.update).not.toHaveBeenCalled();
    expect(db.testCase.aggregate).not.toHaveBeenCalled();
    expect(db.testCase.create.mock.calls[0]![0].data).toMatchObject({ seq: 90, sortOrder: 4 });
  });
});
