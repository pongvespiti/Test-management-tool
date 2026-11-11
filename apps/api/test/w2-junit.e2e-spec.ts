/**
 * JUnit XML import (port of the v1 server's w2-junit tests). The parser cases of that file live in
 * src/modules/automation/junit-parse.spec.ts; this file covers the endpoint.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Suite } from '@tmt/database';
import type {
  CreatedTokenDTO,
  JunitImportResultDTO,
  PlanDTO,
  RunCaseDetailDTO,
  RunCaseDTO,
  RunDTO,
} from '@tmt/shared';
import {
  anon,
  API,
  createCase,
  createProject,
  createSection,
  createSuite,
  createTestApp,
  createUser,
  errorCode,
  expectBody,
  login,
  upload,
  type Client,
  type TestApp,
} from './helpers.js';
import { JUNIT_LONG_NAME, NESTED_XML, PYTEST_XML, SUREFIRE_XML } from './unit/fixtures.js';

let t: TestApp;
let lead: Client;
let tester: Client;
let viewer: Client;
let projectId: number;
let P: string;
let suite: Suite;
let plan: PlanDTO;
let run: RunDTO;
const cases: Record<string, { id: number; displayId: string }> = {};
let rcByCase: Record<string, RunCaseDTO>;
let mobileSectionId: number;

function send(api: Client, url: string, xml: string | Buffer, name = 'results.xml') {
  return upload(t, api, url, { file: { name, content: xml, contentType: 'application/xml' } });
}
async function runCasesNow(runId = run.id): Promise<RunCaseDTO[]> {
  return expectBody<RunCaseDTO[]>(await lead.get(`${P}/runs/${runId}/cases`), 200);
}

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const te = await createUser(t.prisma, 'tester');
  const v = await createUser(t.prisma, 'viewer');
  projectId = (
    await createProject(t.prisma, 'JUN', [
      { userId: l.id, role: 'lead' },
      { userId: te.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');
  suite = await createSuite(t, projectId, { name: 'Adapter', prefix: 'ADP' });
  mobileSectionId = (await createSection(t, suite.id, 'mobile app')).id;
  const add = async (key: string, body: Parameters<typeof createCase>[3]) => {
    cases[key] = await createCase(t, suite, l.id, body);
  };
  await add('c1', { code: 'test_login', title: 'Login with valid password' });
  await add('c2', { title: 'Read register 40001' });
  await add('c3', { code: 'WR-1', title: 'Write register' });
  await add('c4', { title: 'Duplicate title' });
  await add('c5', { title: 'Duplicate title' });
  await add('c6', { code: 'PROP-1', title: 'Property target' });
  plan = expectBody<PlanDTO>(
    await lead.post(`${P}/plans`, { docNo: 'JUN-1', title: 'Automation' }),
    201,
  );
  run = expectBody<RunDTO>(
    await lead.post(`${P}/plans/${plan.id}/runs`, { suiteId: suite.id, code: 'CI-1' }),
    201,
  );
  // Created after the run: its code is taken in the suite but the case is not in the run.
  await add('c7', { code: 'opens', title: 'Some other title' });
  const rcs = await runCasesNow();
  rcByCase = Object.fromEntries(
    Object.entries(cases)
      .map(([k, c]) => [k, rcs.find((r) => r.testCaseId === c.id)])
      .filter(([, r]) => r),
  ) as Record<string, RunCaseDTO>;
  expect(Object.keys(rcByCase)).toHaveLength(6);
});
afterAll(() => t.close());

describe('POST runs/:runId/junit', () => {
  it('previews with dryRun without writing anything', async () => {
    const res = expectBody<JunitImportResultDTO>(
      await send(tester, `${P}/runs/${run.id}/junit?dryRun=true`, PYTEST_XML, 'pytest.xml'),
      200,
    );
    expect(res.dryRun).toBe(true);
    expect(res.importId).toBeNull();
    expect(res.totals).toEqual({
      tests: 6,
      matched: 4,
      unmatched: 2,
      updatedRunCases: 4,
      createdCases: 0,
    });
    expect((await runCasesNow()).every((r) => r.status === 'untested')).toBe(true);
    expect(await t.prisma.db.runCaseResult.count()).toBe(0);
    expect(await t.prisma.db.import.count()).toBe(0);
    expect(await t.prisma.db.activityLog.count({ where: { action: 'junit_imported' } })).toBe(0);
    expect((await t.prisma.db.testPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe(
      'draft',
    );
  });

  it('imports pytest results with auto matching (code, title, display id, property)', async () => {
    const res = expectBody<JunitImportResultDTO>(
      await send(tester, `${P}/runs/${run.id}/junit`, PYTEST_XML, 'pytest.xml'),
      200,
    );
    expect(res.dryRun).toBe(false);
    expect(res.importId).toEqual(expect.any(Number));
    expect(res.fileName).toBe('pytest.xml');
    expect(res.counts).toMatchObject({ ok: 1, ng: 2, nt: 1, untested: 0 });
    expect(res.items.map((i) => [i.displayId, i.previous, i.status, i.tests, i.created])).toEqual([
      [cases.c1!.displayId, 'untested', 'ok', 1, false],
      [cases.c2!.displayId, 'untested', 'ng', 1, false],
      [cases.c3!.displayId, 'untested', 'nt', 1, false],
      [cases.c6!.displayId, 'untested', 'ng', 1, false],
    ]);
    expect(res.unmatched).toEqual([
      { name: 'Duplicate title', classname: 'tests.test_misc', status: 'ok', reason: 'ambiguous' },
      {
        name: 'test_unknown_feature',
        classname: 'tests.test_misc',
        status: 'ok',
        reason: 'no_match',
      },
    ]);

    const detail = expectBody<RunCaseDetailDTO>(
      await lead.get(`${P}/run-cases/${rcByCase.c2!.id}`),
      200,
    );
    expect(detail.status).toBe('ng');
    expect(detail.actualResult).toBe(
      'AssertionError: expected 0x01\ntests/test_modbus.py:12: in test_read\n    assert value == 1\nE   assert 0 == 1',
    );
    expect(detail.resultRemark).toBe('JUnit: pytest.xml');
    expect(detail.elapsedSec).toBe(1);
    expect(detail.executedBy?.username).toBe('tester');
    expect(detail.history).toHaveLength(1);
    expect(detail.history[0]).toMatchObject({ source: 'junit', status: 'ng' });
    const skipped = expectBody<RunCaseDetailDTO>(
      await lead.get(`${P}/run-cases/${rcByCase.c3!.id}`),
      200,
    );
    expect(skipped).toMatchObject({ status: 'nt', actualResult: 'requires hardware' });
    const ok = expectBody<RunCaseDetailDTO>(
      await lead.get(`${P}/run-cases/${rcByCase.c1!.id}`),
      200,
    );
    expect(ok).toMatchObject({ status: 'ok', actualResult: null, elapsedSec: 1 });

    expect((await t.prisma.db.testPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe(
      'in_progress',
    );
    const record = await t.prisma.db.import.findUniqueOrThrow({ where: { id: res.importId! } });
    expect(record).toMatchObject({
      kind: 'junit',
      runId: run.id,
      suiteId: suite.id,
      fileName: 'pytest.xml',
      layout: null,
    });
    expect(record.stats).toMatchObject({ tests: 6, matched: 4, unmatched: 2, ambiguous: 1, ng: 2 });
    const activity = await t.prisma.db.activityLog.findFirstOrThrow({
      where: { action: 'junit_imported', entityId: run.id },
    });
    expect(activity.summary).toContain('Imported JUnit results from pytest.xml into run CI-1');
    expect(activity.summary).toContain('4 run case(s) updated');
  });

  it('combines several tests on one run case with the worst status (surefire style)', async () => {
    const res = expectBody<JunitImportResultDTO>(
      await send(
        lead,
        `${P}/runs/${run.id}/junit?matchBy=auto`,
        SUREFIRE_XML,
        'TEST-AdapterIT.xml',
      ),
      200,
    );
    expect(res.totals).toMatchObject({ tests: 3, matched: 3, unmatched: 0, updatedRunCases: 2 });
    const byId = new Map(res.items.map((i) => [i.runCaseId, i]));
    expect(byId.get(rcByCase.c3!.id)).toMatchObject({ previous: 'nt', status: 'ng', tests: 2 });
    expect(byId.get(rcByCase.c1!.id)).toMatchObject({ previous: 'ok', status: 'ok', tests: 1 });
    const d = expectBody<RunCaseDetailDTO>(
      await lead.get(`${P}/run-cases/${rcByCase.c3!.id}`),
      200,
    );
    expect(d.actualResult).toBe(
      'expected:<1> but was:<2>\njava.lang.AssertionError: expected:<1> but was:<2>\n\tat com.example.app.AdapterRetryIT.write(AdapterRetryIT.java:42)',
    );
    expect(d.elapsedSec).toBe(3); // 1.0 + 1.5 seconds, rounded
    expect(d.history.map((h) => h.source)).toEqual(['junit', 'junit']);
  });

  it('supports the explicit matching modes and skippedAs', async () => {
    const preview = async (query: string) =>
      expectBody<JunitImportResultDTO>(
        await send(tester, `${P}/runs/${run.id}/junit?dryRun=1&${query}`, PYTEST_XML),
        200,
      );
    const titles = await preview('matchBy=title');
    expect(titles.items.map((i) => i.runCaseId)).toEqual([rcByCase.c2!.id]);
    expect(titles.unmatched.map((u) => u.reason).toSorted()).toEqual([
      'ambiguous',
      'no_match',
      'no_match',
      'no_match',
      'no_match',
    ]);
    expect((await preview('matchBy=code')).items.map((i) => i.runCaseId)).toEqual([
      rcByCase.c1!.id,
    ]);
    expect((await preview('matchBy=display_id')).items.map((i) => i.runCaseId)).toEqual([
      rcByCase.c3!.id,
    ]);
    const blocked = await preview('skippedAs=blocked');
    expect(blocked.items.find((i) => i.runCaseId === rcByCase.c3!.id)!.status).toBe('blocked');
    expect(
      errorCode(await send(tester, `${P}/runs/${run.id}/junit?matchBy=fuzzy`, PYTEST_XML)),
    ).toBe('VALIDATION_ERROR');
  });

  it('creates missing library cases (createMissing) and matches them on the next import', async () => {
    const before = (await runCasesNow()).length;
    const res = expectBody<JunitImportResultDTO>(
      await send(lead, `${P}/runs/${run.id}/junit?createMissing=true`, NESTED_XML, 'app.xml'),
      200,
    );
    expect(res.totals).toEqual({
      tests: 6,
      matched: 6,
      unmatched: 0,
      updatedRunCases: 5,
      createdCases: 5,
    });
    expect(res.items.every((i) => i.created)).toBe(true);
    expect(res.items.map((i) => [i.title.slice(0, 15), i.status, i.tests])).toEqual([
      ['shows error on ', 'ng', 1],
      ['remembers user', 'ok', 1],
      ['opens', 'nt', 2],
      [JUNIT_LONG_NAME.slice(0, 15), 'ok', 1],
      ['no suite name', 'ok', 1],
    ]);
    const after = await runCasesNow();
    expect(after).toHaveLength(before + 5);
    expect(after.slice(before).map((r) => r.title.slice(0, 15))).toEqual(
      res.items.map((i) => i.title.slice(0, 15)),
    );

    const created = await t.prisma.db.testCase.findMany({
      where: { suiteId: suite.id, isDeleted: false },
    });
    const byTitle = new Map(created.map((c) => [c.title, c]));
    const shows = byTitle.get('shows error on wrong password')!;
    expect(shows).toMatchObject({
      code: 'shows error on wrong password',
      references: 'app.LoginTest',
      tags: ['automated'],
      status: 'ready',
    });
    expect(byTitle.get('opens')!.code).toBeNull(); // code "opens" is used by c7
    expect(byTitle.get(JUNIT_LONG_NAME)!.code).toBeNull(); // longer than 100 characters
    // Top-level sections of the suite (the section tree API belongs to the library module).
    const top = await t.prisma.db.section.findMany({
      where: { suiteId: suite.id, parentId: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    expect(top.map((s) => s.name)).toEqual(['mobile app', 'Login screen', 'JUnit import']);
    expect(byTitle.get('opens')!.sectionId).toBe(mobileSectionId);
    expect(shows.sectionId).toBe(top.find((s) => s.name === 'Login screen')!.id);
    expect(byTitle.get('no suite name')!.sectionId).toBe(
      top.find((s) => s.name === 'JUnit import')!.id,
    );

    const again = expectBody<JunitImportResultDTO>(
      await send(lead, `${P}/runs/${run.id}/junit?createMissing=true`, NESTED_XML, 'app.xml'),
      200,
    );
    expect(again.totals).toMatchObject({ matched: 6, createdCases: 0, updatedRunCases: 5 });
    expect(again.items.every((i) => !i.created)).toBe(true);
  });

  it('applies the review rule to created cases (draft below lead when reviews are required)', async () => {
    await t.prisma.db.project.update({
      where: { id: projectId },
      data: { requireCaseReview: true },
    });
    try {
      const xml =
        '<testsuite name="Review"><testcase classname="r.T" name="needs review"/></testsuite>';
      const res = expectBody<JunitImportResultDTO>(
        await send(tester, `${P}/runs/${run.id}/junit?createMissing=true`, xml),
        200,
      );
      expect(res.totals.createdCases).toBe(1);
      const c = await t.prisma.db.testCase.findFirstOrThrow({ where: { title: 'needs review' } });
      expect(c.status).toBe('draft');
      const leadXml =
        '<testsuite name="Review"><testcase classname="r.T" name="lead creates ready"/></testsuite>';
      expectBody(await send(lead, `${P}/runs/${run.id}/junit?createMissing=true`, leadXml), 200);
      const l = await t.prisma.db.testCase.findFirstOrThrow({
        where: { title: 'lead creates ready' },
      });
      expect(l.status).toBe('ready');
    } finally {
      await t.prisma.db.project.update({
        where: { id: projectId },
        data: { requireCaseReview: false },
      });
    }
  });

  it('accepts uploads from CI with an API token (no CSRF header)', async () => {
    const token = expectBody<CreatedTokenDTO>(
      await tester.post('/auth/tokens', { name: 'CI' }),
      201,
    );
    const res = await anon(t)
      .post(`${API}${P}/runs/${run.id}/junit`)
      .set('Authorization', `Bearer ${token.token}`)
      .attach('file', Buffer.from(SUREFIRE_XML), { filename: 'ci.xml', contentType: 'text/xml' });
    const body = expectBody<JunitImportResultDTO>(res, 200);
    expect(body.totals.updatedRunCases).toBe(2);
    const d = expectBody<RunCaseDetailDTO>(
      await lead.get(`${P}/run-cases/${rcByCase.c1!.id}`),
      200,
    );
    expect(d.history[0]!.source).toBe('junit');
  });

  it('rejects bad files, wrong types, missing files, viewers and other projects', async () => {
    const url = `${P}/runs/${run.id}/junit`;
    const bad = await send(tester, url, '<testsuite><testcase name="x"></testsuite>');
    expect(bad.status).toBe(422);
    expect(errorCode(bad)).toBe('BAD_XML');
    const doctype = await send(
      tester,
      url,
      '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><testsuite><testcase name="&e;"/></testsuite>',
    );
    expect(errorCode(doctype)).toBe('BAD_XML');
    expect(errorCode(await send(tester, url, '<testsuites/>'))).toBe('BAD_XML');
    const wrongType = await send(tester, url, PYTEST_XML, 'results.txt');
    expect(wrongType.status).toBe(415);
    expect(errorCode(wrongType)).toBe('UNSUPPORTED_FILE_TYPE');
    expect(errorCode(await tester.post(url, { file: 'x' }))).toBe('MULTIPART_REQUIRED');
    expect(errorCode(await upload(t, tester, url, { fields: { note: 'no file' } }))).toBe(
      'FILE_REQUIRED',
    );
    expect((await send(viewer, url, PYTEST_XML)).status).toBe(403);
    expect(errorCode(await send(tester, `${P}/runs/999999/junit`, PYTEST_XML))).toBe(
      'RUN_NOT_FOUND',
    );
  });

  it('refuses imports into completed plans (409 PLAN_LOCKED), dry runs included', async () => {
    await t.prisma.db.testPlan.update({ where: { id: plan.id }, data: { status: 'completed' } });
    try {
      for (const q of ['', '?dryRun=true']) {
        const res = await send(tester, `${P}/runs/${run.id}/junit${q}`, PYTEST_XML);
        expect(res.status).toBe(409);
        expect(errorCode(res)).toBe('PLAN_LOCKED');
      }
    } finally {
      await t.prisma.db.testPlan.update({
        where: { id: plan.id },
        data: { status: 'in_progress' },
      });
    }
  });

  // Last test of the file: a second app on the same database truncates every table.
  it('limits the upload size (413 FILE_TOO_LARGE)', async () => {
    const small = await createTestApp({ maxUploadBytes: 1024 });
    try {
      const u = await createUser(small.prisma, 'tester');
      const p = await createProject(small.prisma, 'SMALL', [{ userId: u.id, role: 'tester' }]);
      const api = await login(small, 'tester');
      const res = await upload(small, api, `/projects/${p.id}/runs/1/junit`, {
        file: { name: 'big.xml', content: PYTEST_XML.repeat(3) },
      });
      expect(res.status).toBe(413);
      expect(errorCode(res)).toBe('FILE_TOO_LARGE');
    } finally {
      await small.close();
    }
  });
});
