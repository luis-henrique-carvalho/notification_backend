import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GatewayModule } from './gateway.module';
import { RpcToHttpInterceptor } from '@app/shared';

async function bootstrap() {
  process.title = 'gateway';

  const logger = new Logger('GatewayBootstrap');

  const rmqUrl = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';
  const gatewayQueue = 'gateway_queue';
  const httpPort = parseInt(process.env.PORT ?? '3000', 10);

  // Create a hybrid app: HTTP server + RMQ microservice listener
  const app = await NestFactory.create(GatewayModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new RpcToHttpInterceptor());

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

  // Setup Swagger
  const config = new DocumentBuilder()
    .setTitle('Notification System API')
    .setDescription('The realtime notification system API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(httpPort);

  logger.log(`Gateway HTTP listening on port ${httpPort}`);
  logger.log(
    `Gateway RMQ consumer listening on queue "${gatewayQueue}" via ${rmqUrl}`,
  );
}

bootstrap();
