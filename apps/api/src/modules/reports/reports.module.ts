import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { SavedViewsController } from './saved-views.controller.js';
import { SavedViewsService } from './saved-views.service.js';
import { CompareService } from './compare.service.js';
import { ReportsService } from './reports.service.js';
import { TraceabilityService } from './traceability.service.js';

/**
 * Reports (ADR-009): trend/burndown, workload, defects, release comparison, coverage, traceability,
 * summary by dimensions (with its saved views), reopens, run comparison and schedule, computed on
 * request with days bucketed in REPORT_TIMEZONE.
 */
@Module({
  controllers: [ReportsController, SavedViewsController],
  providers: [ReportsService, TraceabilityService, CompareService, SavedViewsService],
  exports: [ReportsService],
})
export class ReportsModule {}
