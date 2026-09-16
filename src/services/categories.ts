import crypto from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { categories, locations } from '../db/schema';
import { ServiceError } from './errors';
import { slugify } from './procedures';

// ---------------------------------------------------------------------------
// Public wire shape — same as the row, with no Dates (categories don't expose
// timestamps in the API). Icon and sort_order don't exist (icon lives in
// frontend code; default order is created_at ASC, slug ASC).
// ---------------------------------------------------------------------------
export interface PublicCategory {
  id: string;
  slug: string;
  nameEn: string;
  nameEs: string;
  isArchived: boolean;
}

export function publicCategory(c: Readonly<typeof categories.$inferSelect>): PublicCategory {
  return {
    id: c.id,
    slug: c.slug,
    nameEn: c.nameEn,
    nameEs: c.nameEs,
    isArchived: c.isArchived,
  };
}

// Slug is the URL-safe handle. Lowercase letters, digits, hyphens. The form
// autofills this from nameEn (via the same slugify used by procedures), so
// the manager usually doesn't change it; we still validate on the way in.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CategoryCreateInput {
  locationId: string;
  slug: string;
  nameEn: string;
  nameEs: string;
}

export interface CategoryPatchInput {
  nameEn?: string;
  nameEs?: string;
  isArchived?: boolean;
}

// Ordered insertion-first (created_at ASC), slug tie-break. The manager can
// reshuffle later by renaming + archiving; if the team actually wants a
// drag-and-drop re-order UI we'll add a sort_order column in a follow-up.
export async function listCategories(opts: {
  locationId: string;
  includeArchived: boolean;
}): Promise<PublicCategory[]> {
  const { locationId, includeArchived } = opts;
  const conditions = [eq(categories.locationId, locationId)];
  if (!includeArchived) {
    conditions.push(eq(categories.isArchived, false));
  }
  const rows = await db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(asc(categories.createdAt), asc(categories.slug));
  return rows.map(publicCategory);
}

export async function createCategory(
  input: CategoryCreateInput,
  actor: { employeeId: string },
): Promise<PublicCategory> {
  const nameEn = input.nameEn.trim();
  const nameEs = input.nameEs.trim();
  if (nameEn.length === 0 || nameEs.length === 0) {
    throw new ServiceError(400, 'INVALID_INPUT', 'nameEn and nameEs are required');
  }
  const slug = input.slug.trim();
  if (!SLUG_RE.test(slug)) {
    throw new ServiceError(
      400,
      'INVALID_INPUT',
      'Slug must be lowercase letters, digits, and single hyphens',
    );
  }
  if (nameEn.length > 200 || nameEs.length > 200) {
    throw new ServiceError(400, 'INVALID_INPUT', 'Names must be 200 characters or fewer');
  }

  // Validate the parent location exists; FK would catch this but we want a
  // clean 400 instead of the raw constraint violation.
  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, input.locationId))
    .limit(1);
  if (!loc) {
    throw new ServiceError(400, 'LOCATION_NOT_FOUND', 'Unknown location');
  }

  const id = crypto.randomUUID();
  try {
    await db.insert(categories).values({
      id,
      locationId: input.locationId,
      slug,
      nameEn,
      nameEs,
      isArchived: false,
      createdBy: actor.employeeId,
    });
  } catch (err) {
    // 23505 = unique_violation (the partial unique index
    // categories_location_slug_uniq fired because an active row already
    // carries this slug at this location).
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
      throw new ServiceError(
        409,
        'CATEGORY_SLUG_TAKEN',
        `A category with slug "${slug}" already exists at this location`,
      );
    }
    throw err;
  }

  const [row] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!row) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Inserted category not found');
  }
  return publicCategory(row);
}

export async function updateCategory(
  id: string,
  patch: CategoryPatchInput,
): Promise<PublicCategory> {
  if (Object.keys(patch).length === 0) {
    throw new ServiceError(
      400,
      'INVALID_INPUT',
      'Patch must include at least one field',
    );
  }
  const clean: CategoryPatchInput = {};
  if (patch.nameEn !== undefined) {
    const v = patch.nameEn.trim();
    if (v.length === 0) {
      throw new ServiceError(400, 'INVALID_INPUT', 'nameEn cannot be empty');
    }
    if (v.length > 200) {
      throw new ServiceError(400, 'INVALID_INPUT', 'nameEn must be 200 characters or fewer');
    }
    clean.nameEn = v;
  }
  if (patch.nameEs !== undefined) {
    const v = patch.nameEs.trim();
    if (v.length === 0) {
      throw new ServiceError(400, 'INVALID_INPUT', 'nameEs cannot be empty');
    }
    if (v.length > 200) {
      throw new ServiceError(400, 'INVALID_INPUT', 'nameEs must be 200 characters or fewer');
    }
    clean.nameEs = v;
  }
  if (patch.isArchived !== undefined) {
    clean.isArchived = patch.isArchived;
  }

  const existing = await db
    .update(categories)
    .set(clean)
    .where(eq(categories.id, id))
    .returning({ id: categories.id });
  if (existing.length === 0) {
    throw new ServiceError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  }
  const [row] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!row) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Updated category not found');
  }
  return publicCategory(row);
}

// Soft delete — flips isArchived=true. Unarchive by calling updateCategory
// with { isArchived: false }. Procedures that referenced this category
// keep working (FK is SET NULL, so the join returns null on read).
export async function archiveCategory(id: string): Promise<PublicCategory> {
  const updated = await db
    .update(categories)
    .set({ isArchived: true })
    .where(eq(categories.id, id))
    .returning({ id: categories.id });
  if (updated.length === 0) {
    throw new ServiceError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  }
  const [row] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!row) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Updated category not found');
  }
  return publicCategory(row);
}

// Slug is URL-safe; pulled out so callers (e.g. the new-procedure form on the
// frontend) can pre-fill it from the typed name.
export function slugifyCategoryName(name: string): string {
  return slugify(name);
}
