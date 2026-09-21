import crypto from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { quizzes, type Quiz } from '../db/schema';
import { ServiceError } from './errors';
import { logger } from '../lib/logger.js';
import {
  quizQuestionsSchema,
  type CreateQuizInput,
  type UpdateQuizInput,
} from './quiz-schema';

// ---------------------------------------------------------------------------
// Public wire shape — mirrors the frontend Quiz type. createdAt / updatedAt
// are ISO strings (the dates are exposed in the admin picker for audit).
// `passingScore` exists in the schema for stage 3 (course-wise setting) but
// is not exposed here; left as null by this slice.
// ---------------------------------------------------------------------------
export interface PublicQuiz {
  id: string;
  questions: PublicQuizQuestion[];
  attached: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicQuizQuestion {
  id: string;
  prompt: { en: string; es: string };
  choices: { id: string; label: { en: string; es: string } }[];
  correctChoiceId: string;
}

export function publicQuiz(row: Quiz): PublicQuiz {
  return {
    id: row.id,
    questions: parseStoredQuestions(row.questions, row.id),
    attached: row.attached,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Parse the jsonb `questions` column against the Zod schema. The column has
// no DB-side shape check; a row that fails the schema (legacy data, hand-edited
// DB) is logged and an empty array is served so a single bad row doesn't 500
// the list endpoint. Errors land at warn level with the row id so the
// offending record can be repaired.
function parseStoredQuestions(raw: unknown, quizId: string): PublicQuizQuestion[] {
  const parsed = quizQuestionsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const first = parsed.error.issues[0];
  logger.warn(
    `quiz questions invalid (${quizId}): ${first?.path?.join('.') ?? '?'} - ${first?.message ?? 'invalid'}`,
  );
  return [];
}

// Admin list — newest first. The wizard's "pick existing quiz" picker needs
// every row; there's no archive flag on quizzes (a quiz is deleted by
// cascade when the last procedure referencing it is deleted).
export async function listQuizzes(): Promise<PublicQuiz[]> {
  const rows = await db
    .select()
    .from(quizzes)
    .orderBy(desc(quizzes.updatedAt), desc(quizzes.createdAt));
  return rows.map(publicQuiz);
}

// Single read by id. Returns null when the row doesn't exist — the caller
// maps null to 404. Used by both admin (picker + read) and cook-side reader
// (resolving Procedure.quizId).
export async function getQuizById(id: string): Promise<PublicQuiz | null> {
  const [row] = await db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
  if (!row) return null;
  return publicQuiz(row);
}

// Materialise a quiz row from the wizard's authored form state. The wizard
// calls this first to get back a row id, then stamps it onto
// `Procedure.quizId`. We don't de-dupe identical questions across quizzes —
// if the manager wants the same questions in two places they author twice.
export async function createQuiz(input: CreateQuizInput): Promise<PublicQuiz> {
  const id = crypto.randomUUID();
  await db.insert(quizzes).values({
    id,
    questions: input.questions,
    attached: input.attached,
  });
  const [row] = await db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
  if (!row) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Inserted quiz not found');
  }
  return publicQuiz(row);
}

// Partial update — questions and/or attached. Refuses empty patches so the
// caller doesn't get a 200 with no actual change. updatedAt is stamped
// manually (the column has no `$onUpdate`).
export async function updateQuiz(
  id: string,
  patch: UpdateQuizInput,
): Promise<PublicQuiz> {
  if (patch.questions === undefined && patch.attached === undefined) {
    throw new ServiceError(
      400,
      'INVALID_INPUT',
      'Patch must include at least one field',
    );
  }
  const updated = await db
    .update(quizzes)
    .set({
      ...(patch.questions !== undefined ? { questions: patch.questions } : {}),
      ...(patch.attached !== undefined ? { attached: patch.attached } : {}),
      updatedAt: new Date(),
    })
    .where(eq(quizzes.id, id))
    .returning({ id: quizzes.id });
  if (updated.length === 0) {
    throw new ServiceError(404, 'QUIZ_NOT_FOUND', 'Quiz not found');
  }
  const [row] = await db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
  if (!row) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Updated quiz not found');
  }
  return publicQuiz(row);
}

// Re-export the SQL ordering helpers so the routes file can stay framework-
// agnostic. Currently unused but keeps the seam clean if a future list
// endpoint wants a different sort.
export const quizOrdering = {
  newestFirst: [desc(quizzes.updatedAt), desc(quizzes.createdAt)] as const,
  oldestFirst: [asc(quizzes.createdAt)] as const,
};
