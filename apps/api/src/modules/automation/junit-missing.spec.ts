import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  caseRow,
  projectRow,
  runCaseRow,
  sectionRow,
  suiteRow,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import { createMissingCases } from './junit-missing.js';
import type { JunitTest } from './junit-parse.js';

const test = (overrides: Partial<JunitTest> = {}): JunitTest => ({
  name: 'WR-1',
  classname: 'com.example.app.AdapterIT',
  suiteName: 'Adapter',
  outcome: 'ok',
  message: null,
  timeSec: 1,
  properties: {},
  ...overrides,
});

const input = { projectId: 10, userId: 1, role: 'tester' as const, fileName: 'results.xml' };
const run = { id: 7, suiteId: 2 };

describe('createMissingCases', () => {
  let mock: PrismaMock;
  let nextCaseId: number;

  beforeEach(() => {
    mock = createPrismaMock();
    nextCaseId = 500;
    const { db } = mock;
    db.suite.findUniqueOrThrow.mockResolvedValue(suiteRow({ nextSeq: 41 }));
    db.project.findUnique.mockResolvedValue(projectRow({ requireCaseReview: false }));
    db.section.findMany.mockResolvedValue([]);
    db.section.create.mockImplementation((({ data }: { data: { name: string } }) =>
      Promise.resolve({ id: data.name === 'Adapter' ? 31 : 32 })) as never);
    db.testCase.findMany.mockResolvedValue([]);
    db.testCase.aggregate.mockResolvedValue({ _max: { sortOrder: null } } as never);
    db.suite.update.mockImplementation((({ data }: { data: { nextSeq: { increment: number } } }) =>
      Promise.resolve({ nextSeq: 41 + data.nextSeq.increment })) as never);
    db.testCase.create.mockImplementation((({ data }: { data: object }) =>
      Promise.resolve(caseRow({ ...data, id: nextCaseId++ } as never))) as never);
    db.testCaseVersion.create.mockResolvedValue({} as never);
    db.runCase.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } } as never);
    db.runCase.createManyAndReturn.mockImplementation((({ data }: { data: unknown[] }) =>
      Promise.resolve(data.map((_, i) => ({ id: 900 + i })))) as never);
    db.runCase.findMany.mockImplementation((({ where }: { where: { id: { in: number[] } } }) =>
      // Returned in another order on purpose: the result must follow the insert order.
      Promise.resolve(
        where.id.in.toReversed().map((id) => runCaseRow({ id, runId: 7 })),
      )) as never);
  });

  it('creates one automated library case per suite/class/name and appends them to the run', async () => {
    const first = test();
    const retry = test({ outcome: 'ng' }); // same test reported twice → one case
    const other = test({ name: 'loginWorks', classname: null, suiteName: '' });
    const res = await createMissingCases(mock.db, run, input, [first, retry, other]);

    // Top-level sections named after the <testsuite>, the default one for unnamed suites.
    expect(mock.db.section.create.mock.calls.map(([a]) => a.data)).toEqual([
      { suiteId: 2, parentId: null, name: 'Adapter', sortOrder: 1 },
      { suiteId: 2, parentId: null, name: 'JUnit import', sortOrder: 2 },
    ]);
    // Case numbers are allocated once for all new cases.
    expect(mock.db.suite.update).toHaveBeenCalledTimes(1);
    expect(mock.db.suite.update.mock.calls[0]![0].data).toEqual({ nextSeq: { increment: 2 } });

    const created = mock.db.testCase.create.mock.calls.map(([a]) => a.data);
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      suiteId: 2,
      sectionId: 31,
      seq: 41,
      code: 'WR-1',
      title: 'WR-1',
      caseType: 'Normal',
      status: 'ready',
      priority: 'medium',
      tags: ['automated'],
      references: 'com.example.app.AdapterIT',
      sortOrder: 1,
      source: { fileName: 'results.xml' },
      createdById: 1,
    });
    expect(created[1]).toMatchObject({
      sectionId: 32,
      seq: 42,
      code: 'loginWorks',
      references: null,
    });
    expect(mock.db.testCaseVersion.create).toHaveBeenCalledTimes(2);

    // Run cases continue after the last one of the run, in creation order.
    const inserted = mock.db.runCase.createManyAndReturn.mock.calls[0]![0]!.data as unknown as {
      testCaseId: number;
      sortOrder: number;
      displayId: string;
    }[];
    expect(inserted.map((r) => [r.testCaseId, r.sortOrder, r.displayId])).toEqual([
      [500, 5, 'MBS-041'],
      [501, 6, 'MBS-042'],
    ]);
    expect(res.createdCaseIds).toEqual([500, 501]);
    expect(res.rows.map((r) => r.id)).toEqual([900, 901]);
    expect(res.runCases.get(900)).toEqual([first, retry]);
    expect(res.runCases.get(901)).toEqual([other]);
  });

  it('reuses existing top-level sections (case-insensitive) and continues their case order', async () => {
    mock.db.section.findMany.mockResolvedValue([
      sectionRow({ id: 8, name: ' ADAPTER ', sortOrder: 3 }),
      sectionRow({ id: 9, name: 'Nested', parentId: 8 }),
    ]);
    mock.db.testCase.aggregate.mockResolvedValue({ _max: { sortOrder: 6 } } as never);
    await createMissingCases(mock.db, run, input, [
      test({ name: 'a' }),
      test({ name: 'b' }),
      test({ name: 'c', suiteName: 'New suite' }),
    ]);
    expect(mock.db.section.create.mock.calls.map(([a]) => a.data)).toEqual([
      { suiteId: 2, parentId: null, name: 'New suite', sortOrder: 4 },
    ]);
    const created = mock.db.testCase.create.mock.calls.map(([a]) => a.data);
    expect(created.map((c) => [c.sectionId, c.sortOrder])).toEqual([
      [8, 7],
      [8, 8],
      [32, 7],
    ]);
    // The sort order of a section is read once, then counted locally.
    expect(mock.db.testCase.aggregate).toHaveBeenCalledTimes(2);
  });

  it('leaves the case code empty when it is taken, too long or the test has no name', async () => {
    mock.db.testCase.findMany.mockResolvedValue([{ code: 'WR-1' }] as never);
    const long = 'x'.repeat(101);
    await createMissingCases(mock.db, run, input, [
      test(), // code WR-1 already used in the suite
      test({ name: 'WR-2' }),
      test({ name: 'WR-2', classname: 'other.Class' }), // second WR-2 in the same file
      test({ name: long }),
      test({ name: '', classname: 'only.Class' }),
      test({ name: '', classname: null }),
    ]);
    const created = mock.db.testCase.create.mock.calls.map(([a]) => a.data);
    expect(created.map((c) => c.code)).toEqual([null, 'WR-2', null, null, null, null]);
    expect(created.map((c) => c.title)).toEqual([
      'WR-1',
      'WR-2',
      'WR-2',
      long,
      'only.Class',
      'Unnamed test',
    ]);
  });

  it('creates drafts when the project requires a review and the caller is not a lead', async () => {
    mock.db.project.findUnique.mockResolvedValue(projectRow({ requireCaseReview: true }));
    await createMissingCases(mock.db, run, input, [test()]);
    expect(mock.db.testCase.create.mock.calls[0]![0].data.status).toBe('draft');

    mock.db.testCase.create.mockClear();
    await createMissingCases(mock.db, run, { ...input, role: 'lead' }, [test()]);
    expect(mock.db.testCase.create.mock.calls[0]![0].data.status).toBe('ready');
  });
});
