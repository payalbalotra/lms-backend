import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createProcedureInputSchema,
  updateProcedureInputSchema,
} from '../services/procedure-body-schema';
import * as proceduresService from '../services/procedures';
import type { EmployeeAccessProfile } from '../services/procedures';
import * as categoriesService from '../services/categories';
import { extractProcedureFromDocument } from '../services/document-extract';
import { handleServiceError } from '../lib/handle-service-error';
import { procedureStatuses, type ProcedureStatus } from '../db/schema';

function invalidInput(
  res: Response,
  issues: z.ZodError['issues'],
): void {
  res.status(400).json({
    error: {
      code: 'INVALID_INPUT',
      message: 'Invalid input',
      details: issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    },
  });
}

// requireAuth + requireAdmin always run before these handlers and populate
// req.employee. The runtime null check would never fire — we just read
// `req.employee.id` directly. If middleware is ever loosened to mount one of
// these handlers without requireAdmin, the first `req.employee.id` access
// will throw and the global error handler returns 500 — preferable to a
// silent 401 that masks the misconfiguration.
function actorId(req: Request): string {
  if (!req.employee) {
    throw new Error('actorId called without req.employee — middleware misconfigured');
  }
  return req.employee.id;
}

// ---------- POST /api/admin/library/procedures ------------------------------
//
// Body: { titleEn, titleEs, purposeEn, purposeEs, categoryId, status, bodyEn,
// bodyEs, quizId?, linkedTrainingId?, quizMode? }.
// `status` is 'draft' or 'published'. Both `bodyEn` and `bodyEs` are full
// Procedure bodies (the shape defined in services/procedure-body-schema.ts) —
// same shape, two languages. Both must validate; we never fall back.
//
// F2.5 wiring (all optional):
//   - quizId: FK to the centralised quizzes row; service verifies it
//     exists (404 QUIZ_NOT_FOUND). Default null.
//   - linkedTrainingId: free-form string for now (training_courses table
//     doesn't exist yet in stage 2). Default null = standalone SOP.
//   - quizMode: 'training' (default) = quiz only inside the linked course.
//               'always' = quiz also surfaces on the cook-side reader.
//               Downgraded to 'training' silently when quizId is null.
//
// Mounted at /api/admin/library/procedures via routes/library.ts. The
// requireAuth + requireAdmin middleware populates req.employee before this
// runs.
export async function createProcedure(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = createProcedureInputSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
    return;
  }

  try {
    const procedure = await proceduresService.createProcedure(parsed.data, {
      employeeId: actorId(req),
    });
    res.status(201).json({ procedure });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- GET /api/admin/library/procedures -------------------------------
//
// Query: ?status=draft|published (optional, returns both by default).
//         ?includeArchived=true|false (default false — the admin library
//                                      hides archived rows behind the
//                                      opt-in filter chip).
// Returns: { procedures: PublicProcedure[] } newest-first.
// Admin-only; mounted under requireAuth + requireAdmin in routes/library.ts.
export async function listProcedures(
  req: Request,
  res: Response,
): Promise<void> {
  const raw = req.query.status;
  let status: ProcedureStatus | undefined;
  if (typeof raw === 'string' && raw.length > 0) {
    if (!procedureStatuses.includes(raw as ProcedureStatus)) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid status filter',
          details: [{ path: 'status', message: `Expected one of ${procedureStatuses.join(', ')}` }],
        },
      });
      return;
    }
    status = raw as ProcedureStatus;
  }
  // Default to hiding archived rows. The service's default is
  // include-everything so the cook-side read can opt-in independently;
  // the admin library always hides them unless the manager toggles the
  // "Show archived" filter chip on.
  const includeArchived = req.query.includeArchived === 'true';

  try {
    const procedures = await proceduresService.listProcedures({
      status,
      includeArchived,
    });
    res.status(200).json({ procedures });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- GET /api/admin/library/procedures/:id ---------------------------
//
// Path: :id (the UUID, not the slug — admin summary route stable-link).
// Returns: { procedure: PublicProcedure } — 404 NOT_FOUND on unknown id.
// Admin-only; mounted under requireAuth + requireAdmin. Use this for the
// /admin/library/[id] read-only summary page. The cook-side read uses the
// slug-based path under /api/procedures/:slug with the access join.
export async function getProcedureAdmin(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Missing procedure id' },
    });
    return;
  }
  try {
    const procedure = await proceduresService.getProcedureById(id);
    if (!procedure) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Procedure not found' },
      });
      return;
    }
    res.status(200).json({ procedure });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- PATCH /api/admin/library/procedures/:id -------------------------
//
// Path: :id
// Body: any subset of { titleEn, titleEs, purposeEn, purposeEs, categoryId,
// status, bodyEn, bodyEs, quizId, linkedTrainingId, quizMode, locations,
// roles, stations, employees }. Slug is intentionally NOT patchable. At
// least one field must be set (Zod refine). 404 PROCEDURE_NOT_FOUND when
// the id doesn't match. Cross-field validation runs in the service:
//   - category must exist and not be archived (400 CATEGORY_ARCHIVED)
//   - quiz must exist when quizId is non-null (404 QUIZ_NOT_FOUND)
//   - recipe ingredients must align with factors
//   - critical steps must declare a critical limit
//   - access list ids must exist (400 *_NOT_FOUND)
//
// Returns: { procedure: PublicProcedure } at 200 with the access lists
// populated.
//
// Mounted at /api/admin/library/procedures via routes/library.ts under
// requireAuth + requireAdmin. This is the wire the wizard's Edit mode
// calls when the manager hits Save.
export async function updateProcedureAdmin(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Missing procedure id' },
    });
    return;
  }
  const parsed = updateProcedureInputSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
    return;
  }
  try {
    const procedure = await proceduresService.updateProcedure(id, parsed.data);
    res.status(200).json({ procedure });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- POST /api/admin/library/procedures/:id/archive ------------------
//
// Path: :id
// Idempotent soft-archive. No body required. Flips procedures.is_archived
// to true; calling twice has the same effect. Unarchive is a separate
// action via PATCH /procedures/:id with `{ isArchived: false }` once
// migration 0014 lands and slice D's PATCH path can carry the field on
// the wire. This endpoint deliberately doesn't take a body to avoid the
// ambiguity of an "archive or unarchive?" toggle — matches the categories
// archive endpoint shape.
//
// Returns: { procedure: PublicProcedure } at 200 with the joined category
// + access lists. 404 PROCEDURE_NOT_FOUND when the id doesn't match. Until
// procedures.is_archived exists (migration 0014), the service's UPDATE
// throws at the DB layer — clean 500 the global handler will surface.
//
// Mounted at /api/admin/library/procedures via routes/library.ts under
// requireAuth + requireAdmin. Wire the ⋯ kebab → Archive → modal confirm
// calls this.
export async function archiveProcedureAdmin(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Missing procedure id' },
    });
    return;
  }
  try {
    const procedure = await proceduresService.archiveProcedure(id);
    res.status(200).json({ procedure });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ===========================================================================
// AI import — manager uploads a source doc (PDF/DOCX/JPG/PNG/text) to R2
// via the document-presign endpoint, then posts the resulting publicUrl
// here. We download the object back, pull text out (or pass image bytes
// to Gemini multimodal), ask Gemini to populate the extracted-procedure
// schema, return the result so the wizard can render a per-block preview
// before the manager saves.
// ===========================================================================

const importInputSchema = z.object({
  publicUrl: z.string().min(1),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  procedureType: z.enum(['recipe', 'station', 'cleaning', 'general']),
});

// ---------- POST /api/admin/library/import ---------------------------------
//
// Body: { publicUrl, filename, contentType, procedureType }
// Auth: requireAuth + requireAdmin (mount in routes/library.ts).
// Returns: { extraction } at 200. The wizard applies the extraction to
// FormSnapshot; this endpoint does not write to the DB.
//
// Errors:
//   400 IMPORT_UNSUPPORTED_TYPE — contentType not in the document allowlist.
//   400 INVALID_INPUT — body shape mismatch.
//   502 EXTRACTION_INVALID — Gemini returned something we couldn't parse or
//      that didn't pass the Zod schema. Manager can retry.
//   503 EXTRACTION_FAILED — Gemini transport / SDK error.
//   503 IMPORT_NOT_CONFIGURED — GOOGLE_AI_API_KEY missing on the server.
export async function importProcedure(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = importInputSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
    return;
  }

  try {
    const extraction = await extractProcedureFromDocument(parsed.data);
    res.status(200).json({ extraction });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- GET /api/admin/library/procedures/:slug -------------------------
//
// Path: :slug
// Returns: { procedure: PublicProcedure | null } — `null` when no row matches.
// Open to any logged-in employee (admin OR cook). Cooks need to read their
// own published procedures on the floor. The (currently loose) "any status"
// policy is fine while we're still in Stage 1; tighten to published-only for
// non-admins before going live.
export async function getProcedure(
  req: Request,
  res: Response,
): Promise<void> {
  const slug = req.params.slug;
  if (typeof slug !== 'string' || slug.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Missing procedure slug' },
    });
    return;
  }
  // Cook-side read — gate the row against the caller's (locationId, roleId,
  // stationId, id). null = 404 with no distinction between "wrong slug"
  // and "no access" (avoids leaking which slugs exist).
  const profile: EmployeeAccessProfile = {
    id: actorId(req),
    locationId: req.employee!.locationId,
    roleId: req.employee!.roleId,
    stationId: req.employee!.stationId ?? null,
  };
  try {
    const procedure = await proceduresService.getProcedureForEmployee(slug, profile);
    if (!procedure) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Procedure not found' },
      });
      return;
    }
    res.status(200).json({ procedure });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ===========================================================================
// Cook-side list — any logged-in employee (admin OR cook) can list the
// procedures they're allowed to read. Same access join as the single-SOP
// route, just without the slug filter. Newest-first.
// ===========================================================================
//
// Mounted at /api/procedures via routes/procedures.ts (requireAuth only —
// no requireAdmin). Mount BEFORE /:slug in the router or Express will
// route GET /procedures into the slug handler.
export async function listProceduresForEmployee(
  req: Request,
  res: Response,
): Promise<void> {
  const profile: EmployeeAccessProfile = {
    id: actorId(req),
    locationId: req.employee!.locationId,
    roleId: req.employee!.roleId,
    stationId: req.employee!.stationId ?? null,
  };
  try {
    const procedures = await proceduresService.listProceduresForEmployee(profile);
    res.status(200).json({ procedures });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ===========================================================================
// Categories — manager-defined, FK'd from procedures
// ===========================================================================
//
// Mounted at /api/admin/library/categories (requireAuth + requireAdmin).
// Public read endpoint for any logged-in employee is in
// controllers/procedures.ts → GET /api/procedures/categories.

const categoryCreateSchema = z.object({
  locationId: z.string().min(1),
  slug: z.string().min(1).max(80),
  nameEn: z.string().min(1).max(200),
  nameEs: z.string().min(1).max(200),
});

const categoryPatchSchema = z.object({
  nameEn: z.string().min(1).max(200).optional(),
  nameEs: z.string().min(1).max(200).optional(),
  isArchived: z.boolean().optional(),
});

// ---------- GET /api/admin/library/categories -------------------------------
//
// Query: ?locationId=<uuid>&includeArchived=true|false (default false).
// Returns: { categories: PublicCategory[] } (createdAt ASC, slug ASC).
export async function listCategoriesAdmin(
  req: Request,
  res: Response,
): Promise<void> {
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : '';
  if (locationId.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Missing locationId' },
    });
    return;
  }
  const includeArchived = req.query.includeArchived === 'true';
  try {
    const cats = await categoriesService.listCategories({
      locationId,
      includeArchived,
    });
    res.status(200).json({ categories: cats });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- POST /api/admin/library/categories ------------------------------
//
// Body: { locationId, slug, nameEn, nameEs }. Returns { category } at 201.
// 409 CATEGORY_SLUG_TAKEN when an active row at the same location already
// carries this slug.
export async function createCategoryAdmin(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = categoryCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
    return;
  }
  try {
    const cat = await categoriesService.createCategory(parsed.data, {
      employeeId: actorId(req),
    });
    res.status(201).json({ category: cat });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- PATCH /api/admin/library/categories/:id --------------------------
//
// Body: any of { nameEn, nameEs, isArchived }. Id is the UUID, not the slug.
// 404 CATEGORY_NOT_FOUND, 400 INVALID_INPUT on bad shape / empty patch.
export async function updateCategoryAdmin(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Missing category id' },
    });
    return;
  }
  const parsed = categoryPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
    return;
  }
  try {
    const cat = await categoriesService.updateCategory(id, parsed.data);
    res.status(200).json({ category: cat });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- POST /api/admin/library/categories/:id/archive ------------------
//
// Idempotent soft archive. Flips isArchived=true.
export async function archiveCategoryAdmin(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Missing category id' },
    });
    return;
  }
  try {
    const cat = await categoriesService.archiveCategory(id);
    res.status(200).json({ category: cat });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- GET /api/procedures/categories?locationId= ----------------------
//
// Read-only, mounted under /api/procedures (requireAuth only — any logged-in
// employee, admin or cook). Returns the active categories for the location
// so the employee dashboard tiles, the editor dropdown, and the procedure
// reader can populate without an admin round-trip. ?includeArchived=true
// returns archived rows too (manager-only use case; employee surfaces should
// never ask for them).
export async function listCategoriesPublic(
  req: Request,
  res: Response,
): Promise<void> {
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : '';
  if (locationId.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Missing locationId' },
    });
    return;
  }
  const includeArchived = req.query.includeArchived === 'true';
  try {
    const cats = await categoriesService.listCategories({
      locationId,
      includeArchived,
    });
    res.status(200).json({ categories: cats });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}