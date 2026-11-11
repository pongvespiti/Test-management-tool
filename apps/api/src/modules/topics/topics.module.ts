import { Module } from '@nestjs/common';
import { TopicsController } from './topics.controller.js';
import { TopicsService } from './topics.service.js';

/** Work by topic: progress per suite of a release and handing suites out to people. */
@Module({
  controllers: [TopicsController],
  providers: [TopicsService],
})
export class TopicsModule {}
