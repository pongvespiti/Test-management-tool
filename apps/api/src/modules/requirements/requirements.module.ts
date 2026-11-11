import { Module } from '@nestjs/common';
import { ImportsModule } from '../imports/imports.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { RequirementsController } from './requirements.controller.js';
import { RequirementsService } from './requirements.service.js';

/** Requirements table: typed in, Excel/CSV import, read-only Jira import, links to cases. */
@Module({
  imports: [ImportsModule, IntegrationsModule],
  controllers: [RequirementsController],
  providers: [RequirementsService],
})
export class RequirementsModule {}
