import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { jiraLinkSchema, type DefectDTO, type JiraLinkInput } from '@tmt/shared';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { JiraIssuesService } from './jira-issues.service.js';

const JIRA_CALL_ERRORS = ['JIRA_NOT_CONFIGURED', 'JIRA_ERROR'];

@ApiTags('Jira')
@Controller('projects/:projectId/defects/:defectId/jira')
export class JiraIssuesController {
  constructor(private readonly issues: JiraIssuesService) {}

  /** Creates a Jira issue from the defect and links it. */
  @Post()
  @HttpCode(200)
  @ProjectPermission('useIntegrations')
  @ApiErrorCodes('DEFECT_NOT_FOUND', 'ALREADY_LINKED', ...JIRA_CALL_ERRORS)
  create(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('defectId', ID) defectId: number,
  ): Promise<DefectDTO> {
    return this.issues.create(ctx, me, defectId);
  }

  /** Links the defect to an existing Jira issue (verified in Jira). */
  @Post('link')
  @HttpCode(200)
  @ProjectPermission('useIntegrations')
  @ApiErrorCodes('DEFECT_NOT_FOUND', 'ALREADY_LINKED', 'JIRA_ISSUE_NOT_FOUND', ...JIRA_CALL_ERRORS)
  link(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('defectId', ID) defectId: number,
    @Body({ schema: jiraLinkSchema }) body: JiraLinkInput,
  ): Promise<DefectDTO> {
    return this.issues.link(ctx, me, defectId, body.key);
  }

  /** Refreshes the Jira status of the linked issue. */
  @Post('sync')
  @HttpCode(200)
  @ProjectPermission('useIntegrations')
  @ApiErrorCodes('DEFECT_NOT_FOUND', 'NOT_LINKED', 'JIRA_ISSUE_NOT_FOUND', ...JIRA_CALL_ERRORS)
  sync(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('defectId', ID) defectId: number,
  ): Promise<DefectDTO> {
    return this.issues.sync(ctx, me, defectId);
  }

  /** Unlinks the Jira issue (the issue itself is kept); answers the defect. */
  @Delete()
  @ProjectPermission('useIntegrations')
  @ApiErrorCodes('DEFECT_NOT_FOUND')
  unlink(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('defectId', ID) defectId: number,
  ): Promise<DefectDTO> {
    return this.issues.unlink(ctx, me, defectId);
  }
}
