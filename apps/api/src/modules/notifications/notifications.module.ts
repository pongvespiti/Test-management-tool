import { Module } from '@nestjs/common';
import { LabNotificationsController, NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/** In-app notifications: assignments, due dates, retests, changed requirements, test stand requests. */
@Module({
  controllers: [NotificationsController, LabNotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
