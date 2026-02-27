import * as amqplib from 'amqplib';
import { EventEnvelope } from '../events/event-envelope.interface';

export function publishEvent<T>(
  channel: amqplib.Channel,
  exchange: string,
  routingKey: string,
  envelope: EventEnvelope<T>,
): void {
  const content = Buffer.from(JSON.stringify(envelope));
  channel.publish(exchange, routingKey, content, {
    contentType: 'application/json',
    persistent: true,
  });
}

export async function consumeEvents<T>(
  channel: amqplib.Channel,
  queue: string,
  bindings: Array<{ exchange: string; routingKey: string }>,
  handler: (
    envelope: EventEnvelope<T>,
    msg: amqplib.ConsumeMessage,
  ) => Promise<void>,
): Promise<void> {
  for (const binding of bindings) {
    await channel.bindQueue(queue, binding.exchange, binding.routingKey);
  }

  await channel.consume(queue, (msg) => {
    if (!msg) return;
    const handleMessage = async (): Promise<void> => {
      try {
        const envelope = JSON.parse(msg.content.toString()) as EventEnvelope<T>;
        await handler(envelope, msg);
        channel.ack(msg);
      } catch {
        // Nack without requeue — message goes to DLQ after retry exhaustion
        channel.nack(msg, false, false);
      }
    };
    void handleMessage();
  });
}
