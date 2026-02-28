import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { NotificationsController } from './notifications.controller';

const rmqUrl = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';

@Module({
    imports: [
        ClientsModule.register([
            {
                name: 'NOTIFICATION_CLIENT',
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
    controllers: [NotificationsController],
})
export class NotificationsModule {}
