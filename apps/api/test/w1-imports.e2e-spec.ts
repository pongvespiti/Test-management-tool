/**
 * W1 — import API (port of the old w1-imports.test.ts): upload / analyze / preview / commit / list
 * on the synthetic team layouts, options (existing codes, parent section, new suite, env template),
 * review rule, v1.1 targets and the library export round trip.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mappingFromAnalysis } from '@tmt/excel';
import type {
  ActivityDTO,
  ImportAnalysisDTO,
  ImportPreviewDTO,
  ImportRecordDTO,
  ImportResultDTO,
  ImportSheetInfo,
  Paged,
  SectionNode,
  SectionTreeDTO,
  SuiteDTO,
  TestCaseDTO,
} from '@tmt/shared';
import { ImportUploadStore } from '../src/modules/imports/import-uploads.service.js';
import {
  adapterWorkbook,
  modbusWorkbook,
  testRailCsv,
  unitOperationWorkbook,
} from './fixtures/workbooks.js';
import {
  createExtraTestApp,
  createProject,
  createTestApp,
  createUser,
  download,
  errorCode,
  expectStatus,
  login,
  uploadAs,
  type Client,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let lead: Client;
let tester: Client;
let tester2: Client;
let viewer: Client;
let projectId: number;
let P: string;
let otherSuiteId: number;
let unitXlsx: Buffer;
let uploadDir: string;

interface Upload {
  uploadId: string;
  fileName: string;
  sheets: ImportSheetInfo[];
}

beforeAll(async () => {
  t = await createTestApp();
  const leadId = (await createUser(t.prisma, 'lead')).id;
  const testerId = (await createUser(t.prisma, 'tester')).id;
  const tester2Id = (await createUser(t.prisma, 'tester2')).id;
  const viewerId = (await createUser(t.prisma, 'viewer')).id;
  projectId = (
    await createProject(t.prisma, 'WIMP', [
      { userId: leadId, role: 'lead' },
      { userId: testerId, role: 'tester' },
      { userId: tester2Id, role: 'tester' },
      { userId: viewerId, role: 'viewer' },
    ])
  ).id;
  const other = await createProject(t.prisma, 'WIMX', [{ userId: leadId, role: 'lead' }]);
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  tester2 = await login(t, 'tester2');
  viewer = await login(t, 'viewer');
  otherSuiteId = (
    await expectStatus<SuiteDTO>(
      lead.post(`/projects/${other.id}/suites`, { name: 'Elsewhere', prefix: 'EL' }),
      201,
    )
  ).id;
  unitXlsx = await unitOperationWorkbook();
  uploadDir = path.join(t.config.dataDir, 'tmp', 'imports');
});
afterAll(() => t.close());

function newSuite(prefix: string, extra: Record<string, unknown> = {}): Promise<SuiteDTO> {
  return expectStatus<SuiteDTO>(
    lead.post(`${P}/suites`, { name: `${prefix} suite`, prefix, ...extra }),
    201,
  );
}
function upload(client: Client, name: string, content: Buffer | string): Promise<Upload> {
  return expectStatus<Upload>(
    uploadAs(t, client, `${P}/imports/upload`, { file: { name, content } }),
    200,
  );
}
function analyze(client: Client, body: Record<string, unknown>): Promise<ImportAnalysisDTO> {
  return expectStatus<ImportAnalysisDTO>(client.post(`${P}/imports/analyze`, body), 200);
}
function runBody(a: ImportAnalysisDTO, extra: Record<string, unknown>) {
  return {
    uploadId: a.uploadId,
    sheet: a.sheet,
    headerRow: a.headerRow,
    columns: mappingFromAnalysis(a.columns),
    ...extra,
  };
}
async function suiteCases(suiteId: number, query = ''): Promise<TestCaseDTO[]> {
  return (
    await expectStatus<Paged<TestCaseDTO>>(
      viewer.get(`${P}/suites/${suiteId}/cases?pageSize=500${query}`),
      200,
    )
  ).items;
}

describe('upload', () => {
  it('stores the file temporarily and lists its sheets', async () => {
    const u = await upload(tester, 'Unit operation.xlsx', unitXlsx);
    expect(u.uploadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(u.fileName).toBe('Unit operation.xlsx');
    expect(u.sheets.map((s) => [s.name, s.state])).toEqual([
      ['Summary_Unit operation', 'visible'],
      ['MODE A (Router)', 'hidden'],
      ['MODE B (AP)', 'visible'],
      ['MODE C (Online)', 'visible'],
      ['refer', 'visible'],
    ]);
    expect(await fsp.readdir(uploadDir)).toEqual(
      expect.arrayContaining([`${u.uploadId}.upload`, `${u.uploadId}.json`]),
    );
  });

  it('rejects other file types, broken files, missing files and viewers', async () => {
    const url = `${P}/imports/upload`;
    const xls = await uploadAs(t, tester, url, { file: { name: 'old.xls', content: 'x' } });
    expect(xls.status).toBe(415);
    expect(errorCode(xls)).toBe('UNSUPPORTED_FILE_TYPE');
    expect(xls.body.error.message).toContain('.xlsx');
    expect(
      errorCode(await uploadAs(t, tester, url, { file: { name: 'a.pdf', content: '%PDF' } })),
    ).toBe('UNSUPPORTED_FILE_TYPE');
    const broken = await uploadAs(t, tester, url, {
      file: { name: 'broken.xlsx', content: 'not a zip' },
    });
    expect(broken.status).toBe(422);
    expect(errorCode(broken)).toBe('CORRUPT_FILE');
    expect(errorCode(await uploadAs(t, tester, url, { fields: { note: 'x' } }))).toBe(
      'FILE_REQUIRED',
    );
    expect(
      errorCode(await uploadAs(t, tester, url, { file: { name: 'empty.csv', content: '' } })),
    ).toBe('EMPTY_FILE');
    expect(errorCode(await tester.post(url, {}))).toBe('MULTIPART_REQUIRED');
    expect(
      (await uploadAs(t, viewer, url, { file: { name: 'a.csv', content: 'Title\nx' } })).status,
    ).toBe(403);
  });

  it('enforces MAX_UPLOAD_MB', async () => {
    const small = await createExtraTestApp({ maxUploadBytes: 2048 });
    try {
      const client = await login(small, 'tester');
      const res = await uploadAs(small, client, `${P}/imports/upload`, {
        file: { name: 'big.csv', content: `Title\n${'x'.repeat(5000)}\n` },
      });
      expect(res.status).toBe(413);
      expect(errorCode(res)).toBe('FILE_TOO_LARGE');
    } finally {
      await small.close();
    }
  });

  it('expires uploads after 2 hours and keeps them private to the uploader', async () => {
    const u = await upload(tester, 'cases.csv', 'Title,Steps\nA,1\n');
    expect(errorCode(await tester2.post(`${P}/imports/analyze`, { uploadId: u.uploadId }))).toBe(
      'UPLOAD_NOT_FOUND',
    );
    const metaFile = path.join(uploadDir, `${u.uploadId}.json`);
    const meta = JSON.parse(await fsp.readFile(metaFile, 'utf8'));
    meta.createdAt = new Date(Date.now() - 3 * 3600_000).toISOString();
    await fsp.writeFile(metaFile, JSON.stringify(meta));
    const res = await tester.post(`${P}/imports/analyze`, { uploadId: u.uploadId });
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe('UPLOAD_NOT_FOUND');
    expect((await fsp.readdir(uploadDir)).some((f) => f.startsWith(u.uploadId))).toBe(false);
    const stale = await upload(tester, 'stale.csv', 'Title\nB\n');
    const store = t.app.get(ImportUploadStore);
    expect(await store.cleanup(Date.now() + 3 * 3600_000)).toBeGreaterThanOrEqual(1);
    expect((await fsp.readdir(uploadDir)).some((f) => f.startsWith(stale.uploadId))).toBe(false);
  });
});

describe('analyze, preview and commit (unit operation layout)', () => {
  let suite: SuiteDTO;
  let a: ImportAnalysisDTO;

  beforeAll(async () => {
    suite = await newSuite('UOP');
    const u = await upload(tester, 'Unit operation.xlsx', unitXlsx);
    a = await analyze(tester, { uploadId: u.uploadId, suiteId: suite.id });
  });

  it('analyses the most likely sheet', async () => {
    expect(a).toMatchObject({
      fileName: 'Unit operation.xlsx',
      sheet: 'MODE C (Online)',
      headerRow: 30,
      layout: 'unit_operation',
      dataRowCount: 10,
    });
    expect(a.sheets).toHaveLength(5);
    expect(a.envBlock!.labels).toHaveLength(19);
    const hidden = await analyze(tester, { uploadId: a.uploadId, sheet: 'MODE A (Router)' });
    expect(hidden.sheet).toBe('MODE A (Router)');
    const missing = await tester.post(`${P}/imports/analyze`, {
      uploadId: a.uploadId,
      sheet: 'Nope',
    });
    expect(missing.status).toBe(422);
    expect(errorCode(missing)).toBe('SHEET_NOT_FOUND');
    expect(
      errorCode(
        await tester.post(`${P}/imports/analyze`, { uploadId: a.uploadId, suiteId: otherSuiteId }),
      ),
    ).toBe('BAD_SUITE');
    expect((await tester.post(`${P}/imports/analyze`, { uploadId: 'nope' })).status).toBe(400);
  });

  it('previews without writing anything', async () => {
    const preview = await expectStatus<ImportPreviewDTO>(
      tester.post(`${P}/imports/preview`, runBody(a, { suiteId: suite.id })),
      200,
    );
    expect(preview.counts).toEqual({
      cases: 10,
      create: 10,
      update: 0,
      skip: 0,
      sections: 5,
      newSections: 5,
      newFields: 0,
    });
    expect(preview.sample[0]).toMatchObject({
      row: 31,
      sectionPath: ['Login'],
      code: '1',
      title: 'Login with account',
      caseType: 'Normal',
      priority: 'medium',
      tags: [],
      estimateMinutes: null,
      references: null,
      action: 'create',
    });
    expect(preview.warnings.map((w) => w.kind)).toEqual(
      expect.arrayContaining(['type_defaulted', 'section_filled_down']),
    );
    expect(await suiteCases(suite.id)).toEqual([]);
    expect(
      (await viewer.post(`${P}/imports/preview`, runBody(a, { suiteId: suite.id }))).status,
    ).toBe(403);
  });

  it('commits sections, cases, the environment template and an import record', async () => {
    const result = await expectStatus<ImportResultDTO>(
      tester.post(`${P}/imports/commit`, runBody(a, { suiteId: suite.id })),
      200,
    );
    expect(result).toMatchObject({
      suiteId: suite.id,
      created: 10,
      updated: 0,
      skipped: 0,
      sectionsCreated: 5,
      fieldsCreated: 0,
    });
    const cases = await suiteCases(suite.id);
    expect(cases.map((c) => c.code)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(cases[0]).toMatchObject({
      title: 'Login with account',
      sectionPath: ['Login'],
      status: 'ready',
      precondition: 'Not logged in',
      procedure: '1. Open app\n2. Log in',
      source: { fileName: 'Unit operation.xlsx', sheet: 'MODE C (Online)', row: 31 },
    });
    expect(cases.map((c) => c.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const tree = await expectStatus<SectionTreeDTO>(
      viewer.get(`${P}/suites/${suite.id}/sections`),
      200,
    );
    expect(tree.sections.map((s) => [s.name, s.caseCount])).toEqual([
      ['Login', 1],
      ['Unit control of Cool mode', 3],
      ['Display unit', 2],
      ['Unnamed section (row 37)', 3],
      ['Child lock', 1],
    ]);
    const after = await expectStatus<SuiteDTO>(viewer.get(`${P}/suites/${suite.id}`), 200);
    expect(after.envTemplate).toHaveLength(19);
    expect(after.envTemplate.slice(0, 2)).toEqual(['Platform', 'Brand']);

    const records = await expectStatus<ImportRecordDTO[]>(viewer.get(`${P}/imports`), 200);
    expect(records[0]).toMatchObject({
      id: result.importId,
      kind: 'cases',
      suite: { id: suite.id, name: suite.name },
      run: null,
      fileName: 'Unit operation.xlsx',
      sheet: 'MODE C (Online)',
      layout: 'unit_operation',
      stats: { cases: 10, created: 10, updated: 0, skipped: 0, sectionsCreated: 5 },
      createdBy: { username: 'tester' },
    });
    const activity = await expectStatus<ActivityDTO[]>(
      viewer.get(`${P}/activity?entityType=suite&entityId=${suite.id}`),
      200,
    );
    expect(activity[0]!.action).toBe('imported');
  });

  it('updates, skips or renumbers existing codes on re-import', async () => {
    const all = await suiteCases(suite.id);
    const first = all[0]!;
    await expectStatus(
      lead.patch(`${P}/cases/${first.id}`, {
        title: 'Edited in TMT',
        remark: 'keep me',
        tags: ['Manual'],
      }),
      200,
    );
    // Only title/procedure/code mapped: unmapped fields (remark, tags) are kept.
    const titleOnly = a.columns
      .filter((c) => ['code', 'title', 'procedure', 'section'].includes(c.suggested.target))
      .map((c) => ({ col: c.col, target: c.suggested.target }));
    const skip = await expectStatus<ImportResultDTO>(
      tester.post(`${P}/imports/commit`, {
        ...runBody(a, { suiteId: suite.id }),
        columns: titleOnly,
        options: { onExisting: 'skip' },
      }),
      200,
    );
    expect(skip).toMatchObject({ created: 0, updated: 0, skipped: 10, sectionsCreated: 0 });
    const preview = await expectStatus<ImportPreviewDTO>(
      tester.post(`${P}/imports/preview`, {
        ...runBody(a, { suiteId: suite.id }),
        columns: titleOnly,
      }),
      200,
    );
    expect(preview.counts).toMatchObject({ create: 0, update: 10, newSections: 0 });
    expect(preview.warnings.find((w) => w.kind === 'existing_code')).toMatchObject({ count: 10 });
    const upd = await expectStatus<ImportResultDTO>(
      tester.post(`${P}/imports/commit`, {
        ...runBody(a, { suiteId: suite.id }),
        columns: titleOnly,
      }),
      200,
    );
    expect(upd).toMatchObject({ created: 0, updated: 10 });
    const back = await expectStatus<TestCaseDTO>(viewer.get(`${P}/cases/${first.id}`), 200);
    expect(back).toMatchObject({
      title: 'Login with account',
      remark: 'keep me',
      tags: ['Manual'],
      version: first.version + 2,
    });
    // Unchanged rows do not get a new version.
    expect((await suiteCases(suite.id))[1]!.version).toBe(all[1]!.version);

    const renum = await expectStatus<ImportResultDTO>(
      tester.post(`${P}/imports/commit`, {
        ...runBody(a, { suiteId: suite.id }),
        columns: titleOnly,
        options: { onExisting: 'create_new', saveEnvTemplate: false },
      }),
      200,
    );
    expect(renum.created).toBe(10);
    const codes = (await suiteCases(suite.id)).map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['1', '1-2', '10', '10-2']));
  });

  it('puts the imported cases under a chosen section', async () => {
    const parent = await expectStatus<SectionNode>(
      tester.post(`${P}/suites/${suite.id}/sections`, { name: 'Imported 2026' }),
      201,
    );
    const csv = await upload(tester, 'extra.csv', 'Section,Title\nWi-Fi,Connect\n,Disconnect\n');
    const ca = await analyze(tester, { uploadId: csv.uploadId, suiteId: suite.id });
    const bad = await tester.post(
      `${P}/imports/commit`,
      runBody(ca, { suiteId: suite.id, options: { parentSectionId: 999999 } }),
    );
    expect(errorCode(bad)).toBe('BAD_SECTION');
    const res = await expectStatus<ImportResultDTO>(
      tester.post(
        `${P}/imports/commit`,
        runBody(ca, { suiteId: suite.id, options: { parentSectionId: parent.id } }),
      ),
      200,
    );
    expect(res).toMatchObject({ created: 2, sectionsCreated: 1 });
    const cases = await suiteCases(suite.id, `&sectionId=${parent.id}`);
    expect(cases.map((c) => [c.title, c.sectionPath.join(' / ')])).toEqual([
      ['Connect', 'Imported 2026 / Wi-Fi'],
      ['Disconnect', 'Imported 2026 / Wi-Fi'],
    ]);
  });
});

describe('custom fields, new suites and the review rule', () => {
  it('appends new custom fields (modbus) and maps existing ones', async () => {
    const suite = await newSuite('MBS', {
      fieldDefs: [{ key: 'register', label: 'Register', type: 'text' }],
    });
    const u = await upload(tester, 'Modbus.xlsx', await modbusWorkbook());
    const a = await analyze(tester, { uploadId: u.uploadId, suiteId: suite.id });
    expect(a.columns.find((c) => c.header === 'Register')!.suggested).toEqual({
      target: 'custom',
      customKey: 'register',
    });
    const res = await expectStatus<ImportResultDTO>(
      tester.post(`${P}/imports/commit`, runBody(a, { suiteId: suite.id })),
      200,
    );
    expect(res).toMatchObject({ created: 10, fieldsCreated: 2 });
    const after = await expectStatus<SuiteDTO>(viewer.get(`${P}/suites/${suite.id}`), 200);
    expect(after.fieldDefs.map((f) => f.key)).toEqual([
      'register',
      'modbus_test_method',
      'expected_result_of_device',
    ]);
    const cases = await suiteCases(suite.id);
    expect(cases[0]!.custom).toEqual({
      register: '2001',
      modbus_test_method: 'set -> get',
      expected_result_of_device: 'Device responds',
    });
    const unknown = await tester.post(`${P}/imports/preview`, {
      ...runBody(a, { suiteId: suite.id }),
      columns: [
        { col: 3, target: 'title' },
        { col: 4, target: 'custom', customKey: 'nope' },
      ],
    });
    expect(errorCode(unknown)).toBe('UNKNOWN_FIELD');
  });

  it('updates mapped custom fields without re-validating unrelated legacy values', async () => {
    const suite = await newSuite('LEG', {
      fieldDefs: [
        { key: 'level', label: 'Level', type: 'select', options: ['A', 'B'] },
        { key: 'owner', label: 'Owner', type: 'text' },
      ],
    });
    const c = await expectStatus<TestCaseDTO>(
      tester.post(`${P}/suites/${suite.id}/cases`, {
        title: 'Legacy',
        code: 'LG-1',
        custom: { level: 'A' },
      }),
      201,
    );
    // An option removed later: the stored value is no longer valid.
    await t.prisma.db.testCase.update({ where: { id: c.id }, data: { custom: { level: 'Z' } } });
    const u = await upload(tester, 'owners.csv', 'Case code,Title,Owner\nLG-1,Legacy,Somchai\n');
    const a = await analyze(tester, { uploadId: u.uploadId, suiteId: suite.id });
    const res = await expectStatus<ImportResultDTO>(
      tester.post(`${P}/imports/commit`, {
        ...runBody(a, { suiteId: suite.id }),
        columns: [
          { col: 1, target: 'code' },
          { col: 2, target: 'title' },
          { col: 3, target: 'custom', customKey: 'owner' },
        ],
      }),
      200,
    );
    expect(res).toMatchObject({ created: 0, updated: 1 });
    const after = await expectStatus<TestCaseDTO>(viewer.get(`${P}/cases/${c.id}`), 200);
    expect(after.custom).toEqual({ level: 'Z', owner: 'Somchai' });
    // A mapped select value outside the options is refused up front.
    const bad = await upload(tester, 'levels.csv', 'Case code,Title,Level\nLG-2,New,C\n');
    const ba = await analyze(tester, { uploadId: bad.uploadId, suiteId: suite.id });
    const refused = await tester.post(`${P}/imports/preview`, {
      ...runBody(ba, { suiteId: suite.id }),
      columns: [
        { col: 1, target: 'code' },
        { col: 2, target: 'title' },
        { col: 3, target: 'custom', customKey: 'level' },
      ],
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({
      error: { code: 'INVALID_OPTION', details: { row: 2, field: 'level', value: 'C' } },
    });
  });

  it('creates a new suite (lead only) and rejects a taken prefix', async () => {
    const u = await upload(lead, 'Adapter.xlsx', await adapterWorkbook());
    const a = await analyze(lead, { uploadId: u.uploadId });
    const testerTry = await upload(tester, 'Adapter.xlsx', await adapterWorkbook());
    const ta = await analyze(tester, { uploadId: testerTry.uploadId });
    const denied = await tester.post(
      `${P}/imports/commit`,
      runBody(ta, { newSuite: { name: 'Adapter', prefix: 'ADP' } }),
    );
    expect(denied.status).toBe(403);
    const res = await expectStatus<ImportResultDTO>(
      lead.post(
        `${P}/imports/commit`,
        runBody(a, { newSuite: { name: 'Adapter', prefix: 'adp' } }),
      ),
      200,
    );
    expect(res).toMatchObject({ created: 8, sectionsCreated: 5 });
    const suite = await expectStatus<SuiteDTO>(viewer.get(`${P}/suites/${res.suiteId}`), 200);
    expect(suite).toMatchObject({ name: 'Adapter', prefix: 'ADP', caseCount: 8 });
    expect(suite.envTemplate).toHaveLength(13);
    const tree = await expectStatus<SectionTreeDTO>(
      viewer.get(`${P}/suites/${res.suiteId}/sections`),
      200,
    );
    expect(tree.sections[0]!.children.map((s) => [s.name, s.code])).toEqual([
      ['Connection & operation', 'GRP_01_001'],
      ['Pairing method', 'GRP_01_002'],
    ]);
    const taken = await lead.post(
      `${P}/imports/commit`,
      runBody(a, { newSuite: { name: 'Again', prefix: 'ADP' } }),
    );
    expect(taken.status).toBe(409);
    expect(errorCode(taken)).toBe('SUITE_PREFIX_TAKEN');
    expect(
      errorCode(
        await lead.post(`${P}/imports/commit`, { ...runBody(a, {}), suiteId: otherSuiteId }),
      ),
    ).toBe('BAD_SUITE');
  });

  it('stores imported cases as draft when review is required and the importer is not a lead', async () => {
    await t.prisma.db.project.update({
      where: { id: projectId },
      data: { requireCaseReview: true },
    });
    try {
      const suite = await newSuite('RVW');
      const tu = await upload(tester, 'review.csv', 'Title,Priority\nNeeds review,High\n');
      const ta = await analyze(tester, { uploadId: tu.uploadId, suiteId: suite.id });
      await expectStatus(
        tester.post(`${P}/imports/commit`, runBody(ta, { suiteId: suite.id })),
        200,
      );
      const lu = await upload(lead, 'review.csv', 'Title\nBy the lead\n');
      const la = await analyze(lead, { uploadId: lu.uploadId, suiteId: suite.id });
      await expectStatus(lead.post(`${P}/imports/commit`, runBody(la, { suiteId: suite.id })), 200);
      expect((await suiteCases(suite.id)).map((c) => [c.title, c.status])).toEqual([
        ['Needs review', 'draft'],
        ['By the lead', 'ready'],
      ]);
    } finally {
      await t.prisma.db.project.update({
        where: { id: projectId },
        data: { requireCaseReview: false },
      });
    }
  });
});

describe('v1.1 targets and the library round trip', () => {
  it('imports priority, tags, estimate and references (TestRail-like CSV)', async () => {
    const suite = await newSuite('TRL');
    const u = await upload(tester, 'testrail.csv', testRailCsv());
    const a = await analyze(tester, { uploadId: u.uploadId, suiteId: suite.id });
    await expectStatus(tester.post(`${P}/imports/commit`, runBody(a, { suiteId: suite.id })), 200);
    const cases = await suiteCases(suite.id);
    expect(cases.map((c) => [c.code, c.priority, c.references, c.custom])).toEqual([
      ['C101', 'high', 'REQ-1', { type: 'Functional' }],
      ['C102', 'medium', null, { type: 'Functional' }],
      ['C103', 'low', 'REQ-2', { type: 'Regression' }],
    ]);
    const csv = [
      'Title,Prio,Labels,Est.,Requirement',
      'One,P1,"smoke, ui",1h 30m,REQ-9',
      'Two,whenever,,1:15,',
    ].join('\n');
    const u2 = await upload(tester, 'v11.csv', csv);
    const a2 = await analyze(tester, { uploadId: u2.uploadId, suiteId: suite.id });
    const preview = await expectStatus<ImportPreviewDTO>(
      tester.post(`${P}/imports/preview`, runBody(a2, { suiteId: suite.id })),
      200,
    );
    expect(
      preview.sample.map((s) => [s.priority, s.tags, s.estimateMinutes, s.references]),
    ).toEqual([
      ['critical', ['smoke', 'ui'], 90, 'REQ-9'],
      ['medium', [], 75, null],
    ]);
    expect(preview.warnings.map((w) => w.message)).toContain(
      'Unknown priority “whenever” — set to Medium',
    );
    await expectStatus(tester.post(`${P}/imports/commit`, runBody(a2, { suiteId: suite.id })), 200);
    const one = (await suiteCases(suite.id)).find((c) => c.title === 'One')!;
    expect(one).toMatchObject({
      priority: 'critical',
      tags: ['smoke', 'ui'],
      estimateMinutes: 90,
      references: 'REQ-9',
    });
  });

  it('round-trips the library export through the import', async () => {
    const src = await newSuite('SRC', {
      fieldDefs: [{ key: 'register', label: 'Register', type: 'text' }],
    });
    const sec = await expectStatus<SectionNode>(
      tester.post(`${P}/suites/${src.id}/sections`, { name: 'Power' }),
      201,
    );
    const sub = await expectStatus<SectionNode>(
      tester.post(`${P}/suites/${src.id}/sections`, { name: 'On/Off', parentId: sec.id }),
      201,
    );
    const shared = await expectStatus<{ id: number }>(
      tester.post(`${P}/shared-steps`, { name: 'Wake app', steps: [{ action: 'Open' }] }),
      201,
    );
    const make = (body: Record<string, unknown>) =>
      expectStatus(tester.post(`${P}/suites/${src.id}/cases`, body), 201);
    await make({
      title: 'Power on',
      code: 'PW-1',
      sectionId: sub.id,
      caseType: 'Abnormal',
      priority: 'critical',
      tags: ['Smoke', 'Nightly'],
      estimateMinutes: 90,
      references: 'REQ-1, ACS-7',
      precondition: 'Unit OFF',
      procedure: 'Tap power',
      expected: 'Unit ON',
      remark: 'Check LED',
      summaryGroup: 'Power',
      custom: { register: '2001' },
    });
    await make({
      title: 'Stepwise',
      code: 'PW-2',
      sectionId: sec.id,
      template: 'steps',
      steps: [
        { kind: 'shared', sharedStepId: shared.id },
        { kind: 'step', action: 'Tap power', expected: 'Unit ON' },
      ],
    });
    const exported = await download(viewer, `${P}/suites/${src.id}/export.xlsx`);
    expect(exported.status).toBe(200);
    const u = await upload(tester, 'library.xlsx', exported.body as Buffer);
    const a = await analyze(tester, { uploadId: u.uploadId });
    expect(Object.fromEntries(a.columns.map((c) => [c.header, c.suggested.target]))).toMatchObject({
      Section: 'section',
      'Case code': 'code',
      Title: 'title',
      Type: 'type',
      Status: 'ignore',
      Precondition: 'precondition',
      Procedure: 'procedure',
      'Expected result': 'expected',
      Remark: 'remark',
      'Summary group': 'summary_group',
      Priority: 'priority',
      Tags: 'tags',
      'Estimate (min)': 'estimate',
      References: 'references',
      Register: 'new_custom',
    });
    // The upload belongs to the tester who uploaded it.
    const foreign = await lead.post(
      `${P}/imports/commit`,
      runBody(a, { newSuite: { name: 'Copy', prefix: 'CPY' } }),
    );
    expect(foreign.status).toBe(404);
    expect(errorCode(foreign)).toBe('UPLOAD_NOT_FOUND');
    const target = await newSuite('DST');
    const done = await expectStatus<ImportResultDTO>(
      tester.post(`${P}/imports/commit`, runBody(a, { suiteId: target.id })),
      200,
    );
    expect(done).toMatchObject({ created: 2, fieldsCreated: 1 });
    const imported = await suiteCases(target.id);
    expect(imported.find((c) => c.code === 'PW-1')).toMatchObject({
      code: 'PW-1',
      title: 'Power on',
      sectionPath: ['Power', 'On/Off'],
      caseType: 'Abnormal',
      priority: 'critical',
      tags: ['Smoke', 'Nightly'],
      estimateMinutes: 90,
      references: 'REQ-1, ACS-7',
      precondition: 'Unit OFF',
      procedure: 'Tap power',
      expected: 'Unit ON',
      remark: 'Check LED',
      summaryGroup: 'Power',
      custom: { register: '2001' },
    });
    expect(imported.find((c) => c.code === 'PW-2')).toMatchObject({
      code: 'PW-2',
      sectionPath: ['Power'],
      template: 'text',
      procedure: '1. Open\n2. Tap power',
      expected: '2. Unit ON',
    });
  });
});
