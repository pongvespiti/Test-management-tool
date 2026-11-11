import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { readUpload, type SourceWorkbook } from '@tmt/excel';
import type { ImportRunInput } from '@tmt/shared';
import { caseRow, projectRow, sectionRow, suiteRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import { buildSectionTree } from '../library/section-tree.js';
import {
  pathKey,
  planImport,
  planSections,
  previewOf,
  renumber,
  type ImportContext,
} from './import-plan.js';

const CSV =
  'Section,Case code,Title,Owner,Level\nPower,P-1,Power on,Ann,A\nPower,P-2,Power off,,\n';
const COLUMNS: ImportRunInput['columns'] = [
  { col: 1, target: 'section' },
  { col: 2, target: 'code' },
  { col: 3, target: 'title' },
  { col: 4, target: 'custom', customKey: 'owner' },
];

describe('planning helpers', () => {
  it('renumbers codes past the taken ones and keeps them within 100 characters', () => {
    expect(renumber('A', new Set(['a', 'a-2']))).toBe('A-3');
    expect(renumber('x'.repeat(100), new Set())).toHaveLength(100);
  });

  it('reuses existing sections by name under the same parent and plans the others', () => {
    const tree = buildSectionTree([sectionRow({ id: 1, name: 'Power' })]);
    const planned = planSections(tree, null, {
      sectionPaths: [
        { path: ['power'], codes: [null] },
        { path: ['power', 'On'], codes: [null, 'P-ON'] },
        { path: ['Mode'], codes: ['M'] },
      ],
    });
    expect(planned.map((s) => [s.name, s.code, s.existingId, s.parentKey])).toEqual([
      ['power', null, 1, null],
      ['On', 'P-ON', null, pathKey(['power'])],
      ['Mode', 'M', null, null],
    ]);
    // Without a suite (new suite) every section is new.
    expect(
      planSections(null, null, { sectionPaths: [{ path: ['A'], codes: [] }] })[0],
    ).toMatchObject({ existingId: null, code: null });
  });
});

describe('planImport', () => {
  let wb: SourceWorkbook;
  let sheet: string;
  let mock: PrismaMock;

  beforeAll(async () => {
    wb = await readUpload(Buffer.from(CSV), 'cases.csv');
    sheet = wb.sheetNames[0]!;
  });
  beforeEach(() => {
    mock = createPrismaMock();
    mock.db.suite.findFirst.mockResolvedValue(
      suiteRow({
        fieldDefs: [
          { key: 'owner', label: 'Owner', type: 'text', showInTable: false },
          { key: 'level', label: 'Level', type: 'select', options: ['B'], showInTable: false },
        ] as never,
      }),
    );
    mock.db.section.findMany.mockResolvedValue([sectionRow({ id: 1, name: 'Power' })]);
    mock.db.testCase.findMany.mockResolvedValue([caseRow({ id: 100, code: 'p-1' })]);
    mock.db.project.findUnique.mockResolvedValue(projectRow({ requireCaseReview: true }));
  });

  const context = (
    body: Partial<ImportRunInput> = {},
    options: Partial<ImportRunInput['options']> = {},
    role: ImportContext['role'] = 'tester',
  ): ImportContext => ({
    projectId: 10,
    role,
    userId: 1,
    fileName: 'cases.csv',
    wb,
    body: {
      uploadId: '00000000-0000-4000-8000-000000000000',
      sheet,
      headerRow: 1,
      columns: COLUMNS,
      suiteId: 2,
      ...body,
      options: {
        onDuplicateInFile: 'renumber',
        onExisting: 'update',
        saveEnvTemplate: true,
        ...options,
      },
    },
  });

  it('plans updates of existing codes, creations and existing sections', async () => {
    const plan = await planImport(mock.db, context());
    expect(plan.cases.map((c) => [c.parsed.code, c.action, c.existing?.id ?? null])).toEqual([
      ['P-1', 'update', 100],
      ['P-2', 'create', null],
    ]);
    expect(plan.sections).toEqual([
      { key: pathKey(['Power']), name: 'Power', code: null, parentKey: null, existingId: 1 },
    ]);
    expect(plan).toMatchObject({ createStatus: 'draft', enforceReview: true, envTemplate: null });
    expect(mock.db.testCase.findMany.mock.calls[0]![0]!.where).toEqual({
      suiteId: 2,
      isDeleted: false,
      code: { not: null },
    });
    expect(mock.db.$queryRaw).not.toHaveBeenCalled();
    const preview = previewOf(plan);
    expect(preview.counts).toEqual({
      cases: 2,
      create: 1,
      update: 1,
      skip: 0,
      sections: 1,
      newSections: 0,
      newFields: 0,
    });
    expect(preview.warnings.find((w) => w.kind === 'existing_code')).toEqual({
      kind: 'existing_code',
      message: 'Case code already exists in the suite — the existing case is updated',
      count: 1,
      rows: [2],
    });
    expect(preview.sample[0]).toMatchObject({ row: 2, sectionPath: ['Power'], action: 'update' });
  });

  it('locks the suite row when planning inside the commit and renumbers on create_new', async () => {
    const plan = await planImport(mock.db, context({}, { onExisting: 'create_new' }), true);
    expect(mock.db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(plan.cases.map((c) => [c.code, c.action])).toEqual([
      ['P-1-2', 'create'],
      ['P-2', 'create'],
    ]);
  });

  it('refuses unknown sheets, foreign suites, unknown fields and parent sections', async () => {
    await expect(planImport(mock.db, context({ sheet: 'Nope' }))).rejects.toMatchObject({
      code: 'SHEET_NOT_FOUND',
    });
    await expect(
      planImport(mock.db, context({ columns: [{ col: 3, target: 'custom', customKey: 'nope' }] })),
    ).rejects.toMatchObject({ code: 'UNKNOWN_FIELD' });
    await expect(planImport(mock.db, context({}, { parentSectionId: 99 }))).rejects.toMatchObject({
      code: 'BAD_SECTION',
    });
    mock.db.suite.findFirst.mockResolvedValue(null);
    await expect(planImport(mock.db, context())).rejects.toMatchObject({ code: 'BAD_SUITE' });
  });

  it('refuses select values outside the options with the row in the details', async () => {
    await expect(
      planImport(
        mock.db,
        context({ columns: [...COLUMNS, { col: 5, target: 'custom', customKey: 'level' }] }),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_OPTION',
      details: { row: 2, field: 'level', value: 'A' },
    });
  });

  it('lets only leads create a new suite with a free prefix', async () => {
    const newSuite = { name: 'New', prefix: 'NEW' };
    await expect(
      planImport(mock.db, context({ suiteId: undefined, newSuite })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    mock.db.suite.findFirst.mockResolvedValue({ id: 3 } as never);
    await expect(
      planImport(mock.db, context({ suiteId: undefined, newSuite }, {}, 'lead')),
    ).rejects.toMatchObject({ code: 'SUITE_PREFIX_TAKEN' });
    mock.db.suite.findFirst.mockResolvedValue(null);
    const plan = await planImport(
      mock.db,
      context({ suiteId: undefined, newSuite, columns: COLUMNS.slice(0, 3) }, {}, 'lead'),
    );
    expect(plan).toMatchObject({ suite: null, newSuite, createStatus: 'ready' });
    expect(plan.cases.every((c) => c.action === 'create')).toBe(true);
    expect(plan.sections[0]).toMatchObject({ name: 'Power', existingId: null });
  });
});
