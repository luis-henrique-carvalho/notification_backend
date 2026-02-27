import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const notificationTypeEnum = pgEnum('notification_type', [
  'info',
  'warning',
  'critical',
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  body: varchar('body', { length: 1000 }).notNull(),
  type: notificationTypeEnum('type').notNull(),
  senderId: uuid('sender_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const notificationRecipients = pgTable('notification_recipients', {
  id: uuid('id').primaryKey().defaultRandom(),
  notificationId: uuid('notification_id')
    .notNull()
    .references(() => notifications.id, { onDelete: 'cascade' }),
  recipientId: uuid('recipient_id').notNull(),
  read: boolean('read').notNull().default(false),
  readAt: timestamp('read_at'),
  delivered: boolean('delivered').notNull().default(false),
  deliveredAt: timestamp('delivered_at'),
  acknowledged: boolean('acknowledged').notNull().default(false),
  acknowledgedAt: timestamp('acknowledged_at'),
});

export const notificationsRelations = relations(notifications, ({ many }) => ({
  recipients: many(notificationRecipients),
}));

export const notificationRecipientsRelations = relations(
  notificationRecipients,
  ({ one }) => ({
    notification: one(notifications, {
      fields: [notificationRecipients.notificationId],
      references: [notifications.id],
    }),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationRecipient = typeof notificationRecipients.$inferSelect;
export type NewNotificationRecipient =
  typeof notificationRecipients.$inferInsert;

export const notificationServiceSchema = {
  notifications,
  notificationRecipients,
  notificationTypeEnum,
  notificationsRelations,
  notificationRecipientsRelations,
};
