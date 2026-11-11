/**
 * Integration-test harness: the real Nest application (in-process, supertest) on the PostgreSQL
 * test database. Each spec file calls `createTestApp()` once; it truncates every table first.
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ALL_TABLES } from '@tmt/database';
import { CSRF_HEADER, CSRF_HEADER_VALUE, type ProjectRole } from '@tmt/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfig } from '../src/config/app-config.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type {
  AttachmentEntityType,
  DefectSeverity,
  DefectStatus,
  Prisma,
  Suite,
} from '@tmt/database';
import { createCaseSchema, defectKey, displayId, type FieldDef } from '@tmt/shared';
import type { z } from 'zod';
import { insertCase } from '../src/modules/library/library.queries.js';
import { StorageService } from '../src/modules/storage/storage.service.js';

export const PASSWORD = 'Passw0rd!test';
let passwordHash: Promise<string> | null = null;

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  config: AppConfig;
  close(): Promise<void>;
}

export function testConfig(overrides: Partial<AppConfig> = {}, dataDir = os.tmpdir()): AppConfig {
  const base = AppConfig.fromEnv({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL!,
    LOG_LEVEL: 'silent',
    DATA_DIR: dataDir,
    LOGIN_RATE_LIMIT_PER_MIN: '10000',
    WEB_ORIGINS: 'http://localhost:3000',
  });
  return new AppConfig({ ...base, ...overrides } as AppConfig);
}

export async function createTestApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tmt-api-test-'));
  const config = testConfig(overrides, dataDir);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AppConfig)
    .useValue(config)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await truncateAll(prisma);
  return {
    app,
    prisma,
    config,
    close: async () => {
      await app.close();
      await fsp.rm(dataDir, { recursive: true, force: true });
    },
  };
}

export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.db.$executeRawUnsafe(
    `TRUNCATE TABLE ${ALL_TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

export async function createUser(
  prisma: PrismaService,
  username: string,
  opts: { isAdmin?: boolean; mustChangePassword?: boolean; isActive?: boolean } = {},
) {
  passwordHash ??= hashPassword(PASSWORD);
  return prisma.db.user.create({
    data: {
      username,
      displayName: username.charAt(0).toUpperCase() + username.slice(1),
      passwordHash: await passwordHash,
      isAdmin: opts.isAdmin ?? false,
      isActive: opts.isActive ?? true,
      mustChangePassword: opts.mustChangePassword ?? false,
    },
  });
}

export async function createProject(
  prisma: PrismaService,
  key: string,
  members: { userId: number; role: ProjectRole }[],
) {
  return prisma.db.project.create({
    data: {
      key,
      name: `${key} project`,
      docNoPattern: '{YY}TR-TEST-{MM}-{SEQ}',
      members: { create: members },
    },
  });
}

/** An HTTP client signed in as `username` (session cookie + CSRF header on unsafe calls). */
export interface Client {
  get(url: string): request.Test;
  post(url: string, body?: object): request.Test;
  put(url: string, body?: object): request.Test;
  patch(url: string, body?: object): request.Test;
  delete(url: string): request.Test;
  cookie: string;
}

export const API = '/api/v1';

export async function login(t: TestApp, username: string, password = PASSWORD): Promise<Client> {
  const res = await request(t.app.getHttpServer())
    .post(`${API}/auth/login`)
    .set(CSRF_HEADER, CSRF_HEADER_VALUE)
    .send({ username, password });
  if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status} ${res.text}`);
  const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  return clientWithCookie(t, cookie);
}

export function clientWithCookie(t: TestApp, cookie: string): Client {
  const server = t.app.getHttpServer();
  const unsafe = (r: request.Test) => r.set('Cookie', cookie).set(CSRF_HEADER, CSRF_HEADER_VALUE);
  return {
    cookie,
    get: (url) => request(server).get(`${API}${url}`).set('Cookie', cookie),
    post: (url, body) => unsafe(request(server).post(`${API}${url}`)).send(body ?? {}),
    put: (url, body) => unsafe(request(server).put(`${API}${url}`)).send(body ?? {}),
    patch: (url, body) => unsafe(request(server).patch(`${API}${url}`)).send(body ?? {}),
    delete: (url) => unsafe(request(server).delete(`${API}${url}`)),
  };
}

/** Unauthenticated requests. */
export function anon(t: TestApp) {
  return request(t.app.getHttpServer());
}

// ------------------------------------------------------------------ library & import helpers

/**
 * A further application on the same database that does NOT truncate it (e.g. other upload limits
 * inside one test file). Close it before the main app.
 */
export async function createExtraTestApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tmt-api-test-'));
  const config = testConfig(overrides, dataDir);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AppConfig)
    .useValue(config)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    config,
    close: async () => {
      await app.close();
      await fsp.rm(dataDir, { recursive: true, force: true });
    },
  };
}

/** Awaits a request and returns its JSON body; fails with the response when the status differs. */
export async function expectStatus<T>(
  req: PromiseLike<request.Response>,
  status: number,
): Promise<T> {
  const res = await req;
  if (res.status !== status) {
    throw new Error(`expected HTTP ${status}, got ${res.status}: ${res.text}`);
  }
  return res.body as T;
}

/** Error code of an error envelope. */
export function errorCode(res: request.Response): string | undefined {
  return (res.body as { error?: { code?: string } } | undefined)?.error?.code;
}

export interface UploadForm {
  /** `field` defaults to `file`; `contentType` to application/octet-stream (`upload()` only). */
  file?: { name: string; content: Buffer | string; field?: string; contentType?: string };
  fields?: Record<string, string>;
}

/** Multipart POST as `client`: the file in the `file` field plus text fields. */
export function uploadAs(t: TestApp, client: Client, url: string, form: UploadForm): request.Test {
  let req = request(t.app.getHttpServer())
    .post(`${API}${url}`)
    .set('Cookie', client.cookie)
    .set(CSRF_HEADER, CSRF_HEADER_VALUE);
  for (const [name, value] of Object.entries(form.fields ?? {})) req = req.field(name, value);
  if (form.file) {
    const { name, content } = form.file;
    req = req.attach('file', Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  }
  return req;
}

/** GET of a file download with the raw bytes as `res.body` (Buffer). */
export function download(client: Client, url: string): request.Test {
  return client
    .get(url)
    .buffer(true)
    .parse((res, done) => {
      const stream = res as unknown as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => done(null, Buffer.concat(chunks)));
    });
}

// ---------------------------------------------------------------- execution, templates, automation
// Library cases, shared steps, defects and evidence files are created directly in the database:
// their API routes belong to other modules, these tests exercise execution on top of them.

/** Response body, failing the test with the body when the status is unexpected. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function expectBody<T = any>(res: request.Response, status: number): T {
  if (res.status !== status) {
    throw new Error(`expected HTTP ${status}, got ${res.status}: ${res.text}`);
  }
  return res.body as T;
}

/** Error code of an error envelope. */

export async function setDisplayName(t: TestApp, userId: number, displayName: string) {
  await t.prisma.db.user.update({ where: { id: userId }, data: { displayName } });
}

export async function createSuite(
  t: TestApp,
  projectId: number,
  input: {
    name: string;
    prefix: string;
    topic?: string;
    envTemplate?: string[];
    fieldDefs?: FieldDef[];
  },
): Promise<Suite> {
  return t.prisma.db.suite.create({
    data: {
      projectId,
      name: input.name,
      prefix: input.prefix,
      topic: input.topic ?? null,
      envTemplate: input.envTemplate ?? [],
      fieldDefs: (input.fieldDefs ?? []) as unknown as Prisma.InputJsonValue,
    },
  });
}

/** Section at the end of its parent's children. */
export async function createSection(
  t: TestApp,
  suiteId: number,
  name: string,
  parentId: number | null = null,
) {
  const agg = await t.prisma.db.section.aggregate({
    where: { suiteId, parentId },
    _max: { sortOrder: true },
  });
  return t.prisma.db.section.create({
    data: { suiteId, parentId, name, sortOrder: (agg._max.sortOrder ?? 0) + 1 },
  });
}

/** Library case created like the API does (shared schema defaults, version 1). */
export async function createCase(
  t: TestApp,
  suite: Suite,
  userId: number,
  body: z.input<typeof createCaseSchema>,
) {
  const c = await insertCase(t.prisma.db, suite, createCaseSchema.parse(body), userId);
  return { ...c, displayId: displayId(suite.prefix, c.seq) };
}

export async function createSharedStep(
  t: TestApp,
  projectId: number,
  name: string,
  steps: { action: string; expected: string }[],
) {
  return t.prisma.db.sharedStep.create({ data: { projectId, name, steps } });
}

/** Defect with the next project number, optionally linked to a run case. */
export async function createDefect(
  t: TestApp,
  projectId: number,
  input: {
    title: string;
    severity?: DefectSeverity;
    status?: DefectStatus;
    releaseId?: number | null;
    runCaseId?: number;
    externalKey?: string;
  },
) {
  const db = t.prisma.db;
  const { nextDefectSeq } = await db.project.update({
    where: { id: projectId },
    data: { nextDefectSeq: { increment: 1 } },
    select: { nextDefectSeq: true },
  });
  const d = await db.defect.create({
    data: {
      projectId,
      seq: nextDefectSeq - 1,
      title: input.title,
      severity: input.severity ?? 'major',
      status: input.status ?? 'new',
      releaseId: input.releaseId ?? null,
      externalKey: input.externalKey ?? null,
    },
  });
  if (input.runCaseId !== undefined) {
    const rc = await db.runCase.findUniqueOrThrow({ where: { id: input.runCaseId } });
    await db.defectLink.create({
      data: { defectId: d.id, runCaseId: rc.id, testCaseId: rc.testCaseId },
    });
  }
  return { ...d, key: defectKey(d.seq) };
}

/** Stored file + attachment row (evidence); returns the row and the file's absolute path. */
export async function addAttachment(
  t: TestApp,
  projectId: number,
  entityType: AttachmentEntityType,
  entityId: number,
  fileName: string,
  content: string,
) {
  const storage = t.app.get(StorageService);
  const stored = await storage.saveBuffer(Buffer.from(content));
  const row = await t.prisma.db.attachment.create({
    data: { projectId, entityType, entityId, fileName, mimeType: 'text/plain', ...stored },
  });
  return { row, path: storage.resolve(stored.storageKey) };
}

/** Absolute path of an attachment's file. */
export async function attachmentPath(t: TestApp, attachmentId: string): Promise<string> {
  const row = await t.prisma.db.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
  return t.app.get(StorageService).resolve(row.storageKey);
}

/** Multipart request (session cookie + CSRF header) with text fields and one file. */
export function upload(
  t: TestApp,
  client: Pick<Client, 'cookie'>,
  url: string,
  form: UploadForm,
  method: 'post' | 'put' = 'post',
): request.Test {
  let req = request(t.app.getHttpServer())
    [method](`${API}${url}`)
    .set('Cookie', client.cookie)
    .set(CSRF_HEADER, CSRF_HEADER_VALUE);
  for (const [name, value] of Object.entries(form.fields ?? {})) req = req.field(name, value);
  if (form.file) {
    const f = form.file;
    req = req.attach(f.field ?? 'file', Buffer.from(f.content), {
      filename: f.name,
      contentType: f.contentType ?? 'application/octet-stream',
    });
  }
  return req;
}

/** Reads the response body as a Buffer (downloads). */
export function binary(req: request.Test): request.Test {
  return req.buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });
}
