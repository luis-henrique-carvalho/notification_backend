import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { NotificationServiceService } from './notification-service.service';
import {
  NOTIFICATION_PATTERNS,
  CreateNotificationDto,
  AcknowledgeDto,
} from '@app/shared';

@Controller()
export class NotificationServiceController {
  constructor(
    private readonly notificationService: NotificationServiceService,
  ) {}

  @MessagePattern(NOTIFICATION_PATTERNS.CREATE)
  create(@Payload() data: CreateNotificationDto) {
    return this.notificationService.create(data);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.FIND_ALL)
  findAll(@Payload() data: { userId: string; page?: number; limit?: number }) {
    return this.notificationService.findAll(data.userId, data.page, data.limit);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.MARK_READ)
  markRead(@Payload() data: { notification_id: string; userId: string }) {
    return this.notificationService.markRead(data.notification_id, data.userId);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.MARK_ALL_READ)
  markAllRead(@Payload() data: { userId: string }) {
    return this.notificationService.markAllRead(data.userId);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.ACKNOWLEDGE)
  acknowledge(@Payload() data: { dto: AcknowledgeDto; userId: string }) {
    return this.notificationService.acknowledge(data.dto, data.userId);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.UNREAD_COUNT)
  unreadCount(@Payload() data: { userId: string }) {
    return this.notificationService.unreadCount(data.userId);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.FIND_ALL_ADMIN)
  findAllAdmin(@Payload() data: { page?: number; limit?: number }) {
    return this.notificationService.findAllNotifications(data.page, data.limit);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.FIND_RECIPIENTS)
  findRecipients(@Payload() data: { notificationId: string }) {
    return this.notificationService.findNotificationRecipients(
      data.notificationId,
    );
  }
}
