import { NestFactory } from '@nestjs/core';
import { NotificationServiceModule } from './notification-service.module';
import * as amqplib from 'amqplib';
import {
  RABBITMQ_EXCHANGE,
  RABBITMQ_EXCHANGE_TYPE,
  setupDeadLetterQueue,
  deadLetterQueueArgs,
} from '@app/shared';
import { NotificationServiceService } from './notification-service.service';

const NOTIFICATION_SERVICE_QUEUE = 'notification-service-queue';

async function bootstrap() {
  const app = await NestFactory.create(NotificationServiceModule);

  const rabbitUrl =
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
  const connection = await amqplib.connect(rabbitUrl);
  const channel = await connection.createChannel();

  // Assert the main topic exchange
  await channel.assertExchange(RABBITMQ_EXCHANGE, RABBITMQ_EXCHANGE_TYPE, {
    durable: true,
    autoDelete: false,
  });

  // Setup DLQ for notification-service
  await setupDeadLetterQueue(channel, 'notification-service');

  // Declare notification-service queue with DLQ wiring and bind to notification.#
  await channel.assertQueue(NOTIFICATION_SERVICE_QUEUE, {
    durable: true,
    arguments: deadLetterQueueArgs('notification-service'),
  });
  await channel.bindQueue(
    NOTIFICATION_SERVICE_QUEUE,
    RABBITMQ_EXCHANGE,
    'notification.#',
  );

  // Start consuming events via service
  const notificationService = app.get(NotificationServiceService);
  await notificationService.startConsuming(channel);

  await app.listen(process.env.port ?? 3001);
}

bootstrap();
