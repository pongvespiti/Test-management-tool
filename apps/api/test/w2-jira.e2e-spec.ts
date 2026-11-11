/**
 * Jira integration against a fake Jira (REST v2) HTTP server (port of the v1 server's w2-jira
 * tests). The pure issue-content cases of that file live in
 * src/modules/integrations/jira-issue.spec.ts.
 */
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import type { Prisma } from '@tmt/database';
import type {
  DefectDTO,
  IntegrationsStatusDTO,
  JiraConfigDTO,
  JiraTestResultDTO,
  PlanDTO,
  RunCaseDTO,
  RunDTO,
  SuiteDTO,
  TestCaseDTO,
} from '@tmt/shared';
import type request from 'supertest';
import { JiraClientFactory } from '../src/modules/integrations/jira-client.js';
import { wikiCell } from '../src/modules/integrations/jira-issue.js';
import { APP_SECRET_FILE } from '../src/modules/integrations/secret-box.js';
import {
  createProject,
  createTestApp,
  createUser,
  errorCode,
  expectBody,
  login,
  type Client,
  type TestApp,
} from './helpers.js';

// ---------------------------------------------------------------- mock Jira (REST v2)

const PAT = 'pat-SuperSecret-0123456789';
const CLOUD_TOKEN = 'cloud-api-token-ABCDEF';
const CLOUD_USER = 'qa.tester@example.test';

interface Recorded {
  method: string;
  path: string;
  authorization: string | undefined;
  body: unknown;
}

const mock = {
  url: '',
  requests: [] as Recorded[],
  issues: new Map<string, { summary: string; status: string }>(),
  moved: new Map<string, string>(),
  acceptedAuth: new Set<string>(),
  rejectLabels: false,
  failNext: null as null | { status: number; body: unknown },
  delayMs: 0,
  nextKey: 100,
};
let jiraServer: http.Server;
const sockets = new Set<Socket>();

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleJira(req: http.IncomingMessage, res: http.ServerResponse, raw: string) {
  const url = new URL(req.url ?? '/', mock.url);
  const body: unknown = raw ? JSON.parse(raw) : null;
  mock.requests.push({
    method: req.method ?? 'GET',
    path: url.pathname + url.search,
    authorization: req.headers.authorization,
    body,
  });
  // unref: a request that timed out must not keep the test process alive.
  if (mock.delayMs) await new Promise((r) => setTimeout(r, mock.delayMs).unref());
  if (!mock.acceptedAuth.has(req.headers.authorization ?? '')) {
    return json(res, 401, {
      errorMessages: [
        'You are not authenticated. Authentication required to perform this operation.',
      ],
      errors: {},
    });
  }
  if (mock.failNext) {
    const f = mock.failNext;
    mock.failNext = null;
    return json(res, f.status, f.body);
  }
  const p = url.pathname;
  if (req.method === 'GET' && p === '/rest/api/2/serverInfo') {
    return json(res, 200, {
      baseUrl: mock.url,
      version: '9.12.2',
      deploymentType: 'Server',
      serverTitle: 'Example Jira',
    });
  }
  const project = /^\/rest\/api\/2\/project\/([^/]+)$/.exec(p);
  if (req.method === 'GET' && project) {
    return project[1] === 'TEAM'
      ? json(res, 200, { key: 'TEAM', name: 'Example Edge Devices' })
      : json(res, 404, {
          errorMessages: [`No project could be found with key '${project[1]}'.`],
          errors: {},
        });
  }
  if (req.method === 'POST' && p === '/rest/api/2/issue') {
    const fields = (body as { fields: Record<string, unknown> }).fields;
    if ((fields.project as { key: string }).key !== 'TEAM') {
      return json(res, 400, {
        errorMessages: [],
        errors: { project: 'valid project is required' },
      });
    }
    if (mock.rejectLabels && 'labels' in fields) {
      return json(res, 400, {
        errorMessages: [],
        errors: {
          labels: "Field 'labels' cannot be set. It is not on the appropriate screen, or unknown.",
        },
      });
    }
    const key = `TEAM-${mock.nextKey++}`;
    mock.issues.set(key, { summary: String(fields.summary), status: 'To Do' });
    return json(res, 201, { id: '10001', key, self: `${mock.url}/rest/api/2/issue/10001` });
  }
  const issue = /^\/rest\/api\/2\/issue\/([^/]+)$/.exec(p);
  if (req.method === 'GET' && issue) {
    const requested = decodeURIComponent(issue[1]!).toUpperCase();
    const key = mock.moved.get(requested) ?? requested;
    const found = mock.issues.get(key);
    if (!found) return json(res, 404, { errorMessages: ['Issue Does Not Exist'], errors: {} });
    return json(res, 200, {
      id: '1',
      key,
      fields: { summary: found.summary, status: { name: found.status } },
    });
  }
  return json(res, 404, { errorMessages: ['Unknown endpoint'], errors: {} });
}

// ---------------------------------------------------------------- app & data

let t: TestApp;
let lead: Client;
let tester: Client;
let viewer: Client;
let projectId: number;
let otherProjectId: number;
let P: string;
let ngRunCase: RunCaseDTO;
let tc: TestCaseDTO;
/** Every response body seen in this file — none may contain a secret. */
const bodies: string[] = [];

function track(res: request.Response): request.Response {
  bodies.push(res.text ?? '');
  return res;
}

const jiraSettings = (over: Record<string, unknown> = {}) => ({
  baseUrl: mock.url,
  projectKey: 'team',
  issueType: 'Bug',
  authType: 'pat',
  secret: PAT,
  ...over,
});

async function newDefect(body: Record<string, unknown>): Promise<DefectDTO> {
  return expectBody<DefectDTO>(track(await tester.post(`${P}/defects`, body)), 201);
}

/** The latest activity entry with this action (optionally of one defect). */
function activityEntry(action: string, entityId?: number) {
  return t.prisma.db.activityLog.findFirst({
    where: { action, ...(entityId !== undefined && { entityId }) },
    orderBy: { id: 'desc' },
  });
}

beforeAll(async () => {
  jiraServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      handleJira(req, res, Buffer.concat(chunks).toString('utf8')).catch(() => res.destroy());
    });
  });
  jiraServer.on('connection', (s: Socket) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((r) => jiraServer.listen(0, '127.0.0.1', () => r()));
  mock.url = `http://127.0.0.1:${(jiraServer.address() as AddressInfo).port}`;
  mock.acceptedAuth.add(`Bearer ${PAT}`);
  mock.acceptedAuth.add(`Basic ${Buffer.from(`${CLOUD_USER}:${CLOUD_TOKEN}`).toString('base64')}`);

  t = await createTestApp({ publicUrl: 'http://tmt.example.local:3000', appSecret: null });
  const l = await createUser(t.prisma, 'lead');
  const te = await createUser(t.prisma, 'tester');
  const v = await createUser(t.prisma, 'viewer');
  projectId = (
    await createProject(t.prisma, 'JIR', [
      { userId: l.id, role: 'lead' },
      { userId: te.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  otherProjectId = (await createProject(t.prisma, 'OTH', [{ userId: l.id, role: 'lead' }])).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');

  const suite = expectBody<SuiteDTO>(
    await lead.post(`${P}/suites`, { name: 'Wi-Fi adapter', prefix: 'WIFI' }),
    201,
  );
  tc = expectBody<TestCaseDTO>(
    await lead.post(`${P}/suites/${suite.id}/cases`, {
      title: 'Pair adapter | with [app]',
      procedure: '1. Hold WPS\n2. Open app',
      expected: 'Paired within 30 s',
    }),
    201,
  );
  const plan = expectBody<PlanDTO>(
    await lead.post(`${P}/plans`, { docNo: '26TR-TEAM-10-1', title: 'Adapter FW 2.1' }),
    201,
  );
  const run = expectBody<RunDTO>(
    await lead.post(`${P}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: 'RUN-A',
      environment: [{ label: 'Adapter FW', value: '2.1.0' }],
    }),
    201,
  );
  const [rc] = expectBody<RunCaseDTO[]>(await lead.get(`${P}/runs/${run.id}/cases`), 200);
  ngRunCase = expectBody<RunCaseDTO>(
    await tester.put(`${P}/run-cases/${rc!.id}/result`, {
      status: 'ng',
      actualResult: 'Pairing times out after 60 s',
    }),
    200,
  );
});
afterAll(async () => {
  for (const s of sockets) s.destroy();
  await new Promise((r) => jiraServer.close(r));
  await t.close();
});
beforeEach(() => {
  mock.requests = [];
  mock.failNext = null;
  mock.rejectLabels = false;
  mock.delayMs = 0;
});

// ---------------------------------------------------------------- settings

describe('Jira settings', () => {
  it('starts unconfigured: status null for members, settings null for leads', async () => {
    expect(
      expectBody<IntegrationsStatusDTO>(track(await viewer.get(`${P}/integrations`)), 200),
    ).toEqual({ jira: null });
    const res = track(await lead.get(`${P}/integrations/jira`));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(JSON.parse(res.text)).toBeNull();
    expect((await viewer.get(`${P}/integrations/jira`)).status).toBe(403);
    expect((await tester.put(`${P}/integrations/jira`, jiraSettings())).status).toBe(403);
  });

  it('requires a secret on first save and seals it with the generated app secret', async () => {
    const missing = track(
      await lead.put(`${P}/integrations/jira`, jiraSettings({ secret: undefined })),
    );
    expect(missing.status).toBe(422);
    expect(errorCode(missing)).toBe('SECRET_REQUIRED');
    expect(fs.existsSync(path.join(t.config.dataDir, APP_SECRET_FILE))).toBe(false);

    const saved = expectBody<JiraConfigDTO>(
      track(await lead.put(`${P}/integrations/jira`, jiraSettings())),
      200,
    );
    expect(saved).toMatchObject({
      enabled: true,
      baseUrl: mock.url,
      projectKey: 'TEAM',
      issueType: 'Bug',
      authType: 'pat',
      username: null,
      hasSecret: true,
      verifyTls: true,
    });
    expect(saved.updatedBy?.username).toBe('lead');
    expect(saved).not.toHaveProperty('secret');

    const file = path.join(t.config.dataDir, APP_SECRET_FILE);
    expect(fs.existsSync(file)).toBe(true);
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const row = await t.prisma.db.projectIntegration.findFirstOrThrow({ where: { projectId } });
    expect(row.secretEnc).toMatch(/^v1:/);
    expect(JSON.stringify(row)).not.toContain(PAT);
    expect(JSON.stringify(await activityEntry('jira_configured'))).not.toContain(PAT);
  });

  it('keeps the stored secret for the same server and asks again for another server', async () => {
    const before = await t.prisma.db.projectIntegration.findFirstOrThrow({ where: { projectId } });
    const kept = expectBody<JiraConfigDTO>(
      track(
        await lead.put(`${P}/integrations/jira`, jiraSettings({ secret: '', issueType: 'Defect' })),
      ),
      200,
    );
    expect(kept).toMatchObject({ hasSecret: true, issueType: 'Defect' });
    const after = await t.prisma.db.projectIntegration.findFirstOrThrow({ where: { projectId } });
    expect(after.secretEnc).toBe(before.secretEnc);

    const moved = track(
      await lead.put(
        `${P}/integrations/jira`,
        jiraSettings({ secret: undefined, baseUrl: 'https://evil.example' }),
      ),
    );
    expect(errorCode(moved)).toBe('SECRET_REQUIRED');
    const withCredentials = track(
      await lead.put(
        `${P}/integrations/jira`,
        jiraSettings({ baseUrl: mock.url.replace('http://', 'http://user:pw@') }),
      ),
    );
    expect(errorCode(withCredentials)).toBe('VALIDATION_ERROR');
    expect(
      errorCode(track(await lead.put(`${P}/integrations/jira`, jiraSettings({ baseUrl: 'x' })))),
    ).toBe('VALIDATION_ERROR');
    expect(
      errorCode(
        track(await lead.put(`${P}/integrations/jira`, jiraSettings({ authType: 'basic' }))),
      ),
    ).toBe('VALIDATION_ERROR'); // basic auth needs a username
    // restore the Bug issue type
    expectBody(track(await lead.put(`${P}/integrations/jira`, jiraSettings())), 200);
  });

  it('shows members the status without auth details', async () => {
    const status = expectBody<IntegrationsStatusDTO>(
      track(await viewer.get(`${P}/integrations`)),
      200,
    );
    expect(status).toEqual({ jira: { enabled: true, baseUrl: mock.url, projectKey: 'TEAM' } });
    const settings = expectBody<JiraConfigDTO>(
      track(await lead.get(`${P}/integrations/jira`)),
      200,
    );
    expect(settings.hasSecret).toBe(true);
  });
});

describe('POST integrations/jira/test', () => {
  it('tests the stored settings with the PAT as a Bearer token', async () => {
    const res = expectBody<JiraTestResultDTO>(
      track(await lead.post(`${P}/integrations/jira/test`, {})),
      200,
    );
    expect(res).toEqual({
      ok: true,
      message: 'Connected to Example Jira (Server 9.12.2) — project TEAM (Example Edge Devices)',
      serverTitle: 'Example Jira (Server 9.12.2)',
      projectName: 'Example Edge Devices',
    });
    expect(mock.requests.map((r) => r.path)).toEqual([
      '/rest/api/2/serverInfo',
      '/rest/api/2/project/TEAM',
    ]);
    expect(mock.requests.every((r) => r.authorization === `Bearer ${PAT}`)).toBe(true);
  });

  it('tests unsaved Cloud settings with basic auth (e-mail + API token)', async () => {
    const res = expectBody<JiraTestResultDTO>(
      track(
        await lead.post(
          `${P}/integrations/jira/test`,
          jiraSettings({ authType: 'basic', username: CLOUD_USER, secret: CLOUD_TOKEN }),
        ),
      ),
      200,
    );
    expect(res.ok).toBe(true);
    const expected = `Basic ${Buffer.from(`${CLOUD_USER}:${CLOUD_TOKEN}`).toString('base64')}`;
    expect(mock.requests.every((r) => r.authorization === expected)).toBe(true);
  });

  it('answers ok:false with a message for every failure', async () => {
    const test = async (body: object, api = lead, p = P) =>
      expectBody<JiraTestResultDTO>(
        track(await api.post(`${p}/integrations/jira/test`, body)),
        200,
      );

    const wrongProject = await test(jiraSettings({ projectKey: 'NOPE', secret: undefined }));
    expect(wrongProject.ok).toBe(false);
    expect(wrongProject.serverTitle).toBe('Example Jira (Server 9.12.2)');
    expect(wrongProject.message).toMatch(/project NOPE was not found/);

    const wrongToken = await test(jiraSettings({ secret: 'wrong-token' }));
    expect(wrongToken).toMatchObject({ ok: false, serverTitle: null });
    expect(wrongToken.message).toMatch(/You are not authenticated/);

    const closed = http.createServer();
    const port = await new Promise<number>((r) =>
      closed.listen(0, '127.0.0.1', () => r((closed.address() as AddressInfo).port)),
    );
    await new Promise((r) => closed.close(r));
    const unreachable = await test(jiraSettings({ baseUrl: `http://127.0.0.1:${port}` }));
    expect(unreachable.ok).toBe(false);
    expect(unreachable.message).toMatch(/Cannot reach the Jira server.*ECONNREFUSED/);

    const otherServerWithoutToken = await test(
      jiraSettings({ baseUrl: `http://127.0.0.1:${port}`, secret: undefined }),
    );
    expect(otherServerWithoutToken.message).toMatch(/Enter the token/);

    const notConfigured = await test({}, lead, `/projects/${otherProjectId}`);
    expect(notConfigured).toMatchObject({
      ok: false,
      message: 'Jira is not set up for this project yet',
    });

    expect((await viewer.post(`${P}/integrations/jira/test`, {})).status).toBe(403);
    expect(errorCode(await lead.post(`${P}/integrations/jira/test`, { baseUrl: 'x' }))).toBe(
      'VALIDATION_ERROR',
    );
  });
});

// ---------------------------------------------------------------- defects ↔ Jira

describe('defects and Jira issues', () => {
  it('creates a Jira issue with summary, labels, wiki-markup description and TMT link', async () => {
    const d = await newDefect({
      title: 'Pairing fails on 5 GHz',
      description: 'Seen twice on {noformat} *router* X',
      severity: 'critical',
      runCaseId: ngRunCase.id,
    });
    const linked = expectBody<DefectDTO>(
      track(await tester.post(`${P}/defects/${d.id}/jira`)),
      200,
    );
    expect(linked.externalKey).toMatch(/^TEAM-\d+$/);
    expect(linked.externalUrl).toBe(`${mock.url}/browse/${linked.externalKey}`);
    expect(linked.externalStatus).toBe('To Do');
    expect(linked.externalSyncedAt).not.toBeNull();

    const create = mock.requests.find((r) => r.method === 'POST')!;
    expect(create.authorization).toBe(`Bearer ${PAT}`);
    const fields = (create.body as { fields: Record<string, unknown> }).fields;
    expect(fields).toMatchObject({
      project: { key: 'TEAM' },
      issuetype: { name: 'Bug' },
      summary: `[${d.key}] Pairing fails on 5 GHz`,
      labels: ['tmt'],
    });
    const description = String(fields.description);
    expect(description).toContain(
      'h3. Description\n{noformat}\nSeen twice on { noformat} *router* X\n{noformat}',
    );
    expect(description).toContain(
      'h3. Steps to reproduce\n{noformat}\n1. Hold WPS\n2. Open app\n{noformat}',
    );
    expect(description).toContain('h3. Actual result\n{noformat}\nPairing times out after 60 s');
    expect(description).toContain('h3. Environment\n{noformat}\nAdapter FW: 2.1.0\n{noformat}');
    expect(description).toContain('|Severity|Critical|');
    expect(description).toContain(
      `|${wikiCell(tc.displayId)}|Pair adapter \\| with \\[app\\]|RUN\\-A|26TR\\-TEAM\\-10\\-1|NG|`,
    );
    expect(description).toContain(
      `Created from TMT defect [${d.key}|http://tmt.example.local:3000/projects/${projectId}/defects/${d.id}].`,
    );
    const entry = await activityEntry('jira_created', d.id);
    expect(entry!.summary).toBe(`Created Jira issue ${linked.externalKey} for ${d.key}`);

    const again = track(await tester.post(`${P}/defects/${d.id}/jira`));
    expect(again.status).toBe(409);
    expect(errorCode(again)).toBe('ALREADY_LINKED');
  });

  it('creates one issue for concurrent requests on the same defect', async () => {
    const d = await newDefect({ title: 'Double click' });
    const [a, b] = await Promise.all([
      tester.post(`${P}/defects/${d.id}/jira`),
      tester.post(`${P}/defects/${d.id}/jira`),
    ]);
    expect([a.status, b.status].toSorted()).toEqual([200, 409]);
    expect(mock.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });

  it('maps Jira errors to 502 JIRA_ERROR and keeps the defect unlinked', async () => {
    const d = await newDefect({ title: 'Bad issue type' });
    mock.failNext = {
      status: 400,
      body: { errorMessages: [], errors: { issuetype: 'valid issue type is required' } },
    };
    const res = track(await tester.post(`${P}/defects/${d.id}/jira`));
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({
      error: {
        code: 'JIRA_ERROR',
        details: { status: 400, messages: ['issuetype: valid issue type is required'] },
      },
    });
    const row = await t.prisma.db.defect.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.externalKey).toBeNull();
  });

  it('retries without labels when Jira does not allow them on the create screen', async () => {
    mock.rejectLabels = true;
    const d = await newDefect({ title: 'No labels screen' });
    const linked = expectBody<DefectDTO>(
      track(await tester.post(`${P}/defects/${d.id}/jira`)),
      200,
    );
    expect(linked.externalKey).toMatch(/^TEAM-/);
    const posts = mock.requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(2);
    expect((posts[1]!.body as { fields: object }).fields).not.toHaveProperty('labels');
  });

  it('links existing issues (verified in Jira) and refuses other keys and unknown issues', async () => {
    mock.issues.set('TEAM-7', { summary: 'Existing', status: 'In Progress' });
    const d = await newDefect({ title: 'Link me' });
    const linked = expectBody<DefectDTO>(
      track(await tester.post(`${P}/defects/${d.id}/jira/link`, { key: ' team-7 ' })),
      200,
    );
    expect(linked).toMatchObject({
      externalKey: 'TEAM-7',
      externalStatus: 'In Progress',
      externalUrl: `${mock.url}/browse/TEAM-7`,
    });
    expectBody(track(await tester.post(`${P}/defects/${d.id}/jira/link`, { key: 'TEAM-7' })), 200);
    const other = track(await tester.post(`${P}/defects/${d.id}/jira/link`, { key: 'TEAM-8' }));
    expect(other.status).toBe(409);
    expect(errorCode(other)).toBe('ALREADY_LINKED');

    const d2 = await newDefect({ title: 'Unknown issue' });
    const unknown = track(
      await tester.post(`${P}/defects/${d2.id}/jira/link`, { key: 'TEAM-404' }),
    );
    expect(unknown.status).toBe(422);
    expect(errorCode(unknown)).toBe('JIRA_ISSUE_NOT_FOUND');
    expect(
      errorCode(track(await tester.post(`${P}/defects/${d2.id}/jira/link`, { key: 'nope' }))),
    ).toBe('VALIDATION_ERROR');
    const entry = await activityEntry('jira_linked', d.id);
    expect(entry!.summary).toBe(`Linked ${d.key} to Jira issue TEAM-7`);
  });

  it('syncs the status (and follows moved issues); refuses unlinked defects', async () => {
    const d = await newDefect({ title: 'Sync me' });
    const linked = expectBody<DefectDTO>(
      track(await tester.post(`${P}/defects/${d.id}/jira`)),
      200,
    );
    const key = linked.externalKey!;
    mock.issues.get(key)!.status = 'Done';
    const synced = expectBody<DefectDTO>(
      track(await tester.post(`${P}/defects/${d.id}/jira/sync`)),
      200,
    );
    expect(synced.externalStatus).toBe('Done');
    expect(new Date(synced.externalSyncedAt!).getTime()).toBeGreaterThanOrEqual(
      new Date(linked.externalSyncedAt!).getTime(),
    );
    const entry = await activityEntry('jira_synced', d.id);
    expect(entry!.summary).toBe(`${d.key}: Jira ${key} status To Do → Done`);

    // Moved to another project in Jira: Jira answers with the new key.
    mock.issues.set('APP-55', { summary: 'moved', status: 'Open' });
    mock.moved.set(key, 'APP-55');
    const moved = expectBody<DefectDTO>(
      track(await tester.post(`${P}/defects/${d.id}/jira/sync`)),
      200,
    );
    expect(moved).toMatchObject({
      externalKey: 'APP-55',
      externalStatus: 'Open',
      externalUrl: `${mock.url}/browse/APP-55`,
    });

    mock.issues.delete('APP-55');
    const gone = track(await tester.post(`${P}/defects/${d.id}/jira/sync`));
    expect(errorCode(gone)).toBe('JIRA_ISSUE_NOT_FOUND');

    const unlinked = await newDefect({ title: 'Never linked' });
    const res = track(await tester.post(`${P}/defects/${unlinked.id}/jira/sync`));
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe('NOT_LINKED');
  });

  it('unlinks without calling Jira', async () => {
    const d = await newDefect({ title: 'Unlink me' });
    expectBody(track(await tester.post(`${P}/defects/${d.id}/jira`)), 200);
    mock.requests = [];
    const cleared = expectBody<DefectDTO>(
      track(await tester.delete(`${P}/defects/${d.id}/jira`)),
      200,
    );
    expect(cleared).toMatchObject({
      externalKey: null,
      externalUrl: null,
      externalStatus: null,
      externalSyncedAt: null,
    });
    expect(mock.requests).toHaveLength(0);
    expect(await activityEntry('jira_unlinked', d.id)).not.toBeNull();
    // Idempotent.
    expectBody(track(await tester.delete(`${P}/defects/${d.id}/jira`)), 200);
  });

  it('times out slow Jira servers (502 JIRA_ERROR)', async () => {
    const d = await newDefect({ title: 'Slow Jira' });
    const limits = t.app.get(JiraClientFactory).limits;
    const saved = limits.timeoutMs;
    limits.timeoutMs = 300;
    mock.delayMs = 2000;
    try {
      const res = track(await tester.post(`${P}/defects/${d.id}/jira`));
      expect(res.status).toBe(502);
      expect(res.body).toMatchObject({ error: { code: 'JIRA_ERROR', details: { status: null } } });
      expect((res.body as { error: { message: string } }).error.message).toMatch(/did not answer/);
    } finally {
      limits.timeoutMs = saved;
    }
  });

  it('requires an enabled, readable configuration (422 JIRA_NOT_CONFIGURED)', async () => {
    const other = `/projects/${otherProjectId}`;
    const d = expectBody<DefectDTO>(await lead.post(`${other}/defects`, { title: 'x' }), 201);
    for (const res of [
      await lead.post(`${other}/defects/${d.id}/jira`),
      await lead.post(`${other}/defects/${d.id}/jira/link`, { key: 'TEAM-7' }),
    ]) {
      expect(res.status).toBe(422);
      expect(errorCode(res)).toBe('JIRA_NOT_CONFIGURED');
    }

    const mine = await newDefect({ title: 'Disabled' });
    expectBody(
      track(await lead.put(`${P}/integrations/jira`, jiraSettings({ enabled: false, secret: '' }))),
      200,
    );
    expect(errorCode(await tester.post(`${P}/defects/${mine.id}/jira`))).toBe(
      'JIRA_NOT_CONFIGURED',
    );
    // Stored settings can still be tested while turned off.
    expect(
      expectBody<JiraTestResultDTO>(track(await lead.post(`${P}/integrations/jira/test`, {})), 200)
        .ok,
    ).toBe(true);
    expectBody(track(await lead.put(`${P}/integrations/jira`, jiraSettings({ secret: '' }))), 200);

    // A secret sealed for another project (or with another key) cannot be opened.
    const row = await t.prisma.db.projectIntegration.findFirstOrThrow({ where: { projectId } });
    await t.prisma.db.projectIntegration.create({
      data: {
        projectId: otherProjectId,
        kind: 'jira',
        config: row.config as Prisma.InputJsonValue,
        secretEnc: row.secretEnc,
      },
    });
    const res = await lead.post(`${other}/defects/${d.id}/jira`);
    expect(errorCode(res)).toBe('JIRA_NOT_CONFIGURED');
    expect((res.body as { error: { message: string } }).error.message).toMatch(
      /cannot be decrypted/,
    );
  });

  it('keeps Jira actions for testers and above', async () => {
    const d = await newDefect({ title: 'Viewer cannot' });
    expect((await viewer.post(`${P}/defects/${d.id}/jira`)).status).toBe(403);
    expect((await viewer.post(`${P}/defects/${d.id}/jira/sync`)).status).toBe(403);
    expect((await viewer.delete(`${P}/defects/${d.id}/jira`)).status).toBe(403);
  });
});

describe('removing the integration', () => {
  it('deletes the settings and logs it', async () => {
    expect((await tester.delete(`${P}/integrations/jira`)).status).toBe(403);
    expect((await lead.delete(`${P}/integrations/jira`)).status).toBe(204);
    expect(JSON.parse(track(await lead.get(`${P}/integrations/jira`)).text)).toBeNull();
    expect(
      expectBody<IntegrationsStatusDTO>(track(await viewer.get(`${P}/integrations`)), 200),
    ).toEqual({ jira: null });
    expect((await lead.delete(`${P}/integrations/jira`)).status).toBe(204);
    const removed = await t.prisma.db.activityLog.findMany({
      where: { action: 'jira_removed', projectId },
    });
    expect(removed).toHaveLength(1);
  });

  it('never returned a secret in any response', () => {
    expect(bodies.length).toBeGreaterThan(30);
    for (const body of bodies) {
      expect(body).not.toContain(PAT);
      expect(body).not.toContain(CLOUD_TOKEN);
      expect(body).not.toMatch(/v1:[A-Za-z0-9_-]{16}:/);
    }
  });
});
