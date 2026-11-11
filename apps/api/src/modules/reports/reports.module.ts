import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { SavedViewsController } from './saved-views.controller.js';
import { SavedViewsService } from './saved-views.service.js';
import { ReportsService } from './reports.service.js';

/**
 * Reports (ADR-009): trend/burndown, workload, defects, release comparison, coverage, traceability and the summary by dimensions (with its saved views), computed
 * on request with days bucketed in REPORT_TIMEZONE.
 */
@Module({
  controllers: [ReportsController, SavedViewsController],
  providers: [ReportsService, SavedViewsService],
  exports: [ReportsService],
})
export class ReportsModule {}
