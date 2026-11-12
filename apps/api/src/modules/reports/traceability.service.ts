import { Injectable } from '@nestjs/common';
import { Prisma } from '@tmt/database';
import { defectKey, type ResultStatus, type TraceabilityDTO } from '@tmt/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { assertReleaseInProject } from '../execution/execution.queries.js';
import { needsReview } from '../requirements/requirements.service.js';
import { traceabilityOf } from './traceability.js';

type TraceDefectStatus = TraceabilityDTO['rows'][number]['defects'][number]['status'];
type TraceDefectSeverity = TraceabilityDTO['rows'][number]['defects'][number]['severity'];

/** Traceability report: requirements and references, the cases behind them, results and defects. */
@Injectable()
export class TraceabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Traceability: library cases grouped by the references in their `refs` text, with the latest
   * result in scope and the defects linked to the cases.
   */
  async traceability(projectId: number, releaseId?: number): Promise<TraceabilityDTO> {
    const db = this.prisma.db;
    await assertReleaseInProject(db, projectId, releaseId);
    const cases = await db.testCase.findMany({
      where: {
        suite: { projectId, isArchived: false },
        isDeleted: false,
        status: { not: 'deprecated' },
      },
      orderBy: [{ suite: { sortOrder: 'asc' } }, { suiteId: 'asc' }, { seq: 'asc' }],
      select: {
        id: true,
        seq: true,
        title: true,
        references: true,
        suite: { select: { id: true, name: true, prefix: true } },
      },
    });
    const requirementRows = await db.requirement.findMany({
      where: { projectId },
      select: {
        id: true,
        key: true,
        title: true,
        source: true,
        externalUrl: true,
        externalStatus: true,
        textChangedAt: true,
        reviewedAt: true,
        cases: { select: { testCaseId: true } },
      },
    });
    if (cases.length === 0 && requirementRows.length === 0)
      return { rows: [], casesWithoutReference: 0, totalCases: 0 };
    const release =
      releaseId !== undefined ? Prisma.sql`AND p.release_id = ${releaseId}` : Prisma.empty;
    const latest = await db.$queryRaw<{ testCaseId: number; status: ResultStatus }[]>`
      SELECT DISTINCT ON (rc.test_case_id) rc.test_case_id AS "testCaseId", rc.status::text AS status
      FROM run_cases rc
      JOIN test_runs r ON r.id = rc.run_id
      JOIN test_plans p ON p.id = r.plan_id
      WHERE p.project_id = ${projectId} AND rc.test_case_id IS NOT NULL ${release}
      ORDER BY rc.test_case_id, r.created_at DESC, r.id DESC, rc.id DESC`;
    const defectRelease =
      releaseId !== undefined ? Prisma.sql`AND d.release_id = ${releaseId}` : Prisma.empty;
    const defects = await db.$queryRaw<
      {
        testCaseId: number;
        id: number;
        seq: number;
        title: string;
        status: TraceDefectStatus;
        severity: TraceDefectSeverity;
      }[]
    >`
      SELECT DISTINCT dl.test_case_id AS "testCaseId", d.id, d.seq, d.title,
             d.status::text AS status, d.severity::text AS severity
      FROM defect_links dl
      JOIN defects d ON d.id = dl.defect_id
      WHERE d.project_id = ${projectId} AND dl.test_case_id IS NOT NULL ${defectRelease}`;
    return traceabilityOf(
      cases.map((c) => ({
        id: c.id,
        seq: c.seq,
        title: c.title,
        refs: c.references,
        suite: c.suite,
      })),
      new Map(latest.map((r) => [r.testCaseId, r.status])),
      defects,
      defectKey,
      requirementRows.map((r) => ({
        id: r.id,
        key: r.key,
        title: r.title,
        source: r.source,
        externalUrl: r.externalUrl,
        externalStatus: r.externalStatus,
        needsReview: needsReview(r),
        linkedCaseIds: new Set(r.cases.map((c) => c.testCaseId)),
      })),
    );
  }
}
