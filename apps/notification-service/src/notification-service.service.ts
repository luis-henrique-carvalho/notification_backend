import { Inject, Injectable, Logger } from '@nestjs/common';
import * as amqplib from 'amqplib';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, count } from 'drizzle-orm';
import {
  EventEnvelope,
  publishEvent,
  consumeEvents,
  NOTIFICATION_EVENTS,
  USER_EVENTS,
  RABBITMQ_EXCHANGE,
  NotificationType,
  CreateNotificationPayload,
  NotificationCreatedPayload,
  NotificationCreateFailedPayload,
  NotificationResponsePayload,
  NotificationListRequestedPayload,
  NotificationListSucceededPayload,
  MarkReadRequestedPayload,
  MarkReadSucceededPayload,
  MarkReadFailedPayload,
  AcknowledgeRequestedPayload,
  AcknowledgeSucceededPayload,
  AcknowledgeFailedPayload,
  UnreadCountRequestedPayload,
  UnreadCountSucceededPayload,
  HistoryRequestedPayload,
  HistorySucceededPayload,
  NotificationHistoryEntry,
  DeliveredPayload,
  PendingCriticalRequestedPayload,
  PendingCriticalSucceededPayload,
  UserListSucceededPayload,
  UserListRequestedPayload,
} from '@app/shared';
import {
  notificationServiceSchema,
  notifications,
  notificationRecipients,
  Notification,
  NotificationRecipient,
} from './database';

const NOTIFICATION_SERVICE_QUEUE = 'notification-service-queue';

type NotificationServiceDb = NodePgDatabase<typeof notificationServiceSchema>;

@Injectable()
export class NotificationServiceService {
  private readonly logger = new Logger(NotificationServiceService.name);

  /** Pending broadcast correlationId → resolve callback */
  private readonly pendingBroadcasts = new Map<
    string,
    (userIds: string[]) => void
  >();

  constructor(@Inject('DRIZZLE') private readonly db: NotificationServiceDb) {}

  async startConsuming(channel: amqplib.Channel): Promise<void> {
    await consumeEvents(
      channel,
      NOTIFICATION_SERVICE_QUEUE,
      [],
      async (envelope: EventEnvelope<unknown>) => {
        switch (envelope.eventType) {
          case NOTIFICATION_EVENTS.CREATE_REQUESTED:
            await this.handleCreateNotification(
              channel,
              envelope as EventEnvelope<CreateNotificationPayload>,
            );
            break;
          case NOTIFICATION_EVENTS.LIST_REQUESTED:
            await this.handleListNotifications(
              channel,
              envelope as EventEnvelope<NotificationListRequestedPayload>,
            );
            break;
          case NOTIFICATION_EVENTS.MARKREAD_REQUESTED:
            await this.handleMarkRead(
              channel,
              envelope as EventEnvelope<MarkReadRequestedPayload>,
            );
            break;
          case NOTIFICATION_EVENTS.ACKNOWLEDGE_REQUESTED:
            await this.handleAcknowledge(
              channel,
              envelope as EventEnvelope<AcknowledgeRequestedPayload>,
            );
            break;
          case NOTIFICATION_EVENTS.UNREADCOUNT_REQUESTED:
            await this.handleUnreadCount(
              channel,
              envelope as EventEnvelope<UnreadCountRequestedPayload>,
            );
            break;
          case NOTIFICATION_EVENTS.HISTORY_REQUESTED:
            await this.handleHistory(
              channel,
              envelope as EventEnvelope<HistoryRequestedPayload>,
            );
            break;
          case NOTIFICATION_EVENTS.PENDINGCRITICAL_REQUESTED:
            await this.handlePendingCritical(
              channel,
              envelope as EventEnvelope<PendingCriticalRequestedPayload>,
            );
            break;
          case NOTIFICATION_EVENTS.DELIVERED:
            await this.handleDelivered(
              channel,
              envelope as EventEnvelope<DeliveredPayload>,
            );
            break;
          // Response from user-service for broadcast
          case USER_EVENTS.LIST_SUCCEEDED:
            this.handleUserListSucceeded(
              envelope as EventEnvelope<UserListSucceededPayload>,
            );
            break;
          default:
            this.logger.warn(`Unknown eventType: ${envelope.eventType}`);
        }
      },
    );
  }

  // ─── 5.2 Create Notification ──────────────────────────────────────────────

  async handleCreateNotification(
    channel: amqplib.Channel,
    envelope: EventEnvelope<CreateNotificationPayload>,
  ): Promise<void> {
    const { title, body, type, senderId, recipientIds, broadcast } =
      envelope.payload;

    if (!title || !body || !type || !senderId) {
      this.publishFailed<NotificationCreateFailedPayload>(
        channel,
        NOTIFICATION_EVENTS.CREATE_FAILED,
        envelope,
        { reason: 'Missing required fields: title, body, type, senderId' },
      );
      return;
    }

    let resolvedRecipientIds: string[] = recipientIds ?? [];

    // ─── 5.3 Broadcast flow ────────────────────────────────────────────────
    if (broadcast) {
      try {
        resolvedRecipientIds = await this.resolveBroadcastRecipients(
          channel,
          envelope.correlationId,
        );
      } catch {
        this.publishFailed<NotificationCreateFailedPayload>(
          channel,
          NOTIFICATION_EVENTS.CREATE_FAILED,
          envelope,
          { reason: 'Broadcast failed: could not retrieve user list' },
        );
        return;
      }
    }

    if (resolvedRecipientIds.length === 0) {
      this.publishFailed<NotificationCreateFailedPayload>(
        channel,
        NOTIFICATION_EVENTS.CREATE_FAILED,
        envelope,
        { reason: 'No recipients specified' },
      );
      return;
    }

    // Persist notification
    const [newNotification] = await this.db
      .insert(notifications)
      .values({
        title,
        body,
        type: type as 'info' | 'warning' | 'critical',
        senderId,
      })
      .returning();

    // Create recipient records
    await this.db.insert(notificationRecipients).values(
      resolvedRecipientIds.map((recipientId) => ({
        notificationId: newNotification.id,
        recipientId,
      })),
    );

    const notifPayload = this.toNotificationResponse(newNotification, null);

    publishEvent<NotificationCreatedPayload>(
      channel,
      RABBITMQ_EXCHANGE,
      NOTIFICATION_EVENTS.CREATED,
      {
        eventType: NOTIFICATION_EVENTS.CREATED,
        correlationId: envelope.correlationId,
        timestamp: new Date().toISOString(),
        source: 'notification-service',
        payload: {
          notification: notifPayload,
          recipientIds: resolvedRecipientIds,
        },
      },
    );

    this.logger.log(
      `Created notification ${newNotification.id} for ${resolvedRecipientIds.length} recipients`,
    );
  }

  // ─── 5.3 Broadcast: publish user.list.requested and await response ────────

  private resolveBroadcastRecipients(
    channel: amqplib.Channel,
    correlationId: string,
  ): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingBroadcasts.delete(correlationId);
        reject(new Error('Timeout waiting for user.list.succeeded'));
      }, 10_000);

      this.pendingBroadcasts.set(correlationId, (userIds) => {
        clearTimeout(timeout);
        resolve(userIds);
      });

      // Request the user list using the same correlationId so we can match the response
      publishEvent<UserListRequestedPayload>(
        channel,
        RABBITMQ_EXCHANGE,
        USER_EVENTS.LIST_REQUESTED,
        {
          eventType: USER_EVENTS.LIST_REQUESTED,
          correlationId,
          timestamp: new Date().toISOString(),
          source: 'notification-service',
          payload: {},
        },
      );
    });
  }

  /** Public so tests can simulate user.list.succeeded responses */
  handleUserListSucceeded(
    envelope: EventEnvelope<UserListSucceededPayload>,
  ): void {
    const resolver = this.pendingBroadcasts.get(envelope.correlationId);
    if (resolver) {
      this.pendingBroadcasts.delete(envelope.correlationId);
      resolver(envelope.payload.users.map((u) => u.id));
    }
  }

  // ─── 5.4 List Notifications ───────────────────────────────────────────────

  async handleListNotifications(
    channel: amqplib.Channel,
    envelope: EventEnvelope<NotificationListRequestedPayload>,
  ): Promise<void> {
    const { recipientId } = envelope.payload;

    const rows = await this.db
      .select()
      .from(notificationRecipients)
      .where(eq(notificationRecipients.recipientId, recipientId))
      .innerJoin(
        notifications,
        eq(notificationRecipients.notificationId, notifications.id),
      );

    const notifList: NotificationResponsePayload[] = rows.map(
      ({ notifications: n, notification_recipients: r }) =>
        this.toNotificationResponse(n, r),
    );

    publishEvent<NotificationListSucceededPayload>(
      channel,
      RABBITMQ_EXCHANGE,
      NOTIFICATION_EVENTS.LIST_SUCCEEDED,
      {
        eventType: NOTIFICATION_EVENTS.LIST_SUCCEEDED,
        correlationId: envelope.correlationId,
        timestamp: new Date().toISOString(),
        source: 'notification-service',
        payload: { notifications: notifList, total: notifList.length },
      },
    );
  }

  // ─── 5.5 Mark Read ────────────────────────────────────────────────────────

  async handleMarkRead(
    channel: amqplib.Channel,
    envelope: EventEnvelope<MarkReadRequestedPayload>,
  ): Promise<void> {
    const { notificationId, userId } = envelope.payload;

    const [recipient] = await this.db
      .select()
      .from(notificationRecipients)
      .where(
        and(
          eq(notificationRecipients.notificationId, notificationId),
          eq(notificationRecipients.recipientId, userId),
        ),
      )
      .limit(1);

    if (!recipient) {
      this.publishFailed<MarkReadFailedPayload>(
        channel,
        NOTIFICATION_EVENTS.MARKREAD_FAILED,
        envelope,
        { notificationId, reason: 'Recipient record not found' },
      );
      return;
    }

    const readAt = new Date();
    await this.db
      .update(notificationRecipients)
      .set({ read: true, readAt })
      .where(eq(notificationRecipients.id, recipient.id));

    const payload: MarkReadSucceededPayload = {
      notificationId,
      userId,
      readAt: readAt.toISOString(),
    };

    publishEvent<MarkReadSucceededPayload>(
      channel,
      RABBITMQ_EXCHANGE,
      NOTIFICATION_EVENTS.READ,
      {
        eventType: NOTIFICATION_EVENTS.READ,
        correlationId: envelope.correlationId,
        timestamp: new Date().toISOString(),
        source: 'notification-service',
        payload,
      },
    );
  }

  // ─── 5.6 Acknowledge ──────────────────────────────────────────────────────

  async handleAcknowledge(
    channel: amqplib.Channel,
    envelope: EventEnvelope<AcknowledgeRequestedPayload>,
  ): Promise<void> {
    const { notificationId, userId } = envelope.payload;

    // Validate that the notification is of type critical
    const [notification] = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);

    if (!notification) {
      this.publishFailed<AcknowledgeFailedPayload>(
        channel,
        NOTIFICATION_EVENTS.ACKNOWLEDGE_FAILED,
        envelope,
        { notificationId, reason: 'Notification not found' },
      );
      return;
    }

    if (notification.type !== 'critical') {
      this.publishFailed<AcknowledgeFailedPayload>(
        channel,
        NOTIFICATION_EVENTS.ACKNOWLEDGE_FAILED,
        envelope,
        {
          notificationId,
          reason: 'Only critical notifications can be acknowledged',
        },
      );
      return;
    }

    const [recipient] = await this.db
      .select()
      .from(notificationRecipients)
      .where(
        and(
          eq(notificationRecipients.notificationId, notificationId),
          eq(notificationRecipients.recipientId, userId),
        ),
      )
      .limit(1);

    if (!recipient) {
      this.publishFailed<AcknowledgeFailedPayload>(
        channel,
        NOTIFICATION_EVENTS.ACKNOWLEDGE_FAILED,
        envelope,
        { notificationId, reason: 'Recipient record not found' },
      );
      return;
    }

    const acknowledgedAt = new Date();
    await this.db
      .update(notificationRecipients)
      .set({ acknowledged: true, acknowledgedAt })
      .where(eq(notificationRecipients.id, recipient.id));

    publishEvent<AcknowledgeSucceededPayload>(
      channel,
      RABBITMQ_EXCHANGE,
      NOTIFICATION_EVENTS.ACKNOWLEDGED,
      {
        eventType: NOTIFICATION_EVENTS.ACKNOWLEDGED,
        correlationId: envelope.correlationId,
        timestamp: new Date().toISOString(),
        source: 'notification-service',
        payload: {
          notificationId,
          userId,
          acknowledgedAt: acknowledgedAt.toISOString(),
        },
      },
    );
  }

  // ─── 5.7 Unread Count ─────────────────────────────────────────────────────

  async handleUnreadCount(
    channel: amqplib.Channel,
    envelope: EventEnvelope<UnreadCountRequestedPayload>,
  ): Promise<void> {
    const { userId } = envelope.payload;

    const [result] = await this.db
      .select({ count: count() })
      .from(notificationRecipients)
      .where(
        and(
          eq(notificationRecipients.recipientId, userId),
          eq(notificationRecipients.read, false),
        ),
      );

    publishEvent<UnreadCountSucceededPayload>(
      channel,
      RABBITMQ_EXCHANGE,
      NOTIFICATION_EVENTS.UNREADCOUNT_SUCCEEDED,
      {
        eventType: NOTIFICATION_EVENTS.UNREADCOUNT_SUCCEEDED,
        correlationId: envelope.correlationId,
        timestamp: new Date().toISOString(),
        source: 'notification-service',
        payload: { userId, count: Number(result?.count ?? 0) },
      },
    );
  }

  // ─── 5.8 History ──────────────────────────────────────────────────────────

  async handleHistory(
    channel: amqplib.Channel,
    envelope: EventEnvelope<HistoryRequestedPayload>,
  ): Promise<void> {
    const allNotifications = await this.db.select().from(notifications);

    const historyEntries: NotificationHistoryEntry[] = await Promise.all(
      allNotifications.map(async (n) => {
        const recipients = await this.db
          .select()
          .from(notificationRecipients)
          .where(eq(notificationRecipients.notificationId, n.id));

        const deliveredCount = recipients.filter((r) => r.delivered).length;
        const readCount = recipients.filter((r) => r.read).length;
        const acknowledgedCount = recipients.filter(
          (r) => r.acknowledged,
        ).length;

        return {
          ...this.toNotificationResponse(n, null),
          deliveredCount,
          readCount,
          acknowledgedCount,
        };
      }),
    );

    publishEvent<HistorySucceededPayload>(
      channel,
      RABBITMQ_EXCHANGE,
      NOTIFICATION_EVENTS.HISTORY_SUCCEEDED,
      {
        eventType: NOTIFICATION_EVENTS.HISTORY_SUCCEEDED,
        correlationId: envelope.correlationId,
        timestamp: new Date().toISOString(),
        source: 'notification-service',
        payload: {
          notifications: historyEntries,
          total: historyEntries.length,
        },
      },
    );
  }

  // ─── 5.9 Pending Critical ─────────────────────────────────────────────────

  async handlePendingCritical(
    channel: amqplib.Channel,
    envelope: EventEnvelope<PendingCriticalRequestedPayload>,
  ): Promise<void> {
    const { userId } = envelope.payload;

    const rows = await this.db
      .select()
      .from(notificationRecipients)
      .where(
        and(
          eq(notificationRecipients.recipientId, userId),
          eq(notificationRecipients.acknowledged, false),
        ),
      )
      .innerJoin(
        notifications,
        and(
          eq(notificationRecipients.notificationId, notifications.id),
          eq(notifications.type, 'critical'),
        ),
      );

    const pendingNotifications: NotificationResponsePayload[] = rows.map(
      ({ notifications: n, notification_recipients: r }) =>
        this.toNotificationResponse(n, r),
    );

    publishEvent<PendingCriticalSucceededPayload>(
      channel,
      RABBITMQ_EXCHANGE,
      NOTIFICATION_EVENTS.PENDINGCRITICAL_SUCCEEDED,
      {
        eventType: NOTIFICATION_EVENTS.PENDINGCRITICAL_SUCCEEDED,
        correlationId: envelope.correlationId,
        timestamp: new Date().toISOString(),
        source: 'notification-service',
        payload: { notifications: pendingNotifications },
      },
    );
  }

  // ─── 5.10 Delivered ───────────────────────────────────────────────────────

  async handleDelivered(
    _channel: amqplib.Channel,
    envelope: EventEnvelope<DeliveredPayload>,
  ): Promise<void> {
    const { notificationId, recipientId, deliveredAt } = envelope.payload;

    await this.db
      .update(notificationRecipients)
      .set({ delivered: true, deliveredAt: new Date(deliveredAt) })
      .where(
        and(
          eq(notificationRecipients.notificationId, notificationId),
          eq(notificationRecipients.recipientId, recipientId),
        ),
      );

    this.logger.log(
      `Marked delivered: notification=${notificationId} recipient=${recipientId}`,
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private toNotificationResponse(
    n: Notification,
    r: NotificationRecipient | null,
  ): NotificationResponsePayload {
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      type: n.type as NotificationType,
      senderId: n.senderId,
      createdAt: n.createdAt.toISOString(),
      read: r?.read ?? false,
      readAt: r?.readAt?.toISOString(),
      delivered: r?.delivered ?? false,
      deliveredAt: r?.deliveredAt?.toISOString(),
      acknowledged: r?.acknowledged ?? false,
      acknowledgedAt: r?.acknowledgedAt?.toISOString(),
    };
  }

  private publishFailed<T>(
    channel: amqplib.Channel,
    routingKey: string,
    originalEnvelope: EventEnvelope<unknown>,
    payload: T,
  ): void {
    publishEvent<T>(channel, RABBITMQ_EXCHANGE, routingKey, {
      eventType: routingKey,
      correlationId: originalEnvelope.correlationId,
      timestamp: new Date().toISOString(),
      source: 'notification-service',
      payload,
    });
  }
}
