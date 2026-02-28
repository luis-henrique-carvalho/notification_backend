import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DrizzleProvider } from './database/drizzle.provider';
import { NotificationServiceController } from './notification-service.controller';
import { NotificationEventsController } from './notification-events.controller';
import { NotificationServiceService } from './notification-service.service';

@Module({
    imports: [
        ClientsModule.register([
            {
                name: 'GATEWAY_SERVICE',
                transport: Transport.RMQ,
                options: {
                    urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
                    queue: 'gateway_queue',
                    queueOptions: {
                        durable: true,
                    },
                },
            },
        ]),
    ],
    controllers: [NotificationServiceController, NotificationEventsController],
    providers: [DrizzleProvider, NotificationServiceService],
})
export class NotificationServiceModule {}
