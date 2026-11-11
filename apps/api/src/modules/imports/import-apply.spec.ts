import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ParsedCase, ParsedImport, SourceWorkbook } from '@tmt/excel';
import type { FieldDef, ImportTarget } from '@tmt/shared';
import { caseRow, suiteRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { applyImport, updateFor } from './import-apply.js';
import { pathKey, type ImportContext, type ImportPlan, type PlannedCase } from './import-plan.js';

/** `groupBy` has overloads the deep mock cannot type. */
const groupByMock = (m: PrismaMock) =>
  m.db.testCase.groupBy as unknown as jest.Mock<(args: { where?: unknown }) => Promise<unknown>>;

function parsedCase(overrides: Partial<ParsedCase> = {}): ParsedCase {
  return {
    row: 2,
    sectionPath: [],
    code: 'P-1',
    title: 'Power on',
    caseType: 'Normal',
    priority: 'medium',
    tags: [],
    estimateMinutes: null,
    references: null,
    precondition: null,
    procedure: null,
    expected: null,
    remark: null,
    summaryGroup: null,
    custom: {},
    ...overrides,
  };
}

const defs: FieldDef[] = [
  { key: 'owner', label: 'Owner', type: 'text', showInTable: false },
  { key: 'level', label: 'Level', type: 'select', options: ['A'], showInTable: false },
];

function plan(overrides: Partial<ImportPlan> = {}): ImportPlan {
  const parsed: ParsedImport = {
    sheet: 'Cases',
    headerRow: 1,
    dataStart: 2,
    lastDataRow: 3,
    sectionPaths: [],
    cases: [],
    newFields: [],
    customColumns: [],
    warnings: [],
  };
  return {
    suite: suiteRow({ fieldDefs: defs as never }),
    newSuite: null,
    parsed,
    layout: 'generic',
    fieldDefs: defs,
    newFields: [],
    envTemplate: null,
    rootSectionId: null,
    rootPath: [],
    sections: [],
    cases: [],
    warnings: [],
    mapped: new Set<ImportTarget>(['code', 'title']),
    createStatus: 'ready',
    enforceReview: false,
    ...overrides,
  };
}

describe('updateFor', () => {
  const existing = caseRow({
    title: 'Old',
    remark: 'keep',
    custom: { level: 'Z', owner: 'Bob' } as never,
  });
  const update = (p: Partial<ParsedCase>): PlannedCase => ({
    parsed: parsedCase(p),
    action: 'update',
    code: 'P-1',
    existing,
  });

  it('changes only mapped columns that differ', () => {
    expect(updateFor(plan(), update({ title: 'New', remark: 'other' }), undefined)).toEqual({
      title: 'New',
    });
    expect(updateFor(plan(), update({ title: 'Old' }), undefined)).toEqual({});
    expect(updateFor(plan(), update({}), 5)).toEqual({ sectionId: 5, title: 'Power on' });
  });

  it('never replaces a real title by the code used as fallback title', () => {
    expect(updateFor(plan(), update({ title: 'P-1' }), undefined)).toEqual({});
  });

  it('writes mapped custom columns and keeps other (legacy) values', () => {
    const p = plan({
      parsed: { ...plan().parsed, customColumns: [{ key: 'owner', label: 'Owner', col: 3 }] },
    });
    expect(updateFor(p, update({ title: 'Old', custom: { owner: 'Ann' } }), undefined)).toEqual({
      custom: { level: 'Z', owner: 'Ann' },
    });
    expect(updateFor(p, update({ title: 'Old', custom: {} }), undefined)).toEqual({
      custom: { level: 'Z' },
    });
  });
});

describe('applyImport', () => {
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  const ctx: ImportContext = {
    projectId: 10,
    role: 'lead',
    userId: 1,
    fileName: 'cases.csv',
    wb: {} as SourceWorkbook,
    body: {} as ImportContext['body'],
  };

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    mock.db.import.create.mockResolvedValue({ id: 77 } as never);
    mock.db.testCase.createManyAndReturn.mockResolvedValue([caseRow({ id: 200 })]);
  });

  it('creates the new suite, its sections and cases, the record and activity', async () => {
    mock.db.suite.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } } as never);
    mock.db.suite.create.mockResolvedValue(suiteRow({ id: 9, name: 'Adapter' }));
    mock.db.section.aggregate.mockResolvedValue({ _max: { sortOrder: null } } as never);
    mock.db.section.create
      .mockResolvedValueOnce({ id: 31 } as never)
      .mockResolvedValueOnce({ id: 32 } as never);
    mock.db.suite.update.mockResolvedValue({ nextSeq: 3 } as never);
    groupByMock(mock).mockResolvedValue([] as never);
    const cases: PlannedCase[] = [
      {
        parsed: parsedCase({ sectionPath: ['Pairing', 'Wi-Fi'] }),
        action: 'create',
        code: 'P-1',
        existing: null,
      },
      {
        parsed: parsedCase({ row: 3, code: null, title: 'Loose', remark: 'R  \r\n' }),
        action: 'create',
        code: null,
        existing: null,
      },
    ];
    const result = await applyImport(
      mock.db,
      activity as unknown as ActivityService,
      ctx,
      plan({
        suite: null,
        newSuite: { name: 'Adapter', prefix: 'ADP' },
        envTemplate: ['FW'],
        sections: [
          {
            key: pathKey(['Pairing']),
            name: 'Pairing',
            code: 'G1',
            parentKey: null,
            existingId: null,
          },
          {
            key: pathKey(['Pairing', 'Wi-Fi']),
            name: 'Wi-Fi',
            code: null,
            parentKey: pathKey(['Pairing']),
            existingId: null,
          },
        ],
        cases,
      }),
    );
    expect(result).toEqual({
      importId: 77,
      suiteId: 9,
      created: 2,
      updated: 0,
      skipped: 0,
      sectionsCreated: 2,
      fieldsCreated: 0,
      warnings: [],
    });
    expect(mock.db.suite.create.mock.calls[0]![0].data).toMatchObject({
      prefix: 'ADP',
      envTemplate: ['FW'],
      sortOrder: 3,
    });
    expect(mock.db.section.create.mock.calls.map((c) => c[0].data)).toEqual([
      { suiteId: 9, parentId: null, name: 'Pairing', code: 'G1', sortOrder: 1 },
      { suiteId: 9, parentId: 31, name: 'Wi-Fi', code: null, sortOrder: 1 },
    ]);
    const data = mock.db.testCase.createManyAndReturn.mock.calls[0]![0]!.data as Record<
      string,
      unknown
    >[];
    expect(data.map((d) => [d.seq, d.sectionId, d.sortOrder, d.status, d.remark])).toEqual([
      [1, 32, 1, 'ready', null],
      [2, null, 1, 'ready', 'R'],
    ]);
    expect(data[0]!.source).toEqual({ fileName: 'cases.csv', sheet: 'Cases', row: 2 });
    expect(mock.db.testCaseVersion.createMany).toHaveBeenCalled();
    expect(mock.db.import.create.mock.calls[0]![0].data).toMatchObject({
      kind: 'cases',
      suiteId: 9,
      layout: 'generic',
      stats: { cases: 2, created: 2, updated: 0, skipped: 0, sectionsCreated: 2, fieldsCreated: 0 },
    });
    expect(activity.log.mock.calls.map((c) => [c[1].action, c[1].summary])).toEqual([
      ['created', 'Created suite Adapter from import cases.csv'],
      ['imported', 'Imported cases.csv (Cases) into Adapter: 2 created, 0 updated, 0 skipped'],
    ]);
  });

  it('updates changed cases only and sends reviewed content back to draft', async () => {
    const ready = caseRow({ id: 100, status: 'ready', title: 'Old' });
    const same = caseRow({ id: 101, title: 'Power on' });
    mock.db.testCase.update.mockResolvedValue(caseRow({ id: 100, version: 2 }));
    const result = await applyImport(
      mock.db,
      activity as unknown as ActivityService,
      ctx,
      plan({
        enforceReview: true,
        cases: [
          { parsed: parsedCase(), action: 'update', code: 'P-1', existing: ready },
          { parsed: parsedCase({ code: 'P-2' }), action: 'update', code: 'P-2', existing: same },
          { parsed: parsedCase({ code: 'P-3' }), action: 'skip', code: 'P-3', existing: same },
        ],
      }),
    );
    expect(result).toMatchObject({ created: 0, updated: 2, skipped: 1 });
    expect(mock.db.suite.update).not.toHaveBeenCalled();
    expect(mock.db.testCase.update).toHaveBeenCalledTimes(1);
    expect(mock.db.testCase.update.mock.calls[0]![0]).toEqual({
      where: { id: 100 },
      data: { title: 'Power on', status: 'draft', version: { increment: 1 }, updatedById: 1 },
    });
  });

  it('stores new custom fields of an existing suite', async () => {
    mock.db.suite.update.mockResolvedValue(suiteRow());
    const newField: FieldDef = { key: 'x', label: 'X', type: 'text', showInTable: false };
    await applyImport(
      mock.db,
      activity as unknown as ActivityService,
      ctx,
      plan({ newFields: [newField], fieldDefs: [...defs, newField] }),
    );
    expect(mock.db.suite.update.mock.calls[0]![0]).toEqual({
      where: { id: 2 },
      data: { fieldDefs: [...defs, newField] },
    });
  });
});
