/**
 * JUnit results import into a run (api.md § Automation, ADR-010). Everything happens in one
 * transaction; a dry run executes the same steps and rolls back, so its preview (including cases
 * that `createMissing` would add) is exactly what a real import would do.
 */
import { Injectable } from '@nestjs/common';
import { Prisma, type RunCase } from '@tmt/database';
import {
  emptyCounts,
  RESULT_LABELS,
  type JunitImportItemDTO,
  type JunitImportQuery,
  type JunitImportResultDTO,
  type ProjectRole,
  type ResultStatus,
} from '@tmt/shared';
import type { Request } from 'express';
import { AppException, badRequest } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { PrismaService, type Db } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { stepResultsInput, stepResultsOf } from '../execution/execution.mapper.js';
import {
  assertPlanEditable,
  BULK_TX,
  getRunInProject,
  lockEditablePlan,
  markPlanInProgress,
} from '../execution/execution.queries.js';
import { assertMultipart } from '../execution/http-files.js';
import { cleanFileName, extensionOf } from '../storage/mime.js';
import type { MultipartFile } from '../storage/upload.service.js';
import { createJunitMatcher } from './junit-match.js';
import { createMissingCases } from './junit-missing.js';
import { parseJunitXml, type JunitTest } from './junit-parse.js';
import { assignTests, combineTests, statusOf, type AppliedResult } from './junit-results.js';

const MAX_ITEMS = 2000;
const MAX_UNMATCHED = 500;
const WRITE_CHUNK = 500;

export interface JunitImportInput {
  projectId: number;
  runId: number;
  userId: number;
  /** Caller's effective project role (admins act as lead). */
  role: ProjectRole;
  fileName: string;
  tests: JunitTest[];
  options: JunitImportQuery;
}

interface Applied extends AppliedResult {
  rc: Pick<RunCase, 'id' | 'displayId' | 'title' | 'sortOrder' | 'stepResults'>;
  previous: ResultStatus;
  created: boolean;
}

class DryRunRollback extends Error {
  constructor(readonly result: JunitImportResultDTO) {
    super('dry run');
  }
}

/** The uploaded `.xml` file (400 MULTIPART_REQUIRED / FILE_REQUIRED, 415 for other types). */
export function readXmlUpload(
  req: Pick<Request, 'is'>,
  file: MultipartFile | undefined,
): { fileName: string; content: Buffer } {
  assertMultipart(req, 'Send the JUnit XML file as multipart/form-data (field "file")');
  if (!file) throw badRequest('FILE_REQUIRED', 'Choose a JUnit XML file to upload');
  const fileName = cleanFileName(file.originalname, 'junit.xml');
  if (extensionOf(fileName) !== 'xml') {
    throw new AppException(415, 'UNSUPPORTED_FILE_TYPE', 'Upload a JUnit XML file (.xml)');
  }
  return { fileName, content: file.buffer };
}

/** Writes the results of the affected run cases and their history rows (`source: 'junit'`). */
async function writeResults(
  tx: Db,
  applied: Applied[],
  remark: string,
  userId: number,
  now: Date,
): Promise<void> {
  for (let i = 0; i < applied.length; i += WRITE_CHUNK) {
    const chunk = applied.slice(i, i + WRITE_CHUNK);
    const values = Prisma.join(
      chunk.map(
        (a) =>
          Prisma.sql`(${a.rc.id}::int, ${a.status}::result_status, ${a.actual}::text, ${a.elapsedSec}::int)`,
      ),
    );
    await tx.$executeRaw`
      UPDATE run_cases AS rc SET
        status = v.status,
        actual_result = v.actual,
        result_remark = ${remark},
        elapsed_sec = v.elapsed,
        executed_by_id = ${userId},
        executed_at = ${now},
        updated_at = ${now}
      FROM (VALUES ${values}) AS v(id, status, actual, elapsed)
      WHERE rc.id = v.id`;
    await tx.runCaseResult.createMany({
      data: chunk.map((a) => ({
        runCaseId: a.rc.id,
        status: a.status,
        actualResult: a.actual,
        remark,
        stepResults: stepResultsInput(stepResultsOf(a.rc.stepResults)),
        source: 'junit' as const,
        executedById: userId,
        executedAt: now,
        elapsedSec: a.elapsedSec,
      })),
    });
  }
}

@Injectable()
export class JunitImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Reads and parses the upload, then imports it into the run. */
  importUpload(
    ctx: ProjectContext,
    me: AuthUser,
    runId: number,
    options: JunitImportQuery,
    req: Pick<Request, 'is'>,
    file: MultipartFile | undefined,
  ): Promise<JunitImportResultDTO> {
    const upload = readXmlUpload(req, file);
    return this.import({
      projectId: ctx.id,
      runId,
      userId: me.id,
      role: ctx.role,
      fileName: upload.fileName,
      tests: parseJunitXml(upload.content),
      options,
    });
  }

  async import(input: JunitImportInput): Promise<JunitImportResultDTO> {
    const db = this.prisma.db;
    const { run, plan } = await getRunInProject(db, input.projectId, input.runId);
    assertPlanEditable(plan);
    try {
      return await db.$transaction(async (tx) => {
        await lockEditablePlan(tx, plan.id);
        const result = await this.apply(tx, run, input);
        if (input.options.dryRun) throw new DryRunRollback(result);
        return result;
      }, BULK_TX);
    } catch (e) {
      if (e instanceof DryRunRollback) return e.result;
      throw e;
    }
  }

  private async apply(
    tx: Db,
    run: { id: number; code: string; suiteId: number; planId: number },
    input: JunitImportInput,
  ): Promise<JunitImportResultDTO> {
    const { options } = input;
    const statusFor = (t: JunitTest) => statusOf(t, options.skippedAs);
    const existing = await tx.runCase.findMany({
      where: { runId: run.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const { assigned, unmatched, missing } = assignTests(
      input.tests,
      createJunitMatcher(existing, options.matchBy),
      options,
    );

    const rowsById = new Map(existing.map((r) => [r.id, r]));
    let createdCaseIds: number[] = [];
    const createdRunCases = new Set<number>();
    if (missing.length > 0) {
      const created = await createMissingCases(tx, run, input, missing);
      createdCaseIds = created.createdCaseIds;
      for (const r of created.rows) {
        rowsById.set(r.id, r);
        createdRunCases.add(r.id);
      }
      for (const [id, tests] of created.runCases) assigned.set(id, tests);
    }

    const applied: Applied[] = [...assigned.entries()]
      .map(([id, tests]): Applied => {
        const rc = rowsById.get(id)!;
        return {
          rc,
          previous: rc.status,
          created: createdRunCases.has(id),
          ...combineTests(tests, statusFor),
        };
      })
      .toSorted((a, b) => a.rc.sortOrder - b.rc.sortOrder || a.rc.id - b.rc.id);

    if (applied.length > 0) {
      await writeResults(tx, applied, `JUnit: ${input.fileName}`, input.userId, new Date());
      await markPlanInProgress(tx, run.planId);
    }

    const counts = emptyCounts();
    for (const a of applied) counts[a.status] += 1;
    const totals = {
      tests: input.tests.length,
      matched: input.tests.length - unmatched.length,
      unmatched: unmatched.length,
      updatedRunCases: applied.length,
      createdCases: createdCaseIds.length,
    };
    const record = await tx.import.create({
      data: {
        projectId: input.projectId,
        kind: 'junit',
        suiteId: run.suiteId,
        runId: run.id,
        fileName: input.fileName,
        sheet: '',
        layout: null,
        stats: {
          ...totals,
          ambiguous: unmatched.filter((u) => u.reason === 'ambiguous').length,
          ok: counts.ok,
          ng: counts.ng,
          blocked: counts.blocked,
          nt: counts.nt,
          na: counts.na,
        },
        createdById: input.userId,
      },
      select: { id: true },
    });
    const statusSummary = (Object.keys(counts) as ResultStatus[])
      .filter((s) => counts[s] > 0)
      .map((s) => `${counts[s]} ${RESULT_LABELS[s]}`)
      .join(', ');
    await this.activity.log(tx, {
      projectId: input.projectId,
      userId: input.userId,
      entityType: 'run',
      entityId: run.id,
      action: 'junit_imported',
      summary:
        `Imported JUnit results from ${input.fileName} into run ${run.code}: ` +
        `${applied.length} run case(s) updated${statusSummary ? ` (${statusSummary})` : ''}` +
        `, ${createdCaseIds.length} case(s) created, ${unmatched.length} test(s) unmatched`,
      data: { importId: record.id, ...totals, createdCaseIds: createdCaseIds.slice(0, 500) },
    });

    const items: JunitImportItemDTO[] = applied.slice(0, MAX_ITEMS).map((a) => ({
      runCaseId: a.rc.id,
      displayId: a.rc.displayId,
      title: a.rc.title,
      previous: a.previous,
      status: a.status,
      tests: a.tests,
      created: a.created,
    }));
    return {
      dryRun: options.dryRun,
      importId: options.dryRun ? null : record.id,
      fileName: input.fileName,
      totals,
      counts,
      items,
      unmatched: unmatched.slice(0, MAX_UNMATCHED),
    };
  }
}
