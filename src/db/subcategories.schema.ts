import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { categories } from './categories.schema.ts';
import { employees } from './index.ts';

export const subcategories = pgTable(
  'subcategories',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    nameEn: text('name_en').notNull(),
    nameEs: text('name_es').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
  },
  (t) => ({
    byCategory: index('subcategories_category_idx').on(t.categoryId),
  }),
);

export type Subcategory = typeof subcategories.$inferSelect;
export type NewSubcategory = typeof subcategories.$inferInsert;
