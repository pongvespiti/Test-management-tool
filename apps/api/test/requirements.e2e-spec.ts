/**
 * Requirements table: CRUD, links to cases, the traceability report that joins links and
 * citations, Excel/CSV import (upload → analyze → preview → commit) and the read-only Jira import
 * against a fake Jira server.
 */
import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import type {
  RequirementDTO,
  RequirementImportAnalysisDTO,
  RequirementImportPreviewDTO,
  RequirementImportResultDTO,
  RequirementJiraResultDTO,
  RequirementListItemDTO,
  TraceabilityDTO,
} from '@tmt/shared';
import {
  createCase,
  createProject,
  createSection,
  createSuite,
  createTestApp,
  createUser,
  errorCode,
  expectBody,
  expectStatus,
  login,
  uploadAs,
  type Client,
  type TestApp,
} from './helpers.js';

// ---------------------------------------------------------------- fake Jira

const PAT = 'pat-requirements-0123456789';
const jira = {
  url: '',
  requests: [] as { method: string; path: string }[],
  issues: new Map<string, { summary: string; status: string; description: string | null }>(),
  /** Answer of the Cloud search endpoint: 404 makes the client fall back to Server's. */
  cloudSearch: true,
};
let jiraServer: http.Server;
const sockets = new Set<Socket>();

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function handleJira(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', jira.url);
  jira.requests.push({ method: req.method ?? 'GET', path: url.pathname });
  if (req.headers.authorization !== `Bearer ${PAT}`)
    return send(res, 401, { errorMessages: ['no'] });
  if (req.method === 'GET' && url.pathname === '/rest/api/2/serverInfo')
    return send(res, 200, { serverTitle: 'Fake Jira', version: '9.0.0' });
  if (req.method === 'GET' && url.pathname === '/rest/api/2/project/IOT')
    return send(res, 200, { key: 'IOT', name: 'IoT' });
  const cloud = url.pathname === '/rest/api/2/search/jql';
  if (req.method === 'GET' && (cloud || url.pathname === '/rest/api/2/search')) {
    if (cloud && !jira.cloudSearch) return send(res, 404, {});
    const jql = url.searchParams.get('jql') ?? '';
    const inList = /^key in \((.*)\)$/.exec(jql);
    if (!inList && jql !== 'project = IOT')
      return send(res, 400, { errorMessages: ['Error in the JQL Query'] });
    const keys = inList ? inList[1]!.split(',') : [...jira.issues.keys()];
    const issues = keys
      .filter((k) => jira.issues.has(k))
      .map((k) => ({
        key: k,
        fields: { ...jira.issues.get(k)!, status: { name: jira.issues.get(k)!.status } },
      }));
    return send(res, 200, { issues });
  }
  return send(res, 404, { errorMessages: ['Unknown endpoint'] });
}

// ---------------------------------------------------------------- app

let t: TestApp;
let lead: Client;
let tester: Client;
let viewer: Client;
let outsider: Client;
let P: string;
let cases: { id: number }[];

beforeAll(async () => {
  jiraServer = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => handleJira(req, res));
  });
  jiraServer.on('connection', (s: Socket) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((r) => jiraServer.listen(0, '127.0.0.1', () => r()));
  jira.url = `http://127.0.0.1:${(jiraServer.address() as AddressInfo).port}`;

  t = await createTestApp({ appSecret: null });
  const l = await createUser(t.prisma, 'lead');
  const te = await createUser(t.prisma, 'tester');
  const v = await createUser(t.prisma, 'viewer');
  await createUser(t.prisma, 'outsider');
  const projectId = (
    await createProject(t.prisma, 'REQ', [
      { userId: l.id, role: 'lead' },
      { userId: te.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');
  outsider = await login(t, 'outsider');

  const suite = await createSuite(t, projectId, { name: 'Unit operation', prefix: 'UO' });
  const section = await createSection(t, suite.id, 'All');
  cases = [];
  for (const [title, references] of [
    ['Power on', 'req 1'],
    ['Power off', 'REQ_1'],
    ['Timer', undefined],
    ['Fan speed', undefined],
  ] as const) {
    cases.push(await createCase(t, suite, l.id, { title, sectionId: section.id, references }));
  }
});
afterAll(async () => {
  for (const s of sockets) s.destroy();
  await new Promise((r) => jiraServer.close(r));
  await t.close();
});
beforeEach(() => {
  jira.requests = [];
});

const list = async (client: Client, query = '') =>
  expectBody<RequirementListItemDTO[]>(await client.get(`${P}/requirements${query}`), 200);

describe('requirements CRUD', () => {
  let req1: RequirementDTO;

  it('adds a requirement with a canonical key and shows the cases citing it', async () => {
    req1 = expectBody<RequirementDTO>(
      await tester.post(`${P}/requirements`, {
        key: 'req 1',
        title: 'Unit powers on within 3 s',
        description: 'From the spec',
        sourceRef: 'Spec v3 §4.1',
      }),
      201,
    );
    expect(req1).toMatchObject({
      key: 'REQ-1',
      source: 'manual',
      sourceRef: 'Spec v3 §4.1',
      caseCount: 2,
    });
    expect(req1.cases.map((c) => [c.displayId, c.via])).toEqual([
      ['UO-001', 'refs'],
      ['UO-002', 'refs'],
    ]);
  });

  it('refuses the same key in another spelling', async () => {
    const res = await lead.post(`${P}/requirements`, { key: 'Req_1', title: 'Again' });
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('REQUIREMENT_KEY_TAKEN');
  });

  it('is readable by viewers, writable by testers only', async () => {
    expect(await list(viewer)).toHaveLength(1);
    expect((await viewer.post(`${P}/requirements`, { key: 'X-1', title: 'x' })).status).toBe(403);
    expect((await outsider.get(`${P}/requirements`)).status).toBe(404);
    expect((await viewer.delete(`${P}/requirements/${req1.id}`)).status).toBe(403);
  });

  it('validates the input', async () => {
    expect((await tester.post(`${P}/requirements`, { key: '', title: 'x' })).status).toBe(400);
    expect((await tester.post(`${P}/requirements`, { key: 'A-1', title: ' ' })).status).toBe(400);
  });

  it('links cases explicitly and counts the union with the citations', async () => {
    const linked = expectBody<RequirementDTO>(
      await tester.put(`${P}/requirements/${req1.id}/cases`, {
        caseIds: [cases[1]!.id, cases[2]!.id],
      }),
      200,
    );
    expect(linked.cases.map((c) => [c.displayId, c.via])).toEqual([
      ['UO-001', 'refs'],
      ['UO-002', 'both'],
      ['UO-003', 'linked'],
    ]);
    expect(linked.caseCount).toBe(3);
    expect((await list(viewer))[0]!.caseCount).toBe(3);
  });

  it('rejects links to cases of another project or unknown cases', async () => {
    const res = await tester.put(`${P}/requirements/${req1.id}/cases`, { caseIds: [999_999] });
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe('BAD_CASE');
  });

  it('edits text and key; searches by key or title', async () => {
    const edited = expectBody<RequirementDTO>(
      await tester.patch(`${P}/requirements/${req1.id}`, { title: 'Unit powers on within 2 s' }),
      200,
    );
    expect(edited.title).toBe('Unit powers on within 2 s');
    expect(await list(viewer, '?q=2 s')).toHaveLength(1);
    expect(await list(viewer, '?q=nothing')).toHaveLength(0);
    expect(await list(viewer, '?source=jira')).toHaveLength(0);
    const taken = expectBody<RequirementDTO>(
      await tester.post(`${P}/requirements`, { key: 'REQ-2', title: 'Second' }),
      201,
    );
    const clash = await tester.patch(`${P}/requirements/${taken.id}`, { key: 'req-1' });
    expect(clash.status).toBe(409);
  });

  it('shows requirements in the traceability report, also those without cases', async () => {
    const report = expectBody<TraceabilityDTO>(await viewer.get(`${P}/reports/traceability`), 200);
    const row1 = report.rows.find((r) => r.reference === 'REQ-1')!;
    expect(row1.requirement).toMatchObject({
      title: 'Unit powers on within 2 s',
      source: 'manual',
    });
    expect(row1.counts.total).toBe(3);
    const row2 = report.rows.find((r) => r.reference === 'REQ-2')!;
    expect(row2.cases).toEqual([]);
    expect(row2.requirement?.id).toBeDefined();
    // The two linked/citing cases and the unlinked one: only "Fan speed" has neither.
    expect(report.casesWithoutReference).toBe(1);
  });

  it('deletes a requirement with its links, keeping the cases', async () => {
    const all = await list(lead);
    const second = all.find((r) => r.key === 'REQ-2')!;
    expect((await tester.delete(`${P}/requirements/${second.id}`)).status).toBe(204);
    expect((await tester.get(`${P}/requirements/${second.id}`)).status).toBe(404);
    const gone = await tester.get(`${P}/requirements/${second.id}`);
    expect(errorCode(gone)).toBe('REQUIREMENT_NOT_FOUND');
    expect(
      await t.prisma.db.testCase.count({ where: { id: { in: cases.map((c) => c.id) } } }),
    ).toBe(4);
  });
});

describe('Excel / CSV import', () => {
  const csv = [
    'Requirement ID,Title,Description,Source',
    'REQ-1,Should not overwrite? yes it does,New text,Spec v4',
    'REQ-10,Remote start,Start from the app,Minutes 2026-10-01',
    ',No id,,',
    'REQ-11,,,',
    'req 10,Repeated,,',
    '3.2.1,Defrost cycle,,Spec §3.2.1',
  ].join('\n');

  async function analyzed(): Promise<RequirementImportAnalysisDTO> {
    const up = await expectStatus<{ uploadId: string }>(
      uploadAs(t, tester, `${P}/imports/upload`, {
        file: { name: 'requirements.csv', content: csv },
      }),
      200,
    );
    return expectBody<RequirementImportAnalysisDTO>(
      await tester.post(`${P}/requirements/import/analyze`, { uploadId: up.uploadId }),
      200,
    );
  }
  const body = (a: RequirementImportAnalysisDTO, extra: Record<string, unknown> = {}) => {
    const col = (f: string) => a.columns.find((c) => c.suggested === f)?.col ?? null;
    return {
      uploadId: a.uploadId,
      sheet: a.sheet,
      headerRow: a.headerRow,
      mapping: {
        key: col('key'),
        title: col('title'),
        description: col('description'),
        sourceRef: col('sourceRef'),
      },
      ...extra,
    };
  };

  it('suggests the columns from their headers', async () => {
    const a = await analyzed();
    expect(a.headerRow).toBe(1);
    expect(a.columns.map((c) => c.suggested)).toEqual(['key', 'title', 'description', 'sourceRef']);
  });

  it('previews without writing, then creates and updates', async () => {
    const a = await analyzed();
    const before = (await list(lead)).length;
    const preview = expectBody<RequirementImportPreviewDTO>(
      await tester.post(`${P}/requirements/import/preview`, body(a)),
      200,
    );
    expect(preview).toMatchObject({ create: 2, update: 1, skip: 1, invalid: 2, truncated: false });
    expect(preview.rows.map((r) => [r.row, r.key, r.action])).toEqual([
      [2, 'REQ-1', 'update'],
      [3, 'REQ-10', 'create'],
      [4, '', 'invalid'],
      [5, 'REQ-11', 'invalid'],
      [6, 'REQ-10', 'skip'],
      [7, '3.2.1', 'create'],
    ]);
    expect(await list(lead)).toHaveLength(before);

    const done = expectBody<RequirementImportResultDTO>(
      await tester.post(`${P}/requirements/import/commit`, body(a)),
      200,
    );
    expect(done).toEqual({ created: 2, updated: 1, skipped: 1, invalid: 2 });
    const all = await list(viewer);
    expect(all.map((r) => [r.key, r.source])).toEqual([
      ['3.2.1', 'excel'],
      ['REQ-1', 'manual'],
      ['REQ-10', 'excel'],
    ]);
    expect(all.find((r) => r.key === 'REQ-1')!.title).toBe('Should not overwrite? yes it does');
    const entry = await t.prisma.db.activityLog.findFirst({
      where: { entityType: 'requirement', action: 'imported' },
    });
    expect(entry?.summary).toContain('2 new, 1 updated');
  });

  it('can leave existing requirements alone', async () => {
    const a = await analyzed();
    const done = expectBody<RequirementImportResultDTO>(
      await tester.post(`${P}/requirements/import/commit`, body(a, { onExisting: 'skip' })),
      200,
    );
    expect(done).toMatchObject({ created: 0, updated: 0 });
  });

  it('needs the import permission and a live upload', async () => {
    const a = await analyzed();
    expect((await viewer.post(`${P}/requirements/import/commit`, body(a))).status).toBe(403);
    const ghost = await tester.post(`${P}/requirements/import/analyze`, {
      uploadId: '00000000-0000-4000-8000-000000000000',
    });
    expect(ghost.status).toBe(404);
    expect(errorCode(ghost)).toBe('UPLOAD_NOT_FOUND');
    const badSheet = await tester.post(
      `${P}/requirements/import/preview`,
      body(a, { sheet: 'Nope' }),
    );
    expect(badSheet.status).toBe(422);
  });
});

describe('Jira import (read only)', () => {
  beforeAll(() => {
    jira.issues.set('IOT-1', {
      summary: 'Pairing works',
      status: 'Done',
      description: 'h3. Pairing',
    });
    jira.issues.set('IOT-2', { summary: 'OTA update', status: 'In Progress', description: null });
  });

  it('refuses while Jira is not set up', async () => {
    const res = await tester.post(`${P}/requirements/jira/import`, { keys: ['IOT-1'] });
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe('JIRA_NOT_CONFIGURED');
  });

  it('reads issues by key, reports the missing ones and never writes to Jira', async () => {
    expectBody(
      await lead.put(`${P}/integrations/jira`, {
        baseUrl: jira.url,
        projectKey: 'iot',
        issueType: 'Bug',
        authType: 'pat',
        secret: PAT,
      }),
      200,
    );
    jira.requests = [];
    const res = expectBody<RequirementJiraResultDTO>(
      await tester.post(`${P}/requirements/jira/import`, { keys: ['iot-1', 'IOT-2', 'IOT-404'] }),
      200,
    );
    expect(res).toEqual({ created: 2, updated: 0, missing: ['IOT-404'] });
    expect(jira.requests.every((r) => r.method === 'GET')).toBe(true);
    const jiraRows = await list(viewer, '?source=jira');
    expect(jiraRows.map((r) => [r.key, r.title, r.externalStatus])).toEqual([
      ['IOT-1', 'Pairing works', 'Done'],
      ['IOT-2', 'OTA update', 'In Progress'],
    ]);
    expect(jiraRows[0]!.externalUrl).toBe(`${jira.url}/browse/IOT-1`);
    expect(jiraRows[0]!.syncedAt).not.toBeNull();
    const one = expectBody<RequirementDTO>(
      await viewer.get(`${P}/requirements/${jiraRows[0]!.id}`),
      200,
    );
    expect(one.description).toBe('h3. Pairing');
  });

  it('keeps the Jira text on Jira requirements and lets the source document be edited', async () => {
    const [first] = await list(lead, '?source=jira');
    const res = await tester.patch(`${P}/requirements/${first!.id}`, { title: 'Mine' });
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe('JIRA_MANAGED');
    const ok = expectBody<RequirementDTO>(
      await tester.patch(`${P}/requirements/${first!.id}`, { sourceRef: 'Minutes 2026-11-01' }),
      200,
    );
    expect(ok.sourceRef).toBe('Minutes 2026-11-01');
  });

  it('refreshes from Jira, also on a Server that only has the older search endpoint', async () => {
    jira.cloudSearch = false;
    jira.issues.set('IOT-1', {
      summary: 'Pairing works (v2)',
      status: 'Closed',
      description: null,
    });
    const res = expectBody<RequirementJiraResultDTO>(
      await tester.post(`${P}/requirements/jira/sync`),
      200,
    );
    expect(res).toEqual({ created: 0, updated: 2, missing: [] });
    const rows = await list(viewer, '?source=jira');
    expect(rows.find((r) => r.key === 'IOT-1')).toMatchObject({
      title: 'Pairing works (v2)',
      externalStatus: 'Closed',
    });
    expect(jira.requests.every((r) => r.method === 'GET')).toBe(true);
    jira.cloudSearch = true;
  });

  it('imports a JQL search and turns Jira errors into 502', async () => {
    const byJql = expectBody<RequirementJiraResultDTO>(
      await tester.post(`${P}/requirements/jira/import`, { jql: 'project = IOT' }),
      200,
    );
    expect(byJql).toEqual({ created: 0, updated: 2, missing: [] });
    const bad = await tester.post(`${P}/requirements/jira/import`, { jql: 'broken (' });
    expect(bad.status).toBe(502);
    expect(errorCode(bad)).toBe('JIRA_ERROR');
  });

  it('validates the request and the role', async () => {
    expect((await tester.post(`${P}/requirements/jira/import`, {})).status).toBe(400);
    expect(
      (await tester.post(`${P}/requirements/jira/import`, { keys: ['IOT-1'], jql: 'x' })).status,
    ).toBe(400);
    expect((await tester.post(`${P}/requirements/jira/import`, { keys: ['nope'] })).status).toBe(
      400,
    );
    expect((await viewer.post(`${P}/requirements/jira/import`, { keys: ['IOT-1'] })).status).toBe(
      403,
    );
    expect((await viewer.post(`${P}/requirements/jira/sync`)).status).toBe(403);
  });
});
