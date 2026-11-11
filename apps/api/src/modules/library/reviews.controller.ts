import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  listReviewsQuerySchema,
  reviewDecisionSchema,
  submitReviewSchema,
  type ReviewDecisionInput,
  type SubmitReviewInput,
  type TagCountDTO,
  type TestCaseDTO,
} from '@tmt/shared';
import type { z } from 'zod';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { ReviewsService } from './reviews.service.js';

/** Case review workflow, review queue and tags. */
@ApiTags('Reviews')
@Controller('projects/:projectId')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('cases/:caseId/submit-review')
  @HttpCode(200)
  @ProjectPermission('writeLibrary')
  @ApiErrorCodes('CASE_NOT_FOUND', 'INVALID_REVIEW_STATE', 'BAD_REVIEWER')
  submit(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('caseId', ID) caseId: number,
    @Body({ schema: submitReviewSchema }) body: SubmitReviewInput,
  ): Promise<TestCaseDTO> {
    return this.reviews.submit(ctx, me, caseId, body);
  }

  @Post('cases/:caseId/review')
  @HttpCode(200)
  @ProjectPermission('reviewCases')
  @ApiErrorCodes('CASE_NOT_FOUND', 'INVALID_REVIEW_STATE', 'NOTE_REQUIRED')
  decide(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('caseId', ID) caseId: number,
    @Body({ schema: reviewDecisionSchema }) body: ReviewDecisionInput,
  ): Promise<TestCaseDTO> {
    return this.reviews.decide(ctx, me, caseId, body);
  }

  @Get('reviews')
  @ProjectPermission('read')
  queue(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Query({ schema: listReviewsQuerySchema }) q: z.infer<typeof listReviewsQuerySchema>,
  ): Promise<TestCaseDTO[]> {
    return this.reviews.queue(ctx.id, me, q.mine);
  }

  @Get('tags')
  @ProjectPermission('read')
  tags(@CurrentProject() ctx: ProjectContext): Promise<TagCountDTO[]> {
    return this.reviews.tags(ctx.id);
  }
}
