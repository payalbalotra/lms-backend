import ApiError from '../../shared/api-error.ts';
import { asc, eq, count, ilike, or } from 'drizzle-orm';
import {
  formatPaginatedResult,
  type PaginatedResult,
} from '../../shared/pagination.ts';
import { db } from '../../db/client.ts';
import { categories } from '../../db/schema/categories.schema.ts';

export interface PublicCategory {
  id: string;
  nameEn: string;
  nameEs: string;
  categoryType: string;
  categoryIcon: string;
}

export function publicCategory(
  row: Readonly<typeof categories.$inferSelect>,
): PublicCategory {
  return {
    id: row.id,
    nameEn: row.nameEn,
    nameEs: row.nameEs,
    categoryType: row.categoryType,
    categoryIcon: row.categoryIcon,
  };
}

export interface CategoryCreateInput {
  nameEn: string;
  nameEs: string;
  categoryType: string;
  categoryIcon: string;
}

export interface CategoryPatchInput {
  nameEn?: string | undefined;
  nameEs?: string | undefined;
  categoryType?: string | undefined;
  categoryIcon?: string | undefined;
}

const invalidInput = (message: string) =>
  Object.assign(new ApiError(message, 400), { errorCode: 'INVALID_INPUT' });

const categoryNotFound = () =>
  Object.assign(new ApiError('Category not found', 404), {
    errorCode: 'CATEGORY_NOT_FOUND',
  });

// Ordered insertion-first (created_at ASC), id tie-break. The manager can
// reshuffle later by renaming + archiving; if the team actually wants a
// drag-and-drop re-order UI we'll add a sort_order column in a follow-up.
export async function listCategories(
  page: number = 1,
  limit: number = 10,
  search?: string,
): Promise<PaginatedResult<PublicCategory>> {
  const offset = (page - 1) * limit;
  const whereClause = search
    ? or(
        ilike(categories.nameEn, `%${search}%`),
        ilike(categories.nameEs, `%${search}%`),
      )
    : undefined;

  // Page query and count are independent, so run them in parallel.
  const [rows, [countRes]] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(whereClause)
      .orderBy(asc(categories.createdAt), asc(categories.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(categories).where(whereClause),
  ]);

  return formatPaginatedResult(
    rows.map(publicCategory),
    countRes?.total ?? 0,
    page,
    limit,
  );
}

export async function createCategory(
  input: CategoryCreateInput,
  // categories.created_by references user.id (the Better Auth user).
  actor: { userId: string },
): Promise<PublicCategory> {
  const nameEn = input.nameEn.trim();
  const nameEs = input.nameEs.trim();
  const categoryType = input.categoryType.trim();
  const categoryIcon = input.categoryIcon.trim();
  if (
    nameEn.length === 0 ||
    nameEs.length === 0 ||
    categoryType.length === 0 ||
    categoryIcon.length === 0
  ) {
    throw invalidInput(
      'nameEn, nameEs, categoryType, and categoryIcon are required',
    );
  }

  if (nameEn.length > 200 || nameEs.length > 200) {
    throw invalidInput('Names must be 200 characters or fewer');
  }

  const [row] = await db
    .insert(categories)
    .values({
      nameEn,
      nameEs,
      categoryType,
      categoryIcon,
      createdBy: actor.userId,
    })
    .returning();
  return publicCategory(row!);
}

/** Trims a patch field and rejects it if blank or too long. */
function cleanField(
  name: keyof CategoryPatchInput,
  value: string,
  maxLength?: number,
): string {
  const v = value.trim();
  if (v.length === 0) throw invalidInput(`${name} cannot be empty`);
  if (maxLength !== undefined && v.length > maxLength) {
    throw invalidInput(`${name} must be ${maxLength} characters or fewer`);
  }
  return v;
}

export async function updateCategory(
  id: string,
  patch: CategoryPatchInput,
): Promise<PublicCategory> {
  if (Object.keys(patch).length === 0) {
    throw invalidInput('Patch must include at least one field');
  }
  const clean: CategoryPatchInput = {};
  if (patch.nameEn !== undefined)
    clean.nameEn = cleanField('nameEn', patch.nameEn, 200);
  if (patch.nameEs !== undefined)
    clean.nameEs = cleanField('nameEs', patch.nameEs, 200);
  if (patch.categoryType !== undefined)
    clean.categoryType = cleanField('categoryType', patch.categoryType);
  if (patch.categoryIcon !== undefined)
    clean.categoryIcon = cleanField('categoryIcon', patch.categoryIcon);

  // Save the trimmed values and read the row back in one round trip.
  const [row] = await db
    .update(categories)
    .set(clean)
    .where(eq(categories.id, id))
    .returning();
  if (!row) throw categoryNotFound();
  return publicCategory(row);
}

// Subcategories go with their category (ON DELETE CASCADE); procedures that
// pointed at those subcategories keep existing with subcategory_id = NULL.
export async function deleteCategory(id: string): Promise<void> {
  const deleted = await db
    .delete(categories)
    .where(eq(categories.id, id))
    .returning({ id: categories.id });
  if (deleted.length === 0) throw categoryNotFound();
}
