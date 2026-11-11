import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/**
 * Reports (ADR-009): trend/burndown, workload, defects, release comparison and coverage, computed
 * on request with days bucketed in REPORT_TIMEZONE.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
