import { Controller, Inject, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from './database/drizzle.provider';
import { notificationRecipients } from './database/schema';
import { NOTIFICATION_EVENTS } from '@app/shared';

@Controller()
export class NotificationEventsController {
    private readonly logger = new Logger(NotificationEventsController.name);

    constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) { }

    @EventPattern(NOTIFICATION_EVENTS.DELIVERED)
    async handleNotificationDelivered(@Payload() data: { notificationId: string; userId: string }) {
        this.logger.log(`Marking notification ${data.notificationId} as delivered for user ${data.userId}`);

        await this.db
            .update(notificationRecipients)
            .set({ status: 'delivered', deliveredAt: new Date() })
            .where(
                and(
                    eq(notificationRecipients.notificationId, data.notificationId),
                    eq(notificationRecipients.userId, data.userId),
                    eq(notificationRecipients.status, 'created') // Only update if it wasn't read/ack
                )
            );
    }
}
