import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  NotificationCreatedEventPayload,
  NotificationStateEventPayload,
} from '@app/shared';
import { NotificationsGateway } from '../ws/notifications.gateway';

@Controller()
export class NotificationEventsController {
  private readonly logger = new Logger(NotificationEventsController.name);

  constructor(private readonly notificationsGateway: NotificationsGateway) {}

  @EventPattern('notification.created')
  handleNotificationCreated(
    @Payload() payload: NotificationCreatedEventPayload,
  ) {
    this.logger.log(
      `Received notification.created event for user ${payload.userId}`,
    );

    // Emit the realtime notification to the user's room
    this.notificationsGateway.emitNotification(payload.userId, payload);

    // If the event includes the updated unread count, emit it too
    if (payload.unreadCount !== undefined) {
      this.notificationsGateway.emitUnreadCount(
        payload.userId,
        payload.unreadCount,
      );
    }
  }

  @EventPattern('notification.marked_read')
  handleNotificationMarkedRead(
    @Payload() payload: NotificationStateEventPayload,
  ) {
    this.logger.log(
      `Received notification.marked_read event for user ${payload.userId}`,
    );

    if (payload.unreadCount !== undefined) {
      this.notificationsGateway.emitUnreadCount(
        payload.userId,
        payload.unreadCount,
      );
    }
  }
}
