import {
  pgTable,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql as drizzleSql } from 'drizzle-orm';
import { locations, employees } from './employee.schema.ts';

export const categories = pgTable(
  'categories',
  {
    id: text('id').primaryKey(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    nameEn: text('name_en').notNull(),
    nameEs: text('name_es').notNull(),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
  },
  (t) => ({
    byLocation: index('categories_location_idx').on(t.locationId),
    // Slug is unique per active (non-archived) category at the location;
    // archived rows are ignored so a future recycle doesn't trip the index.
    slugUnique: uniqueIndex('categories_location_slug_uniq')
      .on(t.locationId, drizzleSql`lower(${t.slug})`)
      .where(drizzleSql`${t.isArchived} = false`),
  }),
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
