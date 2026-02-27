import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { UsersController } from './users.controller';

const rmqUrl = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';

@Module({
    imports: [
        ClientsModule.register([
            {
                name: 'USER_CLIENT',
                transport: Transport.RMQ,
                options: {
                    urls: [rmqUrl],
                    queue: 'user_queue',
                    queueOptions: {
                        durable: true,
                    },
                },
            },
        ]),
    ],
    controllers: [UsersController],
})
export class UsersModule { }
