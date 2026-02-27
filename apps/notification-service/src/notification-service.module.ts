import { Module } from '@nestjs/common';
import { NotificationServiceService } from './notification-service.service';
import { DatabaseModule } from '@app/shared';
import { notificationServiceSchema } from './database';

@Module({
  imports: [DatabaseModule.forFeature({ schema: notificationServiceSchema })],
  providers: [NotificationServiceService],
})
export class NotificationServiceModule {}
