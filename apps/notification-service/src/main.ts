import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NotificationServiceModule } from './notification-service.module';

async function bootstrap() {
    process.title = 'notification-service';

    const logger = new Logger('NotificationServiceBootstrap');

    const rmqUrl = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';
    const queue = 'notification_queue';

    const app = await NestFactory.createMicroservice<MicroserviceOptions>(
        NotificationServiceModule,
        {
            transport: Transport.RMQ,
            options: {
                urls: [rmqUrl],
                queue,
                queueOptions: {
                    durable: true,
                },
            },
        },
    );

    app.enableShutdownHooks();

    await app.listen();

    logger.log(`Notification Service RMQ listening on queue "${queue}" via ${rmqUrl}`);
}

bootstrap();
