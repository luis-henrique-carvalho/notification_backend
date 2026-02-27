import * as amqplib from 'amqplib';

export const DEAD_LETTER_EXCHANGE = 'notification.dlx';
export const DLQ_TTL_MS = 5000; // 5 seconds between retries
export const DLQ_MAX_RETRIES = 3;

/**
 * Asserts the dead letter exchange (DLX) and the service DLQ.
 * Each service queue is configured with:
 *   - x-dead-letter-exchange: the DLX
 *   - x-dead-letter-routing-key: <serviceName>.dlq
 *
 * The DLQ itself is also asserted so dead-lettered messages land there.
 */
export async function setupDeadLetterQueue(
  channel: amqplib.Channel,
  serviceName: string,
): Promise<{ dlqName: string }> {
  const dlqName = `${serviceName}.dlq`;

  // Assert the dead letter exchange (fanout for simplicity)
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'direct', {
    durable: true,
    autoDelete: false,
  });

  // Assert the DLQ itself and bind it to the DLX
  await channel.assertQueue(dlqName, {
    durable: true,
    arguments: {
      // Messages in the DLQ expire after TTL * max retries for inspection
      'x-message-ttl': DLQ_TTL_MS * DLQ_MAX_RETRIES * 2,
    },
  });
  await channel.bindQueue(dlqName, DEAD_LETTER_EXCHANGE, dlqName);

  return { dlqName };
}

/**
 * Returns the queue arguments that wire a queue to the DLX.
 * Pass the returned object as `arguments` when calling assertQueue.
 */
export function deadLetterQueueArgs(
  serviceName: string,
): Record<string, unknown> {
  return {
    'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE,
    'x-dead-letter-routing-key': `${serviceName}.dlq`,
    'x-delivery-limit': DLQ_MAX_RETRIES,
  };
}
