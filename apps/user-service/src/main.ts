import { NestFactory } from '@nestjs/core';
import { UserServiceModule } from './user-service.module';
import * as amqplib from 'amqplib';
import { RABBITMQ_EXCHANGE, RABBITMQ_EXCHANGE_TYPE } from '@app/shared';

async function bootstrap() {
  const app = await NestFactory.create(UserServiceModule);

  const connection = await amqplib.connect(
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  );
  const channel = await connection.createChannel();
  await channel.assertExchange(RABBITMQ_EXCHANGE, RABBITMQ_EXCHANGE_TYPE, {
    durable: true,
    autoDelete: false,
  });
  await channel.close();
  await connection.close();

  await app.listen(process.env.port ?? 3002);
}
bootstrap();
