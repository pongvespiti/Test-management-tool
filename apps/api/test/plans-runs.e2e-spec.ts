/**
 * Plans, runs and results (port of the v1 server's plans-runs tests). Library data is created
 * directly in the database (see helpers).
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Suite } from '@tmt/database';
import type {
  AttachmentDTO,
  MatrixDTO,
  PlanDTO,
  ReleaseDTO,
  RunCaseDetailDTO,
  RunCaseDTO,
  RunDTO,
} from '@tmt/shared';
import { caseRunHistory } from '../src/modules/execution/execution.queries.js';
import {
  addAttachment,
  attachmentPath,
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

let t: TestApp;
let lead: Client;
let tester: Client;
let viewer: Client;
let P: string;
let projectId: number;
let testerId: number;
let suite: Suite;
let release: ReleaseDTO;
const sections: Record<string, { id: number }> = {};
const cases: Record<string, { id: number; displayId: string }> = {};

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const te = await createUser(t.prisma, 'tester');
  testerId = te.id;
  const v = await createUser(t.prisma, 'viewer');
  projectId = (
    await createProject(t.prisma, 'EXE', [
      { userId: l.id, role: 'lead' },
      { userId: te.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');

  release = expectBody<ReleaseDTO>(
    await lead.post(`${P}/releases`, { name: 'Step 1.1.6', status: 'active' }),
    201,
  );
  suite = await createSuite(t, projectId, {
    name: 'Modbus',
    prefix: 'MBS',
    envTemplate: ['Adapter FW', 'Baud rate'],
    fieldDefs: [{ key: 'register', label: 'Register', type: 'text', showInTable: true }],
  });
  sections.A = await createSection(t, suite.id, 'A');
  sections.A1 = await createSection(t, suite.id, 'A.1', sections.A.id);
  sections.B = await createSection(t, suite.id, 'B');
  sections.Empty = await createSection(t, suite.id, 'Empty');
  const add = async (key: string, body: Parameters<typeof createCase>[3]) => {
    cases[key] = await createCase(t, suite, l.id, body);
  };
  // Created out of display order on purpose.
  await add('b1', {
    title: 'B one',
    sectionId: sections.B.id,
    summaryGroup: 'Control',
    custom: { register: '40001' },
  });
  await add('a1x', {
    title: 'A.1 one',
    sectionId: sections.A1.id,
    summaryGroup: 'Status',
    caseType: 'Abnormal',
  });
  await add('a', { title: 'A one', sectionId: sections.A.id, summaryGroup: 'Status' });
  await add('draft', { title: 'Draft case', sectionId: sections.A.id, status: 'draft' });
  await add('gone', { title: 'Deleted case', sectionId: sections.B.id });
  await t.prisma.db.testCase.update({ where: { id: cases.gone!.id }, data: { isDeleted: true } });
  await add('emptyDraft', {
    title: 'Only draft here',
    sectionId: sections.Empty.id,
    status: 'draft',
  });
});
afterAll(() => t.close());

async function newPlan(docNo: string, extra: Record<string, unknown> = {}): Promise<PlanDTO> {
  return expectBody<PlanDTO>(
    await tester.post(`${P}/plans`, { docNo, title: `Plan ${docNo}`, ...extra }),
    201,
  );
}
async function newRun(
  planId: number,
  code: string,
  extra: Record<string, unknown> = {},
): Promise<RunDTO> {
  return expectBody<RunDTO>(
    await tester.post(`${P}/plans/${planId}/runs`, { suiteId: suite.id, code, ...extra }),
    201,
  );
}
async function runCases(runId: number): Promise<RunCaseDTO[]> {
  return expectBody<RunCaseDTO[]>(await viewer.get(`${P}/runs/${runId}/cases`), 200);
}

describe('test plans', () => {
  it('suggests a document number and enforces uniqueness per project', async () => {
    const { docNo } = expectBody<{ docNo: string }>(
      await viewer.get(`${P}/plans/doc-no-suggestion`),
      200,
    );
    // The test project uses the pattern {YY}TR-TEST-{MM}-{SEQ} (helpers.createProject).
    expect(docNo).toMatch(/^\d{2}TR-TEST-\d{2}-/);
    const plan = await newPlan(docNo, {
      releaseId: release.id,
      purpose: 'Check it',
      templateId: null,
    });
    expect(plan).toMatchObject({
      docNo,
      status: 'draft',
      release: { id: release.id },
      templateId: null,
      runs: [],
    });
    const dup = await tester.post(`${P}/plans`, { docNo, title: 'Again' });
    expect(dup.status).toBe(409);
    expect(errorCode(dup)).toBe('DOC_NO_TAKEN');
    expect(
      errorCode(await tester.post(`${P}/plans`, { docNo: 'X-9', title: 'x', releaseId: 999999 })),
    ).toBe('BAD_RELEASE');
    expect(
      errorCode(await tester.post(`${P}/plans`, { docNo: 'X-9', title: 'x', templateId: 999999 })),
    ).toBe('BAD_TEMPLATE');
    const next = expectBody<{ docNo: string }>(
      await viewer.get(`${P}/plans/doc-no-suggestion`),
      200,
    );
    expect(next.docNo).not.toBe(docNo);
    const list = expectBody<PlanDTO[]>(await viewer.get(`${P}/plans?releaseId=${release.id}`), 200);
    expect(list.map((p) => p.docNo)).toEqual([docNo]);
  });
});

describe('test runs', () => {
  let plan: PlanDTO;
  beforeAll(async () => {
    plan = await newPlan('RUN-PLAN-1');
  });

  it('snapshots ready cases of the whole suite in tree order, with the environment template', async () => {
    const run = await newRun(plan.id, 'KR_01', { scenario: 'RTU 9600', testerId });
    expect(run).toMatchObject({
      code: 'KR_01',
      planDocNo: 'RUN-PLAN-1',
      planStatus: 'draft',
      suite: { id: suite.id, prefix: 'MBS' },
      tester: { id: testerId },
      environment: [
        { label: 'Adapter FW', value: '' },
        { label: 'Baud rate', value: '' },
      ],
    });
    expect(run.counts.untested).toBe(3);
    const rcs = await runCases(run.id);
    expect(rcs.map((rc) => rc.title)).toEqual(['A one', 'A.1 one', 'B one']);
    expect(rcs.map((rc) => rc.sectionPath)).toEqual([['A'], ['A', 'A.1'], ['B']]);
    expect(rcs[2]).toMatchObject({
      displayId: cases.b1!.displayId,
      custom: { register: '40001' },
      status: 'untested',
    });
    expect(rcs.every((rc) => rc.defectCount === 0 && rc.attachmentCount === 0)).toBe(true);

    // Library edits after the snapshot do not change the run.
    await t.prisma.db.testCase.update({
      where: { id: cases.b1!.id },
      data: { title: 'B one (edited)' },
    });
    expect((await runCases(run.id))[2]!.title).toBe('B one');
  });

  it('honours selected sections (with descendants) and case statuses', async () => {
    const onlyA = await newRun(plan.id, 'KR_A', { sectionIds: [sections.A!.id] });
    expect((await runCases(onlyA.id)).map((rc) => rc.title)).toEqual(['A one', 'A.1 one']);
    const withDraft = await newRun(plan.id, 'KR_D', {
      sectionIds: [sections.A!.id],
      caseStatuses: ['draft', 'ready'],
    });
    expect((await runCases(withDraft.id)).map((rc) => rc.title)).toEqual([
      'A one',
      'Draft case',
      'A.1 one',
    ]);
  });

  it('rejects duplicate codes, empty selections and foreign references', async () => {
    const dup = await tester.post(`${P}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: 'KR_01',
    });
    expect(dup.status).toBe(409);
    expect(errorCode(dup)).toBe('RUN_CODE_TAKEN');
    const empty = await tester.post(`${P}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: 'E',
      sectionIds: [sections.Empty!.id],
    });
    expect(empty.status).toBe(422);
    expect(errorCode(empty)).toBe('NO_CASES');
    expect(
      errorCode(
        await tester.post(`${P}/plans/${plan.id}/runs`, {
          suiteId: suite.id,
          code: 'E',
          sectionIds: [999999],
        }),
      ),
    ).toBe('BAD_SECTION');
    expect(
      errorCode(await tester.post(`${P}/plans/${plan.id}/runs`, { suiteId: 999999, code: 'E' })),
    ).toBe('BAD_SUITE');
    expect(
      errorCode(
        await tester.post(`${P}/plans/${plan.id}/runs`, {
          suiteId: suite.id,
          code: 'E',
          testerId: 999999,
        }),
      ),
    ).toBe('UNKNOWN_USER');
    expect(
      (await viewer.post(`${P}/plans/${plan.id}/runs`, { suiteId: suite.id, code: 'V' })).status,
    ).toBe(403);
  });

  it('updates and duplicates runs (same cases, fresh results)', async () => {
    const run = await newRun(plan.id, 'KR_UPD', {
      environment: [{ label: 'Adapter FW', value: '1.1.6' }],
    });
    const rcs = await runCases(run.id);
    await tester.put(`${P}/run-cases/${rcs[0]!.id}/result`, { status: 'ok' });
    const updated = expectBody<RunDTO>(
      await tester.patch(`${P}/runs/${run.id}`, {
        judgement: 'pass',
        remark: 'Fine',
        testedDate: '2026-10-20',
      }),
      200,
    );
    expect(updated).toMatchObject({ judgement: 'pass', remark: 'Fine', testedDate: '2026-10-20' });
    expect(errorCode(await tester.patch(`${P}/runs/${run.id}`, { code: 'KR_01' }))).toBe(
      'RUN_CODE_TAKEN',
    );

    const copy = expectBody<RunDTO>(
      await tester.post(`${P}/runs/${run.id}/duplicate`, {
        code: 'KR_UPD2',
        scenario: 'Second unit',
      }),
      201,
    );
    expect(copy).toMatchObject({
      code: 'KR_UPD2',
      scenario: 'Second unit',
      environment: [{ label: 'Adapter FW', value: '1.1.6' }],
    });
    expect(copy.counts.untested).toBe(rcs.length);
    const copied = await runCases(copy.id);
    expect(copied.map((rc) => rc.displayId)).toEqual(rcs.map((rc) => rc.displayId));
    expect(copied.every((rc) => rc.status === 'untested' && rc.executedBy === null)).toBe(true);
    expect(errorCode(await tester.post(`${P}/runs/${run.id}/duplicate`, { code: 'KR_UPD2' }))).toBe(
      'RUN_CODE_TAKEN',
    );
  });
});

describe('results', () => {
  let plan: PlanDTO;
  let run: RunDTO;
  let rcs: RunCaseDTO[];

  beforeAll(async () => {
    plan = await newPlan('RES-PLAN-1');
    run = await newRun(plan.id, 'KR_R');
    rcs = await runCases(run.id);
  });

  it('records results with history, moves the plan to in progress, keeps omitted fields', async () => {
    const rc = rcs[0]!;
    const ng = expectBody<RunCaseDTO>(
      await tester.put(`${P}/run-cases/${rc.id}/result`, {
        status: 'ng',
        actualResult: 'No response',
        elapsedSec: 30,
      }),
      200,
    );
    expect(ng).toMatchObject({
      status: 'ng',
      actualResult: 'No response',
      elapsedSec: 30,
      executedBy: { id: testerId },
    });
    expect(expectBody<PlanDTO>(await viewer.get(`${P}/plans/${plan.id}`), 200).status).toBe(
      'in_progress',
    );

    const ok = expectBody<RunCaseDTO>(
      await tester.put(`${P}/run-cases/${rc.id}/result`, { status: 'ok' }),
      200,
    );
    expect(ok).toMatchObject({ status: 'ok', actualResult: 'No response' });
    const cleared = expectBody<RunCaseDTO>(
      await tester.put(`${P}/run-cases/${rc.id}/result`, {
        status: 'untested',
        actualResult: '',
      }),
      200,
    );
    expect(cleared).toMatchObject({
      status: 'untested',
      actualResult: null,
      executedBy: null,
      executedAt: null,
    });

    const detail = expectBody<RunCaseDetailDTO>(await viewer.get(`${P}/run-cases/${rc.id}`), 200);
    expect(detail.history.map((h) => h.status)).toEqual(['untested', 'ok', 'ng']);
    expect(detail).toMatchObject({ attachments: [], defects: [] });
    expect((await viewer.put(`${P}/run-cases/${rc.id}/result`, { status: 'ok' })).status).toBe(403);
    expect((await viewer.get(`${P}/run-cases/999999`)).status).toBe(404);
  });

  it('sets results in bulk only for cases of that run', async () => {
    const other = await newRun(plan.id, 'KR_OTHER');
    const otherCases = await runCases(other.id);
    const res = await tester.post(`${P}/runs/${run.id}/results/bulk`, {
      runCaseIds: [rcs[1]!.id, rcs[2]!.id, otherCases[0]!.id],
      status: 'ok_cond',
    });
    expect(expectBody<{ affected: number }>(res, 200).affected).toBe(2);
    const after = await runCases(run.id);
    expect(after.slice(1).map((rc) => rc.status)).toEqual(['ok_cond', 'ok_cond']);
    expect((await runCases(other.id))[0]!.status).toBe('untested');
    const counts = expectBody<RunDTO>(await viewer.get(`${P}/runs/${run.id}`), 200).counts;
    expect(counts).toMatchObject({ ok_cond: 2, untested: 1 });
  });

  it('shows the same library case in other runs and in the case history', async () => {
    const libCase = rcs[0]!.testCaseId!;
    const other = (await runCases((await newRun(plan.id, 'KR_HIST')).id)).find(
      (x) => x.testCaseId === libCase,
    )!;
    await tester.put(`${P}/run-cases/${other.id}/result`, { status: 'ok' });
    const detail = expectBody<RunCaseDetailDTO>(
      await viewer.get(`${P}/run-cases/${rcs[0]!.id}`),
      200,
    );
    expect(detail.otherRuns.map((o) => o.runCode)).toContain('KR_HIST');
    expect(detail.otherRuns.every((o) => o.runCaseId !== rcs[0]!.id)).toBe(true);
    // The case run history (GET /cases/:caseId/runs of the library module) uses the same query.
    const history = await caseRunHistory(t.prisma.db, libCase);
    expect(history[0]).toMatchObject({ runCode: 'KR_HIST', status: 'ok', planDocNo: 'RES-PLAN-1' });
  });

  it('summarises a plan as a run × group matrix', async () => {
    const matrix = expectBody<MatrixDTO>(
      await viewer.get(`${P}/plans/${plan.id}/matrix?groupBy=summary`),
      200,
    );
    expect(matrix.groupBy).toBe('summary');
    expect(matrix.groups).toEqual(expect.arrayContaining(['Status', 'Control']));
    expect(matrix.rows.map((r) => r.run.code)).toEqual(['KR_R', 'KR_OTHER', 'KR_HIST']);
    const bySection = expectBody<MatrixDTO>(
      await viewer.get(`${P}/plans/${plan.id}/matrix?groupBy=section`),
      200,
    );
    expect(bySection.rows[0]!.cells).toHaveLength(bySection.groups.length);
    expect((await viewer.get(`${P}/plans/${plan.id}/matrix?groupBy=bogus`)).status).toBe(400);
  });
});

describe('completion lock, reopen and signed copy', () => {
  it('locks every plan/run/result write once completed until a lead reopens', async () => {
    const plan = await newPlan('LOCK-1');
    const run = await newRun(plan.id, 'KR_L');
    const [rc] = await runCases(run.id);
    const done = expectBody<PlanDTO>(await tester.post(`${P}/plans/${plan.id}/complete`), 200);
    expect(done).toMatchObject({
      status: 'completed',
      completedBy: expect.objectContaining({ username: 'tester' }),
    });

    const attempts = [
      await tester.put(`${P}/run-cases/${rc!.id}/result`, { status: 'ok' }),
      await tester.post(`${P}/runs/${run.id}/results/bulk`, {
        runCaseIds: [rc!.id],
        status: 'ok',
      }),
      await tester.post(`${P}/plans/${plan.id}/runs`, { suiteId: suite.id, code: 'KR_NEW' }),
      await tester.patch(`${P}/runs/${run.id}`, { remark: 'late' }),
      await tester.post(`${P}/runs/${run.id}/duplicate`, { code: 'KR_DUP' }),
      await tester.patch(`${P}/plans/${plan.id}`, { title: 'Changed' }),
      await lead.delete(`${P}/runs/${run.id}`),
      await lead.delete(`${P}/plans/${plan.id}`),
    ];
    expect(attempts.map((r) => `${r.status} ${errorCode(r)}`)).toEqual(
      Array(attempts.length).fill('409 PLAN_LOCKED'),
    );

    expect((await tester.post(`${P}/plans/${plan.id}/reopen`)).status).toBe(403);
    const reopened = expectBody<PlanDTO>(await lead.post(`${P}/plans/${plan.id}/reopen`), 200);
    expect(reopened).toMatchObject({ status: 'in_progress', completedAt: null, completedBy: null });
    expect((await tester.put(`${P}/run-cases/${rc!.id}/result`, { status: 'ok' })).status).toBe(
      200,
    );
  });

  it('accepts the signed copy (pdf/png/jpg) only for completed plans and replaces it', async () => {
    const plan = await newPlan('SIGN-1');
    const url = `${P}/plans/${plan.id}/signed-copy`;
    const pdf = {
      name: 'signed.pdf',
      content: Buffer.from('%PDF-1.4 signed'),
      contentType: 'application/pdf',
    };
    const early = await upload(t, tester, url, { file: pdf }, 'put');
    expect(early.status).toBe(409);
    expect(errorCode(early)).toBe('PLAN_NOT_COMPLETED');
    await tester.post(`${P}/plans/${plan.id}/complete`);

    const wrongType = await upload(
      t,
      tester,
      url,
      { file: { name: 'notes.txt', content: 'x' } },
      'put',
    );
    expect(wrongType.status).toBe(415);
    expect(errorCode(wrongType)).toBe('UNSUPPORTED_FILE_TYPE');
    expect(errorCode(await tester.put(url, { file: 'x' }))).toBe('MULTIPART_REQUIRED');

    const first = expectBody<AttachmentDTO>(
      await upload(t, tester, url, { file: pdf }, 'put'),
      200,
    );
    expect(first).toMatchObject({
      entityType: 'plan',
      entityId: plan.id,
      fileName: 'signed.pdf',
      mimeType: 'application/pdf',
      url: `/api/v1${P}/attachments/${first.id}/download`,
    });
    const firstPath = await attachmentPath(t, first.id);
    expect(fs.existsSync(firstPath)).toBe(true);

    const second = expectBody<AttachmentDTO>(
      await upload(
        t,
        tester,
        url,
        { file: { name: 'scan.png', content: Buffer.from([0x89, 0x50]) } },
        'put',
      ),
      200,
    );
    expect(second.mimeType).toBe('image/png');
    expect(fs.existsSync(firstPath)).toBe(false);
    expect(expectBody<PlanDTO>(await viewer.get(`${P}/plans/${plan.id}`), 200).signedCopy?.id).toBe(
      second.id,
    );
    // The download itself is served by the attachments route of the collaboration module.
    expect(fs.readFileSync(await attachmentPath(t, second.id))).toEqual(Buffer.from([0x89, 0x50]));

    const secondPath = await attachmentPath(t, second.id);
    expect((await tester.delete(url)).status).toBe(204);
    expect(fs.existsSync(secondPath)).toBe(false);
    expect(
      expectBody<PlanDTO>(await viewer.get(`${P}/plans/${plan.id}`), 200).signedCopy,
    ).toBeNull();
  });
});

describe('deleting runs and plans', () => {
  it('removes run-case evidence files with the run, and plans with everything in them', async () => {
    const plan = await newPlan('DEL-1');
    const run = await newRun(plan.id, 'KR_X');
    const [rc] = await runCases(run.id);
    const evidence = await addAttachment(t, projectId, 'run_case', rc!.id, 'log.txt', 'trace');
    expect(fs.existsSync(evidence.path)).toBe(true);
    expect((await tester.delete(`${P}/runs/${run.id}`)).status).toBe(403);
    expect((await lead.delete(`${P}/runs/${run.id}`)).status).toBe(204);
    expect(fs.existsSync(evidence.path)).toBe(false);
    expect((await viewer.get(`${P}/runs/${run.id}`)).status).toBe(404);

    const run2 = await newRun(plan.id, 'KR_Y');
    const [rc2] = await runCases(run2.id);
    const evidence2 = await addAttachment(t, projectId, 'run_case', rc2!.id, 'log.txt', 'more');
    expect((await lead.delete(`${P}/plans/${plan.id}`)).status).toBe(204);
    expect(fs.existsSync(evidence2.path)).toBe(false);
    expect((await viewer.get(`${P}/plans/${plan.id}`)).status).toBe(404);
    expect((await viewer.get(`${P}/runs/${run2.id}`)).status).toBe(404);
  });
});
