import { Body, Controller, Delete, Get, HttpCode, Post, Put, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  jiraConfigSchema,
  type IntegrationsStatusDTO,
  type JiraConfigDTO,
  type JiraConfigInput,
  type JiraTestResultDTO,
} from '@tmt/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { JiraSettingsService } from './jira-settings.service.js';

/** `{}` (or no body) tests the stored settings; any other body must be complete settings. */
const jiraTestBodySchema = z.preprocess(
  (v) =>
    v === undefined || v === null || (typeof v === 'object' && Object.keys(v).length === 0)
      ? undefined
      : v,
  jiraConfigSchema.optional(),
);

@ApiTags('Jira')
@Controller('projects/:projectId/integrations')
export class IntegrationsController {
  constructor(private readonly settings: JiraSettingsService) {}

  /** Integration status for members (no auth details). */
  @Get()
  @ProjectPermission('read')
  status(@CurrentProject() ctx: ProjectContext): Promise<IntegrationsStatusDTO> {
    return this.settings.status(ctx.id);
  }

  /** Jira settings, JSON `null` when not configured; the secret is never returned. */
  @Get('jira')
  @ProjectPermission('manageIntegrations')
  @ApiOkResponse({ description: 'JiraConfigDTO or null' })
  async getJira(@CurrentProject() ctx: ProjectContext, @Res() res: Response): Promise<void> {
    // Sent by hand: Nest would answer a `null` result with an empty body instead of `null`.
    res.json(await this.settings.get(ctx.id));
  }

  /** Saves the settings; an omitted or empty secret keeps the stored one (same server only). */
  @Put('jira')
  @ProjectPermission('manageIntegrations')
  @ApiErrorCodes('SECRET_REQUIRED')
  save(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: jiraConfigSchema }) body: JiraConfigInput,
  ): Promise<JiraConfigDTO> {
    return this.settings.save(ctx, me, body);
  }

  @Delete('jira')
  @HttpCode(204)
  @ProjectPermission('manageIntegrations')
  remove(@CurrentProject() ctx: ProjectContext, @CurrentUser() me: AuthUser): Promise<void> {
    return this.settings.remove(ctx, me);
  }

  /** Tests unsaved settings, or `{}` for the stored ones; always 200 (`ok: false` + message). */
  @Post('jira/test')
  @HttpCode(200)
  @ProjectPermission('manageIntegrations')
  test(
    @CurrentProject() ctx: ProjectContext,
    @Body({ schema: jiraTestBodySchema }) body: JiraConfigInput | undefined,
  ): Promise<JiraTestResultDTO> {
    return this.settings.test(ctx, body);
  }
}
