import { Injectable } from '@nestjs/common';
import type { CompareDTO, CompareSideDTO, ReportCompareQuery } from '@tmt/shared';
import { notFound } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { envOf } from '../execution/execution.mapper.js';
import { compareResults, type SideResult } from './compare.js';

/** Comparison of two runs or two builds, case by case. */
@Injectable()
export class CompareService {
  constructor(private readonly prisma: PrismaService) {}

  /** Runs (newest first) and builds (newest first) that can be compared. */
  async compareSides(projectId: number): Promise<CompareSideDTO[]> {
    const db = this.prisma.db;
    const [runs, builds] = await Promise.all([
      db.testRun.findMany({
        where: { plan: { projectId } },
        orderBy: { id: 'desc' },
        select: {
          id: true,
          code: true,
          environment: true,
          suite: { select: { name: true } },
          plan: { select: { docNo: true, release: { select: { name: true } } } },
        },
      }),
      db.build.findMany({
        where: { release: { projectId } },
        orderBy: { id: 'desc' },
        select: {
          id: true,
          name: true,
          release: { select: { name: true } },
          _count: { select: { runs: true } },
        },
      }),
    ]);
    return [
      ...runs.map((r) => ({
        value: `run:${r.id}`,
        kind: 'run' as const,
        id: r.id,
        label: `${r.code} · ${r.suite.name}`,
        detail: [
          r.plan.docNo,
          r.plan.release?.name,
          ...envOf(r)
            .map((e) => e.value.trim())
            .filter(Boolean),
        ]
          .filter(Boolean)
          .join(' · '),
      })),
      ...builds.map((b) => ({
        value: `build:${b.id}`,
        kind: 'build' as const,
        id: b.id,
        label: `${b.release.name} / ${b.name}`,
        detail: `${b._count.runs} ${b._count.runs === 1 ? 'run' : 'runs'}`,
      })),
    ];
  }

  /**
   * Results of one case per library case on two sides — a run, or the latest result of each case
   * over the runs of a build — and what changed from the base to the target.
   */
  async compare(projectId: number, q: ReportCompareQuery): Promise<CompareDTO> {
    const sides = await this.compareSides(projectId);
    const find = (value: string) => {
      const side = sides.find((s) => s.value === value);
      if (!side)
        throw notFound(
          value.startsWith('run:') ? 'Run' : 'Build',
          value.startsWith('run:') ? 'RUN_NOT_FOUND' : 'BUILD_NOT_FOUND',
        );
      return side;
    };
    const base = find(q.base);
    const target = find(q.target);
    const [baseResults, targetResults] = await Promise.all([
      this.sideResults(base),
      this.sideResults(target),
    ]);
    return { base, target, ...compareResults(baseResults, targetResults) };
  }

  private sideResults(side: CompareSideDTO): Promise<SideResult[]> {
    const db = this.prisma.db;
    if (side.kind === 'run') {
      return db.$queryRaw<SideResult[]>`
        SELECT rc.test_case_id AS "testCaseId", rc.display_id AS "displayId", rc.title,
               s.name AS suite, rc.status::text AS status
        FROM run_cases rc
        JOIN test_runs r ON r.id = rc.run_id
        JOIN suites s ON s.id = r.suite_id
        WHERE r.id = ${side.id} AND rc.test_case_id IS NOT NULL`;
    }
    return db.$queryRaw<SideResult[]>`
      SELECT DISTINCT ON (rc.test_case_id) rc.test_case_id AS "testCaseId",
             rc.display_id AS "displayId", rc.title, s.name AS suite, rc.status::text AS status
      FROM run_cases rc
      JOIN test_runs r ON r.id = rc.run_id
      JOIN suites s ON s.id = r.suite_id
      WHERE r.build_id = ${side.id} AND rc.test_case_id IS NOT NULL
      ORDER BY rc.test_case_id, r.created_at DESC, r.id DESC, rc.id DESC`;
  }
}
