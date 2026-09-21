import { z } from 'zod';

// Wire shape for the centralised quizzes table. Mirrors the frontend Quiz
// type so the wizard authors a row locally and on save posts the same shape
// to the backend; the cook reader consumes the persisted row unchanged.
//
// Quiz authoring is bilingual — every prompt and every choice label carries
// both languages. We never fall back to "English only" because the cook-side
// reader renders whichever language the employee prefers. The Zod schema
// enforces both sides on save.

const localised = z.object({
  en: z.string().min(1),
  es: z.string().min(1),
});

export const quizChoiceSchema = z.object({
  id: z.string().min(1),
  label: localised,
});

export const quizQuestionSchema = z
  .object({
    id: z.string().min(1),
    prompt: localised,
    choices: z
      .array(quizChoiceSchema)
      .min(2, 'A quiz question needs at least two choices.'),
    correctChoiceId: z.string().min(1),
  })
  .refine(
    (q) => q.choices.some((c) => c.id === q.correctChoiceId),
    'correctChoiceId must reference one of the choices.',
  );

export const quizQuestionsSchema = z.array(quizQuestionSchema);

// Create input — questions + the manual attached toggle. Empty array is
// allowed (so a draft quiz can be saved and questions added later, though
// no admin surface currently does that).
export const createQuizInputSchema = z.object({
  questions: quizQuestionsSchema,
  attached: z.boolean().default(false),
});
export type CreateQuizInput = z.infer<typeof createQuizInputSchema>;

// Patch input — every field optional, refuse empty patches.
export const updateQuizInputSchema = z
  .object({
    questions: quizQuestionsSchema.optional(),
    attached: z.boolean().optional(),
  })
  .refine((p) => Object.keys(p).length > 0, {
    message: 'Patch must include at least one field',
  });
export type UpdateQuizInput = z.infer<typeof updateQuizInputSchema>;
