import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const stations = pgTable('stations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Station = typeof stations.$inferSelect;
export type NewStation = typeof stations.$inferInsert;
