import { Controller, Get, HttpCode, Post, Query, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  listNotificationsQuerySchema,
  type ListNotificationsQuery,
  type NotificationListDTO,
} from '@tmt/shared';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { NotificationsService } from './notifications.service.js';

/** Notifications of the signed-in user in this project. */
@ApiTags('Notifications')
@Controller('projects/:projectId/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Newest first, with the number not read yet. Looking also notices runs that are due. */
  @Get()
  @ProjectPermission('read')
  list(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Query({ schema: listNotificationsQuerySchema }) q: ListNotificationsQuery,
  ): Promise<NotificationListDTO> {
    return this.notifications.list(ctx, me, q);
  }

  @Post('read-all')
  @HttpCode(204)
  @ProjectPermission('read')
  readAll(@CurrentProject() ctx: ProjectContext, @CurrentUser() me: AuthUser): Promise<void> {
    return this.notifications.markAllRead(ctx, me);
  }

  @Post(':notificationId/read')
  @HttpCode(204)
  @ProjectPermission('read')
  @ApiErrorCodes('NOTIFICATION_NOT_FOUND')
  read(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('notificationId', ID) notificationId: number,
  ): Promise<void> {
    return this.notifications.markRead(ctx, me, notificationId);
  }
}
