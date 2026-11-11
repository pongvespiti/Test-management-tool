/**
 * W1 — v1.1 case fields end-to-end (port of the old w1-library.test.ts): priority/tags/estimate/
 * references/template/steps, shared-step references, review rules on create/update/bulk/clone,
 * list filters, bulk actions, versions and the library Excel export.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ExcelJS } from '@tmt/excel';
import type {
  CaseSearchResultDTO,
  CaseVersionDTO,
  Paged,
  SectionNode,
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
let leadId: number;
let testerId: number;
let lead: Client;
let tester: Client;
let viewer: Client;
let projectId: number;
let P: string;
let otherSharedStepId: number;
let otherProjectId: number;
let loginStepId: number;

beforeAll(async () => {
  t = await createTestApp();
  leadId = (await createUser(t.prisma, 'lead')).id;
  testerId = (await createUser(t.prisma, 'tester')).id;
  const viewerId = (await createUser(t.prisma, 'viewer')).id;
  projectId = (
    await createProject(t.prisma, 'WLIB', [
      { userId: leadId, role: 'lead' },
      { userId: testerId, role: 'tester' },
      { userId: viewerId, role: 'viewer' },
    ])
  ).id;
  const otherProject = await createProject(t.prisma, 'WOTH', [{ userId: leadId, role: 'lead' }]);
  otherProjectId = otherProject.id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');
  loginStepId = (
    await t.prisma.db.sharedStep.create({
      data: {
        projectId,
        name: 'Log in',
        steps: [
          { action: 'Open the app', expected: 'Login page' },
          { action: 'Sign in', expected: 'Home page' },
        ],
      },
    })
  ).id;
  otherSharedStepId = (
    await t.prisma.db.sharedStep.create({
      data: {
        projectId: otherProject.id,
        name: 'Elsewhere',
        steps: [{ action: 'x', expected: '' }],
      },
    })
  ).id;
});
afterAll(() => t.close());

function newSuite(prefix: string, extra: Record<string, unknown> = {}): Promise<SuiteDTO> {
  return expectStatus<SuiteDTO>(
    lead.post(`${P}/suites`, { name: `${prefix} suite`, prefix, ...extra }),
    201,
  );
}
function newCase(client: Client, suiteId: number, body: object): Promise<TestCaseDTO> {
  return expectStatus<TestCaseDTO>(client.post(`${P}/suites/${suiteId}/cases`, body), 201);
}
function getCase(id: number): Promise<TestCaseDTO> {
  return expectStatus<TestCaseDTO>(viewer.get(`${P}/cases/${id}`), 200);
}
async function setReviewRequired(on: boolean): Promise<void> {
  await t.prisma.db.project.update({ where: { id: projectId }, data: { requireCaseReview: on } });
}
async function list(suiteId: number, query: string): Promise<string[]> {
  const page = await expectStatus<Paged<TestCaseDTO>>(
    viewer.get(`${P}/suites/${suiteId}/cases?${query}`),
    200,
  );
  return page.items.map((c) => c.title);
}

describe('case fields', () => {
  let suite: SuiteDTO;
  beforeAll(async () => {
    suite = await newSuite('FLD', {
      fieldDefs: [{ key: 'register', label: 'Register', type: 'text' }],
    });
  });

  it('stores priority, tags, estimate, references and step-by-step content', async () => {
    const c = await newCase(tester, suite.id, {
      title: 'Power on from the app',
      priority: 'high',
      tags: [' Smoke ', 'smoke', 'Regression'],
      estimateMinutes: 15,
      references: 'REQ-12, JIRA-7',
      template: 'steps',
      steps: [
        { kind: 'shared', sharedStepId: loginStepId },
        { kind: 'step', action: 'Tap power  \r\n', expected: 'Unit is ON' },
      ],
    });
    expect(c).toMatchObject({
      priority: 'high',
      tags: ['Smoke', 'Regression'],
      estimateMinutes: 15,
      references: 'REQ-12, JIRA-7',
      template: 'steps',
      status: 'ready',
      review: {
        reviewer: null,
        requestedBy: null,
        requestedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        note: null,
      },
    });
    expect(c.steps).toEqual([
      {
        kind: 'shared',
        sharedStepId: loginStepId,
        name: 'Log in',
        steps: [
          { action: 'Open the app', expected: 'Login page' },
          { action: 'Sign in', expected: 'Home page' },
        ],
      },
      { kind: 'step', action: 'Tap power', expected: 'Unit is ON' },
    ]);
  });

  it('defaults the new fields', async () => {
    const c = await newCase(tester, suite.id, { title: 'Defaults' });
    expect(c).toMatchObject({
      priority: 'medium',
      tags: [],
      estimateMinutes: null,
      references: null,
      template: 'text',
      steps: [],
    });
  });

  it('refuses shared steps that do not exist in the project', async () => {
    for (const sharedStepId of [999999, otherSharedStepId]) {
      const res = await tester.post(`${P}/suites/${suite.id}/cases`, {
        title: 'Bad ref',
        template: 'steps',
        steps: [{ kind: 'shared', sharedStepId }],
      });
      expect(res.status).toBe(422);
      expect(errorCode(res)).toBe('BAD_SHARED_STEP');
    }
    const c = await newCase(tester, suite.id, { title: 'Later bad ref' });
    const res = await tester.patch(`${P}/cases/${c.id}`, {
      steps: [{ kind: 'shared', sharedStepId: otherSharedStepId }],
    });
    expect(errorCode(res)).toBe('BAD_SHARED_STEP');
  });

  it('updates and clears the new fields and versions them', async () => {
    const c = await newCase(tester, suite.id, {
      title: 'Edit me',
      estimateMinutes: 5,
      references: 'REQ-1',
    });
    const u = await expectStatus<TestCaseDTO>(
      tester.patch(`${P}/cases/${c.id}`, {
        priority: 'critical',
        tags: ['Nightly'],
        estimateMinutes: null,
        references: '',
        template: 'steps',
        steps: [{ kind: 'step', action: 'Do it' }],
        version: c.version,
      }),
      200,
    );
    expect(u).toMatchObject({
      priority: 'critical',
      tags: ['Nightly'],
      estimateMinutes: null,
      references: null,
      template: 'steps',
      steps: [{ kind: 'step', action: 'Do it', expected: '' }],
      version: c.version + 1,
    });
    const versions = await expectStatus<CaseVersionDTO[]>(
      viewer.get(`${P}/cases/${c.id}/versions`),
      200,
    );
    expect(versions[0]!.data).toMatchObject({
      priority: 'critical',
      tags: ['Nightly'],
      estimateMinutes: null,
      references: null,
      template: 'steps',
      steps: [{ kind: 'step', action: 'Do it', expected: '' }],
    });
    expect(versions[1]!.data).toMatchObject({
      priority: 'medium',
      estimateMinutes: 5,
      references: 'REQ-1',
    });
  });

  it('clones the new fields', async () => {
    const c = await newCase(tester, suite.id, {
      title: 'Clone source',
      priority: 'low',
      tags: ['A'],
      template: 'steps',
      steps: [{ kind: 'shared', sharedStepId: loginStepId }],
    });
    const copy = await expectStatus<TestCaseDTO>(tester.post(`${P}/cases/${c.id}/clone`), 201);
    expect(copy).toMatchObject({
      title: 'Clone source (copy)',
      priority: 'low',
      tags: ['A'],
      template: 'steps',
    });
    expect(copy.steps[0]).toMatchObject({ kind: 'shared', sharedStepId: loginStepId });
  });
});

describe('status rules', () => {
  let suite: SuiteDTO;
  beforeAll(async () => {
    suite = await newSuite('REV');
  });

  it('never sets in_review through create, update or bulk', async () => {
    const create = await tester.post(`${P}/suites/${suite.id}/cases`, {
      title: 'x',
      status: 'in_review',
    });
    expect(create.status).toBe(422);
    expect(errorCode(create)).toBe('USE_REVIEW_ENDPOINT');
    const c = await newCase(tester, suite.id, { title: 'Plain' });
    expect(errorCode(await tester.patch(`${P}/cases/${c.id}`, { status: 'in_review' }))).toBe(
      'USE_REVIEW_ENDPOINT',
    );
    const bulk = await lead.post(`${P}/suites/${suite.id}/cases/bulk`, {
      action: 'setStatus',
      ids: [c.id],
      status: 'in_review',
    });
    expect(bulk.status).toBe(422);
    expect(errorCode(bulk)).toBe('USE_REVIEW_ENDPOINT');
  });

  it('without review required, testers make cases ready freely', async () => {
    await setReviewRequired(false);
    const c = await newCase(tester, suite.id, { title: 'Free', status: 'draft' });
    const u = await expectStatus<TestCaseDTO>(
      tester.patch(`${P}/cases/${c.id}`, { status: 'ready' }),
      200,
    );
    expect(u.status).toBe('ready');
    const edited = await expectStatus<TestCaseDTO>(
      tester.patch(`${P}/cases/${c.id}`, { title: 'Free (edited)' }),
      200,
    );
    expect(edited.status).toBe('ready');
  });

  describe('with review required', () => {
    beforeAll(() => setReviewRequired(true));
    afterAll(() => setReviewRequired(false));

    it('stores ready as draft when a tester creates or clones, keeps ready for leads', async () => {
      const byTester = await newCase(tester, suite.id, { title: 'Tester case' });
      expect(byTester.status).toBe('draft');
      const byLead = await newCase(lead, suite.id, { title: 'Lead case' });
      expect(byLead.status).toBe('ready');
      const copy = await expectStatus<TestCaseDTO>(
        tester.post(`${P}/cases/${byLead.id}/clone`),
        201,
      );
      expect(copy.status).toBe('draft');
      const leadCopy = await expectStatus<TestCaseDTO>(
        lead.post(`${P}/cases/${byLead.id}/clone`),
        201,
      );
      expect(leadCopy.status).toBe('ready');
    });

    it('refuses an explicit ready from a tester (update and bulk)', async () => {
      const c = await newCase(tester, suite.id, { title: 'Needs review' });
      const res = await tester.patch(`${P}/cases/${c.id}`, { status: 'ready' });
      expect(res.status).toBe(403);
      expect(errorCode(res)).toBe('REVIEW_REQUIRED');
      const bulk = await tester.post(`${P}/suites/${suite.id}/cases/bulk`, {
        action: 'setStatus',
        ids: [c.id],
        status: 'ready',
      });
      expect(bulk.status).toBe(403);
      expect(errorCode(bulk)).toBe('REVIEW_REQUIRED');
      expect((await getCase(c.id)).status).toBe('draft');
      // Leads may.
      expect(
        (
          await expectStatus<TestCaseDTO>(
            lead.patch(`${P}/cases/${c.id}`, { status: 'ready' }),
            200,
          )
        ).status,
      ).toBe('ready');
    });

    it('sends a ready case back to draft when a tester changes reviewable content', async () => {
      const c = await newCase(lead, suite.id, {
        title: 'Approved',
        procedure: 'Step 1',
        tags: ['x'],
      });
      expect(c.status).toBe('ready');
      // Not reviewable content (priority, tags, references, remark): stays ready.
      const meta = await expectStatus<TestCaseDTO>(
        tester.patch(`${P}/cases/${c.id}`, {
          priority: 'high',
          tags: ['y'],
          references: 'REQ-9',
          remark: 'note',
        }),
        200,
      );
      expect(meta.status).toBe('ready');
      // Re-sending identical content (full form save) does not count as a change.
      const same = await expectStatus<TestCaseDTO>(
        tester.patch(`${P}/cases/${c.id}`, {
          title: 'Approved',
          procedure: 'Step 1  ',
          status: 'ready',
          custom: {},
          steps: [],
          template: 'text',
        }),
        200,
      );
      expect(same.status).toBe('ready');
      // A lead's content change keeps it ready.
      const byLead = await expectStatus<TestCaseDTO>(
        lead.patch(`${P}/cases/${c.id}`, { procedure: 'Step 1 (lead)' }),
        200,
      );
      expect(byLead.status).toBe('ready');
      // The tester's content change sends it back to draft, even with status ready in the body.
      const changed = await expectStatus<TestCaseDTO>(
        tester.patch(`${P}/cases/${c.id}`, { procedure: 'Step 1 v2', status: 'ready' }),
        200,
      );
      expect(changed.status).toBe('draft');
    });
  });
});

describe('list filters', () => {
  let suite: SuiteDTO;
  beforeAll(async () => {
    suite = await newSuite('FLT');
    const section = await expectStatus<SectionNode>(
      tester.post(`${P}/suites/${suite.id}/sections`, { name: 'Sec' }),
      201,
    );
    await newCase(tester, suite.id, {
      title: 'Crit',
      priority: 'critical',
      tags: ['Smoke'],
      sectionId: section.id,
    });
    await newCase(tester, suite.id, {
      title: 'High',
      priority: 'high',
      tags: ['smoke', 'UI'],
      references: 'JIRA-77',
    });
    await newCase(tester, suite.id, { title: 'Low', priority: 'low', sectionId: section.id });
    await newCase(tester, suite.id, { title: 'Draft', status: 'draft' });
  });

  it('filters by priorities, tag (case-insensitive), unsectioned and status', async () => {
    expect(await list(suite.id, 'priority=critical,high')).toEqual(['High', 'Crit']);
    expect(await list(suite.id, 'tag=SMOKE')).toEqual(['High', 'Crit']);
    expect(await list(suite.id, 'tag=ui')).toEqual(['High']);
    expect(await list(suite.id, 'unsectioned=true')).toEqual(['High', 'Draft']);
    expect(await list(suite.id, 'status=draft')).toEqual(['Draft']);
    expect(await list(suite.id, 'status=in_review')).toEqual([]);
    expect(await list(suite.id, 'priority=low&unsectioned=false')).toEqual(['Low']);
    expect(await list(suite.id, 'q=jira-77')).toEqual(['High']);
    expect((await viewer.get(`${P}/suites/${suite.id}/cases?priority=urgent`)).status).toBe(400);
  });
});

function search(query: string, client: Client = viewer) {
  return client.get(`${P}/cases/search?${query}`);
}

describe('project-wide search', () => {
  let a: SuiteDTO;
  let b: SuiteDTO;
  let hitInB: TestCaseDTO;
  beforeAll(async () => {
    a = await newSuite('SRA');
    b = await newSuite('SRB');
    await newCase(tester, a.id, { title: 'Other', procedure: 'Check the zebra stripe sensor' });
    await newCase(tester, a.id, { title: 'Unrelated' });
    hitInB = await newCase(tester, b.id, { title: 'Zebra stripe alarm', code: 'ZB-1' });
    const gone = await newCase(tester, b.id, { title: 'Zebra stripe deleted' });
    await expectStatus(lead.delete(`${P}/cases/${gone.id}`), 204);
    const archived = await newSuite('SRC');
    await newCase(tester, archived.id, { title: 'Zebra stripe archived' });
    await expectStatus(lead.patch(`${P}/suites/${archived.id}`, { isArchived: true }), 200);
  });

  it('finds cases of every active suite, title matches first, without deleted ones', async () => {
    const res = await expectStatus<CaseSearchResultDTO>(search('q=zebra%20stripe'), 200);
    expect(res.total).toBe(2);
    expect(res.items.map((i) => [i.title, i.suiteId])).toEqual([
      ['Zebra stripe alarm', b.id],
      ['Other', a.id],
    ]);
    expect(res.items[0]).toMatchObject({
      id: hitInB.id,
      displayId: hitInB.displayId,
      code: 'ZB-1',
      suiteName: 'SRB suite',
    });
  });

  it('honours the limit but reports the full total, and treats % literally', async () => {
    const res = await expectStatus<CaseSearchResultDTO>(search('q=zebra&limit=1'), 200);
    expect(res.items).toHaveLength(1);
    expect(res.total).toBe(2);
    expect((await expectStatus<CaseSearchResultDTO>(search('q=%25%25'), 200)).total).toBe(0);
  });

  it('validates the query and never leaks another project', async () => {
    expect((await search('q=z')).status).toBe(400);
    expect((await search('q=zebra&limit=500')).status).toBe(400);
    expect((await search('')).status).toBe(400);
    const elsewhere = await viewer.get(`/projects/${otherProjectId}/cases/search?q=zebra`);
    expect([403, 404]).toContain(elsewhere.status);
  });
});

describe('bulk actions', () => {
  let suite: SuiteDTO;
  let ids: number[];
  beforeAll(async () => {
    suite = await newSuite('BLK');
    ids = [];
    for (const [title, status] of [
      ['One', 'draft'],
      ['Two', 'ready'],
      ['Three', 'deprecated'],
    ] as const) {
      ids.push((await newCase(tester, suite.id, { title, status, tags: ['Keep'] })).id);
    }
  });
  const bulk = (client: Client, body: Record<string, unknown>) =>
    client.post(`${P}/suites/${suite.id}/cases/bulk`, body);
  const affected = async (client: Client, body: Record<string, unknown>) =>
    (await expectStatus<{ affected: number }>(bulk(client, body), 200)).affected;

  it('sets priority on changed cases only', async () => {
    expect(await affected(tester, { action: 'setPriority', ids, priority: 'high' })).toBe(3);
    expect(
      await affected(tester, { action: 'setPriority', ids: ids.slice(0, 2), priority: 'high' }),
    ).toBe(0);
    expect((await getCase(ids[0]!)).priority).toBe('high');
  });

  it('adds and removes tags case-insensitively', async () => {
    expect(await affected(tester, { action: 'addTags', ids, tags: ['keep', 'Nightly'] })).toBe(3);
    expect((await getCase(ids[1]!)).tags).toEqual(['Keep', 'Nightly']);
    expect(
      await affected(tester, { action: 'removeTags', ids: [ids[0]!], tags: ['NIGHTLY', 'absent'] }),
    ).toBe(1);
    expect((await getCase(ids[0]!)).tags).toEqual(['Keep']);
    const versions = await expectStatus<CaseVersionDTO[]>(
      viewer.get(`${P}/cases/${ids[0]}/versions`),
      200,
    );
    expect(versions[0]!.data.tags).toEqual(['Keep']);
  });

  it('submits draft/ready cases for review and lets only leads approve', async () => {
    const badReviewer = await bulk(tester, { action: 'submitReview', ids, reviewerId: testerId });
    expect(badReviewer.status).toBe(422);
    expect(errorCode(badReviewer)).toBe('BAD_REVIEWER');
    expect(await affected(tester, { action: 'submitReview', ids, reviewerId: leadId })).toBe(2); // the deprecated case is skipped
    expect(await getCase(ids[0]!)).toMatchObject({
      status: 'in_review',
      review: { reviewer: { id: leadId }, requestedBy: { id: testerId } },
    });
    expect((await getCase(ids[2]!)).status).toBe('deprecated');

    expect((await bulk(tester, { action: 'approve', ids })).status).toBe(403);
    expect(await affected(lead, { action: 'approve', ids })).toBe(2);
    expect(await getCase(ids[1]!)).toMatchObject({
      status: 'ready',
      review: { reviewedBy: { id: leadId } },
    });
    // Nothing left in review.
    expect(await affected(lead, { action: 'approve', ids })).toBe(0);
  });

  it('keeps the viewer out', async () => {
    expect((await bulk(viewer, { action: 'setPriority', ids, priority: 'low' })).status).toBe(403);
  });
});

describe('library export', () => {
  it('adds priority, tags, estimate and references and writes steps as numbered text', async () => {
    const suite = await newSuite('EXP', {
      fieldDefs: [{ key: 'register', label: 'Register', type: 'text' }],
    });
    await newCase(tester, suite.id, {
      title: 'Stepwise',
      code: 'S-1',
      priority: 'critical',
      tags: ['Smoke', 'UI'],
      estimateMinutes: 90,
      references: 'REQ-1',
      template: 'steps',
      steps: [
        { kind: 'shared', sharedStepId: loginStepId },
        { kind: 'step', action: 'Tap power', expected: '' },
        { kind: 'step', action: 'Check display', expected: 'Shows 25°C' },
      ],
      custom: { register: '2001' },
    });
    const res = await download(viewer, `${P}/suites/${suite.id}/export.xlsx`);
    expect(res.status).toBe(200);
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
      'Register',
    ]);
    const row = (ws.getRow(2).values as unknown[]).slice(1);
    expect(row[6]).toBe('1. Open the app\n2. Sign in\n3. Tap power\n4. Check display');
    expect(row[7]).toBe('1. Login page\n2. Home page\n4. Shows 25°C');
    expect(row.slice(10)).toEqual(['Critical', 'Smoke, UI', 90, 'REQ-1', '2001']);
  });
});
