import { Module } from '@nestjs/common';
import { CaseBulkService } from './case-bulk.service.js';
import { CasesController } from './cases.controller.js';
import { CasesService } from './cases.service.js';
import { LibraryExportService } from './library-export.service.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';
import { SectionsService } from './sections.service.js';
import { SharedStepsController } from './shared-steps.controller.js';
import { SharedStepsService } from './shared-steps.service.js';
import { SuitesController } from './suites.controller.js';
import { SuitesService } from './suites.service.js';

/**
 * Test case library: suites (custom fields, environment template), sections, test cases (versions,
 * bulk actions, run history), reviews, shared steps, tags and the library Excel export.
 * Other modules reuse the plain functions of `library.queries`, `cases.queries`, `case-rules` and
 * `review-transitions`.
 */
@Module({
  controllers: [SuitesController, CasesController, ReviewsController, SharedStepsController],
  providers: [
    SuitesService,
    SectionsService,
    CasesService,
    CaseBulkService,
    ReviewsService,
    SharedStepsService,
    LibraryExportService,
  ],
  exports: [],
})
export class LibraryModule {}
