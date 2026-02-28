import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { eq, inArray, and, desc, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from './database/drizzle.provider';
import { notifications, notificationRecipients } from './database/schema';
import {
    CreateNotificationDto,
    NotificationResponseDto,
    MarkReadDto,
    AcknowledgeDto,
    NOTIFICATION_EVENTS,
    rpcNotFound,
} from '@app/shared';

@Injectable()
export class NotificationServiceService {
    private readonly logger = new Logger(NotificationServiceService.name);

    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDB,
        @Inject('GATEWAY_SERVICE') private readonly gatewayClient: ClientProxy,
    ) {}

    async create(dto: CreateNotificationDto): Promise<NotificationResponseDto> {
        this.logger.log(`Creating notification for user ${dto.userId}`);

        // Persist
        const [notification] = await this.db
            .insert(notifications)
            .values({
                title: dto.title,
                body: dto.body,
                priority: dto.priority,
                senderId: dto.senderId,
                broadcast: false, // assuming explicit users for now
                // metadata/type not in schema but ignoring for now unless we alter schema
            })
            .returning();

        const [recipient] = await this.db
            .insert(notificationRecipients)
            .values({
                notificationId: notification.id,
                userId: dto.userId,
                status: 'created',
            })
            .returning();

        const response: NotificationResponseDto = {
            id: notification.id,
            title: notification.title,
            body: notification.body,
            priority: notification.priority as any,
            type: null,
            metadata: null,
            read: false,
            readAt: null,
            acknowledged: false,
            acknowledgedAt: null,
            createdAt: notification.createdAt,
            userId: recipient.userId,
        };

        // Emit notification.created event to GATEWAY_SERVICE (to be pushed via WebSockets)
        this.gatewayClient.emit(NOTIFICATION_EVENTS.CREATED, response);

        return response;
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
                priority: notification.priority as any,
                type: null,
                metadata: null,
                read:
                    recipient.status === 'read' ||
                    recipient.status === 'acknowledged',
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

    async markRead(dto: MarkReadDto, userId: string) {
        this.logger.log(`Marking notifications read for user ${userId}`);

        await this.db
            .update(notificationRecipients)
            .set({ status: 'read', readAt: new Date() })
            .where(
                and(
                    eq(notificationRecipients.userId, userId),
                    inArray(
                        notificationRecipients.notificationId,
                        dto.notificationIds,
                    ),
                    inArray(notificationRecipients.status, [
                        'delivered',
                        'created',
                    ]),
                ),
            );

        return { success: true };
    }

    async markAllRead(userId: string) {
        this.logger.log(`Marking all notifications read for user ${userId}`);

        await this.db
            .update(notificationRecipients)
            .set({ status: 'read', readAt: new Date() })
            .where(
                and(
                    eq(notificationRecipients.userId, userId),
                    inArray(notificationRecipients.status, [
                        'created',
                        'delivered',
                    ]),
                ),
            );

        return { success: true };
    }

    async acknowledge(dto: AcknowledgeDto, userId: string) {
        this.logger.log(
            `Acknowledging notification ${dto.notificationId} for user ${userId}`,
        );

        const result = await this.db
            .update(notificationRecipients)
            .set({
                status: 'acknowledged',
                acknowledgedAt: new Date(),
                readAt: new Date(),
            })
            .where(
                and(
                    eq(notificationRecipients.userId, userId),
                    eq(
                        notificationRecipients.notificationId,
                        dto.notificationId,
                    ),
                ),
            )
            .returning();

        if (!result.length) {
            throw rpcNotFound('Notification not found or already acknowledged');
        }

        return { success: true };
    }

    async unreadCount(userId: string) {
        const [{ count }] = await this.db
            .select({ count: sql<number>`count(*)` })
            .from(notificationRecipients)
            .where(
                and(
                    eq(notificationRecipients.userId, userId),
                    inArray(notificationRecipients.status, [
                        'created',
                        'delivered',
                    ]),
                ),
            );
        return { count: Number(count), userId };
    }
}
