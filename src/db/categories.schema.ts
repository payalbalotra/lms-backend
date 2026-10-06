import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { employees } from './index.ts';

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  nameEn: text('name_en').notNull(),
  nameEs: text('name_es').notNull(),
  categoryType: text('category_type').notNull(),
  categoryIcon: text('category_icon').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => employees.id, { onDelete: 'restrict' }),
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
