import { Module } from '@nestjs/common';
import { DimensionsModule } from '../dimensions/dimensions.module.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

/** Exploratory sessions: charter, time box, notes timeline and linked defects. */
@Module({
  imports: [DimensionsModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
