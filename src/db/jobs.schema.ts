import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Role } from './employee.schema.ts';

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  // Which access-level this job belongs to. Matches employees.role.
  role: text('role').$type<Role>().notNull().default('employee'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
