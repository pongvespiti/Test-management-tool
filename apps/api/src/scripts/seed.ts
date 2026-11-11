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
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEMO_BUILDS,
  DEMO_DEFECTS,
  DEMO_PLAN,
  DEMO_PROJECT,
  DEMO_RELEASES,
  DEMO_RESULT_PATTERN,
  DEMO_RUN_BUILDS,
  DEMO_RUN_ENVIRONMENTS,
  DEMO_SHARED_STEP,
  DEMO_STEPS_CASE,
  DEMO_SUITES,
  DEMO_USERS,
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

async function seedSuite(call: Call, projectPath: string, suite: DemoSuite): Promise<Id> {
  const created = await call('POST', `${projectPath}/suites`, {
    name: suite.name,
    prefix: suite.prefix,
    envTemplate: suite.envTemplate,
  });
  for (const [sectionName, cases] of Object.entries(suite.sections)) {
    const section = await call('POST', `${projectPath}/suites/${created.id}/sections`, {
      name: sectionName,
    });
    for (const [title, caseType, priority] of cases) {
      await call('POST', `${projectPath}/suites/${created.id}/cases`, {
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
    }
  }
  return created;
}

/** Library, plan, runs, results and defects of the demo project (as the demo lead). */
async function seedProjectContent(call: Call, projectId: number, testerId: number): Promise<void> {
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
  const suites: Id[] = [];
  for (const suite of DEMO_SUITES) suites.push(await seedSuite(call, projectPath, suite));
  await call('POST', `${projectPath}/suites/${suites.at(-1)!.id}/cases`, {
    title: DEMO_STEPS_CASE.title,
    priority: DEMO_STEPS_CASE.priority,
    template: 'steps',
    steps: [
      { kind: 'shared', sharedStepId: sharedStep.id },
      ...DEMO_STEPS_CASE.steps.map((step) => ({ kind: 'step', ...step })),
    ],
    tags: ['smoke'],
  });

  const plan = await call('POST', `${projectPath}/plans`, {
    ...DEMO_PLAN,
    releaseId: activeRelease.id,
  });

  let firstNg: number | null = null;
  for (const [index, suite] of suites.entries()) {
    const environment = Object.entries(DEMO_RUN_ENVIRONMENTS[index] ?? {}).map(
      ([label, value]) => ({ label, value }),
    );
    const run = await call('POST', `${projectPath}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: `RUN-${index + 1}`,
      scenario: DEMO_SUITES[index]!.name,
      environment,
      testerId,
      buildId: buildId(DEMO_RUN_BUILDS[index]),
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

  for (const {
    linkToFirstNg,
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
    }
    if (comment) {
      await call('POST', `${projectPath}/comments`, {
        entityType: 'defect',
        entityId: defect.id,
        body: comment,
      });
    }
  }
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

  // Creating a project and its member list are administrator actions: done with the services.
  const actor: AuthUser = {
    id: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    isAdmin: true,
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
    await seedProjectContent(call, project.id, testerId);
  } finally {
    await call('POST', '/auth/logout').catch(() => undefined);
  }

  say(`Seeded project ${DEMO_PROJECT.key} — ${DEMO_PROJECT.name} (id ${project.id}).`);
  say(`Demo accounts: ${DEMO_USERS.map((u) => `${u.username} (${u.role})`).join(', ')}`);
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
