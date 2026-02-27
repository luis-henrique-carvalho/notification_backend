import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { UserServiceModule } from './user-service.module';

async function bootstrap() {
    process.title = 'user-service';

    const logger = new Logger('UserServiceBootstrap');

    const rmqUrl = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';
    const queue = 'user_queue';

    const app = await NestFactory.createMicroservice<MicroserviceOptions>(
        UserServiceModule,
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

    logger.log(`User Service RMQ listening on queue "${queue}" via ${rmqUrl}`);
}

bootstrap();
