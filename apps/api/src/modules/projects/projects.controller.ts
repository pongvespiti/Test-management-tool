import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createProjectSchema,
  releaseSchema,
  setMembersSchema,
  updateProjectSchema,
  updateReleaseSchema,
  type CreateProjectInput,
  type MemberDTO,
  type ProjectDTO,
  type ReleaseDTO,
  type ReleaseInput,
  type SetMembersInput,
  type UpdateProjectInput,
  type UpdateReleaseInput,
} from '@tmt/shared';
import {
  AdminOnly,
  ApiErrorCodes,
  ProjectPermission,
} from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { ProjectsService } from './projects.service.js';
import { ReleasesService } from './releases.service.js';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly releases: ReleasesService,
  ) {}

  @Get()
  list(@CurrentUser() me: AuthUser): Promise<ProjectDTO[]> {
    return this.projects.listFor(me);
  }

  @Post()
  @AdminOnly()
  @ApiErrorCodes('PROJECT_KEY_TAKEN')
  create(
    @CurrentUser() me: AuthUser,
    @Body({ schema: createProjectSchema }) body: CreateProjectInput,
  ): Promise<ProjectDTO> {
    return this.projects.create(me, body);
  }

  @Get(':projectId')
  @ProjectPermission('read')
  get(@CurrentProject() ctx: ProjectContext): Promise<ProjectDTO> {
    return this.projects.get(ctx);
  }

  @Patch(':projectId')
  @ProjectPermission('manageMembers')
  update(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: updateProjectSchema }) body: UpdateProjectInput,
  ): Promise<ProjectDTO> {
    return this.projects.update(ctx, me, body);
  }

  // ------------------------------------------------------------------------- members

  @Get(':projectId/members')
  @ProjectPermission('read')
  members(@CurrentProject() ctx: ProjectContext): Promise<MemberDTO[]> {
    return this.projects.members(ctx.id);
  }

  @Put(':projectId/members')
  @ProjectPermission('manageMembers')
  @ApiErrorCodes('LEAD_REQUIRED', 'UNKNOWN_USER')
  setMembers(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: setMembersSchema }) body: SetMembersInput,
  ): Promise<MemberDTO[]> {
    return this.projects.setMembers(ctx, me, body);
  }

  // ------------------------------------------------------------------------ releases

  @Get(':projectId/releases')
  @ProjectPermission('read')
  listReleases(@CurrentProject() ctx: ProjectContext): Promise<ReleaseDTO[]> {
    return this.releases.list(ctx.id);
  }

  @Post(':projectId/releases')
  @ProjectPermission('manageReleases')
  createRelease(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: releaseSchema }) body: ReleaseInput,
  ): Promise<ReleaseDTO> {
    return this.releases.create(ctx, me, body);
  }

  @Patch(':projectId/releases/:releaseId')
  @ProjectPermission('manageReleases')
  @ApiErrorCodes('RELEASE_NOT_FOUND')
  updateRelease(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('releaseId', ID) releaseId: number,
    @Body({ schema: updateReleaseSchema }) body: UpdateReleaseInput,
  ): Promise<ReleaseDTO> {
    return this.releases.update(ctx, me, releaseId, body);
  }

  @Delete(':projectId/releases/:releaseId')
  @HttpCode(204)
  @ProjectPermission('manageReleases')
  @ApiErrorCodes('RELEASE_NOT_FOUND', 'RELEASE_IN_USE')
  removeRelease(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('releaseId', ID) releaseId: number,
  ): Promise<void> {
    return this.releases.remove(ctx, me, releaseId);
  }
}
