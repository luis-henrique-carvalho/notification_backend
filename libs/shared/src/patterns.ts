/**
 * Message pattern constants for inter-service communication via RabbitMQ.
 *
 * Used with @MessagePattern() on microservice handlers
 * and ClientProxy.send() on the Gateway.
 */

export const USER_PATTERNS = {
    REGISTER: 'user.register',
    LOGIN: 'user.login',
    FIND_BY_ID: 'user.findById',
    FIND_ALL: 'user.findAll',
} as const;

export const NOTIFICATION_PATTERNS = {
    CREATE: 'notification.create',
    FIND_ALL: 'notification.findAll',
    MARK_READ: 'notification.markRead',
    MARK_ALL_READ: 'notification.markAllRead',
    ACKNOWLEDGE: 'notification.acknowledge',
    UNREAD_COUNT: 'notification.unreadCount',
} as const;
