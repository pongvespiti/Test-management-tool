import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '@tmt/database';
import { caseRow, sectionRow, userRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import {
  caseFilterSql,
  caseRunHistory,
  countCases,
  orderedCases,
  searchProjectCases,
  toCaseDTOs,
} from './cases.queries.js';
import { buildSectionTree } from './section-tree.js';

describe('caseFilterSql', () => {
  it('always limits to the live cases of the suite', () => {
    const where = caseFilterSql(2);
    expect(where.text).toBe('tc.suite_id = $1 AND NOT tc.is_deleted');
    expect(where.values).toEqual([2]);
  });

  it('adds every list filter as a bound parameter', () => {
    const where = caseFilterSql(2, {
      sectionIds: [5, 6],
      unsectioned: true,
      caseType: 'Abnormal',
      status: 'draft',
      priority: ['critical', 'high'],
      tag: 'Smoke',
      q: '50%_x',
    });
    expect(where.text).toContain('tc.section_id IN ($2,$3)');
    expect(where.text).toContain('tc.section_id IS NULL');
    expect(where.text).toContain('tc.case_type::text = $4');
    expect(where.text).toContain('tc.priority::text IN ($6,$7)');
    expect(where.text).toContain('lower(t.tag) = lower($8)');
    expect(where.text).toContain('tc.custom::text ILIKE');
    const pattern = '%50\\%\\_x%';
    expect(where.values).toEqual([
      2,
      5,
      6,
      'Abnormal',
      'draft',
      'critical',
      'high',
      'Smoke',
      ...Array<string>(10).fill(pattern),
    ]);
  });

  it('matches nothing for an empty section list and ignores empty filters', () => {
    expect(caseFilterSql(2, { sectionIds: [] }).text).toContain('FALSE');
    expect(caseFilterSql(2, { priority: [], tag: '', q: '', unsectioned: false }).values).toEqual([
      2,
    ]);
  });
});

describe('searchProjectCases', () => {
  it('returns nothing without a second query when no case matches', async () => {
    const { db } = createPrismaMock();
    db.$queryRaw.mockResolvedValueOnce([{ total: 0 }] as never);
    await expect(searchProjectCases(db, 3, 'none', 10)).resolves.toEqual({ items: [], total: 0 });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('searches the live cases of the active suites of the project, title/code matches first', async () => {
    const { db } = createPrismaMock();
    db.$queryRaw.mockResolvedValueOnce([{ total: 12 }] as never).mockResolvedValueOnce([
      {
        id: 9,
        seq: 36,
        code: 'A-1',
        title: 'Login',
        status: 'ready',
        priority: 'high',
        suite_id: 2,
        suite_name: 'Modbus',
        prefix: 'MBS',
      },
    ] as never);

    await expect(searchProjectCases(db, 3, '50%', 5)).resolves.toEqual({
      total: 12,
      items: [
        {
          id: 9,
          displayId: 'MBS-036',
          code: 'A-1',
          title: 'Login',
          status: 'ready',
          priority: 'high',
          suiteId: 2,
          suiteName: 'Modbus',
        },
      ],
    });

    const [count, page] = db.$queryRaw.mock.calls.map(([sql]) => sql as Prisma.Sql);
    expect(count!.text).toContain('s.project_id = $1 AND NOT s.is_archived');
    expect(count!.text).toContain('NOT tc.is_deleted');
    expect(count!.values[0]).toBe(3);
    expect(page!.text).toContain('ORDER BY ((tc.title ILIKE');
    expect(page!.text).toContain('IS TRUE) DESC');
    expect(page!.text).toContain('s.sort_order, s.id, tc.seq');
    // LIKE wildcards of the user's text are escaped; the limit is the last bound value.
    expect(page!.values).toContain('%50\\%%');
    expect(page!.values.at(-1)).toBe(5);
  });
});

describe('case list queries', () => {
  const tree = buildSectionTree([
    sectionRow({ id: 8, sortOrder: 2 }),
    sectionRow({ id: 7, sortOrder: 1 }),
  ]);

  it('counts matching cases', async () => {
    const { db } = createPrismaMock();
    db.$queryRaw.mockResolvedValue([{ total: 4 }] as never);
    await expect(countCases(db, caseFilterSql(2))).resolves.toBe(4);
    db.$queryRaw.mockResolvedValue([] as never);
    await expect(countCases(db, caseFilterSql(2))).resolves.toBe(0);
  });

  it('pages ids in tree order and loads the rows in that order', async () => {
    const { db } = createPrismaMock();
    db.$queryRaw.mockResolvedValue([{ id: 3 }, { id: 1 }] as never);
    db.testCase.findMany.mockResolvedValue([caseRow({ id: 1 }), caseRow({ id: 3 })]);
    const rows = await orderedCases(db, caseFilterSql(2), tree, { skip: 50, take: 25 });
    expect(rows.map((r) => r.id)).toEqual([3, 1]);
    const sql = db.$queryRaw.mock.calls[0]![0] as unknown as Prisma.Sql;
    expect(sql.text).toMatch(/ORDER BY array_position\(.*\)\s+NULLS FIRST, tc.sort_order, tc.seq/s);
    expect(sql.text).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
    expect(sql.values).toEqual([2, '7,8', 25, 50]);
    expect(db.testCase.findMany).toHaveBeenCalledWith({ where: { id: { in: [3, 1] } } });
  });

  it('returns every case without a page and skips the reload when nothing matches', async () => {
    const { db } = createPrismaMock();
    db.$queryRaw.mockResolvedValue([] as never);
    await expect(orderedCases(db, caseFilterSql(2), tree)).resolves.toEqual([]);
    expect((db.$queryRaw.mock.calls[0]![0] as unknown as Prisma.Sql).text).not.toContain('LIMIT');
    expect(db.testCase.findMany).not.toHaveBeenCalled();
  });
});

describe('toCaseDTOs', () => {
  it('maps cases of several suites with their prefixes and section paths', async () => {
    const { db } = createPrismaMock();
    db.suite.findMany.mockResolvedValue([
      { id: 2, prefix: 'MBS' },
      { id: 3, prefix: 'ADP' },
    ] as never);
    db.section.findMany.mockImplementation((async (args: { where: { suiteId: number } }) =>
      args.where.suiteId === 3
        ? [sectionRow({ id: 9, suiteId: 3, name: 'Pairing' })]
        : []) as never);
    db.user.findMany.mockResolvedValue([userRow()]);
    const dtos = await toCaseDTOs(db, [
      caseRow({ id: 1, suiteId: 2, seq: 4 }),
      caseRow({ id: 2, suiteId: 3, seq: 5, sectionId: 9 }),
    ]);
    expect(dtos.map((d) => [d.displayId, d.sectionPath])).toEqual([
      ['MBS-004', []],
      ['ADP-005', ['Pairing']],
    ]);
    expect(dtos[0]!.createdBy).toMatchObject({ username: 'alice' });
    await expect(toCaseDTOs(db, [])).resolves.toEqual([]);
  });
});

describe('caseRunHistory', () => {
  it('lists results newest first with run, plan and release', async () => {
    const { db } = createPrismaMock();
    db.runCase.findMany.mockResolvedValue([
      {
        id: 11,
        status: 'ng',
        actualResult: 'Fails',
        executedById: 1,
        executedAt: new Date('2026-10-01T00:00:00Z'),
        run: { id: 5, code: 'T1', plan: { id: 7, docNo: 'D-1', title: 'Plan', release: null } },
      },
    ] as never);
    db.user.findMany.mockResolvedValue([userRow()]);
    const items = await caseRunHistory(db, 100, 12, 20);
    expect(items).toEqual([
      {
        runCaseId: 11,
        runId: 5,
        runCode: 'T1',
        planId: 7,
        planDocNo: 'D-1',
        planTitle: 'Plan',
        releaseName: null,
        status: 'ng',
        actualResult: 'Fails',
        executedBy: { id: 1, username: 'alice', displayName: 'Alice' },
        executedAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    const args = db.runCase.findMany.mock.calls[0]![0]!;
    expect(args.where).toEqual({ testCaseId: 100, id: { not: 12 } });
    expect(args.orderBy).toEqual([{ executedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]);
    expect(args.take).toBe(20);
    await caseRunHistory(db, 100);
    expect(db.runCase.findMany.mock.calls[1]![0]!.where).toEqual({ testCaseId: 100 });
  });
});
