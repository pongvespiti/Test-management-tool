import { Injectable } from '@nestjs/common';
import { renderReport } from '@tmt/excel';
import { safeFileName } from '@tmt/shared';
import { AppConfig } from '../../config/app-config.js';
import type { ProjectContext } from '../../common/types/auth.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { getPlanInProject } from '../execution/execution.queries.js';
import { buildPlanReportData } from './report-data.js';
import { TemplatesService, withTemplateErrors } from './templates.service.js';

/** Plan test report filled into the controlled Excel form (T12, ADR-002). */
@Injectable()
export class PlanExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly templates: TemplatesService,
  ) {}

  /** `templateId` 0/omitted = the plan's template, else the project default, else built-in. */
  async export(
    ctx: ProjectContext,
    planId: number,
    templateId?: number,
  ): Promise<{ fileName: string; buffer: Buffer }> {
    const plan = await getPlanInProject(this.prisma.db, ctx.id, planId);
    const template = await this.templates.resolveTemplate(ctx.id, {
      templateId: templateId ? templateId : undefined,
      planTemplateId: plan.templateId,
    });
    const data = await buildPlanReportData(this.prisma.db, {
      project: { name: ctx.name, key: ctx.key },
      plan,
      timezone: this.config.reportTimezone,
    });
    const buffer = await withTemplateErrors(() =>
      renderReport(template.buffer, { runSheet: template.runSheet }, data),
    );
    return {
      fileName: `${safeFileName(`${plan.docNo} ${plan.title}`, 'test-report')}.xlsx`,
      buffer,
    };
  }
}
