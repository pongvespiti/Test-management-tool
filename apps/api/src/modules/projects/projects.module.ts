import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { ReleasesService } from './releases.service.js';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ReleasesService],
  exports: [ProjectsService, ReleasesService],
})
export class ProjectsModule {}
