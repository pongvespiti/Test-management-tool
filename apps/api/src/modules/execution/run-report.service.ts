import { Injectable } from '@nestjs/common';
import { safeFileName, type RunReportDTO } from '@tmt/shared';
import { AppConfig } from '../../config/app-config.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { toUserRef } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { buildRunReport } from './run-report.js';
import { runReportWorkbook } from './run-report-xlsx.js';

/** Run report as JSON (printable page) and as an Excel workbook, in REPORT_TIMEZONE. */
@Injectable()
export class RunReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  report(ctx: ProjectContext, me: AuthUser, runId: number): Promise<RunReportDTO> {
    return buildRunReport(this.prisma.db, {
      project: { id: ctx.id, key: ctx.key, name: ctx.name },
      runId,
      generatedBy: toUserRef(me),
      timezone: this.config.reportTimezone,
    });
  }

  async workbook(
    ctx: ProjectContext,
    me: AuthUser,
    runId: number,
  ): Promise<{ fileName: string; buffer: Buffer }> {
    const data = await this.report(ctx, me, runId);
    return {
      fileName: `${safeFileName(`${data.plan.docNo} ${data.run.code} run report`)}.xlsx`,
      buffer: await runReportWorkbook(data),
    };
  }
}
