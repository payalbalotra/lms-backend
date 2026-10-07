import ApiError from '../../shared/utils/ApiError.ts';
import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { quiz } from '../../db/index.ts';
import {
  type CreateQuizInput,
  createQuizInputSchema,
  type Quiz,
} from '../../db/quiz.schema.ts';

export async function createQuiz(
  input: CreateQuizInput,
  actor: { userId?: string | undefined },
): Promise<Quiz> {
  // Validate questions schema properly
  const parsed = createQuizInputSchema.parse(input);

  const id = crypto.randomUUID();

  await db.insert(quiz).values({
    id,
    nameEn: parsed.nameEn,
    nameEs: parsed.nameEs,
    quizType: parsed.quizType || 'procedure',
    questions: parsed.questions,
    createdBy: actor.userId || null,
  });

  const [created] = await db
    .select()
    .from(quiz)
    .where(eq(quiz.id, id))
    .limit(1);

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

export async function listQuizzes(): Promise<Quiz[]> {
  const rows = await db.select().from(quiz).orderBy(desc(quiz.createdAt));

  return rows;
}
