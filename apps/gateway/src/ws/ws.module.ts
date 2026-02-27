import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsGateway } from './notifications.gateway';
import { WsJwtGuard } from './ws-jwt.guard';
import { NotificationEventsController } from '../events/notification-events.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [AuthModule, ConfigModule],
    controllers: [NotificationEventsController],
    providers: [NotificationsGateway, WsJwtGuard],
})
export class WsModule { }
