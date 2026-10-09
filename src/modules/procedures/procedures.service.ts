import ApiError from '../../shared/api-error.ts';
import crypto from 'node:crypto';
import {
  type SQL,
  and,
  desc,
  eq,
  inArray,
  like,
  ne,
  sql,
  count,
  ilike,
  or,
} from 'drizzle-orm';
import {
  formatPaginatedResult,
  type PaginatedResult,
} from '../../shared/pagination.ts';
import { db } from '../../db/client.ts';
import {
  procedures,
  quiz,
  type ProcedureStatus,
} from '../../db/schema/index.ts';

import { logger } from '../../config/logger.ts';
import {
  procedureBodySchema,
  type Block,
  type CreateProcedureInput,
  type ProcedureBody,
} from './procedures.validation.ts';
import { subcategories } from '../../db/schema/subcategories.schema.ts';
import { stations } from '../../db/schema/stations.schema.ts';
import { employees } from '../../db/schema/employees.schema.ts';
import {
  publicSubcategory,
  type PublicSubcategory,
} from '../categories/subcategories.service.ts';

// Wire shape returned by the API. Same fields as the row, with Date
// serialised to ISO and the JSON bodies parsed back to objects so the
// frontend can render without a second JSON.parse. category is the joined
// Category row — null when the procedure has no category (the row's
// category_id is null) or when the category was archived after this
// procedure was created (FK SET NULL).
export interface PublicProcedure {
  id: string;
  slug: string;
  titleEn: string;
  titleEs: string;
  purposeEn: string;
  purposeEs: string;
  subcategory: PublicSubcategory | null;
  stationId: string | null;
  quizId: string | null;
  procedureImage: string | null;
  assignUsers: string[] | null;
  status: ProcedureStatus;
  previousStatus: ProcedureStatus | null;
  bodyEn: ProcedureBody;
  bodyEs: ProcedureBody;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Parse stored JSON bodies back to the API shape. Fall back to an empty
 *  block list when the stored data doesn't validate — a single malformed row
 *  shouldn't 400 the whole list endpoint. Bad shape is logged with the row id
 *  and the first Zod issue so the offending record can be repaired. */
export function parseStoredBody(raw: unknown, where: string): ProcedureBody {
  const parsed = procedureBodySchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const first = parsed.error.issues[0];
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

// Drizzle's leftJoin selects return one row per procedure with the joined
// subcategory (or null). publicProcedure takes that row shape directly.
export function publicProcedure(
  row: Readonly<typeof procedures.$inferSelect> & {
    subcategory: typeof subcategories.$inferSelect | null;
  },
): PublicProcedure {
  const p = row;
  return {
    id: p.id,
    slug: p.slug,
    titleEn: p.titleEn,
    titleEs: p.titleEs,
    purposeEn: p.purposeEn,
    purposeEs: p.purposeEs,
    subcategory: p.subcategory ? publicSubcategory(p.subcategory) : null,
    stationId: p.stationId,
    quizId: p.quizId,
    procedureImage: p.procedureImage,
    assignUsers: p.assignUsers,
    status: p.status,
    previousStatus: (p.previousStatus as ProcedureStatus) ?? null,
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

// Picks a free slug in one query: the base itself if unused, otherwise the
// first free `-2`, `-3`, ... Past 999 we tack a short uuid suffix so we never
// loop forever. Slugs only contain [a-z0-9-], so LIKE needs no escaping.
async function generateUniqueSlug(base: string): Promise<string> {
  const seed = base.length > 0 ? base : 'untitled';
  const rows = await db
    .select({ slug: procedures.slug })
    .from(procedures)
    .where(or(eq(procedures.slug, seed), like(procedures.slug, `${seed}-%`)));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(seed)) return seed;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${seed}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${seed}-${crypto.randomUUID().slice(0, 8)}`;
}

const isSlugConflict = (err: unknown): boolean => {
  const cause = (err as { cause?: { code?: string; constraint_name?: string } })
    .cause;
  return (
    cause?.code === '23505' && cause.constraint_name === 'procedures_slug_uniq'
  );
};

/**
 * Validates every row the procedure links to, in a single query, and throws
 * the same errors (in the same order) as the old one-query-per-check code:
 * procedure (update only), subcategory, station, quiz, assigned users.
 */
async function assertLinks(
  input: Pick<
    CreateProcedureInput,
    'subcategoryId' | 'stationId' | 'quizId' | 'assignUsers'
  >,
  options: { procedureId?: string; afterExists?: () => void } = {},
): Promise<void> {
  const assignUsers = input.assignUsers ?? [];
  const [r] = await db.execute<{
    procedure_ok: boolean;
    subcategory_ok: boolean;
    station_ok: boolean;
    quiz_ok: boolean;
    assigned_found: number;
    assigned_non_employee: number;
  }>(sql`
    select
      ${options.procedureId ? sql`exists (select 1 from ${procedures} where ${eq(procedures.id, options.procedureId)})` : sql`true`} as procedure_ok,
      ${input.subcategoryId != null ? sql`exists (select 1 from ${subcategories} where ${eq(subcategories.id, input.subcategoryId)})` : sql`true`} as subcategory_ok,
      ${input.stationId != null ? sql`exists (select 1 from ${stations} where ${eq(stations.id, input.stationId)})` : sql`true`} as station_ok,
      ${input.quizId != null ? sql`exists (select 1 from ${quiz} where ${eq(quiz.id, input.quizId)})` : sql`true`} as quiz_ok,
      (select count(*)::int from ${employees} where ${inArray(employees.id, assignUsers)}) as assigned_found,
      (select count(*)::int from ${employees} where ${and(inArray(employees.id, assignUsers), ne(employees.role, 'employee'))}) as assigned_non_employee
  `);

  if (!r?.procedure_ok) {
    throw Object.assign(new ApiError('Procedure not found', 404), {
      errorCode: 'NOT_FOUND',
    });
  }
  // Update validates the body only once the procedure is known to exist.
  options.afterExists?.();

  if (!r.subcategory_ok) {
    throw Object.assign(new ApiError('Subcategory not found', 404), {
      errorCode: 'SUBCATEGORY_NOT_FOUND',
    });
  }
  // FKs are SET NULL / plain references; an invalid id would otherwise
  // corrupt the row silently or surface as a generic conflict.
  if (!r.station_ok) {
    throw Object.assign(new ApiError('Station not found', 404), {
      errorCode: 'STATION_NOT_FOUND',
    });
  }
  if (!r.quiz_ok) {
    throw Object.assign(new ApiError('Quiz not found', 404), {
      errorCode: 'QUIZ_NOT_FOUND',
    });
  }
  // Assigned users must be existing employees with the employee role.
  if (r.assigned_found !== assignUsers.length) {
    throw Object.assign(
      new ApiError('One or more assigned users do not exist', 400),
      { errorCode: 'ASSIGNED_USER_NOT_FOUND' },
    );
  }
  if (r.assigned_non_employee > 0) {
    throw Object.assign(
      new ApiError(
        'Only users with the employee role can be assigned to procedures',
        400,
      ),
      { errorCode: 'INVALID_ASSIGNED_USER_ROLE' },
    );
  }
}

/** Parses both bodies and applies the cross-field block rules. */
function validateBodies(input: CreateProcedureInput): {
  bodyEn: ProcedureBody;
  bodyEs: ProcedureBody;
} {
  const bodyEn = procedureBodySchema.parse(input.bodyEn);
  const bodyEs = procedureBodySchema.parse(input.bodyEs);

  // Recipe cross-field rule: ingredients and factors travel together. If
  // either is set, both must be set, and every ingredient's amounts row
  // length must equal the factors length. Walk every recipe block in both
  // language bodies.
  assertRecipeIngredientsAlign(bodyEn.blocks, 'en');
  assertRecipeIngredientsAlign(bodyEs.blocks, 'es');

  // Method-block cross-field rule: every step marked critical must declare
  // a criticalLimit. Applies to method blocks AND the steps inside recipe
  // blocks (recipes have methods too).
  assertCriticalStepsHaveLimits(bodyEn.blocks, 'en');
  assertCriticalStepsHaveLimits(bodyEs.blocks, 'es');

  return { bodyEn, bodyEs };
}

/** Builds the API shape for a row, loading its subcategory if it has one. */
async function toPublic(
  row: typeof procedures.$inferSelect,
): Promise<PublicProcedure> {
  const subcategory = row.subcategoryId
    ? ((
        await db
          .select()
          .from(subcategories)
          .where(eq(subcategories.id, row.subcategoryId))
          .limit(1)
      )[0] ?? null)
    : null;
  return publicProcedure({ ...row, subcategory });
}

export async function createProcedure(
  input: CreateProcedureInput,
  actor: { employeeId: string; userId?: string | undefined },
): Promise<PublicProcedure> {
  const { bodyEn, bodyEs } = validateBodies(input);
  await assertLinks(input);

  // A concurrent create can take the same slug between picking it and
  // inserting; the unique index rejects that, so pick again and retry.
  for (let attempt = 1; ; attempt++) {
    const slug = await generateUniqueSlug(slugify(input.titleEn));
    try {
      const [row] = await db
        .insert(procedures)
        .values({
          slug,
          titleEn: input.titleEn,
          titleEs: input.titleEs,
          purposeEn: input.purposeEn,
          purposeEs: input.purposeEs,
          subcategoryId: input.subcategoryId,
          stationId: input.stationId ?? null,
          quizId: input.quizId ?? null,
          procedureImage: input.procedureImage ?? null,
          assignUsers: input.assignUsers ?? null,
          status: input.status,
          blocksEn: bodyEn,
          blocksEs: bodyEs,
          createdBy: actor.userId || null,
        })
        .returning();
      if (!row) {
        throw Object.assign(new ApiError('Inserted procedure not found', 500), {
          errorCode: 'INTERNAL_ERROR',
        });
      }
      return toPublic(row);
    } catch (err) {
      if (attempt < 3 && isSlugConflict(err)) continue;
      throw err;
    }
  }
}

/** Update an existing procedure by ID. Follows the same validation as create. */
export async function updateProcedure(
  id: string,
  input: CreateProcedureInput,
): Promise<PublicProcedure> {
  let bodies!: { bodyEn: ProcedureBody; bodyEs: ProcedureBody };
  await assertLinks(input, {
    procedureId: id,
    afterExists: () => {
      bodies = validateBodies(input);
    },
  });

  const [row] = await db
    .update(procedures)
    .set({
      titleEn: input.titleEn,
      titleEs: input.titleEs,
      purposeEn: input.purposeEn,
      purposeEs: input.purposeEs,
      subcategoryId: input.subcategoryId,
      stationId: input.stationId ?? null,
      quizId: input.quizId ?? null,
      procedureImage: input.procedureImage ?? null,
      assignUsers: input.assignUsers ?? null,
      status: input.status,
      blocksEn: bodies.bodyEn,
      blocksEs: bodies.bodyEs,
      updatedAt: new Date(),
    })
    .where(eq(procedures.id, id))
    .returning();

  if (!row) {
    // Deleted between the check and the update.
    throw Object.assign(new ApiError('Procedure not found', 404), {
      errorCode: 'NOT_FOUND',
    });
  }
  return toPublic(row);
}

/** Admin-only list of procedures. Newest first. Optionally filtered by:
 *  - `status`         – 'draft' | 'published'
 *  - `stationIds`     – one or more station UUIDs (OR semantics)
 *  - `subcategoryIds` – one or more subcategory UUIDs (OR semantics)
 *  - `categoryIds`    – one or more category UUIDs (OR semantics)
 *
 *  Returns the full public shape so the editor can re-open a draft without a
 *  second fetch. */
export async function listProcedures(
  filter: {
    status?: ProcedureStatus | undefined;
    stationIds?: string[] | undefined;
    subcategoryIds?: string[] | undefined;
    categoryIds?: string[] | undefined;
    search?: string | undefined;
  } = {},
  page: number = 1,
  limit: number = 10,
): Promise<PaginatedResult<PublicProcedure>> {
  const conditions: SQL[] = [];

  if (filter.status) {
    conditions.push(eq(procedures.status, filter.status));
  }

  if (filter.stationIds && filter.stationIds.length > 0) {
    conditions.push(inArray(procedures.stationId, filter.stationIds));
  }

  if (filter.subcategoryIds && filter.subcategoryIds.length > 0) {
    conditions.push(inArray(procedures.subcategoryId, filter.subcategoryIds));
  }

  const byCategory = filter.categoryIds && filter.categoryIds.length > 0;
  if (byCategory) {
    conditions.push(inArray(subcategories.categoryId, filter.categoryIds!));
  }

  if (filter.search) {
    conditions.push(
      or(
        ilike(procedures.titleEn, `%${filter.search}%`),
        ilike(procedures.titleEs, `%${filter.search}%`),
      )!,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * limit;

  // Page query and count are independent, so run them in parallel. The
  // count only needs the subcategory join when filtering by category. The id
  // tie-break keeps pages stable when two rows share an updated_at.
  const countQuery = db.select({ total: count() }).from(procedures);
  const [rows, [countRes]] = await Promise.all([
    db
      .select({ proc: procedures, subcategory: subcategories })
      .from(procedures)
      .leftJoin(subcategories, eq(subcategories.id, procedures.subcategoryId))
      .where(whereClause)
      .orderBy(desc(procedures.updatedAt), desc(procedures.id))
      .limit(limit)
      .offset(offset),
    byCategory
      ? countQuery
          .leftJoin(
            subcategories,
            eq(subcategories.id, procedures.subcategoryId),
          )
          .where(whereClause)
      : countQuery.where(whereClause),
  ]);

  const mapped = rows.map((row) =>
    publicProcedure({ ...row.proc, subcategory: row.subcategory }),
  );
  return formatPaginatedResult(mapped, countRes?.total ?? 0, page, limit);
}

/** Fetch a single procedure by slug (used by the public doc view). Returns
 *  `null` when the slug doesn't match anything — the caller decides whether
 *  that's a 404 or just an empty result. Works for both drafts and published. */
export async function getProcedureBySlug(
  slug: string,
): Promise<PublicProcedure | null> {
  const [row] = await db
    .select({ proc: procedures, subcategory: subcategories })
    .from(procedures)
    .leftJoin(subcategories, eq(subcategories.id, procedures.subcategoryId))
    .where(eq(procedures.slug, slug))
    .limit(1);
  if (!row) return null;
  return publicProcedure({ ...row.proc, subcategory: row.subcategory });
}

/** 404 when the procedure does not exist, otherwise the given 409. */
async function notFoundOr(
  id: string,
  conflict: { message: string; code: string },
): Promise<never> {
  const [exists] = await db
    .select({ id: procedures.id })
    .from(procedures)
    .where(eq(procedures.id, id))
    .limit(1);
  if (!exists) {
    throw Object.assign(new ApiError('Procedure not found', 404), {
      errorCode: 'NOT_FOUND',
    });
  }
  throw Object.assign(new ApiError(conflict.message, 409), {
    errorCode: conflict.code,
  });
}

/** Archive a procedure (draft → archived or published → archived).
 *  Saves the current status in `previousStatus` so it can be restored.
 *  Throws 404 when the id doesn't exist, 409 when it is already archived. */
export async function archiveProcedure(id: string): Promise<PublicProcedure> {
  // One atomic statement: SET reads the old status before overwriting it.
  const [row] = await db
    .update(procedures)
    .set({
      previousStatus: sql`${procedures.status}`,
      status: 'archived',
      updatedAt: new Date(),
    })
    .where(and(eq(procedures.id, id), ne(procedures.status, 'archived')))
    .returning();

  if (!row) {
    return notFoundOr(id, {
      message: 'Procedure is already archived',
      code: 'ALREADY_ARCHIVED',
    });
  }
  return toPublic(row);
}

/** Unarchive a procedure — restores it to its `previousStatus` (draft or
 *  published). Falls back to 'draft' if no previousStatus was recorded.
 *  Throws 404 when the id doesn't exist, 409 when it is not archived. */
export async function unarchiveProcedure(id: string): Promise<PublicProcedure> {
  const [row] = await db
    .update(procedures)
    .set({
      status: sql`coalesce(${procedures.previousStatus}, 'draft')`,
      previousStatus: null,
      updatedAt: new Date(),
    })
    .where(and(eq(procedures.id, id), eq(procedures.status, 'archived')))
    .returning();

  if (!row) {
    return notFoundOr(id, {
      message: 'Procedure is not archived',
      code: 'NOT_ARCHIVED',
    });
  }
  return toPublic(row);
}

function assertRecipeIngredientsAlign(
  blocks: Block[],
  lang: 'en' | 'es',
): void {
  for (const block of blocks) {
    if (block.kind !== 'recipe' && block.kind !== 'ingredients') continue;
    const recipe = block;
    const hasIngredients = (recipe.ingredients?.length ?? 0) > 0;
    const hasFactors = (recipe.factors?.length ?? 0) > 0;
    if (hasIngredients !== hasFactors) {
      throw Object.assign(
        new ApiError(
          `Block ingredients and factors must be set together (${lang}).`,
          400,
        ),
        { errorCode: 'INVALID_INPUT' },
      );
    }
    if (!hasIngredients || !recipe.factors || !recipe.ingredients) continue;
    const expected = recipe.factors.length;
    for (const ingredient of recipe.ingredients) {
      if (ingredient.amounts.length !== expected) {
        throw Object.assign(
          new ApiError(
            `Ingredient "${ingredient.name}" has ${ingredient.amounts.length} amounts but ${expected} factors are defined (${lang}).`,
            400,
          ),
          { errorCode: 'INVALID_INPUT' },
        );
      }
    }
  }
}

function assertCriticalStepsHaveLimits(
  blocks: Block[],
  lang: 'en' | 'es',
): void {
  for (const block of blocks) {
    const steps =
      block.kind === 'method'
        ? block.steps
        : block.kind === 'recipe'
          ? block.steps
          : null;
    if (!steps) continue;
    for (const step of steps) {
      if (step.critical && !step.criticalLimit) {
        throw Object.assign(
          new ApiError(
            `A critical step is missing its critical limit (${lang}): "${(step.body[lang] || step.body['en'] || '').slice(0, 60)}…"`,
            400,
          ),
          { errorCode: 'INVALID_INPUT' },
        );
      }
    }
  }
}
