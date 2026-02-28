import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  priority: text('priority').notNull().default('info'), // info, warning, critical
  senderId: uuid('sender_id'), // can be null if system generated? Let's make it nullable or string
  broadcast: boolean('broadcast').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notificationRecipients = pgTable(
  'notification_recipients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    status: text('status').notNull().default('created'), // created, delivered, read, acknowledged
    readAt: timestamp('read_at'),
    acknowledgedAt: timestamp('acknowledged_at'),
    deliveredAt: timestamp('delivered_at'),
  },
  (table) => [
    index('notification_recipients_user_id_idx').on(table.userId),
    index('notification_recipients_notification_id_idx').on(
      table.notificationId,
    ),
    uniqueIndex('notification_recipients_unique_user_notification_idx').on(
      table.notificationId,
      table.userId,
    ),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationRecipient = typeof notificationRecipients.$inferSelect;
export type NewNotificationRecipient =
  typeof notificationRecipients.$inferInsert;
