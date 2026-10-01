import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.schema.ts';

export const categoryTypes = ['general', 'station_based'] as const;
export type CategoryType = (typeof categoryTypes)[number];

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  nameEn: text('name_en').notNull(),
  nameEs: text('name_es').notNull(),
  categoryType: text('category_type').$type<CategoryType>(),
  categoryIcon: text('category_icon'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
});

export const subcategories = pgTable('subcategories', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  nameEn: text('name_en').notNull(),
  nameEs: text('name_es').notNull(),
  subcategoryIcon: text('subcategory_icon'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
});

export type Subcategory = typeof subcategories.$inferSelect;
export type NewSubcategory = typeof subcategories.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
