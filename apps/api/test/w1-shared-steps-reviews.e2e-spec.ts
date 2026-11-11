/**
 * W1 — shared steps CRUD (incl. inline delete), review workflow, review queue and tags (port of
 * the old w1-shared-steps-reviews.test.ts). Review comments are read from the database because the
 * comments endpoint belongs to the collaboration module.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type {
  ActivityDTO,
  CaseVersionDTO,
  SharedStepDetailDTO,
  SharedStepDTO,
  SuiteDTO,
  TagCountDTO,
  TestCaseDTO,
} from '@tmt/shared';
import {
  createProject,
  createTestApp,
  createUser,
  errorCode,
  expectStatus,
  login,
  type Client,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let leadId: number;
let lead2Id: number;
let testerId: number;
let outsiderId: number;
let lead: Client;
let lead2: Client;
let tester: Client;
let viewer: Client;
let projectId: number;
let P: string;
let suite: SuiteDTO;

beforeAll(async () => {
  t = await createTestApp();
  leadId = (await createUser(t.prisma, 'lead')).id;
  lead2Id = (await createUser(t.prisma, 'lead2')).id;
  testerId = (await createUser(t.prisma, 'tester')).id;
  outsiderId = (await createUser(t.prisma, 'outsider')).id;
  const viewerId = (await createUser(t.prisma, 'viewer')).id;
  projectId = (
    await createProject(t.prisma, 'WSS', [
      { userId: leadId, role: 'lead' },
      { userId: lead2Id, role: 'lead' },
      { userId: testerId, role: 'tester' },
      { userId: viewerId, role: 'viewer' },
    ])
  ).id;
  await createProject(t.prisma, 'WSX', [{ userId: outsiderId, role: 'lead' }]);
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  lead2 = await login(t, 'lead2');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');
  suite = await expectStatus<SuiteDTO>(
    lead.post(`${P}/suites`, { name: 'Shared suite', prefix: 'SS' }),
    201,
  );
});
afterAll(() => t.close());

function newCase(client: Client, body: object): Promise<TestCaseDTO> {
  return expectStatus<TestCaseDTO>(client.post(`${P}/suites/${suite.id}/cases`, body), 201);
}
function getCase(id: number): Promise<TestCaseDTO> {
  return expectStatus<TestCaseDTO>(viewer.get(`${P}/cases/${id}`), 200);
}
function newShared(name: string, steps: { action: string; expected?: string }[]) {
  return expectStatus<SharedStepDTO>(tester.post(`${P}/shared-steps`, { name, steps }), 201);
}
async function commentBodies(caseId: number): Promise<string[]> {
  const rows = await t.prisma.db.comment.findMany({
    where: { entityType: 'test_case', entityId: caseId },
    orderBy: { id: 'asc' },
  });
  return rows.map((c) => c.body);
}
function caseActivity(caseId: number): Promise<ActivityDTO[]> {
  return expectStatus<ActivityDTO[]>(
    viewer.get(`${P}/activity?entityType=test_case&entityId=${caseId}`),
    200,
  );
}

describe('shared steps', () => {
  let loginStep: SharedStepDTO;
  let user1: TestCaseDTO;
  let user2: TestCaseDTO;

  it('creates shared steps (tester) with unique names', async () => {
    loginStep = await newShared('Log in', [
      { action: 'Open the app  ', expected: 'Login page' },
      { action: 'Sign in' },
    ]);
    expect(loginStep).toMatchObject({
      projectId,
      name: 'Log in',
      description: null,
      version: 1,
      usageCount: 0,
      createdBy: { id: testerId },
      steps: [
        { action: 'Open the app', expected: 'Login page' },
        { action: 'Sign in', expected: '' },
      ],
    });
    const dup = await tester.post(`${P}/shared-steps`, {
      name: 'LOG IN',
      steps: [{ action: 'x' }],
    });
    expect(dup.status).toBe(409);
    expect(errorCode(dup)).toBe('SHARED_STEP_NAME_TAKEN');
    expect((await tester.post(`${P}/shared-steps`, { name: 'Empty', steps: [] })).status).toBe(400);
    expect(
      (await viewer.post(`${P}/shared-steps`, { name: 'V', steps: [{ action: 'x' }] })).status,
    ).toBe(403);
  });

  it('counts and lists the cases that use a shared step', async () => {
    await newShared('Another', [{ action: 'Other' }]);
    user1 = await newCase(tester, {
      title: 'Uses login',
      template: 'steps',
      steps: [
        { kind: 'shared', sharedStepId: loginStep.id },
        { kind: 'step', action: 'Check home', expected: 'Greeting' },
      ],
    });
    user2 = await newCase(tester, {
      title: 'Uses login twice',
      template: 'steps',
      steps: [
        { kind: 'shared', sharedStepId: loginStep.id },
        { kind: 'shared', sharedStepId: loginStep.id },
      ],
    });
    const gone = await newCase(tester, {
      title: 'Deleted user',
      template: 'steps',
      steps: [{ kind: 'shared', sharedStepId: loginStep.id }],
    });
    expect((await lead.delete(`${P}/cases/${gone.id}`)).status).toBe(204);

    const list = await expectStatus<SharedStepDTO[]>(viewer.get(`${P}/shared-steps`), 200);
    expect(list.map((s) => [s.name, s.usageCount])).toEqual([
      ['Another', 0],
      ['Log in', 2],
    ]);
    const detail = await expectStatus<SharedStepDetailDTO>(
      viewer.get(`${P}/shared-steps/${loginStep.id}`),
      200,
    );
    expect(detail.usageCount).toBe(2);
    expect(detail.usedBy).toEqual([
      {
        id: user1.id,
        suiteId: suite.id,
        displayId: user1.displayId,
        code: null,
        title: 'Uses login',
      },
      {
        id: user2.id,
        suiteId: suite.id,
        displayId: user2.displayId,
        code: null,
        title: 'Uses login twice',
      },
    ]);
    const missing = await viewer.get(`${P}/shared-steps/999999`);
    expect(missing.status).toBe(404);
    expect(errorCode(missing)).toBe('SHARED_STEP_NOT_FOUND');
  });

  it('updates with optimistic concurrency; cases show the new steps', async () => {
    const u = await expectStatus<SharedStepDTO>(
      tester.patch(`${P}/shared-steps/${loginStep.id}`, {
        description: 'Standard login',
        steps: [{ action: 'Open the app', expected: 'Login page' }, { action: 'Sign in (SSO)' }],
        version: 1,
      }),
      200,
    );
    expect(u).toMatchObject({ version: 2, description: 'Standard login', usageCount: 2 });
    const stale = await tester.patch(`${P}/shared-steps/${loginStep.id}`, {
      name: 'Stale',
      version: 1,
    });
    expect(stale.status).toBe(409);
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    const taken = await tester.patch(`${P}/shared-steps/${loginStep.id}`, { name: 'another' });
    expect(errorCode(taken)).toBe('SHARED_STEP_NAME_TAKEN');
    const c = await getCase(user1.id);
    expect(c.steps[0]).toMatchObject({
      kind: 'shared',
      name: 'Log in',
      steps: [
        { action: 'Open the app', expected: 'Login page' },
        { action: 'Sign in (SSO)', expected: '' },
      ],
    });
  });

  it('refuses to delete a used shared step unless it is inlined (lead only)', async () => {
    expect((await tester.delete(`${P}/shared-steps/${loginStep.id}`)).status).toBe(403);
    const busy = await lead.delete(`${P}/shared-steps/${loginStep.id}`);
    expect(busy.status).toBe(409);
    expect(busy.body).toMatchObject({
      error: { code: 'SHARED_STEP_IN_USE', details: { usageCount: 2 } },
    });
    const before = await getCase(user2.id);
    expect((await lead.delete(`${P}/shared-steps/${loginStep.id}?inline=true`)).status).toBe(204);
    expect((await viewer.get(`${P}/shared-steps/${loginStep.id}`)).status).toBe(404);

    const after1 = await getCase(user1.id);
    expect(after1.steps).toEqual([
      { kind: 'step', action: 'Open the app', expected: 'Login page' },
      { kind: 'step', action: 'Sign in (SSO)', expected: '' },
      { kind: 'step', action: 'Check home', expected: 'Greeting' },
    ]);
    const after2 = await getCase(user2.id);
    expect(after2.steps).toHaveLength(4);
    expect(after2.version).toBe(before.version + 1);
    const versions = await expectStatus<CaseVersionDTO[]>(
      viewer.get(`${P}/cases/${user2.id}/versions`),
      200,
    );
    expect((versions[0]!.data.steps as unknown[]).length).toBe(4);
    expect((await caseActivity(user2.id))[0]).toMatchObject({
      action: 'updated',
      summary: `Inlined shared step Log in into ${user2.displayId} Uses login twice`,
    });
    const unused = (await expectStatus<SharedStepDTO[]>(viewer.get(`${P}/shared-steps`), 200)).find(
      (s) => s.name === 'Another',
    )!;
    expect((await lead.delete(`${P}/shared-steps/${unused.id}`)).status).toBe(204);
  });
});

describe('review workflow', () => {
  let c: TestCaseDTO;
  beforeAll(async () => {
    c = await newCase(tester, { title: 'Review me', status: 'draft', tags: ['Smoke'] });
  });

  it('submits a case for review with a reviewer and a note', async () => {
    for (const reviewerId of [testerId, outsiderId, 999999]) {
      const bad = await tester.post(`${P}/cases/${c.id}/submit-review`, { reviewerId });
      expect(bad.status).toBe(422);
      expect(errorCode(bad)).toBe('BAD_REVIEWER');
    }
    expect((await viewer.post(`${P}/cases/${c.id}/submit-review`, {})).status).toBe(403);
    const r = await expectStatus<TestCaseDTO>(
      tester.post(`${P}/cases/${c.id}/submit-review`, {
        reviewerId: leadId,
        note: 'Please check the steps',
      }),
      200,
    );
    expect(r).toMatchObject({
      status: 'in_review',
      version: c.version + 1,
      review: {
        reviewer: { id: leadId },
        requestedBy: { id: testerId },
        reviewedBy: null,
        reviewedAt: null,
        note: 'Please check the steps',
      },
    });
    expect(r.review.requestedAt).not.toBeNull();
    const again = await tester.post(`${P}/cases/${c.id}/submit-review`, {});
    expect(again.status).toBe(409);
    expect(errorCode(again)).toBe('INVALID_REVIEW_STATE');

    expect(await commentBodies(c.id)).toEqual(['Review requested: Please check the steps']);
    expect((await caseActivity(c.id))[0]).toMatchObject({
      action: 'review_requested',
      user: { id: testerId },
    });
  });

  it('lists the review queue, oldest request first; mine = assigned to me or unassigned', async () => {
    const unassigned = await newCase(tester, { title: 'Anyone may review', status: 'draft' });
    await expectStatus(tester.post(`${P}/cases/${unassigned.id}/submit-review`, {}), 200);
    const forLead2 = await newCase(tester, { title: 'For lead 2', status: 'ready' });
    await expectStatus(
      tester.post(`${P}/cases/${forLead2.id}/submit-review`, { reviewerId: lead2Id }),
      200,
    );
    const all = await expectStatus<TestCaseDTO[]>(viewer.get(`${P}/reviews`), 200);
    expect(all.map((x) => x.title)).toEqual(['Review me', 'Anyone may review', 'For lead 2']);
    const mine = await expectStatus<TestCaseDTO[]>(lead.get(`${P}/reviews?mine=true`), 200);
    expect(mine.map((x) => x.title)).toEqual(['Review me', 'Anyone may review']);
    const mine2 = await expectStatus<TestCaseDTO[]>(lead2.get(`${P}/reviews?mine=1`), 200);
    expect(mine2.map((x) => x.title)).toEqual(['Anyone may review', 'For lead 2']);
  });

  it('lets leads request changes (note required) and approve', async () => {
    expect((await tester.post(`${P}/cases/${c.id}/review`, { decision: 'approve' })).status).toBe(
      403,
    );
    const noNote = await lead.post(`${P}/cases/${c.id}/review`, { decision: 'request_changes' });
    expect(noNote.status).toBe(422);
    expect(errorCode(noNote)).toBe('NOTE_REQUIRED');
    const back = await expectStatus<TestCaseDTO>(
      lead.post(`${P}/cases/${c.id}/review`, {
        decision: 'request_changes',
        note: 'Add the expected result of step 2',
      }),
      200,
    );
    expect(back).toMatchObject({
      status: 'draft',
      review: {
        reviewer: { id: leadId },
        reviewedBy: { id: leadId },
        note: 'Add the expected result of step 2',
      },
    });
    const notInReview = await lead.post(`${P}/cases/${c.id}/review`, { decision: 'approve' });
    expect(notInReview.status).toBe(409);
    expect(errorCode(notInReview)).toBe('INVALID_REVIEW_STATE');

    await expectStatus(tester.post(`${P}/cases/${c.id}/submit-review`, {}), 200);
    const ok = await expectStatus<TestCaseDTO>(
      lead.post(`${P}/cases/${c.id}/review`, { decision: 'approve' }),
      200,
    );
    expect(ok).toMatchObject({
      status: 'ready',
      review: { reviewedBy: { id: leadId }, note: null },
    });
    expect((await caseActivity(c.id)).map((a) => a.action).slice(0, 4)).toEqual([
      'review_approved',
      'review_requested',
      'review_changes_requested',
      'review_requested',
    ]);
    expect(await commentBodies(c.id)).toEqual([
      'Review requested: Please check the steps',
      'Changes requested: Add the expected result of step 2',
    ]);
  });

  it('is the only way for testers to get a case ready when review is required', async () => {
    await t.prisma.db.project.update({
      where: { id: projectId },
      data: { requireCaseReview: true },
    });
    try {
      const draft = await newCase(tester, { title: 'Under policy' });
      expect(draft.status).toBe('draft');
      await expectStatus(tester.post(`${P}/cases/${draft.id}/submit-review`, {}), 200);
      const approved = await expectStatus<TestCaseDTO>(
        lead.post(`${P}/cases/${draft.id}/review`, { decision: 'approve' }),
        200,
      );
      expect(approved.status).toBe('ready');
    } finally {
      await t.prisma.db.project.update({
        where: { id: projectId },
        data: { requireCaseReview: false },
      });
    }
  });
});

describe('tags', () => {
  it('counts tags of live cases, merging spellings, most used first', async () => {
    const before = await expectStatus<TagCountDTO[]>(viewer.get(`${P}/tags`), 200);
    const smokeBefore = before.find((x) => x.tag.toLowerCase() === 'smoke')?.count ?? 0;
    await newCase(tester, { title: 'T1', tags: ['smoke', 'Wifi'] });
    await newCase(tester, { title: 'T2', tags: ['SMOKE', 'wifi', 'Rare'] });
    await newCase(tester, { title: 'T3', tags: ['Wifi'] });
    const gone = await newCase(tester, { title: 'T4', tags: ['Wifi', 'Ghost'] });
    await lead.delete(`${P}/cases/${gone.id}`);
    const tags = await expectStatus<TagCountDTO[]>(viewer.get(`${P}/tags`), 200);
    expect(tags.find((x) => x.tag === 'Wifi')).toEqual({ tag: 'Wifi', count: 3 });
    expect(tags.find((x) => x.tag.toLowerCase() === 'smoke')!.count).toBe(smokeBefore + 2);
    expect(tags.find((x) => x.tag === 'Rare')).toEqual({ tag: 'Rare', count: 1 });
    expect(tags.some((x) => x.tag === 'Ghost')).toBe(false);
    expect(tags[0]!.count).toBeGreaterThanOrEqual(tags[tags.length - 1]!.count);
  });
});
