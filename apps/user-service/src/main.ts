import { NestFactory } from '@nestjs/core';
import { UserServiceModule } from './user-service.module';
import * as amqplib from 'amqplib';
import {
  RABBITMQ_EXCHANGE,
  RABBITMQ_EXCHANGE_TYPE,
  setupDeadLetterQueue,
  deadLetterQueueArgs,
} from '@app/shared';
import { UserServiceService } from './user-service.service';

const USER_SERVICE_QUEUE = 'user-service-queue';

async function bootstrap() {
  const app = await NestFactory.create(UserServiceModule);

  const rabbitUrl =
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
  const connection = await amqplib.connect(rabbitUrl);
  const channel = await connection.createChannel();

  // Assert the main topic exchange
  await channel.assertExchange(RABBITMQ_EXCHANGE, RABBITMQ_EXCHANGE_TYPE, {
    durable: true,
    autoDelete: false,
  });

  // Setup DLQ for user-service
  await setupDeadLetterQueue(channel, 'user-service');

  // Declare user-service queue with DLQ wiring and bind to user.#
  await channel.assertQueue(USER_SERVICE_QUEUE, {
    durable: true,
    arguments: deadLetterQueueArgs('user-service'),
  });
  await channel.bindQueue(USER_SERVICE_QUEUE, RABBITMQ_EXCHANGE, 'user.#');

  // Start consuming events via service
  const userService = app.get(UserServiceService);
  await userService.startConsuming(channel);

  await app.listen(process.env.port ?? 3002);
}
bootstrap();
