import ApiError from '../../shared/api-error.ts';
import { eq, asc, count, ilike, or, and, type SQL } from 'drizzle-orm';
import {
  formatPaginatedResult,
  type PaginatedResult,
} from '../../shared/pagination.ts';
import { db } from '../../db/client.ts';
import { subcategories } from '../../db/schema/subcategories.schema.ts';

export interface PublicSubcategory {
  id: string;
  categoryId: string;
  nameEn: string;
  nameEs: string;
}

export function publicSubcategory(
  s: Readonly<typeof subcategories.$inferSelect>,
): PublicSubcategory {
  return {
    id: s.id,
    categoryId: s.categoryId,
    nameEn: s.nameEn,
    nameEs: s.nameEs,
  };
}

const subcategoryNotFound = () =>
  Object.assign(new ApiError('Subcategory not found', 404), {
    errorCode: 'SUBCATEGORY_NOT_FOUND',
  });

/** Matches a subcategory only inside the category named in the URL. */
const inCategory = (categoryId: string, id: string) =>
  and(eq(subcategories.id, id), eq(subcategories.categoryId, categoryId));

export async function listSubcategories(
  categoryId: string,
  page: number = 1,
  limit: number = 10,
  search?: string,
): Promise<PaginatedResult<PublicSubcategory>> {
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [eq(subcategories.categoryId, categoryId)];
  if (search) {
    conditions.push(
      or(
        ilike(subcategories.nameEn, `%${search}%`),
        ilike(subcategories.nameEs, `%${search}%`),
      )!,
    );
  }
  const whereClause = and(...conditions);

  // Page query and count are independent, so run them in parallel.
  const [rows, [countRes]] = await Promise.all([
    db
      .select()
      .from(subcategories)
      .where(whereClause)
      .orderBy(asc(subcategories.createdAt), asc(subcategories.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(subcategories).where(whereClause),
  ]);

  return formatPaginatedResult(
    rows.map(publicSubcategory),
    countRes?.total ?? 0,
    page,
    limit,
  );
}

export interface SubcategoryCreateInput {
  nameEn: string;
  nameEs: string;
}

export async function createSubcategory(
  categoryId: string,
  input: SubcategoryCreateInput,
  // subcategories.created_by references user.id (the Better Auth user).
  actor: { userId: string },
): Promise<PublicSubcategory> {
  try {
    const [row] = await db
      .insert(subcategories)
      .values({
        categoryId,
        nameEn: input.nameEn,
        nameEs: input.nameEs,
        createdBy: actor.userId,
        subcategoryIcon: '',
      })
      .returning();
    return publicSubcategory(row!);
  } catch (err) {
    // One query instead of check-then-insert: an unknown category shows up as
    // a foreign key violation on category_id.
    const cause = (
      err as { cause?: { code?: string; constraint_name?: string } }
    ).cause;
    if (
      cause?.code === '23503' &&
      cause.constraint_name?.includes('category_id')
    ) {
      throw Object.assign(new ApiError('Category not found', 404), {
        errorCode: 'CATEGORY_NOT_FOUND',
      });
    }
    throw err;
  }
}

export interface SubcategoryPatchInput {
  nameEn?: string | undefined;
  nameEs?: string | undefined;
}

export async function updateSubcategory(
  categoryId: string,
  id: string,
  patch: SubcategoryPatchInput,
): Promise<PublicSubcategory> {
  if (Object.keys(patch).length === 0) {
    throw Object.assign(
      new ApiError('Patch must include at least one field', 400),
      { errorCode: 'INVALID_INPUT' },
    );
  }

  const [row] = await db
    .update(subcategories)
    .set(patch)
    .where(inCategory(categoryId, id))
    .returning();
  if (!row) throw subcategoryNotFound();
  return publicSubcategory(row);
}

export async function deleteSubcategory(
  categoryId: string,
  id: string,
): Promise<void> {
  const deleted = await db
    .delete(subcategories)
    .where(inCategory(categoryId, id))
    .returning({ id: subcategories.id });
  if (deleted.length === 0) throw subcategoryNotFound();
}
