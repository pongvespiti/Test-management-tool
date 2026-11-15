/**
 * `pnpm db:seed` — fills the database with a demo project so that every screen has data.
 *
 * Self-contained: it starts the API inside this process (no server has to run and no password has
 * to be typed), creates the demo accounts, then builds the project through the REST API as the
 * demo lead, so the data obeys every domain rule. Safe to run again: an existing demo project is
 * left alone.
 *
 * Settings (environment or `.env`): DATABASE_URL and the usual API settings, plus
 * SEED_USER_PASSWORD — password of the demo accounts (a random one is generated and printed when
 * it is empty; existing demo accounts keep their password).
 */
import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  API_PREFIX,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  passwordSchema,
  type ProjectDTO,
} from '@tmt/shared';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import type { AuthUser } from '../common/types/auth.js';
import { AppConfig } from '../config/app-config.js';
import { loadEnvFiles } from '../config/load-env.js';
import { hashPassword, randomPassword } from '../modules/auth/password.js';
import { SessionService } from '../modules/auth/session.service.js';
import { ProjectsService } from '../modules/projects/projects.service.js';
import { StandsService } from '../modules/stands/stands.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEMO_BUILDS,
  DEMO_DEFECTS,
  DEMO_PLAN,
  DEMO_PROJECT,
  DEMO_RELEASES,
  DEMO_DEVICES,
  DEMO_REQUIREMENTS,
  DEMO_RESULT_PATTERN,
  DEMO_ENV_LISTS,
  DEMO_RUNS,
  DEMO_SESSIONS,
  DEMO_SHARED_STEP,
  DEMO_STEPS_CASE,
  DEMO_SUITES,
  DEMO_STAND_ZONES,
  DEMO_TECHNICIAN,
  DEMO_USERS,
  DEMO_VIEWS,
  type DemoSuite,
} from './demo-data.js';

interface Id {
  id: number;
}

type Call = <T = Id>(method: string, path: string, body?: unknown) => Promise<T>;

/** `YYYY-MM-DD` of today plus `days` (UTC calendar; demo dates need no time zone care). */
function dayFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** REST client of the in-process API, signed in with a session cookie. */
function restClient(baseUrl: string, cookie: string): Call {
  return async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_HEADER_VALUE, cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
    return (text ? JSON.parse(text) : null) as T;
  };
}

/** Creates the missing demo accounts; returns their ids by username and whether any was created. */
async function ensureDemoUsers(
  prisma: PrismaService,
  password: string,
): Promise<{ ids: Map<string, number>; created: boolean }> {
  const ids = new Map<string, number>();
  let created = false;
  for (const demo of DEMO_USERS) {
    const existing = await prisma.db.user.findUnique({ where: { username: demo.username } });
    if (existing) {
      ids.set(demo.username, existing.id);
      continue;
    }
    const user = await prisma.db.user.create({
      data: {
        username: demo.username,
        displayName: demo.displayName,
        passwordHash: await hashPassword(password),
        mustChangePassword: false,
      },
    });
    ids.set(demo.username, user.id);
    created = true;
  }
  return { ids, created };
}

/** The demo technician (created once, like the other demo accounts). */
async function ensureDemoTechnician(prisma: PrismaService, password: string): Promise<number> {
  const existing = await prisma.db.user.findUnique({
    where: { username: DEMO_TECHNICIAN.username },
  });
  if (existing) return existing.id;
  const user = await prisma.db.user.create({
    data: {
      ...DEMO_TECHNICIAN,
      isTechnician: true,
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
    },
  });
  return user.id;
}

/**
 * Lab layout (only when there are no zones yet), a booking for the demo project and a request
 * to the technician, sent by the demo lead.
 */
async function seedStands(
  stands: StandsService,
  actor: AuthUser,
  call: Call,
  projectId: number,
  technicianId: number,
): Promise<void> {
  const board = await stands.board(actor, {});
  if (board.zones.length > 0) return;
  const ids = new Map<string, number>();
  for (const z of DEMO_STAND_ZONES) {
    const zone = await stands.createZone(actor, { name: z.name });
    for (const s of z.stands) {
      const stand = await stands.createStand(actor, {
        zoneId: zone.id,
        code: s.code,
        currentModel: s.model,
        inCharge: s.inCharge ?? null,
      });
      ids.set(s.code, stand.id);
    }
  }
  await call('POST', '/stands/bookings', {
    standId: ids.get('L1/B-1'),
    projectId,
    model: 'ACU-35X',
    startDate: dayFromToday(-3),
    endDate: dayFromToday(10),
    note: 'Firmware regression of v1.0',
  });
  await call('POST', '/stands/bookings', {
    standId: ids.get('L2/A-1'),
    projectId,
    model: 'ACU-25',
    startDate: dayFromToday(5),
    endDate: dayFromToday(20),
  });
  await call('POST', '/stands/bookings', {
    standId: ids.get('L1/A-1'),
    projectId,
    model: 'ACU-25',
    startDate: dayFromToday(1),
    endDate: dayFromToday(1),
    startTime: '09:00',
    endTime: '12:00',
    note: 'Short check of the new firmware',
  });
  await call('POST', '/stands/requests', {
    standId: ids.get('L2/A-1'),
    projectId,
    kind: 'install',
    model: 'ACU-25',
    technicianId,
    requestedDate: dayFromToday(4),
    note: 'Needed for the v1.1 energy tests',
  });
}

interface SeededSuite extends Id {
  /** Case ids by title. */
  cases: Map<string, number>;
}

async function seedSuite(call: Call, projectPath: string, suite: DemoSuite): Promise<SeededSuite> {
  const created = await call('POST', `${projectPath}/suites`, {
    name: suite.name,
    prefix: suite.prefix,
    envTemplate: suite.envTemplate,
    ...(suite.topic && { topic: suite.topic }),
  });
  const caseIds = new Map<string, number>();
  for (const [sectionName, cases] of Object.entries(suite.sections)) {
    const section = await call('POST', `${projectPath}/suites/${created.id}/sections`, {
      name: sectionName,
    });
    for (const [title, caseType, priority] of cases) {
      const createdCase = await call('POST', `${projectPath}/suites/${created.id}/cases`, {
        sectionId: section.id,
        title,
        caseType,
        priority,
        status: 'ready',
        estimateMinutes: priority === 'critical' ? 15 : 10,
        precondition: 'Unit installed, remote paired, room at 25 °C',
        procedure: `1. Prepare the unit\n2. ${title}\n3. Observe the indoor unit and the app`,
        expected: 'The unit responds within 1 s and the display matches the command',
        tags: caseType === 'Abnormal' ? ['negative'] : ['smoke'],
      });
      caseIds.set(title, createdCase.id);
    }
  }
  return { ...created, cases: caseIds };
}

/** Requirements with their linked cases; other cases only cite the key in their References. */
async function seedRequirements(
  call: Call,
  projectPath: string,
  suites: readonly SeededSuite[],
): Promise<void> {
  const caseId = ([suite, title]: readonly [number, string]) => suites[suite]!.cases.get(title)!;
  for (const requirement of DEMO_REQUIREMENTS) {
    const { linked, cited = [], reworded, ...fields } = requirement;
    const created = await call('POST', `${projectPath}/requirements`, fields);
    if (linked.length > 0) {
      await call('PUT', `${projectPath}/requirements/${created.id}/cases`, {
        caseIds: linked.map(caseId),
      });
    }
    if (reworded) {
      await call('PATCH', `${projectPath}/requirements/${created.id}`, { title: reworded });
    }
    for (const ref of cited) {
      await call('PATCH', `${projectPath}/cases/${caseId(ref)}`, { references: requirement.key });
    }
  }
}

/** Test devices; one of them is in repair. */
async function seedDevices(call: Call, projectPath: string): Promise<void> {
  for (const { repair, ...fields } of DEMO_DEVICES as readonly (Record<string, unknown> & {
    repair?: boolean;
  })[]) {
    const device = await call('POST', `${projectPath}/devices`, fields);
    if (repair) await call('PATCH', `${projectPath}/devices/${device.id}`, { status: 'repair' });
  }
}

/** Exploratory sessions in every state, with notes and a defect found in one of them. */
async function seedSessions(
  call: Call,
  projectPath: string,
  ctx: {
    testerId: number;
    releaseId: number;
    buildId: (name: string | undefined) => number | undefined;
    defectIds: readonly number[];
  },
): Promise<void> {
  for (const demo of DEMO_SESSIONS) {
    const { state, notes = [], summary, defect, build, environment, ...fields } = demo;
    const session = await call('POST', `${projectPath}/sessions`, {
      ...fields,
      ownerId: ctx.testerId,
      releaseId: ctx.releaseId,
      buildId: ctx.buildId(build),
      environment: Object.entries(environment).map(([label, value]) => ({ label, value })),
    });
    const base = `${projectPath}/sessions/${session.id}`;
    if (state === 'planned') continue;
    await call('POST', `${base}/start`);
    for (const note of notes) await call('POST', `${base}/notes`, note);
    if (defect !== undefined) {
      await call('POST', `${base}/defects`, { defectId: ctx.defectIds[defect] });
    }
    if (state === 'completed') {
      if (summary) await call('PATCH', base, { summary });
      await call('POST', `${base}/complete`);
    }
  }
}

/** Library, plan, runs, results and defects of the demo project (as the demo lead). */
async function seedProjectContent(
  call: Call,
  projectId: number,
  testerId: number,
  leadId: number,
): Promise<void> {
  const projectPath = `/projects/${projectId}`;

  const releases: Id[] = [];
  for (const release of DEMO_RELEASES) {
    const { startInDays, endInDays, ...fields } = release;
    releases.push(
      await call('POST', `${projectPath}/releases`, {
        ...fields,
        ...(startInDays !== undefined && { startDate: dayFromToday(startInDays) }),
        ...(endInDays !== undefined && { endDate: dayFromToday(endInDays) }),
      }),
    );
  }
  const activeRelease = releases[0]!;
  const buildIds = new Map<string, number>();
  for (const { release, ...build } of DEMO_BUILDS) {
    const created = await call(
      'POST',
      `${projectPath}/releases/${releases[release]!.id}/builds`,
      build,
    );
    buildIds.set(build.name, created.id);
  }
  const buildId = (name: string | undefined) => (name ? buildIds.get(name) : undefined);

  const sharedStep = await call('POST', `${projectPath}/shared-steps`, DEMO_SHARED_STEP);
  const suites: SeededSuite[] = [];
  for (const suite of DEMO_SUITES) suites.push(await seedSuite(call, projectPath, suite));
  await call('POST', `${projectPath}/suites/${suites[2]!.id}/cases`, {
    title: DEMO_STEPS_CASE.title,
    priority: DEMO_STEPS_CASE.priority,
    template: 'steps',
    steps: [
      { kind: 'shared', sharedStepId: sharedStep.id },
      ...DEMO_STEPS_CASE.steps.map((step) => ({ kind: 'step', ...step })),
    ],
    tags: ['smoke'],
  });

  const { startInDays, dueInDays, ...planFields } = DEMO_PLAN;
  const plan = await call('POST', `${projectPath}/plans`, {
    ...planFields,
    releaseId: activeRelease.id,
    startDate: dayFromToday(startInDays),
    dueDate: dayFromToday(dueInDays),
  });

  await call('PUT', `${projectPath}/env-dimensions`, { dimensions: DEMO_ENV_LISTS });

  let firstNg: number | null = null;
  for (const [index, demo] of DEMO_RUNS.entries()) {
    const suite = suites[demo.suite]!;
    const run = await call('POST', `${projectPath}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: demo.code,
      scenario: DEMO_SUITES[demo.suite]!.name,
      environment: Object.entries(demo.environment).map(([label, value]) => ({ label, value })),
      // The lead's suites are handed out below, like the Team page does it.
      ...(demo.holder === 'tester' && { testerId }),
      dueDate: dayFromToday(demo.dueInDays),
      buildId: buildId(demo.build),
    });
    const runCases = await call<Id[]>('GET', `${projectPath}/runs/${run.id}/cases`);
    for (const [position, runCase] of runCases.entries()) {
      const status = DEMO_RESULT_PATTERN[(position + index * 3) % DEMO_RESULT_PATTERN.length]!;
      if (status === 'untested') continue;
      await call('POST', `${projectPath}/runs/${run.id}/results/bulk`, {
        runCaseIds: [runCase.id],
        status,
      });
      if (status === 'ng' && firstNg === null) firstNg = runCase.id;
    }
  }
  // Suites held by the lead are handed out once for all their runs (what the Team page does).
  for (const suiteIndex of new Set(
    DEMO_RUNS.filter((r) => r.holder === 'lead').map((r) => r.suite),
  )) {
    const due = Math.min(
      ...DEMO_RUNS.filter((r) => r.suite === suiteIndex).map((r) => r.dueInDays),
    );
    await call('POST', `${projectPath}/topics/assign`, {
      releaseId: activeRelease.id,
      suiteIds: [suites[suiteIndex]!.id],
      testerId: leadId,
      dueDate: dayFromToday(due),
    });
  }

  const defectIds: number[] = [];
  for (const {
    linkToFirstNg,
    reopens = 0,
    comment,
    foundInBuild,
    fixedInBuild,
    resolved,
    ...fields
  } of DEMO_DEFECTS) {
    const defect = await call('POST', `${projectPath}/defects`, {
      ...fields,
      releaseId: activeRelease.id,
      foundInBuildId: buildId(foundInBuild),
      fixedInBuildId: buildId(fixedInBuild),
      ...(linkToFirstNg && firstNg !== null ? { runCaseId: firstNg } : {}),
    });
    if (resolved) {
      for (const to of ['open', 'resolved']) {
        await call('POST', `${projectPath}/defects/${defect.id}/transition`, { to });
      }
      for (let i = 0; i < reopens; i++) {
        for (const to of ['reopened', 'resolved']) {
          await call('POST', `${projectPath}/defects/${defect.id}/transition`, { to });
        }
      }
    }
    defectIds.push(defect.id);
    if (comment) {
      await call('POST', `${projectPath}/comments`, {
        entityType: 'defect',
        entityId: defect.id,
        body: comment,
      });
    }
  }

  await seedRequirements(call, projectPath, suites);
  await seedDevices(call, projectPath);
  await seedSessions(call, projectPath, {
    testerId,
    releaseId: activeRelease.id,
    buildId,
    defectIds,
  });
  await seedSummaryViews(call, projectPath);
}

async function seedSummaryViews(call: Call, projectPath: string): Promise<void> {
  for (const view of DEMO_VIEWS) await call('POST', `${projectPath}/reports/views`, view);
}

async function seed(app: NestExpressApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const config = app.get(AppConfig);

  const existing = await prisma.db.project.findUnique({ where: { key: DEMO_PROJECT.key } });
  if (existing) {
    say(`Project ${DEMO_PROJECT.key} already exists — nothing to do.`);
    return;
  }
  // The first administrator exists by now (created at start-up when the database had no user).
  const admin = await prisma.db.user.findFirst({
    where: { isAdmin: true, isActive: true },
    orderBy: { id: 'asc' },
  });
  if (!admin) throw new Error('No active administrator account — start the API once, then re-run.');

  const configured = process.env.SEED_USER_PASSWORD?.trim();
  if (configured) {
    // Same rule as passwords set in the app.
    const check = passwordSchema.safeParse(configured);
    if (!check.success) {
      throw new Error(
        `SEED_USER_PASSWORD: ${check.error.issues[0]?.message ?? 'invalid password'}`,
      );
    }
  }
  const password = configured || randomPassword();
  const users = await ensureDemoUsers(prisma, password);
  const technicianId = await ensureDemoTechnician(prisma, password);

  // Creating a project and its member list are administrator actions: done with the services.
  const actor: AuthUser = {
    id: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    isAdmin: true,
    isTechnician: false,
    mustChangePassword: false,
  };
  const projects = app.get(ProjectsService);
  const project: ProjectDTO = await projects.create(actor, { ...DEMO_PROJECT });
  await projects.setMembers(
    { id: project.id, key: project.key, name: project.name, role: 'lead' },
    actor,
    {
      members: [
        { userId: admin.id, role: 'lead' },
        ...DEMO_USERS.map((u) => ({ userId: users.ids.get(u.username)!, role: u.role })),
      ],
    },
  );

  // Everything else goes through the REST API as the demo lead (same rules as the web app).
  const leadId = users.ids.get(DEMO_USERS.find((u) => u.role === 'lead')!.username)!;
  const testerId = users.ids.get(DEMO_USERS.find((u) => u.role === 'tester')!.username)!;
  const sessions = app.get(SessionService);
  const session = await sessions.create(leadId, { userAgent: 'db:seed' });
  const { port } = app.getHttpServer().address() as AddressInfo;
  const call = restClient(
    `http://127.0.0.1:${port}${API_PREFIX}`,
    `${config.sessionCookieName}=${session.token}`,
  );
  try {
    await seedProjectContent(call, project.id, testerId, leadId);
    await seedStands(app.get(StandsService), actor, call, project.id, technicianId);
  } finally {
    await call('POST', '/auth/logout').catch(() => undefined);
  }

  say(`Seeded project ${DEMO_PROJECT.key} — ${DEMO_PROJECT.name} (id ${project.id}).`);
  say(
    `Demo accounts: ${DEMO_USERS.map((u) => `${u.username} (${u.role})`).join(', ')}, ${DEMO_TECHNICIAN.username} (technician)`,
  );
  if (!users.created) say('The demo accounts already existed and keep their password.');
  else if (configured) say('Password of the demo accounts: the value of SEED_USER_PASSWORD.');
  else say(`Password of the demo accounts (shown once): ${password}`);
}

async function main(): Promise<void> {
  loadEnvFiles();
  // Request logs of the seed itself are noise; warnings (e.g. the first admin password) stay.
  process.env.LOG_LEVEL ??= 'warn';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  try {
    await seed(app);
  } finally {
    await app.close();
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
