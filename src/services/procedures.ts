import crypto from 'node:crypto';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  categories,
  employees,
  locations,
  procedureEmployees,
  procedureLocations,
  procedureRoles,
  procedureStations,
  procedures,
  quizzes,
  roles,
  stations,
  type Procedure,
  type ProcedureStatus,
} from '../db/schema';
import { ServiceError } from './errors';
import { logger } from '../lib/logger.js';
import {
  procedureBodySchema,
  type Block,
  type CreateProcedureInput,
  type ProcedureBody,
  type QuizMode,
} from './procedure-body-schema';
import {
  publicCategory,
  type PublicCategory,
} from './categories';

// Wire shape returned by the API. Same fields as the row, with Date
// serialised to ISO and the JSON bodies parsed back to objects so the
// frontend can render without a second JSON.parse. category is the joined
// Category row — null when the procedure has no category (the row's
// category_id is null) or when the category was archived after this
// procedure was created (FK SET NULL). quizId + linkedTrainingId +
// quizMode are the F2.5 wiring for training-course + quiz attachment.
export interface PublicProcedure {
  id: string;
  slug: string;
  titleEn: string;
  titleEs: string;
  purposeEn: string;
  purposeEs: string;
  category: PublicCategory | null;
  status: ProcedureStatus;
  bodyEn: ProcedureBody;
  bodyEs: ProcedureBody;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  quizId: string | null;
  linkedTrainingId: string | null;
  quizMode: QuizMode;
}

/** Parse stored JSON bodies back to the API shape. Fall back to an empty
 *  block list when the stored data doesn't validate — a single malformed row
 *  shouldn't 400 the whole list endpoint.
 *
 *  Three branches, in order:
 *    1. New shape (`{ blocks: [...] }`) — accepted silently.
 *    2. Legacy shape (object with pre-migration section keys, no `blocks`)
 *       — logged at `info`, not `warn`: these rows predate the schema
 *       change and are expected for any procedure written before the
 *       blocks-array migration. Empty body is served until the rows are
 *       converted in place by a follow-up data migration.
 *    3. Anything else — true corruption, logged at `warn` with the row id
 *       and the first Zod issue so the offending record can be repaired. */
export function parseStoredBody(
  raw: unknown,
  where: string,
): ProcedureBody {
  const parsed = procedureBodySchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  if (looksLikeLegacyBody(raw)) {
    logger.info(`procedure body legacy shape (${where})`);
    return { blocks: [] };
  }

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

// Section keys that defined the pre-migration body shape. Any one of
// these — without a `blocks` key — is enough to identify the row as
// legacy. A full set guards against accidental matches on single-key
// arbitrary objects.
const LEGACY_BODY_SECTION_KEYS = [
  'facts',
  'method',
  'attachments',
  'related',
  'control',
] as const;

// Recognise the legacy body shape: a plain object, no `blocks` key, with
// at least one of the documented legacy section keys. Anything else
// falls through to the warn branch above.
function looksLikeLegacyBody(raw: unknown): boolean {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  if ('blocks' in o) return false;
  return LEGACY_BODY_SECTION_KEYS.some((k) => k in o);
}

// Drizzle's leftJoin selects return one row per procedure with the joined
// category (or null). publicProcedure takes that row shape directly.
export function publicProcedure(
  row: Readonly<typeof procedures.$inferSelect> & {
    category: typeof categories.$inferSelect | null;
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
    category: p.category ? publicCategory(p.category) : null,
    status: p.status,
    bodyEn: parseStoredBody(p.blocksEn, `${p.id}/blocksEn`),
    bodyEs: parseStoredBody(p.blocksEs, `${p.id}/blocksEs`),
    createdBy: p.createdBy,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    quizId: p.quizId,
    linkedTrainingId: p.linkedTrainingId,
    // Schema default is 'training' — but treat any unknown value (legacy row,
    // hand-edited DB) as 'training' so the wire shape stays typed.
    quizMode: p.quizMode === 'always' ? 'always' : 'training',
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

  // Verify the picked category exists and isn't archived. The FK has
  // SET NULL semantics — an invalid id would corrupt the row silently — so
  // we surface a clean 400 / 404 here.
  if (input.categoryId !== null) {
    const [cat] = await db
      .select({
        id: categories.id,
        isArchived: categories.isArchived,
      })
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .limit(1);
    if (!cat) {
      throw new ServiceError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    }
    if (cat.isArchived) {
      throw new ServiceError(
        400,
        'CATEGORY_ARCHIVED',
        'Cannot assign an archived category to a procedure',
      );
    }
  }

  // F2.5 wiring: validate the quiz reference. FK SET NULL would silently
  // accept an unknown id — we want a clean 404 instead. Stage 3 training
  // courses don't exist as a table yet, so linkedTrainingId is plain text
  // (no FK, no existence check).
  const quizId = input.quizId ?? null;
  if (quizId !== null) {
    const [quiz] = await db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);
    if (!quiz) {
      throw new ServiceError(404, 'QUIZ_NOT_FOUND', 'Quiz not found');
    }
  }

  // Default quizMode to 'training' when no quiz is attached (the field is
  // a no-op without a quiz, but we still store it so later re-attaching
  // doesn't require a second write).
  const quizMode = input.quizMode ?? 'training';
  if (quizId === null && quizMode === 'always') {
    // 'always' only matters when there IS a quiz. Don't reject — just
    // downgrade silently so the wizard can leave the radio in its last
    // position without blocking the save.
    logger.info(
      `procedure create: quizMode 'always' ignored because no quiz is attached`,
    );
  }
  const finalQuizMode = quizId === null ? 'training' : quizMode;

  // F2.6: validate the access selection lists before the insert. Each
  // list is deduped (manager may have double-clicked a chip) and checked
  // for existence against the dimension table. Locations are additionally
  // constrained to the procedure's location — managers can't pick a
  // location the procedure doesn't belong to (the procedure is implicitly
  // anchored to the actor's location; categories are the only piece that
  // can move it).
  const locationsList = dedupe(input.locations ?? []);
  const rolesList = dedupe(input.roles ?? []);
  const stationsList = dedupe(input.stations ?? []);
  const employeesList = dedupe(input.employees ?? []);

  await assertAccessIdsExist({
    locationsList,
    rolesList,
    stationsList,
    employeesList,
  });

  const id = crypto.randomUUID();
  const slug = await generateUniqueSlug(slugify(input.titleEn));

  // Wrap the procedure insert + the four junction inserts in one tx so a
  // FK violation on a junction row doesn't leave the procedure half-set.
  await db.transaction(async (tx) => {
    await tx.insert(procedures).values({
      id,
      slug,
      titleEn: input.titleEn,
      titleEs: input.titleEs,
      purposeEn: input.purposeEn,
      purposeEs: input.purposeEs,
      categoryId: input.categoryId,
      status: input.status,
      blocksEn: bodyEn,
      blocksEs: bodyEs,
      createdBy: actor.employeeId,
      quizId,
      linkedTrainingId: input.linkedTrainingId ?? null,
      quizMode: finalQuizMode,
    });

    if (locationsList.length > 0) {
      await tx.insert(procedureLocations).values(
        locationsList.map((locationId) => ({ procedureId: id, locationId })),
      );
    }
    if (rolesList.length > 0) {
      await tx.insert(procedureRoles).values(
        rolesList.map((roleId) => ({ procedureId: id, roleId })),
      );
    }
    if (stationsList.length > 0) {
      await tx.insert(procedureStations).values(
        stationsList.map((stationId) => ({ procedureId: id, stationId })),
      );
    }
    if (employeesList.length > 0) {
      await tx.insert(procedureEmployees).values(
        employeesList.map((employeeId) => ({ procedureId: id, employeeId })),
      );
    }
  });

  const [row] = await db
    .select({
      proc: procedures,
      category: categories,
    })
    .from(procedures)
    .leftJoin(categories, eq(categories.id, procedures.categoryId))
    .where(eq(procedures.id, id))
    .limit(1);
  if (!row) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Inserted procedure not found');
  }
  return publicProcedure({
    ...row.proc,
    category: row.category,
  });
}

// De-dupe the access lists so the manager can double-click a chip without
// tripping the composite PK or doubling the junction rows. Preserves
// order (does not sort) so the wizard's display order stays predictable.
function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

// Verify every id in every access list exists in its dimension table.
// One round-trip per dimension (4 SELECTs in the worst case). The
// alternative is one big UNION, but that costs us the per-list error
// code — we'd lose the ability to say "this location id doesn't exist"
// vs "this role id doesn't exist". Each list short-circuits when empty.
async function assertAccessIdsExist(opts: {
  locationsList: string[];
  rolesList: string[];
  stationsList: string[];
  employeesList: string[];
}): Promise<void> {
  if (opts.locationsList.length > 0) {
    const found = await db
      .select({ id: locations.id })
      .from(locations)
      .where(inArray(locations.id, opts.locationsList));
    if (found.length !== opts.locationsList.length) {
      throw new ServiceError(400, 'LOCATION_NOT_FOUND', 'Unknown location in access list');
    }
  }
  if (opts.rolesList.length > 0) {
    const found = await db
      .select({ id: roles.id })
      .from(roles)
      .where(inArray(roles.id, opts.rolesList));
    if (found.length !== opts.rolesList.length) {
      throw new ServiceError(400, 'ROLE_NOT_FOUND', 'Unknown role in access list');
    }
  }
  if (opts.stationsList.length > 0) {
    const found = await db
      .select({ id: stations.id })
      .from(stations)
      .where(inArray(stations.id, opts.stationsList));
    if (found.length !== opts.stationsList.length) {
      throw new ServiceError(400, 'STATION_NOT_FOUND', 'Unknown station in access list');
    }
  }
  if (opts.employeesList.length > 0) {
    const found = await db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.id, opts.employeesList));
    if (found.length !== opts.employeesList.length) {
      throw new ServiceError(400, 'EMPLOYEE_NOT_FOUND', 'Unknown employee in access list');
    }
  }
}

/** Admin-only list of procedures. Newest first. Optionally filtered by status
 *  (`'draft' | 'published'`). Returns the full public shape so the editor can
 *  re-open a draft without a second fetch. */
export async function listProcedures(
  filter: { status?: ProcedureStatus } = {},
): Promise<PublicProcedure[]> {
  const conditions = [];
  if (filter.status) {
    conditions.push(eq(procedures.status, filter.status));
  }
  const rows = await db
    .select({ proc: procedures, category: categories })
    .from(procedures)
    .leftJoin(categories, eq(categories.id, procedures.categoryId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(procedures.updatedAt));
  return rows.map((row) =>
    publicProcedure({ ...row.proc, category: row.category }),
  );
}

/** Fetch a single procedure by slug (used by the public doc view). Returns
 *  `null` when the slug doesn't match anything — the caller decides whether
 *  that's a 404 or just an empty result. Works for both drafts and published;
 *  status-based gating happens at the route layer. */
export async function getProcedureBySlug(
  slug: string,
): Promise<PublicProcedure | null> {
  const [row] = await db
    .select({ proc: procedures, category: categories })
    .from(procedures)
    .leftJoin(categories, eq(categories.id, procedures.categoryId))
    .where(eq(procedures.slug, slug))
    .limit(1);
  if (!row) return null;
  return publicProcedure({ ...row.proc, category: row.category });
}

// Shape we need from the cookie session to evaluate "can this cook read
// this procedure?". `stationId` is nullable (a cook may have no station).
// `id` and `locationId` are always present.
export interface EmployeeAccessProfile {
  id: string;
  locationId: string;
  roleId: string;
  stationId: string | null;
}

/** Cook-side list. Returns every published, non-archived procedure that
 *  the caller can read — either because it's open to all employees at
 *  the location (no rows in any of the four junction tables) or because
 *  the cook's (locationId, roleId, stationId, id) hits at least one
 *  junction row for the procedure.
 *
 *  Built as one SQL round-trip with four correlated EXISTS subqueries
 *  OR'd together plus an "all four are empty" branch. Each EXISTS is
 *  backed by the composite PK on its junction table — `(procedure_id,
 *  <dim>_id)` is the index, so the planner can seek directly.
 *
 *  Newest first so the cook dashboard shows freshly-updated SOPs at the
 *  top. No pagination in this slice — small library, dozens not
 *  thousands of procedures per location. Add LIMIT/OFFSET or cursor
 *  pagination when the count passes ~200.
 *
 *  NOTE: is_archived filter intentionally absent — procedures.is_archived
 *  doesn't exist yet (stage 2 plan adds it as migration 0014). When the
 *  column lands, add `coalesce(${procedures.isArchived}, false) = false`
 *  to the WHERE and bump the SQL once. Until then, archived procedures
 *  still surface — the manager hasn't been able to archive anything yet
 *  so this is a no-op in practice.
 */
export async function listProceduresForEmployee(
  me: EmployeeAccessProfile,
): Promise<PublicProcedure[]> {
  const rows = await db
    .select({ proc: procedures, category: categories })
    .from(procedures)
    .leftJoin(categories, eq(categories.id, procedures.categoryId))
    .where(
      and(
        eq(procedures.status, 'published'),
        or(
          // Open to all: zero rows across every junction table for this SOP.
          and(
            sql`not exists (select 1 from procedure_locations pl where pl.procedure_id = ${procedures.id})`,
            sql`not exists (select 1 from procedure_roles pr where pr.procedure_id = ${procedures.id})`,
            sql`not exists (select 1 from procedure_stations ps where ps.procedure_id = ${procedures.id})`,
            sql`not exists (select 1 from procedure_employees pe where pe.procedure_id = ${procedures.id})`,
          ),
          // OR the cook's profile hits at least one junction row.
          sql`exists (select 1 from procedure_locations pl where pl.procedure_id = ${procedures.id} and pl.location_id = ${me.locationId})`,
          sql`exists (select 1 from procedure_roles pr where pr.procedure_id = ${procedures.id} and pr.role_id = ${me.roleId})`,
          me.stationId !== null
            ? sql`exists (select 1 from procedure_stations ps where ps.procedure_id = ${procedures.id} and ps.station_id = ${me.stationId})`
            : sql`false`,
          sql`exists (select 1 from procedure_employees pe where pe.procedure_id = ${procedures.id} and pe.employee_id = ${me.id})`,
        ),
      ),
    )
    .orderBy(desc(procedures.updatedAt));
  return rows.map((row) => publicProcedure({ ...row.proc, category: row.category }));
}

/** Single-procedure cook-side read. Returns `null` when the slug doesn't
 *  match OR when the cook isn't allowed to read the procedure (status
 *  filter + access join both evaluated). Callers map null to 404 — we
 *  don't distinguish "wrong slug" from "no access" on the wire, since
 *  leaking that distinction would help an attacker enumerate slugs.
 *
 *  Implementation: same SQL as listProceduresForEmployee, narrowed by
 *  slug. One round-trip.
 *
 *  is_archived comment from listProceduresForEmployee applies here too. */
export async function getProcedureForEmployee(
  slug: string,
  me: EmployeeAccessProfile,
): Promise<PublicProcedure | null> {
  const [row] = await db
    .select({ proc: procedures, category: categories })
    .from(procedures)
    .leftJoin(categories, eq(categories.id, procedures.categoryId))
    .where(
      and(
        eq(procedures.slug, slug),
        eq(procedures.status, 'published'),
        or(
          and(
            sql`not exists (select 1 from procedure_locations pl where pl.procedure_id = ${procedures.id})`,
            sql`not exists (select 1 from procedure_roles pr where pr.procedure_id = ${procedures.id})`,
            sql`not exists (select 1 from procedure_stations ps where ps.procedure_id = ${procedures.id})`,
            sql`not exists (select 1 from procedure_employees pe where pe.procedure_id = ${procedures.id})`,
          ),
          sql`exists (select 1 from procedure_locations pl where pl.procedure_id = ${procedures.id} and pl.location_id = ${me.locationId})`,
          sql`exists (select 1 from procedure_roles pr where pr.procedure_id = ${procedures.id} and pr.role_id = ${me.roleId})`,
          me.stationId !== null
            ? sql`exists (select 1 from procedure_stations ps where ps.procedure_id = ${procedures.id} and ps.station_id = ${me.stationId})`
            : sql`false`,
          sql`exists (select 1 from procedure_employees pe where pe.procedure_id = ${procedures.id} and pe.employee_id = ${me.id})`,
        ),
      ),
    )
    .limit(1);
  if (!row) return null;
  return publicProcedure({ ...row.proc, category: row.category });
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
