import crypto from 'node:crypto';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  categories,
  employees,
  locations,
  procedures,
  quizzes,
  roles,
  stations,
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
  type UpdateProcedureInput,
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
//
// `access` carries the per-dimension FK id (added in migration 0015) so
// the manager can see who a SOP is restricted to; cook-side readers get
// the same shape and can ignore it. ALL FOUR fields null = open to
// everyone at the location (the manager's "Everyone" choice on the
// Access step). One FK set per dimension max — multi-assignment per
// dimension was the deliberate simplification in 0015.
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
  /** Monotonic publish version. Bumped server-side on every publish
   *  transition inside a SELECT FOR UPDATE so concurrent publishes
   *  serialize and don't both write N+1. Starts at 1. The QR code on
   *  the printed SOP links back to procedures.slug?version=N so the
   *  manager can hand out a stable code that always points at the
   *  current version. Added by migration 0014. */
  version: number;
  /** Soft-archive flag. Per PROJECT_OVERVIEW §02: content moves through
   *  draft → published → archived. Archived procedures stay visible in
   *  the admin library under an opt-in filter chip; the cook-side reader
   *  filters them out. Added by migration 0014. */
  isArchived: boolean;
  access: ProcedureAccess;
}

export interface ProcedureAccess {
  locationId: string | null;
  roleId: string | null;
  stationId: string | null;
  employeeId: string | null;
}

// Used by callers that haven't (or don't need to) load the procedure row
// for its access columns — createProcedure passes the FKs it just wrote.
export const EMPTY_ACCESS: ProcedureAccess = {
  locationId: null,
  roleId: null,
  stationId: null,
  employeeId: null,
};

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
// category (or null). publicProcedure reads the access FKs off the row
// directly (migration 0015 put them on procedures) — no second fetch.
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
    // Migration 0014 columns: surfaced on every read so admin surfaces can
    // render the v{n} chip + archived filter without a second fetch.
    version: p.version,
    isArchived: p.isArchived,
    // Migration 0015 access FKs: one nullable id per dimension. ALL null =
    // open to everyone at the manager's "Everyone" choice on the Access
    // step. Otherwise the cook must match at least one of the four.
    access: {
      locationId: p.accessLocationId,
      roleId: p.accessRoleId,
      stationId: p.accessStationId,
      employeeId: p.accessEmployeeId,
    },
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

  // F2.6: validate the access FKs before the insert. Each is a single
  // nullable id — checked for existence against its dimension table so a
  // typo surfaces as 400 *_NOT_FOUND instead of a 23503 violation on the
  // FK (which would surface as a 500). When all four are null the
  // procedure is open to everyone (the manager's "Everyone" choice).
  const access = {
    locationId: input.accessLocationId ?? null,
    roleId: input.accessRoleId ?? null,
    stationId: input.accessStationId ?? null,
    employeeId: input.accessEmployeeId ?? null,
  };
  await assertAccessIdsExist(access);

  const id = crypto.randomUUID();
  const slug = await generateUniqueSlug(slugify(input.titleEn));

  // Single insert — the access FKs live on procedures themselves (0015),
  // no junction rows to follow up with. The transaction wrapper stays
  // for parity with updateProcedure; it's a no-op overhead but keeps
  // the shape uniform and lets future writes (e.g. an audit row) ride
  // along.
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
      accessLocationId: access.locationId,
      accessRoleId: access.roleId,
      accessStationId: access.stationId,
      accessEmployeeId: access.employeeId,
    });
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

// Update an existing procedure. Partial — every field optional, but at
// least one must be set (enforced by the Zod patch schema before this
// runs). The slug is intentionally NOT patchable: keeping the URL handle
// stable across edits preserves any QR codes already printed.
//
// Cross-field rules mirror createProcedure — recipe ingredients must
// align with factors, every critical step must declare a critical limit,
// and an attached quiz must exist (404 QUIZ_NOT_FOUND if not). Access
// updates replace existing FK values per dimension; passing an explicit
// null in a patch is the way to drop the chip on that dimension.
//
// Body updates are validated through the same Zod schema as creation,
// then the recipe / critical-limit cross-field checks run on the parsed
// blocks. The parsed result is what we write back — no re-parse.
//
// On transitions to status='published' from any other status, we bump
// procedures.version inside a SELECT FOR UPDATE so concurrent publishes
// serialize and don't both write N+1. The QR code on the printed SOP
// links to procedures.slug?version=N — the bump is the signal that the
// printed copy is stale.
export async function updateProcedure(
  id: string,
  patch: UpdateProcedureInput,
): Promise<PublicProcedure> {
  // 1. Parse body updates up front + run cross-field checks on the parsed
  //    blocks. Storing the parsed result avoids a second parse when we
  //    write back.
  let parsedBodyEn: ProcedureBody | undefined;
  let parsedBodyEs: ProcedureBody | undefined;
  if (patch.bodyEn !== undefined) {
    parsedBodyEn = procedureBodySchema.parse(patch.bodyEn);
    assertRecipeIngredientsAlign(parsedBodyEn.blocks, 'en');
    assertCriticalStepsHaveLimits(parsedBodyEn.blocks, 'en');
  }
  if (patch.bodyEs !== undefined) {
    parsedBodyEs = procedureBodySchema.parse(patch.bodyEs);
    assertRecipeIngredientsAlign(parsedBodyEs.blocks, 'es');
    assertCriticalStepsHaveLimits(parsedBodyEs.blocks, 'es');
  }

  // 2. Load the current row. We need it for cross-references that combine
  //    patch with current state (effective quiz id, current status for the
  //    publish-bump decision, current version for the bump itself).
  const [current] = await db
    .select({ proc: procedures, category: categories })
    .from(procedures)
    .leftJoin(categories, eq(categories.id, procedures.categoryId))
    .where(eq(procedures.id, id))
    .limit(1);
  if (!current) {
    throw new ServiceError(404, 'PROCEDURE_NOT_FOUND', 'Procedure not found');
  }

  // 3. Validate category if patched. SET NULL FK would silently accept a
  //    bogus id — we want a clean 404 / 400 instead.
  if (patch.categoryId !== undefined && patch.categoryId !== null) {
    const [cat] = await db
      .select({ id: categories.id, isArchived: categories.isArchived })
      .from(categories)
      .where(eq(categories.id, patch.categoryId))
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

  // 4. Validate quiz if patched to a non-null id. Same SET NULL rationale.
  if (patch.quizId !== undefined && patch.quizId !== null) {
    const [quiz] = await db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(eq(quizzes.id, patch.quizId))
      .limit(1);
    if (!quiz) {
      throw new ServiceError(404, 'QUIZ_NOT_FOUND', 'Quiz not found');
    }
  }

  // 5. Resolve effective quizId + quizMode. Patch wins; otherwise fall
  //    back to the current row. 'always' with no quiz is downgraded
  //    silently (logged at info) — same rule as createProcedure.
  const effectiveQuizId =
    patch.quizId !== undefined ? patch.quizId : current.proc.quizId;
  let effectiveQuizMode: QuizMode;
  if (patch.quizMode !== undefined) {
    if (effectiveQuizId === null && patch.quizMode === 'always') {
      logger.info(
        `procedure update: quizMode 'always' ignored because no quiz is attached`,
      );
      effectiveQuizMode = 'training';
    } else {
      effectiveQuizMode = patch.quizMode;
    }
  } else {
    effectiveQuizMode = current.proc.quizMode === 'always' ? 'always' : 'training';
  }

  // 6. Validate access FKs if any dimension is patched. A patch sets the
  //    column to its new value verbatim (null included) — there's no
  //    "leave alone" semantic; the manager only touches the field when
  //    they want to change it.
  if (
    patch.accessLocationId !== undefined ||
    patch.accessRoleId !== undefined ||
    patch.accessStationId !== undefined ||
    patch.accessEmployeeId !== undefined
  ) {
    await assertAccessIdsExist({
      locationId: patch.accessLocationId ?? null,
      roleId: patch.accessRoleId ?? null,
      stationId: patch.accessStationId ?? null,
      employeeId: patch.accessEmployeeId ?? null,
    });
  }

  // 7. Build the procedure patch — only fields present in the input are
  //    written. updatedAt is always stamped. The publish-transition
  //    bump is computed inside the transaction (step 8) so the version
  //    read is FOR-UPDATE-consistent.
  const procPatch: Partial<typeof procedures.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.titleEn !== undefined) procPatch.titleEn = patch.titleEn;
  if (patch.titleEs !== undefined) procPatch.titleEs = patch.titleEs;
  if (patch.purposeEn !== undefined) procPatch.purposeEn = patch.purposeEn;
  if (patch.purposeEs !== undefined) procPatch.purposeEs = patch.purposeEs;
  if (patch.categoryId !== undefined) procPatch.categoryId = patch.categoryId;
  if (patch.status !== undefined) {
    procPatch.status = patch.status;
  }
  if (parsedBodyEn !== undefined) procPatch.blocksEn = parsedBodyEn;
  if (parsedBodyEs !== undefined) procPatch.blocksEs = parsedBodyEs;
  if (patch.quizId !== undefined) procPatch.quizId = patch.quizId;
  if (patch.linkedTrainingId !== undefined) {
    procPatch.linkedTrainingId = patch.linkedTrainingId;
  }
  // Stamp quizMode if it changed. Without this, a patch that only sets
  // quizId=null with quizMode='training' (the default) would persist
  // 'always' on the row even though the manager picked 'training'.
  const currentQuizMode: QuizMode =
    current.proc.quizMode === 'always' ? 'always' : 'training';
  if (effectiveQuizMode !== currentQuizMode) {
    procPatch.quizMode = effectiveQuizMode;
  }
  // Access FKs land in the same UPDATE (0015 — no junction rows).
  if (patch.accessLocationId !== undefined) {
    procPatch.accessLocationId = patch.accessLocationId ?? null;
  }
  if (patch.accessRoleId !== undefined) {
    procPatch.accessRoleId = patch.accessRoleId ?? null;
  }
  if (patch.accessStationId !== undefined) {
    procPatch.accessStationId = patch.accessStationId ?? null;
  }
  if (patch.accessEmployeeId !== undefined) {
    procPatch.accessEmployeeId = patch.accessEmployeeId ?? null;
  }

  // 8. Atomic write — single UPDATE on procedures. The publish-bump
  //    runs the same SELECT FOR UPDATE inside the transaction so two
  //    concurrent publishes serialize and don't both write N+1.
  await db.transaction(async (tx) => {
    if (
      patch.status === 'published' &&
      current.proc.status !== 'published'
    ) {
      const [row] = await tx
        .select({ version: procedures.version })
        .from(procedures)
        .where(eq(procedures.id, id))
        .for('update')
        .limit(1);
      if (row) {
        procPatch.version = row.version + 1;
      }
    }
    await tx.update(procedures).set(procPatch).where(eq(procedures.id, id));
  });

  // 9. Re-fetch the row and return the public shape. Access FKs come
  //    straight off the row — no separate junction fetch.
  const [updated] = await db
    .select({ proc: procedures, category: categories })
    .from(procedures)
    .leftJoin(categories, eq(categories.id, procedures.categoryId))
    .where(eq(procedures.id, id))
    .limit(1);
  if (!updated) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Updated procedure not found');
  }
  return publicProcedure({ ...updated.proc, category: updated.category });
}

// Verify each access FK resolves to a real row in its dimension table.
// One SELECT per dimension — only the dimensions the manager actually
// set (or is patching to) cost a query. A typo surfaces as 400
// *_NOT_FOUND rather than as a 23503 violation that would surface as a
// generic 500.
async function assertAccessIdsExist(opts: {
  locationId: string | null;
  roleId: string | null;
  stationId: string | null;
  employeeId: string | null;
}): Promise<void> {
  if (opts.locationId !== null) {
    const [row] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, opts.locationId))
      .limit(1);
    if (!row) {
      throw new ServiceError(400, 'LOCATION_NOT_FOUND', 'Unknown location id');
    }
  }
  if (opts.roleId !== null) {
    const [row] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.id, opts.roleId))
      .limit(1);
    if (!row) {
      throw new ServiceError(400, 'ROLE_NOT_FOUND', 'Unknown role id');
    }
  }
  if (opts.stationId !== null) {
    const [row] = await db
      .select({ id: stations.id })
      .from(stations)
      .where(eq(stations.id, opts.stationId))
      .limit(1);
    if (!row) {
      throw new ServiceError(400, 'STATION_NOT_FOUND', 'Unknown station id');
    }
  }
  if (opts.employeeId !== null) {
    const [row] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, opts.employeeId))
      .limit(1);
    if (!row) {
      throw new ServiceError(400, 'EMPLOYEE_NOT_FOUND', 'Unknown employee id');
    }
  }
}

/** Admin-only list of procedures. Newest first. Optionally filtered by status
 *  (`'draft' | 'published'`) or by archived flag (default = include
 *  everything; admin library uses `includeArchived=false` to hide archived
 *  rows behind the opt-in filter chip). Returns the full public shape so
 *  the editor can re-open a draft without a second fetch. */
export async function listProcedures(
  filter: { status?: ProcedureStatus; includeArchived?: boolean } = {},
): Promise<PublicProcedure[]> {
  const conditions = [];
  if (filter.status) {
    conditions.push(eq(procedures.status, filter.status));
  }
  if (filter.includeArchived === false) {
    conditions.push(eq(procedures.isArchived, false));
  }
  const rows = await db
    .select({ proc: procedures, category: categories })
    .from(procedures)
    .leftJoin(categories, eq(categories.id, procedures.categoryId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(procedures.updatedAt));
  return rows.map((row) => publicProcedure({ ...row.proc, category: row.category }));
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

// Soft-archive a procedure. Idempotent — calling twice has the same
// effect (the row is already archived). Unarchive is a separate action:
// PATCH /api/admin/library/procedures/:id with `{ isArchived: false }`,
// handled by the slice-D update path. Splitting archive and unarchive
// matches the categories endpoint shape and avoids the ambiguity of a
// toggle that the manager might fire by accident.
// Idempotent toggle. The route is a single POST /archive with no body —
// each call flips the row. The SELECT ... FOR UPDATE inside the
// transaction serialises concurrent toggles so two simultaneous archive
// calls can't both flip in the same direction (one would no-op, but the
// version audit log would still see exactly one transition).
export async function archiveProcedure(
  id: string,
): Promise<PublicProcedure> {
  let nextArchived = false;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ isArchived: procedures.isArchived })
      .from(procedures)
      .where(eq(procedures.id, id))
      .for('update')
      .limit(1);
    if (!row) {
      throw new ServiceError(404, 'PROCEDURE_NOT_FOUND', 'Procedure not found');
    }
    nextArchived = !row.isArchived;
    await tx
      .update(procedures)
      .set({ isArchived: nextArchived, updatedAt: new Date() })
      .where(eq(procedures.id, id));
  });
  const procedure = await getProcedureById(id);
  if (!procedure) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Archived procedure not found');
  }
  return procedure;
}

/** Admin read by id (not slug). Used by the read-only summary route at
 *  /admin/library/[id] so the manager can deep-link to a procedure via its
 *  stable UUID instead of the mutable slug. Returns `null` for unknown id —
 *  the controller maps to 404. Unlike getProcedureBySlug this is admin-only:
 *  the cook-side reader uses the slug-based path with the access join. */
export async function getProcedureById(
  id: string,
): Promise<PublicProcedure | null> {
  const [row] = await db
    .select({ proc: procedures, category: categories })
    .from(procedures)
    .leftJoin(categories, eq(categories.id, procedures.categoryId))
    .where(eq(procedures.id, id))
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
 *  the caller can read.
 *
 *  Access rule (post-0015): a cook sees the procedure when ANY of the
 *  four access_*_id columns matches their profile, OR the procedure is
 *  open to everyone (all four FKs null). isArchived=false is layered
 *  on top so the cook reader hides archived SOPs automatically.
 *
 *  One SQL round-trip — no junction EXISTS subqueries, no per-row
 *  access fetch. Each per-dimension match is backed by the b-tree
 *  index on its access_*_id column (created in 0015).
 *
 *  Newest first so the cook dashboard shows freshly-updated SOPs at the
 *  top. No pagination in this slice — small library, dozens not
 *  thousands of procedures per location. Add LIMIT/OFFSET or cursor
 *  pagination when the count passes ~200. */
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
        eq(procedures.isArchived, false),
        cookAccessMatches(me),
      ),
    )
    .orderBy(desc(procedures.updatedAt));
  return rows.map((row) => publicProcedure({ ...row.proc, category: row.category }));
}

/** Single-procedure cook-side read. Returns `null` when the slug doesn't
 *  match OR when the cook isn't allowed to read the procedure (status
 *  filter + access match + archived filter all evaluated). Callers map
 *  null to 404 — we don't distinguish "wrong slug" from "no access" on
 *  the wire, since leaking that distinction would help an attacker
 *  enumerate slugs.
 *
 *  Implementation: same WHERE shape as listProceduresForEmployee,
 *  narrowed by slug. One round-trip. */
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
        eq(procedures.isArchived, false),
        cookAccessMatches(me),
      ),
    )
    .limit(1);
  if (!row) return null;
  return publicProcedure({ ...row.proc, category: row.category });
}

// Cook-side access predicate. A procedure matches the cook when ANY of:
//   - accessLocationId = me.locationId (manager targeted this location)
//   - accessRoleId     = me.roleId     (manager targeted this role)
//   - accessStationId  = me.stationId  (manager targeted this station)
//   - accessEmployeeId = me.id         (manager targeted this person)
//   - OR all four FKs are null (manager picked "Everyone").
//
// The station match has a NULL guard: if the cook has no station, the
// station clause is dropped to NULL = NULL being false in SQL — we
// don't want a NULL-meets-NULL match accidentally granting access.
function cookAccessMatches(me: EmployeeAccessProfile) {
  return or(
    // Open to all: every FK null.
    and(
      sql`${procedures.accessLocationId} IS NULL`,
      sql`${procedures.accessRoleId} IS NULL`,
      sql`${procedures.accessStationId} IS NULL`,
      sql`${procedures.accessEmployeeId} IS NULL`,
    ),
    eq(procedures.accessLocationId, me.locationId),
    eq(procedures.accessRoleId, me.roleId),
    me.stationId !== null
      ? eq(procedures.accessStationId, me.stationId)
      : sql`false`,
    eq(procedures.accessEmployeeId, me.id),
  );
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
