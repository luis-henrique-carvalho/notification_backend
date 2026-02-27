export const USER_EVENTS = {
  // Auth - Login
  AUTH_LOGIN_REQUESTED: 'user.auth.login.requested',
  AUTH_LOGIN_SUCCEEDED: 'user.auth.login.succeeded',
  AUTH_LOGIN_FAILED: 'user.auth.login.failed',

  // Auth - Register
  AUTH_REGISTER_REQUESTED: 'user.auth.register.requested',
  AUTH_REGISTER_SUCCEEDED: 'user.auth.register.succeeded',
  AUTH_REGISTER_FAILED: 'user.auth.register.failed',

  // List
  LIST_REQUESTED: 'user.list.requested',
  LIST_SUCCEEDED: 'user.list.succeeded',
} as const;

export const NOTIFICATION_EVENTS = {
  // Create
  CREATE_REQUESTED: 'notification.create.requested',
  CREATED: 'notification.created',
  CREATE_FAILED: 'notification.create.failed',

  // List
  LIST_REQUESTED: 'notification.list.requested',
  LIST_SUCCEEDED: 'notification.list.succeeded',

  // Mark Read
  MARKREAD_REQUESTED: 'notification.markread.requested',
  READ: 'notification.read',
  MARKREAD_FAILED: 'notification.markread.failed',

  // Acknowledge
  ACKNOWLEDGE_REQUESTED: 'notification.acknowledge.requested',
  ACKNOWLEDGED: 'notification.acknowledged',
  ACKNOWLEDGE_FAILED: 'notification.acknowledge.failed',

  // Unread Count
  UNREADCOUNT_REQUESTED: 'notification.unreadcount.requested',
  UNREADCOUNT_SUCCEEDED: 'notification.unreadcount.succeeded',

  // History
  HISTORY_REQUESTED: 'notification.history.requested',
  HISTORY_SUCCEEDED: 'notification.history.succeeded',

  // Delivery
  DELIVERED: 'notification.delivered',

  // Pending Critical
  PENDINGCRITICAL_REQUESTED: 'notification.pendingcritical.requested',
  PENDINGCRITICAL_SUCCEEDED: 'notification.pendingcritical.succeeded',
} as const;
