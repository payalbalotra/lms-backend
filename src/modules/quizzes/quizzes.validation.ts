import { z } from 'zod';

const localisedString = z.object({
  en: z.string(),
  es: z.string().optional(),
});

export const quizChoiceSchema = z.object({
  id: z.string(),
  label: localisedString,
});

export const quizQuestionSchema = z
  .object({
    id: z.string(),
    question: localisedString,
    choices: z.array(quizChoiceSchema),
    correctChoiceId: z.string().optional(),
  })
  // A correct answer that is not one of the choices can never be graded.
  .refine(
    (q) =>
      q.correctChoiceId === undefined ||
      q.choices.some((c) => c.id === q.correctChoiceId),
    {
      message: 'correctChoiceId must match the id of one of the choices',
      path: ['correctChoiceId'],
    },
  );

export const createQuizInputSchema = z.object({
  nameEn: z.string().min(1, 'English name is required'),
  nameEs: z.string().min(1, 'Spanish name is required'),
  quizType: z.enum(['procedure', 'course']).optional(),
  questions: z.array(quizQuestionSchema).default([]),
});

export type CreateQuizInput = z.infer<typeof createQuizInputSchema>;
