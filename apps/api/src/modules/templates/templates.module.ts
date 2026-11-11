import { Module } from '@nestjs/common';
import { PlanExportService } from './plan-export.service.js';
import { PlanExportController, TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';

/** Report templates (Excel workbooks with placeholders) and the template-based plan export. */
@Module({
  controllers: [TemplatesController, PlanExportController],
  providers: [TemplatesService, PlanExportService],
  exports: [TemplatesService, PlanExportService],
})
export class TemplatesModule {}
