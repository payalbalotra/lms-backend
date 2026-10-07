import { pgTable, text, timestamp, index, uuid } from 'drizzle-orm/pg-core';
import { categories } from './categories.schema.ts';
import { user } from './auth.schema.ts';

export const subcategories = pgTable(
  'subcategories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    nameEn: text('name_en').notNull(),
    nameEs: text('name_es').notNull(),
    subcategoryIcon: text('subcategory_icon').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
  },
  (t) => ({
    byCategory: index('subcategories_category_idx').on(t.categoryId),
  }),
);

export type Subcategory = typeof subcategories.$inferSelect;
export type NewSubcategory = typeof subcategories.$inferInsert;
