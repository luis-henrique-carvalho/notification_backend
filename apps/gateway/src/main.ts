import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
    process.title = 'gateway';

    const logger = new Logger('GatewayBootstrap');

    const rmqUrl = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';
    const gatewayQueue = 'gateway_queue';
    const httpPort = parseInt(process.env.PORT ?? '3000', 10);

    // Create a hybrid app: HTTP server + RMQ microservice listener
    const app = await NestFactory.create(GatewayModule);

    // Connect Gateway as a consumer of gateway_queue so it can receive
    // events emitted by internal services (e.g. notification.created)
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.RMQ,
        options: {
            urls: [rmqUrl],
            queue: gatewayQueue,
            queueOptions: {
                durable: true,
            },
        },
    });

    app.enableShutdownHooks();
    app.enableCors();

    // Start RMQ listener and HTTP server concurrently
    await app.startAllMicroservices();
    await app.listen(httpPort);

    logger.log(
        `Gateway HTTP listening on port ${httpPort}`,
    );
    logger.log(
        `Gateway RMQ consumer listening on queue "${gatewayQueue}" via ${rmqUrl}`,
    );
}

bootstrap();
