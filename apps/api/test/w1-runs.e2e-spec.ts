/**
 * v1.1 execution (port of the v1 server's w1-runs tests): snapshots with the new fields,
 * add/remove run cases, assign, step results, re-run, duplicate, plan lock, run report (JSON + xlsx).
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Suite } from '@tmt/database';
import { ExcelJS } from '@tmt/excel';
import type {
  ActivityDTO,
  PlanDTO,
  RunCaseDetailDTO,
  RunCaseDTO,
  RunDTO,
  RunReportDTO,
} from '@tmt/shared';
import JSZip from 'jszip';
import {
  addAttachment,
  binary,
  createCase,
  createDefect,
  createProject,
  createSection,
  createSharedStep,
  createSuite,
  createTestApp,
  createUser,
  errorCode,
  expectBody,
  login,
  setDisplayName,
  type Client,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let leadId: number;
let testerId: number;
let tester2Id: number;
let viewerId: number;
let outsiderId: number;
let inactiveId: number;
let lead: Client;
let tester: Client;
let viewer: Client;
let P: string;
let projectId: number;
let suite: Suite;
const c: Record<string, { id: number; displayId: string }> = {};
let docSeq = 0;

beforeAll(async () => {
  t = await createTestApp();
  leadId = (await createUser(t.prisma, 'lead')).id;
  testerId = (await createUser(t.prisma, 'tester')).id;
  tester2Id = (await createUser(t.prisma, 'tester2')).id;
  viewerId = (await createUser(t.prisma, 'viewer')).id;
  outsiderId = (await createUser(t.prisma, 'outsider')).id;
  inactiveId = (await createUser(t.prisma, 'inactive', { isActive: false })).id;
  await setDisplayName(t, leadId, 'Lead Person');
  await setDisplayName(t, testerId, 'Tester One');
  await setDisplayName(t, tester2Id, 'Tester Two');
  projectId = (
    await createProject(t.prisma, 'WRUN', [
      { userId: leadId, role: 'lead' },
      { userId: testerId, role: 'tester' },
      { userId: tester2Id, role: 'tester' },
      { userId: viewerId, role: 'viewer' },
      { userId: inactiveId, role: 'tester' },
    ])
  ).id;
  await createProject(t.prisma, 'WRX', [{ userId: outsiderId, role: 'tester' }]);
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');

  suite = await createSuite(t, projectId, {
    name: 'Run suite',
    prefix: 'RN',
    envTemplate: ['Phone', 'OS'],
  });
  const otherSuite = await createSuite(t, projectId, { name: 'Other suite', prefix: 'OT' });
  const secA = await createSection(t, suite.id, 'A');
  const secA1 = await createSection(t, suite.id, 'A.1', secA.id);
  const secB = await createSection(t, suite.id, 'B');
  const loginStep = await createSharedStep(t, projectId, 'Login', [
    { action: 'Open app', expected: 'Login page' },
    { action: 'Sign in', expected: 'Home' },
  ]);
  const add = async (key: string, body: Parameters<typeof createCase>[3], s = suite) => {
    c[key] = await createCase(t, s, leadId, body);
  };
  await add('alpha', {
    title: 'Alpha',
    sectionId: secA.id,
    priority: 'critical',
    tags: ['Smoke'],
    estimateMinutes: 10,
    references: 'REQ-1',
  });
  await add('beta', {
    title: 'Beta',
    sectionId: secA1.id,
    priority: 'high',
    tags: ['smoke', 'UI'],
    estimateMinutes: 20,
    template: 'steps',
    steps: [
      { kind: 'shared', sharedStepId: loginStep.id },
      { kind: 'step', action: 'Tap power', expected: 'Unit ON' },
    ],
  });
  await add('gamma', { title: 'Gamma', sectionId: secB.id, priority: 'low', estimateMinutes: 5 });
  await add('delta', { title: 'Delta', status: 'draft' });
  await add('epsilon', { title: 'Epsilon', sectionId: secB.id, status: 'draft' });
  // Submitted for review (the review endpoints belong to the library module).
  await t.prisma.db.testCase.update({
    where: { id: c.epsilon!.id },
    data: { status: 'in_review' },
  });
  await add('foreign', { title: 'Foreign' }, otherSuite);
});
afterAll(() => t.close());

async function newPlan(): Promise<PlanDTO> {
  docSeq++;
  return expectBody<PlanDTO>(
    await tester.post(`${P}/plans`, { docNo: `W1-RUN-${docSeq}`, title: `Plan ${docSeq}` }),
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
function setResult(api: Client, rcId: number, body: Record<string, unknown>) {
  return api.put(`${P}/run-cases/${rcId}/result`, body);
}

describe('run snapshots and case filters', () => {
  it('copies priority, tags, estimate, references and flattened steps', async () => {
    const plan = await newPlan();
    const run = await newRun(plan.id, 'SNAP', { priorities: ['critical', 'high'] });
    expect(run.estimate).toEqual({ totalMinutes: 30, remainingMinutes: 30 });
    const rcs = await runCases(run.id);
    expect(rcs.map((rc) => rc.title)).toEqual(['Alpha', 'Beta']);
    expect(rcs[0]).toMatchObject({
      priority: 'critical',
      tags: ['Smoke'],
      estimateMinutes: 10,
      references: 'REQ-1',
      template: 'text',
      steps: [],
      assignee: null,
      stepResults: null,
    });
    expect(rcs[1]).toMatchObject({ priority: 'high', tags: ['smoke', 'UI'], template: 'steps' });
    expect(rcs[1]!.steps).toEqual([
      { action: 'Open app', expected: 'Login page', sharedStepName: 'Login' },
      { action: 'Sign in', expected: 'Home', sharedStepName: 'Login' },
      { action: 'Tap power', expected: 'Unit ON', sharedStepName: null },
    ]);
  });

  it('filters by tag, explicit cases and review status (ANDed)', async () => {
    const plan = await newPlan();
    const titles = async (code: string, extra: Record<string, unknown>) =>
      (await runCases((await newRun(plan.id, code, extra)).id)).map((rc) => rc.title);
    expect(await titles('TAG', { tags: ['SMOKE'] })).toEqual(['Alpha', 'Beta']);
    expect(await titles('IDS', { caseIds: [c.gamma!.id, c.alpha!.id] })).toEqual([
      'Alpha',
      'Gamma',
    ]);
    expect(await titles('REV', { caseStatuses: ['in_review'] })).toEqual(['Epsilon']);
    const foreign = await tester.post(`${P}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: 'BAD',
      caseIds: [c.foreign!.id],
    });
    expect(foreign.status).toBe(422);
    expect(errorCode(foreign)).toBe('BAD_CASE');
    const none = await tester.post(`${P}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: 'NONE',
      priorities: ['low'],
      tags: ['smoke'],
    });
    expect(errorCode(none)).toBe('NO_CASES');
  });
});

describe('adding and removing run cases', () => {
  it('adds library cases at the end in tree order, skipping cases already in the run', async () => {
    const plan = await newPlan();
    const run = await newRun(plan.id, 'ADD', { caseIds: [c.gamma!.id] });
    const res = expectBody<{ added: number }>(
      await tester.post(`${P}/runs/${run.id}/cases`, { caseStatuses: ['draft', 'ready'] }),
      200,
    );
    expect(res.added).toBe(3);
    const rcs = await runCases(run.id);
    expect(rcs.map((rc) => rc.title)).toEqual(['Gamma', 'Delta', 'Alpha', 'Beta']);
    expect(rcs.map((rc) => rc.sortOrder)).toEqual([1, 2, 3, 4]);
    expect(
      expectBody<{ added: number }>(
        await tester.post(`${P}/runs/${run.id}/cases`, { caseStatuses: ['draft', 'ready'] }),
        200,
      ).added,
    ).toBe(0);
    expect(
      errorCode(await tester.post(`${P}/runs/${run.id}/cases`, { sectionIds: [999999] })),
    ).toBe('BAD_SECTION');
    expect(
      errorCode(await tester.post(`${P}/runs/${run.id}/cases`, { caseIds: [c.foreign!.id] })),
    ).toBe('BAD_CASE');
    expect((await viewer.post(`${P}/runs/${run.id}/cases`, {})).status).toBe(403);
    const activity = expectBody<ActivityDTO[]>(
      await viewer.get(`${P}/activity?entityType=run&entityId=${run.id}`),
      200,
    );
    expect(activity[0]!.action).toBe('cases_added');
  });

  it('removes untested run cases; executed ones need a lead', async () => {
    const plan = await newPlan();
    const run = await newRun(plan.id, 'REM', { caseStatuses: ['draft', 'ready'] });
    const other = await newRun(plan.id, 'REM2', { caseIds: [c.alpha!.id] });
    const rcs = await runCases(run.id);
    expect(rcs).toHaveLength(4);
    expectBody(await setResult(tester, rcs[0]!.id, { status: 'ng' }), 200);
    const evidence = await addAttachment(t, projectId, 'run_case', rcs[0]!.id, 'log.txt', 'trace');
    expect(fs.existsSync(evidence.path)).toBe(true);

    const denied = await tester.post(`${P}/runs/${run.id}/cases/remove`, {
      runCaseIds: [rcs[0]!.id, rcs[1]!.id],
    });
    expect(denied.status).toBe(403);
    expect(errorCode(denied)).toBe('EXECUTED_RUN_CASES');
    expect(await runCases(run.id)).toHaveLength(4);

    const foreign = await tester.post(`${P}/runs/${run.id}/cases/remove`, {
      runCaseIds: [rcs[1]!.id, (await runCases(other.id))[0]!.id],
    });
    expect(foreign.status).toBe(422);
    expect(errorCode(foreign)).toBe('BAD_RUN_CASE');

    expect(
      expectBody<{ removed: number }>(
        await tester.post(`${P}/runs/${run.id}/cases/remove`, { runCaseIds: [rcs[1]!.id] }),
        200,
      ).removed,
    ).toBe(1);
    expect(
      expectBody<{ removed: number }>(
        await lead.post(`${P}/runs/${run.id}/cases/remove`, { runCaseIds: [rcs[0]!.id] }),
        200,
      ).removed,
    ).toBe(1);
    expect((await runCases(run.id)).map((rc) => rc.id)).toEqual([rcs[2]!.id, rcs[3]!.id]);
    expect(fs.existsSync(evidence.path)).toBe(false);
    expect(expectBody<RunDTO>(await viewer.get(`${P}/runs/${run.id}`), 200).counts.ng).toBe(0);
  });
});

describe('assignment', () => {
  it('assigns run cases to active testers/leads of the project and unassigns', async () => {
    const plan = await newPlan();
    const run = await newRun(plan.id, 'ASG', { testerId });
    const rcs = await runCases(run.id);
    const ids = rcs.slice(0, 2).map((rc) => rc.id);
    expect(
      expectBody<{ affected: number }>(
        await tester.post(`${P}/runs/${run.id}/assign`, { runCaseIds: ids, assigneeId: tester2Id }),
        200,
      ).affected,
    ).toBe(2);
    let after = await runCases(run.id);
    expect(after.map((rc) => rc.assignee?.id ?? null)).toEqual([tester2Id, tester2Id, null]);
    expectBody(
      await tester.post(`${P}/runs/${run.id}/assign`, { runCaseIds: [ids[0]], assigneeId: null }),
      200,
    );
    after = await runCases(run.id);
    expect(after[0]!.assignee).toBeNull();
    expect(after[1]!.assignee).toMatchObject({ id: tester2Id, displayName: 'Tester Two' });

    for (const bad of [viewerId, outsiderId, inactiveId, 999999]) {
      const res = await tester.post(`${P}/runs/${run.id}/assign`, {
        runCaseIds: ids,
        assigneeId: bad,
      });
      expect(res.status).toBe(422);
      expect(errorCode(res)).toBe('UNKNOWN_USER');
    }
    expect(
      errorCode(
        await tester.post(`${P}/runs/${run.id}/assign`, {
          runCaseIds: [999999],
          assigneeId: leadId,
        }),
      ),
    ).toBe('BAD_RUN_CASE');
    expect(
      (await viewer.post(`${P}/runs/${run.id}/assign`, { runCaseIds: ids, assigneeId: leadId }))
        .status,
    ).toBe(403);
  });
});

describe('step results', () => {
  it('validates the step count and stores step results on the run case and in history', async () => {
    const plan = await newPlan();
    const run = await newRun(plan.id, 'STEP', { caseIds: [c.beta!.id, c.alpha!.id] });
    const [alpha, beta] = await runCases(run.id);
    expect(beta!.steps).toHaveLength(3);
    const wrong = await setResult(tester, beta!.id, {
      status: 'ng',
      stepResults: [{ status: 'ok' }],
    });
    expect(wrong.status).toBe(422);
    expect(wrong.body).toMatchObject({
      error: { code: 'STEP_COUNT_MISMATCH', details: { expected: 3, received: 1 } },
    });
    expect(
      errorCode(
        await setResult(tester, alpha!.id, { status: 'ok', stepResults: [{ status: 'ok' }] }),
      ),
    ).toBe('STEP_COUNT_MISMATCH');

    const ng = expectBody<RunCaseDTO>(
      await setResult(tester, beta!.id, {
        status: 'ng',
        actualResult: 'Stuck at sign in',
        stepResults: [
          { status: 'ok' },
          { status: 'ng', actual: 'Spinner forever\r\n' },
          { status: 'untested' },
        ],
      }),
      200,
    );
    expect(ng.stepResults).toEqual([
      { status: 'ok', actual: '' },
      { status: 'ng', actual: 'Spinner forever' },
      { status: 'untested', actual: '' },
    ]);
    // Omitted keeps, null clears.
    const kept = expectBody<RunCaseDTO>(
      await setResult(tester, beta!.id, { status: 'blocked' }),
      200,
    );
    expect(kept.stepResults).toHaveLength(3);
    const cleared = expectBody<RunCaseDTO>(
      await setResult(tester, beta!.id, { status: 'ok', stepResults: null }),
      200,
    );
    expect(cleared.stepResults).toBeNull();
    const detail = expectBody<RunCaseDetailDTO>(
      await viewer.get(`${P}/run-cases/${beta!.id}`),
      200,
    );
    expect(detail.history.map((h) => [h.status, h.stepResults?.length ?? null, h.source])).toEqual([
      ['ok', null, 'ui'],
      ['blocked', 3, 'ui'],
      ['ng', 3, 'ui'],
    ]);
    // Text cases accept an empty list.
    expect(
      expectBody<RunCaseDTO>(
        await setResult(tester, alpha!.id, { status: 'ok', stepResults: [] }),
        200,
      ).stepResults,
    ).toBeNull();
  });
});

describe('re-run and duplicate', () => {
  let plan: PlanDTO;
  let source: RunDTO;
  let srcCases: RunCaseDTO[];
  beforeAll(async () => {
    plan = await newPlan();
    source = await newRun(plan.id, 'SRC', {
      scenario: 'Android 16',
      testerId,
      environment: [
        { label: 'Phone', value: 'Pixel' },
        { label: 'OS', value: '16' },
      ],
    });
    srcCases = await runCases(source.id); // Alpha, Beta, Gamma
    expectBody(await setResult(tester, srcCases[0]!.id, { status: 'ng' }), 200);
    expectBody(await setResult(tester, srcCases[1]!.id, { status: 'ok' }), 200);
    expectBody(await setResult(tester, srcCases[2]!.id, { status: 'blocked' }), 200);
    expectBody(
      await tester.post(`${P}/runs/${source.id}/assign`, {
        runCaseIds: [srcCases[2]!.id],
        assigneeId: tester2Id,
      }),
      200,
    );
  });

  it('creates a run with the NG/Blocked cases of the source run', async () => {
    const rerun = expectBody<RunDTO>(
      await tester.post(`${P}/runs/${source.id}/rerun`, { code: 'SRC (re-run)' }),
      201,
    );
    expect(rerun).toMatchObject({
      code: 'SRC (re-run)',
      scenario: 'Android 16',
      sourceRun: { id: source.id, code: 'SRC' },
      tester: { id: testerId },
      environment: [
        { label: 'Phone', value: 'Pixel' },
        { label: 'OS', value: '16' },
      ],
      counts: { untested: 2 },
    });
    const rcs = await runCases(rerun.id);
    expect(rcs.map((rc) => [rc.title, rc.status, rc.assignee?.id ?? null])).toEqual([
      ['Alpha', 'untested', null],
      ['Gamma', 'untested', tester2Id],
    ]);
    const planDto = expectBody<PlanDTO>(await viewer.get(`${P}/plans/${plan.id}`), 200);
    expect(planDto.runs.find((r) => r.id === rerun.id)!.sourceRun).toEqual({
      id: source.id,
      code: 'SRC',
    });
    const activity = expectBody<ActivityDTO[]>(
      await viewer.get(`${P}/activity?entityType=run&entityId=${rerun.id}`),
      200,
    );
    expect(activity[0]!.action).toBe('rerun_created');

    const dup = await tester.post(`${P}/runs/${source.id}/rerun`, { code: 'SRC (re-run)' });
    expect(dup.status).toBe(409);
    expect(errorCode(dup)).toBe('RUN_CODE_TAKEN');
    const none = await tester.post(`${P}/runs/${source.id}/rerun`, {
      code: 'NOTHING',
      statuses: ['nt'],
    });
    expect(none.status).toBe(422);
    expect(errorCode(none)).toBe('NO_CASES');
    expect((await viewer.post(`${P}/runs/${source.id}/rerun`, { code: 'V' })).status).toBe(403);
  });

  it('honours statuses, environment, tester and assignee options', async () => {
    const rerun = expectBody<RunDTO>(
      await tester.post(`${P}/runs/${source.id}/rerun`, {
        code: 'OPT',
        scenario: '',
        statuses: ['blocked'],
        copyEnvironment: false,
        testerId: null,
        keepAssignees: false,
      }),
      201,
    );
    expect(rerun).toMatchObject({
      scenario: null,
      tester: null,
      environment: [
        { label: 'Phone', value: '' },
        { label: 'OS', value: '' },
      ],
    });
    expect((await runCases(rerun.id)).map((rc) => [rc.title, rc.assignee])).toEqual([
      ['Gamma', null],
    ]);
    expect(
      (await tester.post(`${P}/runs/${source.id}/rerun`, { code: 'X', statuses: ['ok'] })).status,
    ).toBe(400);
    const env = expectBody<RunDTO>(
      await tester.post(`${P}/runs/${source.id}/rerun`, {
        code: 'ENV',
        environment: [{ label: 'Phone', value: 'iPhone' }],
      }),
      201,
    );
    expect(env.environment).toEqual([{ label: 'Phone', value: 'iPhone' }]);
  });

  it('keeps the old snapshot unless refreshFromLibrary (deleted cases keep it anyway)', async () => {
    const kept1 = await createCase(t, suite, leadId, { title: 'Kept', priority: 'high' });
    const extra = await createCase(t, suite, leadId, { title: 'Temporary' });
    const run = await newRun(plan.id, 'SNAPSRC', { caseIds: [kept1.id, extra.id] });
    for (const rc of await runCases(run.id)) {
      expectBody(await setResult(tester, rc.id, { status: 'ng' }), 200);
    }
    await t.prisma.db.testCase.update({
      where: { id: kept1.id },
      data: { title: 'Kept (v2)', priority: 'low', version: { increment: 1 } },
    });
    await t.prisma.db.testCase.update({ where: { id: extra.id }, data: { isDeleted: true } });
    const kept = expectBody<RunDTO>(
      await tester.post(`${P}/runs/${run.id}/rerun`, { code: 'KEEP' }),
      201,
    );
    expect((await runCases(kept.id)).map((rc) => rc.title)).toEqual(['Kept', 'Temporary']);
    const fresh = expectBody<RunDTO>(
      await tester.post(`${P}/runs/${run.id}/rerun`, { code: 'FRESH', refreshFromLibrary: true }),
      201,
    );
    const rcs = await runCases(fresh.id);
    expect(rcs.map((rc) => [rc.title, rc.priority])).toEqual([
      ['Kept (v2)', 'low'],
      ['Temporary', 'medium'],
    ]);
    // The new library cases must not leak into later runs of this file.
    await t.prisma.db.testCase.update({ where: { id: kept1.id }, data: { isDeleted: true } });
  });

  it('duplicates a run with the same snapshot (steps included) and fresh results', async () => {
    const run = await newRun(plan.id, 'DUPSRC', { caseIds: [c.beta!.id] });
    const [rc] = await runCases(run.id);
    expectBody(
      await setResult(tester, rc!.id, {
        status: 'ok',
        stepResults: [{ status: 'ok' }, { status: 'ok' }, { status: 'ok' }],
      }),
      200,
    );
    const dup = expectBody<RunDTO>(
      await tester.post(`${P}/runs/${run.id}/duplicate`, { code: 'DUP' }),
      201,
    );
    expect(dup.sourceRun).toBeNull();
    const [copy] = await runCases(dup.id);
    expect(copy).toMatchObject({
      title: 'Beta',
      priority: 'high',
      tags: ['smoke', 'UI'],
      template: 'steps',
      status: 'untested',
      stepResults: null,
    });
    expect(copy!.steps).toEqual(rc!.steps);
  });
});

describe('completed plans', () => {
  it('refuses run changes with PLAN_LOCKED', async () => {
    const plan = await newPlan();
    const run = await newRun(plan.id, 'LOCK');
    const rcs = await runCases(run.id);
    expectBody(await setResult(tester, rcs[0]!.id, { status: 'ng' }), 200);
    expectBody(await tester.post(`${P}/plans/${plan.id}/complete`), 200);
    const attempts = [
      await tester.post(`${P}/runs/${run.id}/cases`, {}),
      await lead.post(`${P}/runs/${run.id}/cases/remove`, { runCaseIds: [rcs[1]!.id] }),
      await tester.post(`${P}/runs/${run.id}/rerun`, { code: 'LOCK2' }),
      await tester.post(`${P}/runs/${run.id}/assign`, {
        runCaseIds: [rcs[0]!.id],
        assigneeId: testerId,
      }),
      await setResult(tester, rcs[0]!.id, { status: 'ok' }),
    ];
    expect(attempts.map((r) => `${r.status} ${errorCode(r)}`)).toEqual(
      Array(attempts.length).fill('409 PLAN_LOCKED'),
    );
  });
});

describe('run report', () => {
  let plan: PlanDTO;
  let run: RunDTO;
  let rcs: RunCaseDTO[];
  beforeAll(async () => {
    plan = await newPlan();
    run = await newRun(plan.id, 'REPORT', {
      scenario: 'Report scenario',
      testerId,
      testedDate: '2026-10-20',
      environment: [
        { label: 'Phone', value: 'Pixel 9' },
        { label: 'OS', value: 'Android 16' },
        { label: 'App version', value: '1.2.3' },
      ],
    });
    rcs = await runCases(run.id); // Alpha (A), Beta (A > A.1, steps), Gamma (B)
    expectBody(
      await tester.post(`${P}/runs/${run.id}/assign`, {
        runCaseIds: [rcs[2]!.id],
        assigneeId: tester2Id,
      }),
      200,
    );
    expectBody(await setResult(tester, rcs[0]!.id, { status: 'ok', elapsedSec: 90 }), 200);
    expectBody(
      await setResult(tester, rcs[1]!.id, {
        status: 'ng',
        actualResult: 'No response',
        remark: 'Retest on FW 1.3',
        elapsedSec: 30,
        stepResults: [
          { status: 'ok' },
          { status: 'ng', actual: 'Timeout' },
          { status: 'untested' },
        ],
      }),
      200,
    );
    await createDefect(t, projectId, {
      title: 'Sign in times out',
      severity: 'critical',
      runCaseId: rcs[1]!.id,
      externalKey: 'ACS-77',
    });
  });

  it('returns the PractiTest-style report with local times', async () => {
    const r = expectBody<RunReportDTO>(await viewer.get(`${P}/runs/${run.id}/report`), 200);
    expect(r).toMatchObject({
      timezone: 'Asia/Bangkok',
      generatedBy: { username: 'viewer' },
      project: { key: 'WRUN' },
      plan: { id: plan.id, docNo: plan.docNo, status: 'in_progress', release: null },
      run: {
        id: run.id,
        code: 'REPORT',
        scenario: 'Report scenario',
        suite: { id: suite.id, prefix: 'RN' },
        tester: { id: testerId },
        testedDate: '2026-10-20',
        judgement: null,
        suggestedJudgement: 'not_pass',
        sourceRun: null,
      },
      estimate: { totalMinutes: 35, remainingMinutes: 5 },
      actualDurationSec: 120,
      counts: { ok: 1, ng: 1, untested: 1 },
      passRate: 0.5,
    });
    expect(r.progress).toBeCloseTo(2 / 3);
    expect(r.run.environment).toHaveLength(3);
    for (const v of [r.generatedAt, r.run.createdAt, r.firstExecutedAt, r.lastExecutedAt]) {
      expect(v).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+07:00$/);
    }
    expect(new Date(r.firstExecutedAt!).getTime()).toBeLessThanOrEqual(
      new Date(r.lastExecutedAt!).getTime(),
    );
    expect(r.sections).toEqual([
      { path: ['A'], counts: expect.objectContaining({ ok: 1, ng: 1 }) },
      { path: ['B'], counts: expect.objectContaining({ untested: 1 }) },
    ]);
    const [alpha, beta, gamma] = r.cases;
    expect(alpha).toMatchObject({
      displayId: c.alpha!.displayId,
      priority: 'critical',
      status: 'ok',
      assignee: { id: testerId }, // effective assignee = run tester
      executedBy: { id: testerId },
      elapsedSec: 90,
      steps: [],
      defects: [],
    });
    expect(alpha!.executedAt).toMatch(/\+07:00$/);
    expect(beta).toMatchObject({
      status: 'ng',
      actualResult: 'No response',
      resultRemark: 'Retest on FW 1.3',
      defects: [{ title: 'Sign in times out', severity: 'critical', externalKey: 'ACS-77' }],
    });
    expect(beta!.steps.map((s) => [s.action, s.status, s.actual, s.sharedStepName])).toEqual([
      ['Open app', 'ok', '', 'Login'],
      ['Sign in', 'ng', 'Timeout', 'Login'],
      ['Tap power', 'untested', '', null],
    ]);
    expect(gamma).toMatchObject({
      status: 'untested',
      assignee: { id: tester2Id },
      executedAt: null,
    });
    expect(r.defects).toEqual([
      expect.objectContaining({ key: expect.stringMatching(/^BUG-\d+$/), externalKey: 'ACS-77' }),
    ]);
    expect((await viewer.get(`${P}/runs/999999/report`)).status).toBe(404);
  });

  it('exports the report as xlsx: Summary (formulas), Results and Steps', async () => {
    const res = await binary(viewer.get(`${P}/runs/${run.id}/report.xlsx`));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(String(res.headers['content-disposition'])).toContain(
      `filename*=UTF-8''${encodeURIComponent(`${plan.docNo} REPORT run report.xlsx`)}`,
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Results', 'Steps']);

    const results = wb.getWorksheet('Results')!;
    expect((results.getRow(1).values as unknown[]).slice(1)).toEqual([
      '#',
      'ID',
      'Code',
      'Section',
      'Title',
      'Type',
      'Priority',
      'Status',
      'Assignee',
      'Executed by',
      'Executed at',
      'Elapsed',
      'Actual result',
      'Remark',
      'Defects',
    ]);
    expect([2, 3, 4].map((r) => results.getCell(`H${r}`).value)).toEqual(['OK', 'NG', null]);
    expect(results.getCell('D3').value).toBe('A / A.1');
    expect(results.getCell('I4').value).toBe('Tester Two');
    expect(results.getCell('O3').value).toMatch(/^BUG-\d+ \(ACS-77\)$/);
    expect(results.getCell('K2').value).toBeInstanceOf(Date);
    expect(results.getCell('K2').numFmt).toBe('yyyy-mm-dd hh:mm');
    // Elapsed is an Excel duration (90 s) — ExcelJS reads time-formatted numbers back as dates.
    expect(results.getCell('L2').numFmt).toBe('[h]:mm:ss');
    expect(results.getCell('L2').value).toEqual(new Date(Date.UTC(1899, 11, 30, 0, 1, 30)));
    expect(results.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });

    const zip = await JSZip.loadAsync(res.body as Buffer);
    const sheet2 = await zip.file('xl/worksheets/sheet2.xml')!.async('string');
    expect(sheet2).toContain('<autoFilter ref="A1:O4"/>');

    const steps = wb.getWorksheet('Steps')!;
    expect(steps.rowCount).toBe(4);
    expect(steps.getCell('F3').value).toBe('Sign in');
    expect(steps.getCell('H3').value).toBe('NG');
    expect(steps.getCell('I3').value).toBe('Timeout');

    const summary = wb.getWorksheet('Summary')!;
    expect(summary.getCell('A1').value).toBe('Test run report — REPORT');
    const rows: Record<string, { b: unknown; c: unknown }> = {};
    summary.eachRow((row) => {
      const key = row.getCell(1).value;
      if (typeof key === 'string') rows[key] = { b: row.getCell(2).value, c: row.getCell(3).value };
    });
    expect(rows['Test run']!.b).toBe('REPORT');
    expect(rows['App version']!.b).toBe('1.2.3');
    expect(rows.Phone!.b).toBe('Pixel 9');
    expect(rows['Tested date']!.b).toEqual(new Date(Date.UTC(2026, 9, 20)));
    expect(rows.NG!.b).toEqual({ formula: 'COUNTIF(Results!$H$2:$H$4,"NG")', result: 1 });
    expect(rows.OK!.b).toMatchObject({ result: 1 });
    expect(rows.Untested!.b).toMatchObject({ result: 1 });
    expect(rows.Total!.b).toEqual({ formula: 'COUNTA(Results!$A$2:$A$4)', result: 3 });
    expect(rows['Pass rate']!.b).toMatchObject({ result: 0.5 });
    expect(String((rows['Pass rate']!.b as { formula: string }).formula)).toContain('IF(');
  });

  it('leaves out the Steps sheet when no step cases are in the run', async () => {
    const plain = await newRun(plan.id, 'PLAIN', { caseIds: [c.gamma!.id] });
    const res = await binary(viewer.get(`${P}/runs/${plain.id}/report.xlsx`));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Results']);
  });
});
