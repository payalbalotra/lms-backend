import ApiError from '../../shared/utils/ApiError.ts';
import crypto from 'node:crypto';
import { eq, asc } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { categories } from '../../db/categories.schema.ts';
import { subcategories } from '../../db/subcategories.schema.ts';

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

export async function listSubcategories(
  categoryId: string,
): Promise<PublicSubcategory[]> {
  const rows = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.categoryId, categoryId))
    .orderBy(asc(subcategories.createdAt));
  return rows.map(publicSubcategory);
}

export interface SubcategoryCreateInput {
  nameEn: string;
  nameEs: string;
}

export async function createSubcategory(
  categoryId: string,
  input: SubcategoryCreateInput,
  actor: { employeeId: string },
): Promise<PublicSubcategory> {
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!cat) {
    throw Object.assign(new ApiError('Category not found', 404), {
      errorCode: 'CATEGORY_NOT_FOUND',
    });
  }

  const id = crypto.randomUUID();
  await db.insert(subcategories).values({
    id,
    categoryId,
    nameEn: input.nameEn,
    nameEs: input.nameEs,
    createdBy: actor.employeeId,
    subcategoryIcon: '',
  });

  const [row] = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.id, id))
    .limit(1);
  return publicSubcategory(row!);
}

export interface SubcategoryPatchInput {
  nameEn?: string | undefined;
  nameEs?: string | undefined;
}

export async function updateSubcategory(
  id: string,
  patch: SubcategoryPatchInput,
): Promise<PublicSubcategory> {
  if (Object.keys(patch).length === 0) {
    throw Object.assign(
      new ApiError('Patch must include at least one field', 400),
      { errorCode: 'INVALID_INPUT' },
    );
  }

  const existing = await db
    .update(subcategories)
    .set(patch)
    .where(eq(subcategories.id, id))
    .returning({ id: subcategories.id });
  if (existing.length === 0) {
    throw Object.assign(new ApiError('Subcategory not found', 404), {
      errorCode: 'SUBCATEGORY_NOT_FOUND',
    });
  }
  const [row] = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.id, id))
    .limit(1);
  return publicSubcategory(row!);
}

export async function deleteSubcategory(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: subcategories.id })
    .from(subcategories)
    .where(eq(subcategories.id, id))
    .limit(1);
  if (!existing) {
    throw Object.assign(new ApiError('Subcategory not found', 404), {
      errorCode: 'SUBCATEGORY_NOT_FOUND',
    });
  }
  await db.delete(subcategories).where(eq(subcategories.id, id));
}
