import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller.js';
import { AttachmentsService } from './attachments.service.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

/**
 * Collaboration: comments and attachments on defects, run cases, test cases and plans (the
 * activity feed is served by the global ActivityModule). Read helpers shared with other modules:
 * `attachments.queries.ts`, `attachments.mapper.ts` and `entities.queries.ts`.
 */
@Module({
  controllers: [CommentsController, AttachmentsController],
  providers: [CommentsService, AttachmentsService],
  exports: [CommentsService, AttachmentsService],
})
export class CollabModule {}
