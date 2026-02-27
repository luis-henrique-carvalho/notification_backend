import { NestFactory } from '@nestjs/core';
import { NotificationServiceModule } from './notification-service.module';
import * as amqplib from 'amqplib';
import {
  RABBITMQ_EXCHANGE,
  RABBITMQ_EXCHANGE_TYPE,
  setupDeadLetterQueue,
} from '@app/shared';

async function bootstrap() {
  const app = await NestFactory.create(NotificationServiceModule);

  const connection = await amqplib.connect(
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  );
  const channel = await connection.createChannel();
  await channel.assertExchange(RABBITMQ_EXCHANGE, RABBITMQ_EXCHANGE_TYPE, {
    durable: true,
    autoDelete: false,
  });
  await setupDeadLetterQueue(channel, 'notification-service');
  await channel.close();
  await connection.close();

  await app.listen(process.env.port ?? 3001);
}

bootstrap();
