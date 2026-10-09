import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import { user } from './auth.schema.ts';

export const quizTypes = ['procedure', 'course'] as const;
export type QuizType = (typeof quizTypes)[number];

export const quiz = pgTable('quiz', {
  id: uuid('id').primaryKey().defaultRandom(),
  nameEn: text('name_en').notNull(),
  nameEs: text('name_es').notNull(),
  quizType: text('quiz_type').$type<QuizType>().notNull().default('procedure'),
  questions: jsonb('questions').$type<unknown>().notNull().default([]),
  createdBy: text('created_by').references(() => user.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Quiz = typeof quiz.$inferSelect;
export type NewQuiz = typeof quiz.$inferInsert;
