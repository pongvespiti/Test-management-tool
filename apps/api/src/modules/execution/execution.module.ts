import { Module } from '@nestjs/common';
import { DimensionsModule } from '../dimensions/dimensions.module.js';
import { PlansController } from './plans.controller.js';
import { PlansService } from './plans.service.js';
import { ResultsController } from './results.controller.js';
import { ResultsService } from './results.service.js';
import { RunChangesService } from './run-changes.service.js';
import { RunReportService } from './run-report.service.js';
import { RunsController } from './runs.controller.js';
import { RunsService } from './runs.service.js';

/**
 * Test execution: plans (doc numbers, complete/reopen, sign-off), runs (create from library
 * selection, re-run, duplicate), run cases (results, step results, bulk, assignment), matrix and
 * the run report (JSON + Excel). Shared read helpers live in `execution.queries.ts`.
 */
@Module({
  imports: [DimensionsModule],
  controllers: [PlansController, RunsController, ResultsController],
  providers: [PlansService, RunsService, RunChangesService, ResultsService, RunReportService],
  exports: [PlansService, RunsService, ResultsService],
})
export class ExecutionModule {}
