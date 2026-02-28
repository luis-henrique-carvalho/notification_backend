/**
 * Event pattern constants for fire-and-forget communication via RabbitMQ.
 *
 * Used with @EventPattern() on microservice handlers
 * and ClientProxy.emit() on event producers.
 */

export const NOTIFICATION_EVENTS = {
  CREATED: 'notification.created',
  DELIVERED: 'notification.delivered',
} as const;
