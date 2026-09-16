import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { procedures, type Procedure, type ProcedureStatus } from '../db/schema';
import { ServiceError } from './errors';
import { logger } from '../lib/logger.js';
import {
  procedureBodySchema,
  type Block,
  type CreateProcedureInput,
  type ProcedureBody,
} from './procedure-body-schema';

// Wire shape returned by the API. Same fields as the row, with Date
// serialised to ISO and the JSON bodies parsed back to objects so the
// frontend can render without a second JSON.parse.
export interface PublicProcedure {
  id: string;
  slug: string;
  titleEn: string;
  titleEs: string;
  purposeEn: string;
  purposeEs: string;
  categoryKey: string;
  status: ProcedureStatus;
  bodyEn: ProcedureBody;
  bodyEs: ProcedureBody;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Parse stored JSON bodies back to the API shape. Fall back to an empty
 *  block list when the stored data doesn't validate — a single malformed row
 *  shouldn't 400 the whole list endpoint. Bad shape is logged with the row id
 *  and the first Zod issue so the offending record can be repaired. */
export function parseStoredBody(
  raw: unknown,
  where: string,
): ProcedureBody {
  const parsed = procedureBodySchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const first = parsed.error.issues[0];
  // Snapshot the bad shape for diagnostics: type + shallow keys/array-ness.
  // Avoid logging raw user-authored strings (could be long).
  const shape =
    raw === null
      ? 'null'
      : Array.isArray(raw)
        ? `array(len=${raw.length})`
        : typeof raw === 'object'
          ? `object(keys=${Object.keys(raw as Record<string, unknown>).join(',')})`
          : typeof raw;
  logger.warn(
    `procedure body invalid (${where}): ${first?.path?.join('.') ?? '?'} - ${first?.message ?? 'invalid'} -> ${shape}`,
  );
  return { blocks: [] };
}

export function publicProcedure(p: Readonly<Procedure>): PublicProcedure {
  return {
    id: p.id,
    slug: p.slug,
    titleEn: p.titleEn,
    titleEs: p.titleEs,
    purposeEn: p.purposeEn,
    purposeEs: p.purposeEs,
    categoryKey: p.categoryKey,
    status: p.status,
    bodyEn: parseStoredBody(p.blocksEn, `${p.id}/blocksEn`),
    bodyEs: parseStoredBody(p.blocksEs, `${p.id}/blocksEs`),
    createdBy: p.createdBy,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// URL-safe slug from a human title. Lowercase, ASCII, hyphens.
// Diacritics get stripped (so "Limpieza" -> "limpieza"); everything else
// non-alphanumeric becomes a hyphen; repeated/edge hyphens collapse.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Append `-2`, `-3`, … on collision. Stops at 999 — past that we tack a
// short uuid suffix so we never loop forever.
async function generateUniqueSlug(base: string): Promise<string> {
  const seed = base.length > 0 ? base : 'untitled';
  const [hit] = await db
    .select({ slug: procedures.slug })
    .from(procedures)
    .where(eq(procedures.slug, seed))
    .limit(1);
  if (!hit) return seed;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${seed}-${i}`;
    const [exists] = await db
      .select({ slug: procedures.slug })
      .from(procedures)
      .where(eq(procedures.slug, candidate))
      .limit(1);
    if (!exists) return candidate;
  }
  return `${seed}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createProcedure(
  input: CreateProcedureInput,
  actor: { employeeId: string },
): Promise<PublicProcedure> {
  // Defensive re-validation. The controller has already parsed, but the
  // service is the public boundary (CLI, future workers) — re-validate here
  // so a future caller bypassing the controller still gets the contract.
  const bodyEn = procedureBodySchema.parse(input.bodyEn);
  const bodyEs = procedureBodySchema.parse(input.bodyEs);

  // Recipe cross-field rule: ingredients and factors travel together. If
  // either is set, both must be set, and every ingredient's amounts row
  // length must equal the factors length. Throws ServiceError so the
  // controller surfaces a clean 400. Walk every recipe block in both
  // language bodies.
  assertRecipeIngredientsAlign(bodyEn.blocks, 'en');
  assertRecipeIngredientsAlign(bodyEs.blocks, 'es');

  // Method-block cross-field rule: every step marked critical must declare
  // a criticalLimit. Applies to method blocks AND the steps inside recipe
  // blocks (recipes have methods too).
  assertCriticalStepsHaveLimits(bodyEn.blocks, 'en');
  assertCriticalStepsHaveLimits(bodyEs.blocks, 'es');

  const id = crypto.randomUUID();
  const slug = await generateUniqueSlug(slugify(input.titleEn));

  await db.insert(procedures).values({
    id,
    slug,
    titleEn: input.titleEn,
    titleEs: input.titleEs,
    purposeEn: input.purposeEn,
    purposeEs: input.purposeEs,
    categoryKey: input.categoryKey,
    status: input.status,
    blocksEn: bodyEn,
    blocksEs: bodyEs,
    createdBy: actor.employeeId,
  });

  const [row] = await db
    .select()
    .from(procedures)
    .where(eq(procedures.id, id))
    .limit(1);
  if (!row) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Inserted procedure not found');
  }
  return publicProcedure(row);
}

/** Admin-only list of procedures. Newest first. Optionally filtered by status
 *  (`'draft' | 'published'`). Returns the full public shape so the editor can
 *  re-open a draft without a second fetch. */
export async function listProcedures(
  filter: { status?: ProcedureStatus } = {},
): Promise<PublicProcedure[]> {
  const where = filter.status ? eq(procedures.status, filter.status) : undefined;
  const rows = await db
    .select()
    .from(procedures)
    .where(where)
    .orderBy(desc(procedures.updatedAt));
  return rows.map(publicProcedure);
}

/** Fetch a single procedure by slug (used by the public doc view). Returns
 *  `null` when the slug doesn't match anything — the caller decides whether
 *  that's a 404 or just an empty result. Works for both drafts and published;
 *  status-based gating happens at the route layer. */
export async function getProcedureBySlug(
  slug: string,
): Promise<PublicProcedure | null> {
  const [row] = await db
    .select()
    .from(procedures)
    .where(eq(procedures.slug, slug))
    .limit(1);
  return row ? publicProcedure(row) : null;
}

function assertRecipeIngredientsAlign(blocks: Block[], lang: 'en' | 'es'): void {
  for (const block of blocks) {
    if (block.kind !== 'recipe') continue;
    const recipe = block;
    const hasIngredients = (recipe.ingredients?.length ?? 0) > 0;
    const hasFactors = (recipe.factors?.length ?? 0) > 0;
    if (hasIngredients !== hasFactors) {
      throw new ServiceError(
        400,
        'INVALID_INPUT',
        `Recipe block ingredients and factors must be set together (${lang}).`,
      );
    }
    if (!hasIngredients || !recipe.factors || !recipe.ingredients) continue;
    const expected = recipe.factors.length;
    for (const ingredient of recipe.ingredients) {
      if (ingredient.amounts.length !== expected) {
        throw new ServiceError(
          400,
          'INVALID_INPUT',
          `Ingredient "${ingredient.name}" has ${ingredient.amounts.length} amounts but ${expected} factors are defined (${lang}).`,
        );
      }
    }
  }
}

function assertCriticalStepsHaveLimits(blocks: Block[], lang: 'en' | 'es'): void {
  for (const block of blocks) {
    const steps =
      block.kind === 'method' ? block.steps : block.kind === 'recipe' ? block.steps : null;
    if (!steps) continue;
    for (const step of steps) {
      if (step.critical && !step.criticalLimit) {
        throw new ServiceError(
          400,
          'INVALID_INPUT',
          `A critical step is missing its critical limit (${lang}): "${step.body[lang].slice(0, 60)}…"`,
        );
      }
    }
  }
}
