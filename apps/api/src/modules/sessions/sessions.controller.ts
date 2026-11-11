import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  addSessionNoteSchema,
  createSessionSchema,
  linkSessionDefectSchema,
  listSessionsQuerySchema,
  updateSessionSchema,
  type AddSessionNoteInput,
  type CreateSessionInput,
  type ListSessionsQuery,
  type SessionDTO,
  type SessionListItemDTO,
  type SessionNoteDTO,
  type UpdateSessionInput,
} from '@tmt/shared';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { SessionsService } from './sessions.service.js';

/** Exploratory sessions. */
@ApiTags('Sessions')
@Controller('projects/:projectId/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ProjectPermission('read')
  list(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: listSessionsQuerySchema }) q: ListSessionsQuery,
  ): Promise<SessionListItemDTO[]> {
    return this.sessions.list(ctx.id, q);
  }

  @Post()
  @ProjectPermission('execute')
  @ApiErrorCodes('BAD_RELEASE', 'BAD_BUILD', 'BAD_USER')
  create(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: createSessionSchema }) body: CreateSessionInput,
  ): Promise<SessionDTO> {
    return this.sessions.create(ctx, me, body);
  }

  @Get(':sessionId')
  @ProjectPermission('read')
  @ApiErrorCodes('SESSION_NOT_FOUND')
  get(
    @CurrentProject() ctx: ProjectContext,
    @Param('sessionId', ID) sessionId: number,
  ): Promise<SessionDTO> {
    return this.sessions.get(ctx.id, sessionId);
  }

  @Patch(':sessionId')
  @ProjectPermission('execute')
  @ApiErrorCodes('SESSION_NOT_FOUND', 'BAD_RELEASE', 'BAD_BUILD', 'BAD_USER')
  update(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('sessionId', ID) sessionId: number,
    @Body({ schema: updateSessionSchema }) body: UpdateSessionInput,
  ): Promise<SessionDTO> {
    return this.sessions.update(ctx, me, sessionId, body);
  }

  /** Planned → in progress. */
  @Post(':sessionId/start')
  @HttpCode(200)
  @ProjectPermission('execute')
  @ApiErrorCodes('SESSION_NOT_FOUND', 'INVALID_SESSION_STATE')
  start(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('sessionId', ID) sessionId: number,
  ): Promise<SessionDTO> {
    return this.sessions.start(ctx, me, sessionId);
  }

  /** In progress → completed. */
  @Post(':sessionId/complete')
  @HttpCode(200)
  @ProjectPermission('execute')
  @ApiErrorCodes('SESSION_NOT_FOUND', 'INVALID_SESSION_STATE')
  complete(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('sessionId', ID) sessionId: number,
  ): Promise<SessionDTO> {
    return this.sessions.complete(ctx, me, sessionId);
  }

  /** Completed → in progress again. */
  @Post(':sessionId/resume')
  @HttpCode(200)
  @ProjectPermission('execute')
  @ApiErrorCodes('SESSION_NOT_FOUND', 'INVALID_SESSION_STATE')
  resume(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('sessionId', ID) sessionId: number,
  ): Promise<SessionDTO> {
    return this.sessions.resume(ctx, me, sessionId);
  }

  /** Deletes a session: its owner or creator, or a lead. */
  @Delete(':sessionId')
  @HttpCode(204)
  @ProjectPermission('execute')
  @ApiErrorCodes('SESSION_NOT_FOUND')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('sessionId', ID) sessionId: number,
  ): Promise<void> {
    return this.sessions.remove(ctx, me, sessionId);
  }

  @Post(':sessionId/notes')
  @ProjectPermission('execute')
  @ApiErrorCodes('SESSION_NOT_FOUND', 'SESSION_COMPLETED')
  addNote(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('sessionId', ID) sessionId: number,
    @Body({ schema: addSessionNoteSchema }) body: AddSessionNoteInput,
  ): Promise<SessionNoteDTO> {
    return this.sessions.addNote(ctx, me, sessionId, body);
  }

  /** Deletes a note: its author or a lead. */
  @Delete(':sessionId/notes/:noteId')
  @HttpCode(204)
  @ProjectPermission('execute')
  @ApiErrorCodes('SESSION_NOT_FOUND', 'NOTE_NOT_FOUND')
  removeNote(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('sessionId', ID) sessionId: number,
    @Param('noteId', ID) noteId: number,
  ): Promise<void> {
    return this.sessions.removeNote(ctx, me, sessionId, noteId);
  }

  @Post(':sessionId/defects')
  @HttpCode(200)
  @ProjectPermission('execute')
  @ApiErrorCodes('SESSION_NOT_FOUND', 'DEFECT_NOT_FOUND')
  linkDefect(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('sessionId', ID) sessionId: number,
    @Body({ schema: linkSessionDefectSchema }) body: { defectId: number },
  ): Promise<SessionDTO> {
    return this.sessions.linkDefect(ctx, me, sessionId, body.defectId);
  }

  @Delete(':sessionId/defects/:defectId')
  @ProjectPermission('execute')
  @ApiErrorCodes('SESSION_NOT_FOUND', 'LINK_NOT_FOUND')
  unlinkDefect(
    @CurrentProject() ctx: ProjectContext,
    @Param('sessionId', ID) sessionId: number,
    @Param('defectId', ID) defectId: number,
  ): Promise<SessionDTO> {
    return this.sessions.unlinkDefect(ctx, sessionId, defectId);
  }
}
