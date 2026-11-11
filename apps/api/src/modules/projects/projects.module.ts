import { Module } from '@nestjs/common';
import { BuildsService } from './builds.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { ReleasesService } from './releases.service.js';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ReleasesService, BuildsService],
  exports: [ProjectsService, ReleasesService, BuildsService],
})
export class ProjectsModule {}
