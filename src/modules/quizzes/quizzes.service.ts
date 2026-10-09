import ApiError from '../../shared/api-error.ts';
import { desc, eq, count, ilike, or } from 'drizzle-orm';
import {
  formatPaginatedResult,
  type PaginatedResult,
} from '../../shared/pagination.ts';
import { db } from '../../db/client.ts';
import { quiz } from '../../db/schema/index.ts';
import type { Quiz } from '../../db/schema/quizzes.schema.ts';
import type { CreateQuizInput } from './quizzes.validation.ts';

/** `input` must already be parsed with createQuizInputSchema (the controller does). */
export async function createQuiz(
  input: CreateQuizInput,
  actor: { userId?: string | undefined },
): Promise<Quiz> {
  const [created] = await db
    .insert(quiz)
    .values({
      nameEn: input.nameEn,
      nameEs: input.nameEs,
      quizType: input.quizType || 'procedure',
      questions: input.questions,
      createdBy: actor.userId || null,
    })
    .returning();

  if (!created) {
    throw Object.assign(new ApiError('Inserted quiz not found', 500), {
      errorCode: 'INTERNAL_ERROR',
    });
  }

  return created;
}

export async function getQuiz(id: string): Promise<Quiz> {
  const [row] = await db.select().from(quiz).where(eq(quiz.id, id)).limit(1);

  if (!row) {
    throw Object.assign(new ApiError('Quiz not found', 404), {
      errorCode: 'QUIZ_NOT_FOUND',
    });
  }

  return row;
}

export async function listQuizzes(
  page: number = 1,
  limit: number = 10,
  search?: string,
): Promise<PaginatedResult<Quiz>> {
  const offset = (page - 1) * limit;
  const whereClause = search
    ? or(ilike(quiz.nameEn, `%${search}%`), ilike(quiz.nameEs, `%${search}%`))!
    : undefined;

  // Page query and count are independent, so run them in parallel. The id
  // tie-break keeps pages stable when two quizzes share a created_at.
  const [rows, [countRes]] = await Promise.all([
    db
      .select()
      .from(quiz)
      .where(whereClause)
      .orderBy(desc(quiz.createdAt), desc(quiz.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(quiz).where(whereClause),
  ]);
  return formatPaginatedResult(rows, countRes?.total ?? 0, page, limit);
}
