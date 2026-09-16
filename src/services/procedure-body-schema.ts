import { z } from 'zod';

// A text field that's filled in for both languages. Every free-form string
// in a block uses this so the procedure has real bilingual content — no
// fallback, no "English only".
export const localisedString = z.object({
  en: z.string().min(1),
  es: z.string().min(1),
});

// Same shape, but each side is optional. Used for captions, alt text, and
// other supporting copy where one side may legitimately be empty.
export const localisedStringOptional = z.object({
  en: z.string().optional(),
  es: z.string().optional(),
});

// Shared critical limit sub-shape. Lives inside method and recipe blocks.
export const criticalLimitSchema = z.object({
  label: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
  value: z.string().min(1),
  subtitle: z.string().optional(),
  howToCheck: z.string().min(1),
  breachLabel: z.string().min(1),
  breachResponse: z.string().min(1),
});

// Per-step video clip. startSec/endSec are integers (seconds).
export const videoSegmentSchema = z
  .object({
    src: z.string().min(1),
    startSec: z.number().int().min(0),
    endSec: z.number().int().min(0),
  })
  .refine((v) => v.endSec > v.startSec, {
    message: 'endSec must be greater than startSec',
    path: ['endSec'],
  });

// Backfill shim — wrap legacy string body in { en: <body>, es: '' } so old
// procedures load unchanged. New procedures must fill both sides.
const stepBodySchema = z.preprocess(
  (v) => (typeof v === 'string' ? { en: v, es: '' } : v),
  localisedString,
);

// A single step inside a method or recipe block.
const methodStepSchema = z.object({
  id: z.string().min(1),
  body: stepBodySchema,
  critical: z.boolean().optional(),
  criticalLimit: criticalLimitSchema.optional(),
  videoSegment: videoSegmentSchema.optional(),
});
export type MethodStepInput = z.infer<typeof methodStepSchema>;

// Recipe sub-shapes.
export const allergenSchema = z.object({
  summary: z.string().min(1),
  detail: z.string().min(1),
  selectedAllergens: z.array(z.string().min(1)).optional(),
});

export const yieldItemSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  unit: z.string().optional(),
});

export const ingredientSchema = z.object({
  name: z.string().min(1),
  form: z.string().optional(),
  allergen: z.boolean().optional(),
  unit: z.string().optional(),
  amounts: z.array(z.string().min(1)).default([]),
});

// ---------------------------------------------------------------------------
// Block discriminated union
// ---------------------------------------------------------------------------

const textBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('text'),
  body: localisedString,
});

const headingBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: localisedString,
});

const methodBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('method'),
  steps: z.array(methodStepSchema).min(1, 'A method block needs at least one step.'),
});

const recipeBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('recipe'),
  audience: z.string().optional(),
  allergen: allergenSchema.optional(),
  yieldItems: z.array(yieldItemSchema).optional(),
  factors: z.array(z.number().int().positive()).optional(),
  ingredients: z.array(ingredientSchema).optional(),
  steps: z.array(methodStepSchema).min(1, 'A recipe block needs at least one step.'),
});

const imageBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('image'),
  src: z.string().url(),
  alt: localisedString,
  caption: localisedStringOptional,
  hint: z.enum(['photo', 'diagram']).default('photo'),
});

const videoBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('video'),
  src: z.string().url(),
  caption: localisedStringOptional,
});

const warningBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('warning'),
  severity: z.enum(['warn', 'tip', 'alt', 'equip', 'allergen']),
  body: localisedString,
});

const attachmentBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('attachment'),
  title: localisedString,
  href: z.string().min(1),
  meta: z.string().optional(),
});

const tableBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('table'),
  headers: z.array(localisedString).min(1),
  rows: z.array(z.array(localisedString)),
});

export const blockSchema = z.discriminatedUnion('kind', [
  textBlockSchema,
  headingBlockSchema,
  methodBlockSchema,
  recipeBlockSchema,
  imageBlockSchema,
  videoBlockSchema,
  warningBlockSchema,
  attachmentBlockSchema,
  tableBlockSchema,
]);
export type Block = z.infer<typeof blockSchema>;
export type BlockKind = Block['kind'];

// ---------------------------------------------------------------------------
// ProcedureBody + create input
// ---------------------------------------------------------------------------

export const procedureBodySchema = z.object({
  blocks: z.array(blockSchema).min(1, 'At least one block is required.'),
});
export type ProcedureBody = z.infer<typeof procedureBodySchema>;

export const createProcedureInputSchema = z.object({
  titleEn: z.string().min(1).max(200),
  titleEs: z.string().min(1).max(200),
  purposeEn: z.string().min(1),
  purposeEs: z.string().min(1),
  categoryKey: z.string().min(1),
  status: z.enum(['draft', 'published']).default('draft'),
  bodyEn: procedureBodySchema,
  bodyEs: procedureBodySchema,
});
export type CreateProcedureInput = z.infer<typeof createProcedureInputSchema>;
