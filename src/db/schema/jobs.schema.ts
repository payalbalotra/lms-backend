import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql as drizzleSql } from 'drizzle-orm';

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  stationIds: uuid('station_ids')
    .array()
    .default(drizzleSql`'{}'::uuid[]`),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
