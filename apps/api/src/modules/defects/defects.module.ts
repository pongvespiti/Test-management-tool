import { Module } from '@nestjs/common';
import { DefectsController } from './defects.controller.js';
import { DefectsService } from './defects.service.js';

/**
 * Defects: list, report (optionally from a run case), edit, workflow transitions, links to run
 * cases / test cases and delete. Read helpers shared with other modules: `defects.queries.ts`.
 */
@Module({
  controllers: [DefectsController],
  providers: [DefectsService],
  exports: [DefectsService],
})
export class DefectsModule {}
