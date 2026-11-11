/**
 * Library basics end-to-end (port of the old library.test.ts): suites, sections, cases (validation,
 * list order/filters/paging, versions, clone, bulk, soft delete), the Excel export and the run
 * history of a case.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ExcelJS } from '@tmt/excel';
import type {
  CaseRunHistoryItem,
  CaseVersionDTO,
  Paged,
  SectionNode,
  SectionTreeDTO,
  SuiteDTO,
  TestCaseDTO,
} from '@tmt/shared';
import {
  createProject,
  createTestApp,
  createUser,
  download,
  errorCode,
  expectStatus,
  login,
  type Client,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let lead: Client;
let tester: Client;
let viewer: Client;
let leadId: number;
let projectId: number;
let P: string;

const FIELD_DEFS = [
  {
    key: 'function_code',
    label: 'Function code',
    type: 'select',
    options: ['03', '04', '06'],
    showInTable: true,
  },
  { key: 'register', label: 'Register address', type: 'text' },
  { key: 'note', label: 'Note', type: 'longtext' },
];

beforeAll(async () => {
  t = await createTestApp();
  leadId = (await createUser(t.prisma, 'lead')).id;
  const testerUser = await createUser(t.prisma, 'tester');
  const viewerUser = await createUser(t.prisma, 'viewer');
  projectId = (
    await createProject(t.prisma, 'LIB', [
      { userId: leadId, role: 'lead' },
      { userId: testerUser.id, role: 'tester' },
      { userId: viewerUser.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');
});
afterAll(() => t.close());

function newSuite(prefix: string, extra: Record<string, unknown> = {}): Promise<SuiteDTO> {
  return expectStatus<SuiteDTO>(
    lead.post(`${P}/suites`, { name: `${prefix} suite`, prefix, ...extra }),
    201,
  );
}
function newSection(suiteId: number, name: string, parentId?: number): Promise<SectionNode> {
  return expectStatus<SectionNode>(
    tester.post(`${P}/suites/${suiteId}/sections`, { name, parentId }),
    201,
  );
}
function newCase(suiteId: number, body: Record<string, unknown>): Promise<TestCaseDTO> {
  return expectStatus<TestCaseDTO>(tester.post(`${P}/suites/${suiteId}/cases`, body), 201);
}

describe('suites', () => {
  it('creates suites (lead only) with normalised, unique prefixes', async () => {
    const s = await newSuite('mbs', {
      fieldDefs: FIELD_DEFS,
      envTemplate: ['Adapter FW', 'Baud rate'],
    });
    expect(s).toMatchObject({
      prefix: 'MBS',
      caseCount: 0,
      envTemplate: ['Adapter FW', 'Baud rate'],
    });
    expect(s.fieldDefs[1]).toMatchObject({ key: 'register', type: 'text', showInTable: false });
    const dup = await lead.post(`${P}/suites`, { name: 'Other', prefix: 'MBS' });
    expect(dup.status).toBe(409);
    expect(errorCode(dup)).toBe('SUITE_PREFIX_TAKEN');
    expect((await tester.post(`${P}/suites`, { name: 'T', prefix: 'TT' })).status).toBe(403);
    const list = await expectStatus<SuiteDTO[]>(viewer.get(`${P}/suites`), 200);
    expect(list.map((x) => x.prefix)).toContain('MBS');
  });

  it('strips removed custom fields from existing cases', async () => {
    const s = await newSuite('STRIP', { fieldDefs: FIELD_DEFS });
    const c = await newCase(s.id, {
      title: 'Read status',
      custom: { function_code: '03', register: '40001' },
    });
    expect(c.custom).toEqual({ function_code: '03', register: '40001' });
    const updated = await expectStatus<SuiteDTO>(
      lead.patch(`${P}/suites/${s.id}`, {
        fieldDefs: FIELD_DEFS.filter((d) => d.key !== 'register'),
      }),
      200,
    );
    expect(updated.fieldDefs.map((d) => d.key)).toEqual(['function_code', 'note']);
    expect(updated.caseCount).toBe(1);
    const after = await expectStatus<TestCaseDTO>(viewer.get(`${P}/cases/${c.id}`), 200);
    expect(after.custom).toEqual({ function_code: '03' });
  });

  it('archives suites (hidden unless includeArchived) and deletes unused ones', async () => {
    const archived = await newSuite('ARCH');
    await expectStatus(lead.patch(`${P}/suites/${archived.id}`, { isArchived: true }), 200);
    const visible = await expectStatus<SuiteDTO[]>(viewer.get(`${P}/suites`), 200);
    expect(visible.map((x) => x.prefix)).not.toContain('ARCH');
    const all = await expectStatus<SuiteDTO[]>(viewer.get(`${P}/suites?includeArchived=true`), 200);
    expect(all.map((x) => x.prefix)).toContain('ARCH');

    const s = await newSuite('GONE');
    expect((await lead.delete(`${P}/suites/${s.id}`)).status).toBe(204);
    const gone = await viewer.get(`${P}/suites/${s.id}`);
    expect(gone.status).toBe(404);
    expect(errorCode(gone)).toBe('SUITE_NOT_FOUND');
  });
});

describe('sections', () => {
  it('builds a tree, refuses cycles and cross-suite parents', async () => {
    const s = await newSuite('TREE');
    const other = await newSuite('OTHER');
    const root = await newSection(s.id, 'Read registers');
    const child = await newSection(s.id, 'Operation status', root.id);
    const grandChild = await newSection(s.id, 'Mode', child.id);
    const tree = await expectStatus<SectionTreeDTO>(
      viewer.get(`${P}/suites/${s.id}/sections`),
      200,
    );
    expect(tree.sections[0]!.name).toBe('Read registers');
    expect(tree.sections[0]!.children[0]!.children[0]!.id).toBe(grandChild.id);

    const cycle = await tester.patch(`${P}/sections/${root.id}`, { parentId: grandChild.id });
    expect(cycle.status).toBe(422);
    expect(errorCode(cycle)).toBe('SECTION_CYCLE');
    const otherRoot = await newSection(other.id, 'Elsewhere');
    expect(
      errorCode(await tester.patch(`${P}/sections/${child.id}`, { parentId: otherRoot.id })),
    ).toBe('BAD_PARENT');
    expect(
      errorCode(
        await tester.post(`${P}/suites/${s.id}/sections`, { name: 'x', parentId: otherRoot.id }),
      ),
    ).toBe('BAD_PARENT');
    const moved = await expectStatus<SectionNode>(
      tester.patch(`${P}/sections/${grandChild.id}`, { parentId: null, name: 'Mode (top)' }),
      200,
    );
    expect(moved).toMatchObject({ parentId: null, name: 'Mode (top)', sortOrder: 2 });
  });

  it('deletes empty sections; non-empty ones only when moving content to the parent', async () => {
    const s = await newSuite('DEL');
    const root = await newSection(s.id, 'Root');
    const child = await newSection(s.id, 'Child', root.id);
    const c = await newCase(s.id, { title: 'In child', sectionId: child.id });
    expect((await tester.delete(`${P}/sections/${child.id}`)).status).toBe(403); // lead only
    const busy = await lead.delete(`${P}/sections/${child.id}`);
    expect(busy.status).toBe(409);
    expect(errorCode(busy)).toBe('SECTION_NOT_EMPTY');
    expect((await lead.delete(`${P}/sections/${child.id}?moveContentToParent=true`)).status).toBe(
      204,
    );
    expect((await expectStatus<TestCaseDTO>(viewer.get(`${P}/cases/${c.id}`), 200)).sectionId).toBe(
      root.id,
    );
  });
});

describe('test cases', () => {
  let suite: SuiteDTO;
  let secA: SectionNode;
  let secA1: SectionNode;
  let secB: SectionNode;

  beforeAll(async () => {
    suite = await newSuite('CASE', { fieldDefs: FIELD_DEFS });
    secA = await newSection(suite.id, 'A');
    secA1 = await newSection(suite.id, 'A.1', secA.id);
    secB = await newSection(suite.id, 'B');
  });

  it('validates custom fields and codes, and assigns display ids', async () => {
    const unknown = await tester.post(`${P}/suites/${suite.id}/cases`, {
      title: 'x',
      custom: { nope: '1' },
    });
    expect(unknown.status).toBe(422);
    expect(errorCode(unknown)).toBe('UNKNOWN_FIELD');
    const badOption = await tester.post(`${P}/suites/${suite.id}/cases`, {
      title: 'x',
      custom: { function_code: '99' },
    });
    expect(errorCode(badOption)).toBe('INVALID_OPTION');
    const badSection = await tester.post(`${P}/suites/${suite.id}/cases`, {
      title: 'x',
      sectionId: 999999,
    });
    expect(errorCode(badSection)).toBe('BAD_SECTION');

    const c = await newCase(suite.id, {
      title: 'Read ON/OFF',
      code: 'MB-001',
      sectionId: secB.id,
      procedure: 'Line 1   \r\nLine 2\r\n\r\n\r\n\r\nEnd  ',
      custom: { function_code: '03', register: ' 40001 ', note: '' },
    });
    expect(c.displayId).toMatch(/^CASE-\d{3}$/);
    expect(c.procedure).toBe('Line 1\nLine 2\n\nEnd');
    expect(c.custom).toEqual({ function_code: '03', register: '40001' });
    expect(c.sectionPath).toEqual(['B']);
    const dup = await tester.post(`${P}/suites/${suite.id}/cases`, {
      title: 'Another',
      code: 'MB-001',
    });
    expect(dup.status).toBe(409);
    expect(errorCode(dup)).toBe('CASE_CODE_TAKEN');
    expect((await viewer.post(`${P}/suites/${suite.id}/cases`, { title: 'viewer' })).status).toBe(
      403,
    );
  });

  it('lists cases in section-tree order with paging, filters and search', async () => {
    await newCase(suite.id, { title: 'In A.1', sectionId: secA1.id, caseType: 'Abnormal' });
    await newCase(suite.id, { title: 'In A', sectionId: secA.id, custom: { register: '30001' } });
    await newCase(suite.id, { title: 'Unsectioned' });
    const list = async (query = '') =>
      expectStatus<Paged<TestCaseDTO>>(viewer.get(`${P}/suites/${suite.id}/cases${query}`), 200);
    const all = await list();
    expect(all.items.map((c) => c.title)).toEqual(['Unsectioned', 'In A', 'In A.1', 'Read ON/OFF']);
    expect(all.total).toBe(4);

    const page2 = await list('?page=2&pageSize=3');
    expect(page2).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(page2.items.map((c) => c.title)).toEqual(['Read ON/OFF']);

    expect((await list(`?sectionId=${secA.id}`)).items.map((c) => c.title)).toEqual([
      'In A',
      'In A.1',
    ]);
    expect(
      (await list(`?sectionId=${secA.id}&includeSubsections=false`)).items.map((c) => c.title),
    ).toEqual(['In A']);
    expect((await list('?caseType=Abnormal')).items.map((c) => c.title)).toEqual(['In A.1']);
    expect((await list('?q=30001')).items.map((c) => c.title)).toEqual(['In A']);
    expect((await list('?q=%25')).total).toBe(0);
    const missing = await viewer.get(`${P}/suites/${suite.id}/cases?sectionId=999999`);
    expect(missing.status).toBe(404);
    expect(errorCode(missing)).toBe('SECTION_NOT_FOUND');
  });

  it('versions edits with optimistic concurrency', async () => {
    const c = await newCase(suite.id, { title: 'Versioned', sectionId: secB.id });
    const v2 = await expectStatus<TestCaseDTO>(
      tester.patch(`${P}/cases/${c.id}`, { title: 'Versioned v2', version: c.version }),
      200,
    );
    expect(v2.version).toBe(c.version + 1);
    const stale = await tester.patch(`${P}/cases/${c.id}`, {
      title: 'Stale edit',
      version: c.version,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: c.version + 1 },
    });
    const versions = await expectStatus<CaseVersionDTO[]>(
      viewer.get(`${P}/cases/${c.id}/versions`),
      200,
    );
    expect(versions.map((v) => [v.version, v.data.title])).toEqual([
      [2, 'Versioned v2'],
      [1, 'Versioned'],
    ]);
    expect(versions[0]!.changedBy).toMatchObject({ username: 'tester' });
  });

  it('clones, bulk-edits and soft-deletes cases', async () => {
    const c = await newCase(suite.id, {
      title: 'Original',
      code: 'ORIG-1',
      sectionId: secB.id,
      status: 'draft',
    });
    const copy = await expectStatus<TestCaseDTO>(tester.post(`${P}/cases/${c.id}/clone`), 201);
    expect(copy).toMatchObject({
      title: 'Original (copy)',
      code: null,
      sectionId: secB.id,
      status: 'draft',
    });
    expect(copy.displayId).not.toBe(c.displayId);

    const ids = [c.id, copy.id];
    const bulk = (client: Client, body: Record<string, unknown>) =>
      client.post(`${P}/suites/${suite.id}/cases/bulk`, body);
    expect(
      (
        await expectStatus<{ affected: number }>(
          bulk(tester, { action: 'setStatus', ids, status: 'ready' }),
          200,
        )
      ).affected,
    ).toBe(2);
    expect(
      (
        await expectStatus<{ affected: number }>(
          bulk(tester, { action: 'move', ids, sectionId: secA.id }),
          200,
        )
      ).affected,
    ).toBe(2);
    expect(await expectStatus<TestCaseDTO>(viewer.get(`${P}/cases/${copy.id}`), 200)).toMatchObject(
      { status: 'ready', sectionId: secA.id },
    );
    expect((await bulk(tester, { action: 'delete', ids })).status).toBe(403);
    expect(
      (
        await expectStatus<{ affected: number }>(
          bulk(lead, { action: 'delete', ids: [copy.id] }),
          200,
        )
      ).affected,
    ).toBe(1);
    expect((await tester.delete(`${P}/cases/${c.id}`)).status).toBe(403);
    expect((await lead.delete(`${P}/cases/${c.id}`)).status).toBe(204);
    expect((await viewer.get(`${P}/cases/${c.id}`)).status).toBe(404);
    // A deleted case frees its code.
    await newCase(suite.id, { title: 'Reuses the code', code: 'ORIG-1' });
  });

  it('exports the suite as xlsx with the agreed header and section paths', async () => {
    const res = await download(viewer, `${P}/suites/${suite.id}/export.xlsx`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(String(res.headers['content-disposition'])).toContain('attachment;');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as never);
    const ws = wb.worksheets[0]!;
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Section',
      'Case code',
      'Title',
      'Type',
      'Status',
      'Precondition',
      'Procedure',
      'Expected result',
      'Remark',
      'Summary group',
      'Priority',
      'Tags',
      'Estimate (min)',
      'References',
      'Function code',
      'Register address',
      'Note',
    ]);
    const rows: string[][] = [];
    ws.eachRow((row, n) => {
      if (n > 1) {
        rows.push(
          (row.values as unknown[])
            .slice(1)
            .map((v) => (v === undefined || v === null ? '' : String(v))),
        );
      }
    });
    const inA1 = rows.find((r) => r[2] === 'In A.1')!;
    expect(inA1[0]).toBe('A > A.1');
    expect(inA1[3]).toBe('Abnormal');
    const read = rows.find((r) => r[2] === 'Read ON/OFF')!;
    expect(read[10]).toBe('Medium');
    expect(read.slice(14, 16)).toEqual(['03', '40001']);
    expect(rows[0]![2]).toBe('Unsectioned');
  });
});

describe('run history', () => {
  it('lists the results of a case across runs, newest first', async () => {
    const s = await newSuite('HIST');
    const c = await newCase(s.id, { title: 'Run me' });
    const db = t.prisma.db;
    const release = await db.release.create({ data: { projectId, name: 'R1' } });
    const plan = await db.testPlan.create({
      data: { projectId, releaseId: release.id, docNo: 'DOC-1', title: 'Plan 1' },
    });
    const run = await db.testRun.create({ data: { planId: plan.id, suiteId: s.id, code: 'T1' } });
    const base = { runId: run.id, testCaseId: c.id, displayId: c.displayId, title: c.title };
    const older = await db.runCase.create({
      data: {
        ...base,
        status: 'ng',
        actualResult: 'Fails',
        executedById: leadId,
        executedAt: new Date('2026-10-01T00:00:00Z'),
      },
    });
    const newer = await db.runCase.create({
      data: { ...base, status: 'ok', executedAt: new Date('2026-10-02T00:00:00Z') },
    });
    const untested = await db.runCase.create({ data: base });
    const list = await expectStatus<CaseRunHistoryItem[]>(
      viewer.get(`${P}/cases/${c.id}/runs`),
      200,
    );
    expect(list.map((r) => r.runCaseId)).toEqual([newer.id, older.id, untested.id]);
    expect(list[1]).toEqual({
      runCaseId: older.id,
      runId: run.id,
      runCode: 'T1',
      planId: plan.id,
      planDocNo: 'DOC-1',
      planTitle: 'Plan 1',
      releaseName: 'R1',
      status: 'ng',
      actualResult: 'Fails',
      executedBy: { id: leadId, username: 'lead', displayName: 'Lead' },
      executedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(errorCode(await viewer.get(`${P}/cases/999999/runs`))).toBe('CASE_NOT_FOUND');
    // A suite with runs cannot be deleted.
    const inUse = await lead.delete(`${P}/suites/${s.id}`);
    expect(inUse.status).toBe(409);
    expect(errorCode(inUse)).toBe('SUITE_IN_USE');
  });
});
