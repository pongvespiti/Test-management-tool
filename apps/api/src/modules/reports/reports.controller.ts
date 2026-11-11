import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  reportCoverageQuerySchema,
  reportDefectsQuerySchema,
  reportScopeSchema,
  reportTrendQuerySchema,
  type CoverageRowDTO,
  type DefectReportDTO,
  type ReleaseComparisonRowDTO,
  type ReportDefectsQuery,
  type ReportTrendDTO,
  type ReportTrendQuery,
  type TraceabilityDTO,
  type WorkloadRowDTO,
} from '@tmt/shared';
import type { z } from 'zod';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject } from '../../common/decorators/request.decorators.js';
import type { ProjectContext } from '../../common/types/auth.js';
import { ReportsService } from './reports.service.js';

/** Reports: scope `planId` (wins) or `releaseId` or the whole project; days in REPORT_TIMEZONE. */
@ApiTags('Reports')
@Controller('projects/:projectId/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

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
    return this.reports.traceability(ctx.id, q.releaseId);
  }
}
