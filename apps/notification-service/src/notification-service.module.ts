import { Module } from '@nestjs/common';
import { NotificationServiceController } from './notification-service.controller';
import { NotificationServiceService } from './notification-service.service';
import { DatabaseModule } from '@app/shared';
import { notificationServiceSchema } from './database';

@Module({
  imports: [DatabaseModule.forFeature({ schema: notificationServiceSchema })],
  controllers: [NotificationServiceController],
  providers: [NotificationServiceService],
})
export class NotificationServiceModule {}
