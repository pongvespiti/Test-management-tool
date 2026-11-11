import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller.js';
import { JunitImportService } from './junit-import.service.js';

/** Automation results: JUnit XML import into runs (match, create missing cases). */
@Module({
  controllers: [AutomationController],
  providers: [JunitImportService],
  exports: [JunitImportService],
})
export class AutomationModule {}
