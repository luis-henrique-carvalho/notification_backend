import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { eq, inArray, and, desc, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from './database/drizzle.provider';
import { notifications, notificationRecipients } from './database/schema';
import {
  CreateNotificationDto,
  NotificationResponseDto,
  SendNotificationResponseDto,
  AcknowledgeDto,
  NOTIFICATION_EVENTS,
  rpcNotFound,
  NotificationPriority,
  AdminNotificationSummaryDto,
  AdminNotificationRecipientDto,
  RecipientUpdatedEventPayload,
} from '@app/shared';

@Injectable()
export class NotificationServiceService {
  private readonly logger = new Logger(NotificationServiceService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject('GATEWAY_SERVICE') private readonly gatewayClient: ClientProxy,
  ) {}

  async create(
    dto: CreateNotificationDto,
  ): Promise<SendNotificationResponseDto> {
    const { userIds, broadcast = false } = dto;
    this.logger.log(
      `Creating notification for ${broadcast ? 'broadcast' : `${userIds.length} user(s)`}`,
    );

    const { notification, recipients } = await this.db.transaction(
      async (tx) => {
        // Persist notification
        const [notification] = await tx
          .insert(notifications)
          .values({
            title: dto.title,
            body: dto.body,
            priority: dto.priority,
            senderId: dto.senderId,
            broadcast,
          })
          .returning();

        // Bulk insert all recipients
        const recipients = await tx
          .insert(notificationRecipients)
          .values(
            userIds.map((userId) => ({
              notificationId: notification.id,
              userId,
              status: 'created' as const,
            })),
          )
          .returning();

        return { notification, recipients };
      },
    );

    // Emit one notification.created event per recipient
    for (const recipient of recipients) {
      const payload: NotificationResponseDto = {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        priority: notification.priority as NotificationPriority,
        type: null,
        metadata: null,
        read: false,
        readAt: null,
        acknowledged: false,
        acknowledgedAt: null,
        createdAt: notification.createdAt,
        userId: recipient.userId,
      };
      this.gatewayClient.emit(NOTIFICATION_EVENTS.CREATED, payload);
    }

    return {
      notificationId: notification.id,
      recipientCount: recipients.length,
      broadcast,
    };
  }

  async findAll(userId: string, page = 1, limit = 20) {
    this.logger.log(`Finding all notifications for user ${userId}`);
    const offset = (page - 1) * limit;

    const results = await this.db
      .select({
        notification: notifications,
        recipient: notificationRecipients,
      })
      .from(notificationRecipients)
      .innerJoin(
        notifications,
        eq(notificationRecipients.notificationId, notifications.id),
      )
      .where(eq(notificationRecipients.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    // Fetch total count for pagination
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(notificationRecipients)
      .where(eq(notificationRecipients.userId, userId));

    const data: NotificationResponseDto[] = results.map(
      ({ notification, recipient }) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        priority: notification.priority as NotificationPriority,
        type: null,
        metadata: null,
        read:
          recipient.status === 'read' || recipient.status === 'acknowledged',
        readAt: recipient.readAt,
        acknowledged: recipient.status === 'acknowledged',
        acknowledgedAt: recipient.acknowledgedAt,
        createdAt: notification.createdAt,
        userId: recipient.userId,
      }),
    );

    return {
      data,
      meta: {
        total: Number(count),
        page,
        limit,
        totalPages: Math.ceil(Number(count) / limit),
      },
    };
  }

  async markRead(notificationId: string, userId: string) {
    this.logger.log(`Marking notifications read for user ${userId}`);
    this.logger.debug(
      `Marking notification ${notificationId} as read for user ${userId}`,
    );

    const readAt = new Date();
    const result = await this.db
      .update(notificationRecipients)
      .set({ status: 'read', readAt })
      .where(
        and(
          eq(notificationRecipients.userId, userId),
          eq(notificationRecipients.notificationId, notificationId),
          inArray(notificationRecipients.status, ['created', 'delivered']),
        ),
      )
      .returning();

    if (!result.length) {
      rpcNotFound('Notification not found or already read');
    }

    // Task 2.5 — enrich MARKED_READ with stats
    const { readCount, recipientCount } =
      await this.getNotificationStats(notificationId);
    const unreadCount = await this.getUnreadCount(userId);

    this.gatewayClient.emit(NOTIFICATION_EVENTS.MARKED_READ, {
      userId,
      unreadCount,
      notificationId,
      readCount,
      recipientCount,
    });

    // Task 2.6 — emit RECIPIENT_UPDATED for this recipient
    const recipientUpdatedPayload: RecipientUpdatedEventPayload = {
      notificationId,
      userId,
      status: 'read',
      readAt,
      acknowledgedAt: null,
    };
    this.gatewayClient.emit(
      NOTIFICATION_EVENTS.RECIPIENT_UPDATED,
      recipientUpdatedPayload,
    );

    return { success: true };
  }

  async markAllRead(userId: string) {
    this.logger.log(`Marking all notifications read for user ${userId}`);

    const readAt = new Date();
    // Task 2.7 — capture updated rows so we can emit per-recipient events
    const updatedRows = await this.db
      .update(notificationRecipients)
      .set({ status: 'read', readAt })
      .where(
        and(
          eq(notificationRecipients.userId, userId),
          inArray(notificationRecipients.status, ['created', 'delivered']),
        ),
      )
      .returning();

    // Emit one RECIPIENT_UPDATED per updated record
    for (const row of updatedRows) {
      const recipientPayload: RecipientUpdatedEventPayload = {
        notificationId: row.notificationId,
        userId: row.userId,
        status: 'read',
        readAt,
        acknowledgedAt: null,
      };
      this.gatewayClient.emit(
        NOTIFICATION_EVENTS.RECIPIENT_UPDATED,
        recipientPayload,
      );
    }

    // Emit MARKED_READ with per-notification stats for each distinct notification touched
    const uniqueNotificationIds = [
      ...new Set(updatedRows.map((r) => r.notificationId)),
    ];
    for (const notificationId of uniqueNotificationIds) {
      const { readCount, recipientCount } =
        await this.getNotificationStats(notificationId);
      this.gatewayClient.emit(NOTIFICATION_EVENTS.MARKED_READ, {
        userId,
        unreadCount: 0,
        notificationId,
        readCount,
        recipientCount,
      });
    }

    const unreadCount = await this.getUnreadCount(userId);
    // Final catch-all MARKED_READ for the user's global unread count
    this.gatewayClient.emit(NOTIFICATION_EVENTS.MARKED_READ, {
      userId,
      unreadCount,
    });

    return { success: true };
  }

  async acknowledge(dto: AcknowledgeDto, userId: string) {
    this.logger.log(
      `Acknowledging notification ${dto.notificationId} for user ${userId}`,
    );

    const acknowledgedAt = new Date();
    const result = await this.db
      .update(notificationRecipients)
      .set({
        status: 'acknowledged',
        acknowledgedAt,
        readAt: acknowledgedAt,
      })
      .where(
        and(
          eq(notificationRecipients.userId, userId),
          eq(notificationRecipients.notificationId, dto.notificationId),
        ),
      )
      .returning();

    if (!result.length) {
      rpcNotFound('Notification not found or already acknowledged');
    }

    // Task 2.8 — enrich MARKED_READ with stats
    const { readCount, recipientCount } = await this.getNotificationStats(
      dto.notificationId,
    );
    const unreadCount = await this.getUnreadCount(userId);

    this.gatewayClient.emit(NOTIFICATION_EVENTS.MARKED_READ, {
      userId,
      unreadCount,
      notificationId: dto.notificationId,
      readCount,
      recipientCount,
    });

    // Task 2.8 — emit RECIPIENT_UPDATED with status 'acknowledged'
    const recipientPayload: RecipientUpdatedEventPayload = {
      notificationId: dto.notificationId,
      userId,
      status: 'acknowledged',
      readAt: acknowledgedAt,
      acknowledgedAt,
    };
    this.gatewayClient.emit(
      NOTIFICATION_EVENTS.RECIPIENT_UPDATED,
      recipientPayload,
    );

    return { success: true };
  }

  async unreadCount(userId: string) {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(notificationRecipients)
      .where(
        and(
          eq(notificationRecipients.userId, userId),
          inArray(notificationRecipients.status, ['created', 'delivered']),
        ),
      );
    return { count: Number(count), userId };
  }

  // Task 2.9 — helper to get per-notification read/recipient counts
  private async getNotificationStats(
    notificationId: string,
  ): Promise<{ readCount: number; recipientCount: number }> {
    const [readRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(notificationRecipients)
      .where(
        and(
          eq(notificationRecipients.notificationId, notificationId),
          inArray(notificationRecipients.status, ['read', 'acknowledged']),
        ),
      )
      .execute();

    const [totalRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(notificationRecipients)
      .where(eq(notificationRecipients.notificationId, notificationId))
      .execute();

    return {
      readCount: Number(readRow.count),
      recipientCount: Number(totalRow.count),
    };
  }

  private async getUnreadCount(userId: string): Promise<number> {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(notificationRecipients)
      .where(
        and(
          eq(notificationRecipients.userId, userId),
          inArray(notificationRecipients.status, ['created', 'delivered']),
        ),
      );
    return Number(count);
  }

  async findAllNotifications(page = 1, limit = 20) {
    this.logger.log('Finding all notifications with recipient statistics');
    const offset = (page - 1) * limit;

    // Query notifications with aggregated recipient counts
    const results = await this.db
      .select({
        id: notifications.id,
        title: notifications.title,
        body: notifications.body,
        priority: notifications.priority,
        broadcast: notifications.broadcast,
        senderId: notifications.senderId,
        createdAt: notifications.createdAt,
        recipientCount: sql<number>`COUNT(*)`,
        readCount: sql<number>`COUNT(*) FILTER (WHERE ${notificationRecipients.status} IN ('read', 'acknowledged'))`,
      })
      .from(notifications)
      .leftJoin(
        notificationRecipients,
        eq(notificationRecipients.notificationId, notifications.id),
      )
      .groupBy(notifications.id)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    // Fetch total count for pagination
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(DISTINCT ${notifications.id})` })
      .from(notifications);

    const data: AdminNotificationSummaryDto[] = results.map((row) => ({
      notificationId: row.id,
      title: row.title,
      body: row.body,
      priority: row.priority as NotificationPriority,
      broadcast: row.broadcast,
      senderId: row.senderId,
      recipientCount: Number(row.recipientCount),
      readCount: Number(row.readCount),
      unreadCount: Number(row.recipientCount) - Number(row.readCount),
      createdAt: row.createdAt,
    }));

    return {
      data,
      meta: {
        total: Number(count),
        page,
        limit,
        totalPages: Math.ceil(Number(count) / limit),
      },
    };
  }

  async findNotificationRecipients(notificationId: string) {
    this.logger.log(`Finding recipients for notification ${notificationId}`);

    // Verify notification exists
    const notification = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);

    if (!notification.length) {
      rpcNotFound('Notification not found');
    }

    // Query recipients for the notification
    const recipients = await this.db
      .select({
        userId: notificationRecipients.userId,
        status: notificationRecipients.status,
        readAt: notificationRecipients.readAt,
        deliveredAt: notificationRecipients.deliveredAt,
        acknowledgedAt: notificationRecipients.acknowledgedAt,
      })
      .from(notificationRecipients)
      .where(eq(notificationRecipients.notificationId, notificationId));

    return recipients.map(
      (recipient): AdminNotificationRecipientDto => ({
        userId: recipient.userId,
        status: recipient.status,
        readAt: recipient.readAt,
        deliveredAt: recipient.deliveredAt,
        acknowledgedAt: recipient.acknowledgedAt,
      }),
    );
  }
}
