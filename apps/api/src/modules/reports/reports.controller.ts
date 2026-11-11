import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  reportCoverageQuerySchema,
  reportDefectsQuerySchema,
  reportCompareQuerySchema,
  reportScopeSchema,
  reportSummaryQuerySchema,
  reportTrendQuerySchema,
  type CoverageRowDTO,
  type DefectReportDTO,
  type ReleaseComparisonRowDTO,
  type CompareDTO,
  type CompareSideDTO,
  type ReopenReportDTO,
  type ScheduleDTO,
  type ReportCompareQuery,
  type ReportDefectsQuery,
  type ReportSummaryQuery,
  type ReportTrendDTO,
  type ReportTrendQuery,
  type SummaryDTO,
  type TraceabilityDTO,
  type WorkloadRowDTO,
} from '@tmt/shared';
import type { z } from 'zod';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject } from '../../common/decorators/request.decorators.js';
import type { ProjectContext } from '../../common/types/auth.js';
import { CompareService } from './compare.service.js';
import { ReportsService } from './reports.service.js';
import { TraceabilityService } from './traceability.service.js';

/** Reports: scope `planId` (wins) or `releaseId` or the whole project; days in REPORT_TIMEZONE. */
@ApiTags('Reports')
@Controller('projects/:projectId/reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly traces: TraceabilityService,
    private readonly comparison: CompareService,
  ) {}

  /** Daily results, burndown and pass rate. */
  @Get('trend')
  @ProjectPermission('viewReports')
  @ApiErrorCodes('PLAN_NOT_FOUND', 'BAD_RELEASE')
  trend(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: reportTrendQuerySchema }) q: ReportTrendQuery,
  ): Promise<ReportTrendDTO> {
    return this.reports.trend(ctx.id, q);
  }

  /** Run cases per effective assignee over open plans. */
  @Get('workload')
  @ProjectPermission('viewReports')
  @ApiErrorCodes('PLAN_NOT_FOUND', 'BAD_RELEASE')
  workload(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: reportScopeSchema }) q: z.infer<typeof reportScopeSchema>,
  ): Promise<WorkloadRowDTO[]> {
    return this.reports.workload(ctx.id, q);
  }

  /** Defects by status/severity, open trend, assignees and top cases. */
  @Get('defects')
  @ProjectPermission('viewReports')
  @ApiErrorCodes('BAD_RELEASE')
  defects(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: reportDefectsQuerySchema }) q: ReportDefectsQuery,
  ): Promise<DefectReportDTO> {
    return this.reports.defects(ctx.id, q);
  }

  /** Release comparison (newest release first). */
  @Get('releases')
  @ProjectPermission('viewReports')
  releases(@CurrentProject() ctx: ProjectContext): Promise<ReleaseComparisonRowDTO[]> {
    return this.reports.releases(ctx.id);
  }

  /** Coverage per suite (latest run case of every library case). */
  @Get('coverage')
  @ProjectPermission('viewReports')
  @ApiErrorCodes('BAD_RELEASE')
  coverage(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: reportCoverageQuerySchema }) q: z.infer<typeof reportCoverageQuerySchema>,
  ): Promise<CoverageRowDTO[]> {
    return this.reports.coverage(ctx.id, q.releaseId);
  }

  /** Library cases grouped by the references in their text, with latest results and defects. */
  @Get('traceability')
  @ProjectPermission('viewReports')
  @ApiErrorCodes('BAD_RELEASE')
  traceability(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: reportCoverageQuerySchema }) q: z.infer<typeof reportCoverageQuerySchema>,
  ): Promise<TraceabilityDTO> {
    return this.traces.traceability(ctx.id, q.releaseId);
  }

  /** Result counts of the runs, filtered and grouped by environment dimensions, topic, release, build. */
  @Get('summary')
  @ProjectPermission('viewReports')
  @ApiErrorCodes('PLAN_NOT_FOUND', 'BAD_RELEASE')
  summary(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: reportSummaryQuerySchema }) q: ReportSummaryQuery,
  ): Promise<SummaryDTO> {
    return this.reports.summary(ctx.id, q);
  }

  /** Defect reopen counts by release, build, platform and topic, and the defects that keep coming back. */
  @Get('reopens')
  @ProjectPermission('viewReports')
  @ApiErrorCodes('BAD_RELEASE')
  reopens(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: reportCoverageQuerySchema }) q: z.infer<typeof reportCoverageQuerySchema>,
  ): Promise<ReopenReportDTO> {
    return this.reports.reopens(ctx.id, q.releaseId);
  }

  /** Runs and builds that can be compared. */
  @Get('compare/sides')
  @ProjectPermission('viewReports')
  compareSides(@CurrentProject() ctx: ProjectContext): Promise<CompareSideDTO[]> {
    return this.comparison.compareSides(ctx.id);
  }

  /** What changed per test case between two runs or two builds (`run:<id>` / `build:<id>`). */
  @Get('compare')
  @ProjectPermission('viewReports')
  @ApiErrorCodes('RUN_NOT_FOUND', 'BUILD_NOT_FOUND')
  compare(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: reportCompareQuerySchema }) q: ReportCompareQuery,
  ): Promise<CompareDTO> {
    return this.comparison.compare(ctx.id, q);
  }

  /** Runs with their planned window (plan start, run or plan due date), topic and tester — for the Gantt. */
  @Get('schedule')
  @ProjectPermission('viewReports')
  @ApiErrorCodes('BAD_RELEASE')
  schedule(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: reportCoverageQuerySchema }) q: z.infer<typeof reportCoverageQuerySchema>,
  ): Promise<ScheduleDTO> {
    return this.reports.schedule(ctx.id, q.releaseId);
  }
}
