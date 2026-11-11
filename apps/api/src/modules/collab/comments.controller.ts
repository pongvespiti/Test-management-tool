import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createCommentSchema,
  listCommentsQuerySchema,
  type CommentDTO,
  type CreateCommentInput,
} from '@tmt/shared';
import type { z } from 'zod';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { CommentsService } from './comments.service.js';

@ApiTags('Collaboration')
@Controller('projects/:projectId/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  /** Comments of an entity, oldest first. */
  @Get()
  @ProjectPermission('read')
  @ApiErrorCodes('BAD_ENTITY')
  list(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: listCommentsQuerySchema }) q: z.infer<typeof listCommentsQuerySchema>,
  ): Promise<CommentDTO[]> {
    return this.comments.list(ctx.id, q.entityType, q.entityId);
  }

  /** Comments on a defect, run case, test case or plan. */
  @Post()
  @ProjectPermission('comment')
  @ApiErrorCodes('BAD_ENTITY', 'PLAN_LOCKED')
  create(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: createCommentSchema }) body: CreateCommentInput,
  ): Promise<CommentDTO> {
    return this.comments.create(ctx, me, body);
  }

  /** Deletes a comment: its author (any member role) or a lead. */
  @Delete(':commentId')
  @HttpCode(204)
  @ProjectPermission('read')
  @ApiErrorCodes('COMMENT_NOT_FOUND', 'PLAN_LOCKED')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('commentId', ID) commentId: number,
  ): Promise<void> {
    return this.comments.remove(ctx, me, commentId);
  }
}
