/**
 * Defects, comments, attachments and the activity feed (port of the v1 server's defects-collab
 * tests). Suites, cases, plans, runs and results are created through their endpoints.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type {
  ActivityDTO,
  AttachmentDTO,
  CommentDTO,
  DefectDTO,
  DefectListItem,
  Paged,
  PlanDTO,
  ReleaseDTO,
  RunCaseDetailDTO,
  RunCaseDTO,
  RunDTO,
  SuiteDTO,
} from '@tmt/shared';
import {
  API,
  attachmentPath,
  createExtraTestApp,
  createProject,
  createTestApp,
  createUser,
  download,
  errorCode,
  expectBody,
  login,
  upload,
  type Client,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let leadId: number;
let lead: Client;
let tester: Client;
let tester2: Client;
let viewer: Client;
let other: Client;
let P: string;
let OTHER: string;
let plan: PlanDTO;
let run: RunDTO;
let rcs: RunCaseDTO[];

/** Path of an attachment's download URL below the API prefix (for the test clients). */
const fileUrl = (a: AttachmentDTO) => a.url.slice(API.length);

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const te = await createUser(t.prisma, 'tester');
  const te2 = await createUser(t.prisma, 'tester2');
  const v = await createUser(t.prisma, 'viewer');
  leadId = l.id;
  const project = await createProject(t.prisma, 'DEF', [
    { userId: l.id, role: 'lead' },
    { userId: te.id, role: 'tester' },
    { userId: te2.id, role: 'tester' },
    { userId: v.id, role: 'viewer' },
  ]);
  const otherProject = await createProject(t.prisma, 'OTH', [{ userId: l.id, role: 'lead' }]);
  P = `/projects/${project.id}`;
  OTHER = `/projects/${otherProject.id}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  tester2 = await login(t, 'tester2');
  viewer = await login(t, 'viewer');
  other = lead;

  const release = expectBody<ReleaseDTO>(
    await lead.post(`${P}/releases`, { name: 'R1', status: 'active' }),
    201,
  );
  const suite = expectBody<SuiteDTO>(
    await lead.post(`${P}/suites`, { name: 'Ops', prefix: 'OPS', envTemplate: ['FW', 'Unit'] }),
    201,
  );
  for (const title of ['Power ON', 'Power OFF', 'Mode']) {
    expectBody(
      await lead.post(`${P}/suites/${suite.id}/cases`, {
        title,
        procedure: `Do ${title}`,
        expected: `${title} works`,
      }),
      201,
    );
  }
  plan = expectBody<PlanDTO>(
    await tester.post(`${P}/plans`, { docNo: 'D-1', title: 'Plan', releaseId: release.id }),
    201,
  );
  run = expectBody<RunDTO>(
    await tester.post(`${P}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: 'KR_01',
      environment: [
        { label: 'FW', value: '1.1.6' },
        { label: 'Unit', value: '' },
      ],
    }),
    201,
  );
  rcs = expectBody<RunCaseDTO[]>(await viewer.get(`${P}/runs/${run.id}/cases`), 200);
  expectBody(
    await tester.put(`${P}/run-cases/${rcs[0]!.id}/result`, {
      status: 'ng',
      actualResult: 'Nothing happens',
    }),
    200,
  );
});
afterAll(() => t.close());

describe('defects', () => {
  let bug1: DefectDTO;
  let bug2: DefectDTO;

  it('creates a defect from an NG result: key, link and prefilled fields', async () => {
    bug1 = expectBody<DefectDTO>(
      await tester.post(`${P}/defects`, {
        title: 'Unit ignores Power ON',
        severity: 'critical',
        assigneeId: leadId,
        runCaseId: rcs[0]!.id,
      }),
      201,
    );
    expect(bug1).toMatchObject({
      key: 'BUG-1',
      status: 'new',
      severity: 'critical',
      priority: 'medium',
      steps: 'Do Power ON',
      expected: 'Power ON works',
      actual: 'Nothing happens',
      environment: 'FW: 1.1.6',
      release: { id: plan.release!.id },
      reporter: { username: 'tester' },
      assignee: { username: 'lead' },
      allowedTransitions: ['open', 'rejected'],
    });
    expect(bug1.links).toEqual([
      expect.objectContaining({
        runCaseId: rcs[0]!.id,
        runCode: 'KR_01',
        planDocNo: 'D-1',
        resultStatus: 'ng',
      }),
    ]);
    expect(bug1.linkSummary).toBe(`${rcs[0]!.displayId} · KR_01 · D-1`);

    bug2 = expectBody<DefectDTO>(
      await tester.post(`${P}/defects`, { title: 'Typo in app', severity: 'trivial', steps: '' }),
      201,
    );
    expect(bug2).toMatchObject({
      key: 'BUG-2',
      steps: null,
      links: [],
      linkSummary: null,
      release: null,
    });

    const rc = expectBody<RunCaseDetailDTO>(await viewer.get(`${P}/run-cases/${rcs[0]!.id}`), 200);
    expect(rc.defectCount).toBe(1);
    expect(rc.defects).toEqual([expect.objectContaining({ key: 'BUG-1', severity: 'critical' })]);
  });

  it('validates references and permissions', async () => {
    expect(errorCode(await tester.post(`${P}/defects`, { title: 'x', assigneeId: 999999 }))).toBe(
      'UNKNOWN_USER',
    );
    expect(errorCode(await tester.post(`${P}/defects`, { title: 'x', releaseId: 999999 }))).toBe(
      'BAD_RELEASE',
    );
    expect((await tester.post(`${P}/defects`, { title: 'x', runCaseId: 999999 })).status).toBe(404);
    expect((await viewer.post(`${P}/defects`, { title: 'x' })).status).toBe(403);
    expect((await other.get(`${OTHER}/defects/${bug1.id}`)).status).toBe(404);
  });

  it('lists with paging, filters and search by key', async () => {
    const all = expectBody<Paged<DefectListItem>>(await viewer.get(`${P}/defects`), 200);
    expect(all.total).toBe(2);
    expect(all.items.map((d) => d.key)).toEqual(['BUG-2', 'BUG-1']);
    const page = expectBody<Paged<DefectListItem>>(
      await viewer.get(`${P}/defects?pageSize=1&page=2`),
      200,
    );
    expect(page.items.map((d) => d.key)).toEqual(['BUG-1']);
    const filters: [string, string[]][] = [
      ['status=new,open', ['BUG-2', 'BUG-1']],
      ['severity=critical', ['BUG-1']],
      [`runId=${run.id}`, ['BUG-1']],
      [`planId=${plan.id}`, ['BUG-1']],
      [`assigneeId=${leadId}`, ['BUG-1']],
      [`releaseId=${plan.release!.id}`, ['BUG-1']],
      ['q=bug-2', ['BUG-2']],
      ['q=2', ['BUG-2']],
      ['q=typo', ['BUG-2']],
      ['q=%25', []],
    ];
    for (const [query, keys] of filters) {
      const res = expectBody<Paged<DefectListItem>>(await viewer.get(`${P}/defects?${query}`), 200);
      expect([query, res.items.map((d) => d.key)]).toEqual([query, keys]);
    }
    expect((await viewer.get(`${P}/defects?status=bogus`)).status).toBe(400);
  });

  it('updates fields and follows the status workflow with timestamps', async () => {
    const upd = expectBody<DefectDTO>(
      await tester.patch(`${P}/defects/${bug1.id}`, { priority: 'high', fixedIn: '1.1.7' }),
      200,
    );
    expect(upd).toMatchObject({ priority: 'high', fixedIn: '1.1.7' });

    const invalid = await tester.post(`${P}/defects/${bug1.id}/transition`, { to: 'closed' });
    expect(invalid.status).toBe(422);
    expect(errorCode(invalid)).toBe('INVALID_TRANSITION');

    const steps: [string, Partial<DefectDTO>][] = [
      ['open', { resolvedAt: null, closedAt: null }],
      ['in_progress', {}],
      ['resolved', { closedAt: null }],
      ['closed', {}],
      ['reopened', { resolvedAt: null, closedAt: null }],
    ];
    for (const [to, expected] of steps) {
      const d = expectBody<DefectDTO>(
        await tester.post(`${P}/defects/${bug1.id}/transition`, {
          to,
          comment: to === 'resolved' ? 'Fixed in 1.1.7' : undefined,
        }),
        200,
      );
      expect(d.status).toBe(to);
      expect(d).toMatchObject(expected);
      if (to === 'resolved') expect(d.resolvedAt).not.toBeNull();
      if (to === 'closed') expect(d.closedAt).not.toBeNull();
    }
    const comments = expectBody<CommentDTO[]>(
      await viewer.get(`${P}/comments?entityType=defect&entityId=${bug1.id}`),
      200,
    );
    expect(comments.map((c) => c.body)).toEqual(['Fixed in 1.1.7']);
  });

  it('links and unlinks results (idempotent link)', async () => {
    const add = () => tester.post(`${P}/defects/${bug2.id}/links`, { runCaseId: rcs[1]!.id });
    expect(expectBody<DefectDTO>(await add(), 200).links).toHaveLength(1);
    const again = expectBody<DefectDTO>(await add(), 200);
    expect(again.links).toHaveLength(1);
    expect((await tester.delete(`${P}/defects/${bug2.id}/links/999999`)).status).toBe(404);
    expect(
      (await tester.delete(`${P}/defects/${bug2.id}/links/${again.links[0]!.id}`)).status,
    ).toBe(204);
    expect(expectBody<DefectDTO>(await viewer.get(`${P}/defects/${bug2.id}`), 200).links).toEqual(
      [],
    );
  });

  it('lets only leads delete defects, removing their comments and files', async () => {
    const d = expectBody<DefectDTO>(
      await tester.post(`${P}/defects`, { title: 'Short-lived' }),
      201,
    );
    const att = expectBody<AttachmentDTO>(
      await upload(t, tester, `${P}/attachments`, {
        fields: { entityType: 'defect', entityId: String(d.id) },
        file: { name: 'shot.png', content: Buffer.from([1, 2, 3]) },
      }),
      201,
    );
    const file = await attachmentPath(t, att.id);
    expectBody(
      await tester.post(`${P}/comments`, { entityType: 'defect', entityId: d.id, body: 'note' }),
      201,
    );
    expect((await tester.delete(`${P}/defects/${d.id}`)).status).toBe(403);
    expect((await lead.delete(`${P}/defects/${d.id}`)).status).toBe(204);
    expect(fs.existsSync(file)).toBe(false);
    expect((await viewer.get(`${P}/defects/${d.id}`)).status).toBe(404);
    expect(
      expectBody<CommentDTO[]>(
        await viewer.get(`${P}/comments?entityType=defect&entityId=${d.id}`),
        200,
      ),
    ).toEqual([]);
  });
});

describe('comments', () => {
  it('adds comments to project entities and lets only the author or a lead delete them', async () => {
    const c1 = expectBody<CommentDTO>(
      await tester.post(`${P}/comments`, {
        entityType: 'run_case',
        entityId: rcs[1]!.id,
        body: 'Looks flaky',
      }),
      201,
    );
    expect(c1).toMatchObject({
      entityType: 'run_case',
      author: { username: 'tester' },
      body: 'Looks flaky',
    });
    expectBody(
      await tester2.post(`${P}/comments`, {
        entityType: 'run_case',
        entityId: rcs[1]!.id,
        body: 'Agreed',
      }),
      201,
    );
    const list = expectBody<CommentDTO[]>(
      await viewer.get(`${P}/comments?entityType=run_case&entityId=${rcs[1]!.id}`),
      200,
    );
    expect(list.map((c) => c.body)).toEqual(['Looks flaky', 'Agreed']);

    expect(
      (await viewer.post(`${P}/comments`, { entityType: 'plan', entityId: plan.id, body: 'x' }))
        .status,
    ).toBe(403);
    expect(
      (await tester.post(`${P}/comments`, { entityType: 'plan', entityId: 999999, body: 'x' }))
        .status,
    ).toBe(404);
    const foreign = await lead.post(`${OTHER}/comments`, {
      entityType: 'plan',
      entityId: plan.id,
      body: 'x',
    });
    expect(foreign.status).toBe(404);

    expect((await tester2.delete(`${P}/comments/${c1.id}`)).status).toBe(403);
    expect((await tester.delete(`${P}/comments/${c1.id}`)).status).toBe(204);
    const c3 = expectBody<CommentDTO>(
      await tester2.post(`${P}/comments`, { entityType: 'plan', entityId: plan.id, body: 'Mine' }),
      201,
    );
    expect((await lead.delete(`${P}/comments/${c3.id}`)).status).toBe(204);
  });
});

describe('attachments', () => {
  it('uploads, lists and downloads evidence (inline only for safe types)', async () => {
    const png = expectBody<AttachmentDTO>(
      await upload(t, tester, `${P}/attachments`, {
        file: {
          name: 'C:\\temp\\screen.PNG',
          content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
          contentType: 'text/html',
        },
        fields: { entityType: 'run_case', entityId: String(rcs[0]!.id) },
      }),
      201,
    );
    expect(png).toMatchObject({
      fileName: 'screen.PNG',
      mimeType: 'image/png',
      sizeBytes: 4,
      createdBy: { username: 'tester' },
    });
    expect(png.url).toBe(`/api/v1${P}/attachments/${png.id}/download`);

    const inline = await download(viewer, fileUrl(png));
    expect(inline.status).toBe(200);
    expect(inline.headers['content-type']).toBe('image/png');
    expect(inline.headers['x-content-type-options']).toBe('nosniff');
    expect(String(inline.headers['content-disposition'])).toMatch(/^inline; filename="screen.PNG"/);
    expect(inline.body).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const forced = await viewer.get(`${fileUrl(png)}?download=1`);
    expect(String(forced.headers['content-disposition'])).toMatch(/^attachment;/);

    const csv = expectBody<AttachmentDTO>(
      await upload(t, tester, `${P}/attachments`, {
        fields: { entityType: 'run_case', entityId: String(rcs[0]!.id) },
        file: { name: 'ผลทดสอบ.csv', content: 'a,b' },
      }),
      201,
    );
    const dl = await viewer.get(fileUrl(csv));
    expect(String(dl.headers['content-disposition'])).toContain(
      `filename*=UTF-8''${encodeURIComponent('ผลทดสอบ.csv')}`,
    );
    expect(String(dl.headers['content-disposition'])).toMatch(/^attachment;/);

    const list = expectBody<AttachmentDTO[]>(
      await viewer.get(`${P}/attachments?entityType=run_case&entityId=${rcs[0]!.id}`),
      200,
    );
    expect(list.map((a) => a.id)).toEqual([png.id, csv.id]);
    const rc = expectBody<RunCaseDetailDTO>(await viewer.get(`${P}/run-cases/${rcs[0]!.id}`), 200);
    expect(rc.attachmentCount).toBe(2);
    expect(rc.attachments.map((a) => a.fileName)).toEqual(['screen.PNG', 'ผลทดสอบ.csv']);
  });

  it('rejects blocked types, missing files, bad targets and other projects', async () => {
    const url = `${P}/attachments`;
    const html = await upload(t, tester, url, {
      fields: { entityType: 'run_case', entityId: String(rcs[0]!.id) },
      file: { name: 'evil.html', content: '<script>' },
    });
    expect(html.status).toBe(415);
    expect(errorCode(html)).toBe('UNSUPPORTED_FILE_TYPE');
    expect(
      errorCode(await upload(t, tester, url, { fields: { entityType: 'defect', entityId: '1' } })),
    ).toBe('FILE_REQUIRED');
    expect(
      (
        await upload(t, tester, url, {
          fields: { entityType: 'nope', entityId: '1' },
          file: { name: 'a.txt', content: 'a' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await upload(t, tester, url, {
          fields: { entityType: 'plan', entityId: '999999' },
          file: { name: 'a.txt', content: 'a' },
        })
      ).status,
    ).toBe(404);
    const json = await tester.post(url, { entityType: 'plan', entityId: plan.id });
    expect(json.status).toBe(400);
    expect(errorCode(json)).toBe('MULTIPART_REQUIRED');
    expect(
      (
        await upload(t, viewer, url, {
          fields: { entityType: 'plan', entityId: String(plan.id) },
          file: { name: 'a.txt', content: 'a' },
        })
      ).status,
    ).toBe(403);
    const malformed = await viewer.get(`${P}/attachments/not-a-uuid/download`);
    expect(malformed.status).toBe(404);
    expect(errorCode(malformed)).toBe('ATTACHMENT_NOT_FOUND');
    const mine = expectBody<AttachmentDTO>(
      await upload(t, tester, url, {
        fields: { entityType: 'plan', entityId: String(plan.id) },
        file: { name: 'p.txt', content: 'p' },
      }),
      201,
    );
    expect((await other.get(`${OTHER}/attachments/${mine.id}/download`)).status).toBe(404);
  });

  it('enforces the upload size limit', async () => {
    const small = await createExtraTestApp({ maxUploadBytes: 1024 });
    try {
      const u = await createUser(small.prisma, 'sizer');
      const p = await createProject(small.prisma, 'SZ', [{ userId: u.id, role: 'lead' }]);
      const api = await login(small, 'sizer');
      const plan2 = expectBody<PlanDTO>(
        await api.post(`/projects/${p.id}/plans`, { docNo: 'S-1', title: 'S' }),
        201,
      );
      const big = await upload(small, api, `/projects/${p.id}/attachments`, {
        fields: { entityType: 'plan', entityId: String(plan2.id) },
        file: { name: 'big.bin', content: Buffer.alloc(4096, 1) },
      });
      expect(big.status).toBe(413);
      expect(errorCode(big)).toBe('FILE_TOO_LARGE');
      expect(
        fs
          .readdirSync(small.config.dataDir, { recursive: true })
          .filter((f) => String(f).match(/[0-9a-f-]{36}$/)),
      ).toEqual([]);
    } finally {
      await small.close();
    }
  });

  it('deletes by uploader or lead, and locks evidence of completed plans', async () => {
    const mk = (api: Client, name: string) =>
      upload(t, api, `${P}/attachments`, {
        fields: { entityType: 'run_case', entityId: String(rcs[2]!.id) },
        file: { name, content: name },
      });
    const a1 = expectBody<AttachmentDTO>(await mk(tester, 'a1.txt'), 201);
    const a2 = expectBody<AttachmentDTO>(await mk(tester, 'a2.txt'), 201);
    const f1 = await attachmentPath(t, a1.id);
    expect((await tester2.delete(`${P}/attachments/${a1.id}`)).status).toBe(403);
    expect((await tester.delete(`${P}/attachments/${a1.id}`)).status).toBe(204);
    expect(fs.existsSync(f1)).toBe(false);

    expectBody(await tester.post(`${P}/plans/${plan.id}/complete`), 200);
    const locked = await mk(tester, 'late.txt');
    expect(locked.status).toBe(409);
    expect(errorCode(locked)).toBe('PLAN_LOCKED');
    expect(errorCode(await lead.delete(`${P}/attachments/${a2.id}`))).toBe('PLAN_LOCKED');
    // Comments and defect links stay possible on completed plans.
    expect(
      (
        await tester.post(`${P}/comments`, {
          entityType: 'run_case',
          entityId: rcs[2]!.id,
          body: 'After sign-off',
        })
      ).status,
    ).toBe(201);
    expectBody(await lead.post(`${P}/plans/${plan.id}/reopen`), 200);
    expect((await lead.delete(`${P}/attachments/${a2.id}`)).status).toBe(204);
  });
});

describe('activity', () => {
  it('records project activity newest first with entity filters', async () => {
    const feed = expectBody<ActivityDTO[]>(await viewer.get(`${P}/activity?limit=500`), 200);
    expect(feed.length).toBeGreaterThan(10);
    const times = feed.map((a) => a.createdAt);
    expect(times.toSorted().toReversed()).toEqual(times);
    expect(feed.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'created',
        'result_set',
        'transitioned',
        'linked',
        'attachment_added',
        'commented',
        'completed',
        'reopened',
      ]),
    );
    const one = expectBody<ActivityDTO[]>(
      await viewer.get(`${P}/activity?entityType=run_case&entityId=${rcs[0]!.id}`),
      200,
    );
    expect(one.length).toBeGreaterThan(0);
    expect(one.every((a) => a.entityType === 'run_case' && a.entityId === rcs[0]!.id)).toBe(true);
    expect(expectBody<ActivityDTO[]>(await viewer.get(`${P}/activity?limit=2`), 200)).toHaveLength(
      2,
    );
    expect(feed.find((a) => a.action === 'result_set')?.user).toMatchObject({
      username: 'tester',
    });
  });
});
