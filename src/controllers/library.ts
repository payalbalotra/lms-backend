import type { Request, Response } from 'express';
import { z } from 'zod';
import { createProcedureInputSchema } from '../services/procedure-body-schema';
import * as proceduresService from '../services/procedures';
import * as categoriesService from '../services/categories';
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

function unauthenticated(res: Response): void {
  res.status(401).json({
    error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
  });
}

// ---------- POST /api/admin/library/procedures ------------------------------
//
// Body: { titleEn, titleEs, purposeEn, purposeEs, categoryKey, status, bodyEn, bodyEs }
// `status` is 'draft' or 'published'. Both `bodyEn` and `bodyEs` are full
// Procedure bodies (the shape defined in services/procedure-body-schema.ts) —
// same shape, two languages. Both must validate; we never fall back.
//
// Mounted at /api/admin/library/procedures via routes/library.ts. The
// requireAuth + requireAdmin middleware populates req.employee before this
// runs.
export async function createProcedure(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.employee) {
    unauthenticated(res);
    return;
  }

  const parsed = createProcedureInputSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
    return;
  }

  try {
    const procedure = await proceduresService.createProcedure(parsed.data, {
      employeeId: req.employee.id,
    });
    res.status(201).json({ procedure });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- GET /api/admin/library/procedures -------------------------------
//
// Query: ?status=draft|published (optional, returns both by default).
// Returns: { procedures: PublicProcedure[] } newest-first.
// Admin-only; mounted under requireAuth + requireAdmin in routes/library.ts.
export async function listProcedures(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.employee) {
    unauthenticated(res);
    return;
  }

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

  try {
    const procedures = await proceduresService.listProcedures({ status });
    res.status(200).json({ procedures });
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
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
  const slug = req.params.slug;
  if (typeof slug !== 'string' || slug.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Missing procedure slug' },
    });
    return;
  }
  try {
    const procedure = await proceduresService.getProcedureBySlug(slug);
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
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
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
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
  const parsed = categoryCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
    return;
  }
  try {
    const cat = await categoriesService.createCategory(parsed.data, {
      employeeId: req.employee.id,
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
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
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
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
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
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
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