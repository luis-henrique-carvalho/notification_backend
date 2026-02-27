import {
    pgTable,
    uuid,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
    'users',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        name: text('name').notNull(),
        email: text('email').notNull(),
        password: text('password').notNull(),
        role: text('role').notNull().default('user'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
    },
    (table) => [
        uniqueIndex('users_email_idx').on(table.email),
    ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
