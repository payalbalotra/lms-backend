import { z } from 'zod';

// Structured fields an LLM is asked to produce from a manager-uploaded
// source document. The wizard applies these to FormSnapshot — title,
// purpose, blocks (text/heading/method/warning/recipe/table/etc.) and,
// for recipe-mode procedures, ingredients + yieldItems + audience +
// allergen. Image/video blocks aren't extracted; the LLM is told to skip
// them and the wizard appends an empty content slot instead.
//
// Why a separate schema (not procedure-body-schema.ts): the backend's
// full procedure body validates every field as required. Extracted
// results are best-effort and frequently partial — the admin is meant
// to review and complete them. So every field here is optional except
// the wrapper, and we use .partial()-style opt-in validation.

// One side optional. The extraction prompt tells Gemini to fill only the
// source-language side and leave the other empty; the wizard mirrors
// whichever side is filled to the other before saving. We still require at
// least one side to be non-empty so the AI can't return an empty stub.
const localisedString = z
  .object({
    en: z.string().optional(),
    es: z.string().optional(),
  })
  .refine((v) => (v.en ?? '').trim().length > 0 || (v.es ?? '').trim().length > 0, {
    message: 'Localised string must have at least one non-empty side',
  });

const criticalLimitSchema = z.object({
  label: z.string().optional(),
  value: z.string().min(1),
  subtitle: z.string().optional(),
  howToCheck: z.string().min(1),
  breachLabel: z.string().min(1),
  breachResponse: z.string().min(1),
});

const methodStepSchema = z.object({
  body: localisedString,
  critical: z.boolean().optional(),
  criticalLimit: criticalLimitSchema.optional(),
});

const textBlock = z.object({
  kind: z.literal('text'),
  body: localisedString,
});

const headingBlock = z.object({
  kind: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: localisedString,
});

const methodBlock = z.object({
  kind: z.literal('method'),
  steps: z.array(methodStepSchema).min(1),
});

const warningBlock = z.object({
  kind: z.literal('warning'),
  severity: z.enum(['warn', 'tip', 'alt', 'equip', 'allergen']),
  body: localisedString,
});

const tableBlock = z.object({
  kind: z.literal('table'),
  headers: z.array(localisedString).min(1),
  rows: z.array(z.array(localisedString)).min(1),
});

const ingredientSchema = z.object({
  name: z.string().min(1),
  unit: z.string().optional(),
  amounts: z.array(z.string()).min(1),
});

const yieldItemSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  unit: z.string().optional(),
});

const recipePayloadSchema = z.object({
  audience: z.string().optional(),
  yieldItems: z.array(yieldItemSchema).optional(),
  ingredients: z.array(ingredientSchema).optional(),
  steps: z.array(methodStepSchema).optional(),
  allergenSummary: z.string().optional(),
});

const recipeBlock = z.object({
  kind: z.literal('recipe'),
  audience: z.string().optional(),
  yieldItems: z.array(yieldItemSchema).optional(),
  ingredients: z.array(ingredientSchema).optional(),
  steps: z.array(methodStepSchema).optional(),
});

const extractedBlockSchema = z.discriminatedUnion('kind', [
  textBlock,
  headingBlock,
  methodBlock,
  warningBlock,
  tableBlock,
  recipeBlock,
]);

// The wrapper. Everything inside is optional except `extractedLanguage`,
// which we use to know which side of the bilingual fields we trust — the
// LLM is told the source is one language and we mirror it to the other.
export const extractedProcedureSchema = z.object({
  title: localisedString.optional(),
  purpose: localisedString.optional(),
  blocks: z.array(extractedBlockSchema).optional(),
  recipe: recipePayloadSchema.optional(),
  extractedLanguage: z.enum(['en', 'es']),
  notes: z.string().optional(),
});

export type ExtractedProcedure = z.infer<typeof extractedProcedureSchema>;
export type ExtractedBlock = z.infer<typeof extractedBlockSchema>;
export type ExtractedRecipe = z.infer<typeof recipePayloadSchema>;
