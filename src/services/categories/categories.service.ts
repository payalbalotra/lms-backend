import ApiError from '../../shared/utils/ApiError.ts';
import crypto from 'node:crypto';
import { eq, asc } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { categories, subcategories } from '../../db/schema.ts';
import type { CategoryType } from '../../db/schema.ts';

export interface PublicCategory {
  id: string;
  nameEn: string;
  nameEs: string;
  categoryType: CategoryType | null;
  categoryIcon: string | null;
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

export interface PublicSubcategory {
  id: string;
  categoryId: string;
  nameEn: string;
  nameEs: string;
  subcategoryIcon: string | null;
}

export function publicSubcategory(
  row: Readonly<typeof subcategories.$inferSelect>,
): PublicSubcategory {
  return {
    id: row.id,
    categoryId: row.categoryId,
    nameEn: row.nameEn,
    nameEs: row.nameEs,
    subcategoryIcon: row.subcategoryIcon,
  };
}

export interface CategoryCreateInput {
  nameEn: string;
  nameEs: string;
  categoryType: CategoryType;
  categoryIcon?: string;
}

export interface CategoryPatchInput {
  nameEn?: string;
  nameEs?: string;
  categoryType?: CategoryType;
  categoryIcon?: string;
}

export async function listCategories(opts?: { categoryType?: CategoryType }) {
  const allCategories = await db
    .select()
    .from(categories)
    .where(
      opts?.categoryType
        ? eq(categories.categoryType, opts.categoryType)
        : undefined,
    )
    .orderBy(asc(categories.createdAt));
  const allSubcats = await db
    .select()
    .from(subcategories)
    .orderBy(asc(subcategories.createdAt));

  return allCategories.map((c) => ({
    id: c.id,
    nameEn: c.nameEn,
    nameEs: c.nameEs,
    categoryType: c.categoryType,
    categoryIcon: c.categoryIcon,
    subcategories: allSubcats
      .filter((s) => s.categoryId === c.id)
      .map((s) => ({
        id: s.id,
        nameEn: s.nameEn,
        nameEs: s.nameEs,
        subcategoryIcon: s.subcategoryIcon,
      })),
  }));
}

export async function getCategoryWithSubcategories(id: string) {
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);

  if (!category) {
    throw Object.assign(new ApiError('Category not found', 404), {
      errorCode: 'CATEGORY_NOT_FOUND',
    });
  }

  const subcats = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.categoryId, id))
    .orderBy(asc(subcategories.createdAt));

  return {
    id: category.id,
    nameEn: category.nameEn,
    nameEs: category.nameEs,
    categoryType: category.categoryType,
    categoryIcon: category.categoryIcon,
    subcategories: subcats.map((s) => ({
      id: s.id,
      nameEn: s.nameEn,
      nameEs: s.nameEs,
      subcategoryIcon: s.subcategoryIcon,
    })),
  };
}

export async function createCategory(
  input: CategoryCreateInput,
  actor: { userId: string },
) {
  const id = crypto.randomUUID();
  await db.insert(categories).values({
    id,
    ...input,
    createdBy: actor.userId,
  });

  const [row] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  return row;
}

export interface SubcategoryCreateInput {
  nameEn: string;
  nameEs: string;
  subcategoryIcon?: string;
}

export async function createSubcategory(
  categoryId: string,
  input: SubcategoryCreateInput,
  actor: { userId: string },
) {
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!category) {
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
    subcategoryIcon: input.subcategoryIcon,
    createdBy: actor.userId,
  });

  const [row] = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.id, id))
    .limit(1);
  return row;
}

export async function updateCategory(id: string, patch: CategoryPatchInput) {
  if (Object.keys(patch).length === 0) {
    throw Object.assign(
      new ApiError('Patch must include at least one field', 400),
      { errorCode: 'INVALID_INPUT' },
    );
  }

  const existing = await db
    .update(categories)
    .set(patch)
    .where(eq(categories.id, id))
    .returning({ id: categories.id });

  if (existing.length === 0) {
    throw Object.assign(new ApiError('Category not found', 404), {
      errorCode: 'CATEGORY_NOT_FOUND',
    });
  }

  const [row] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  return row;
}

export async function deleteCategory(id: string) {
  const deleted = await db
    .delete(categories)
    .where(eq(categories.id, id))
    .returning({ id: categories.id });
  if (deleted.length === 0) {
    throw Object.assign(new ApiError('Category not found', 404), {
      errorCode: 'CATEGORY_NOT_FOUND',
    });
  }
  return { id };
}

export interface SubcategoryPatchInput {
  nameEn?: string;
  nameEs?: string;
  subcategoryIcon?: string;
}

export async function updateSubcategory(
  id: string,
  patch: SubcategoryPatchInput,
) {
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
  return row;
}

export async function deleteSubcategory(id: string) {
  const deleted = await db
    .delete(subcategories)
    .where(eq(subcategories.id, id))
    .returning({ id: subcategories.id });
  if (deleted.length === 0) {
    throw Object.assign(new ApiError('Subcategory not found', 404), {
      errorCode: 'SUBCATEGORY_NOT_FOUND',
    });
  }
  return { id };
}
