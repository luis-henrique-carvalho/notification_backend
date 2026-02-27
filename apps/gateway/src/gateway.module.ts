import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WsModule } from './ws/ws.module';

export const USER_CLIENT = 'USER_CLIENT';
export const NOTIFICATION_CLIENT = 'NOTIFICATION_CLIENT';

const rmqUrl = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        AuthModule,
        UsersModule,
        NotificationsModule,
        WsModule,
        ClientsModule.register([
            {
                name: USER_CLIENT,
                transport: Transport.RMQ,
                options: {
                    urls: [rmqUrl],
                    queue: 'user_queue',
                    queueOptions: {
                        durable: true,
                    },
                },
            },
            {
                name: NOTIFICATION_CLIENT,
                transport: Transport.RMQ,
                options: {
                    urls: [rmqUrl],
                    queue: 'notification_queue',
                    queueOptions: {
                        durable: true,
                    },
                },
            },
        ]),
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: JwtAuthGuard,
        },
    ],
})
export class GatewayModule { }
