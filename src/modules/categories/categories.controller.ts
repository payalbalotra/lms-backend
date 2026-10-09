import ApiResponse from '../../shared/api-response.ts';
import ApiError from '../../shared/api-error.ts';
import type { Request, Response } from 'express';
import {
  categoryCreateSchema,
  categoryPatchSchema,
} from './categories.validation.ts';
import { uuidIdParam } from '../../shared/common.validation.ts';
import * as categoriesService from './categories.service.ts';
import catchAsync from '../../shared/catch-async.ts';
import { getPaginationParams } from '../../shared/pagination.ts';

const unauthenticated = () =>
  new ApiError('Not authenticated', 401, true, '', {
    code: 'UNAUTHENTICATED',
  });

function parseCategoryId(req: Request): string {
  const param = uuidIdParam.safeParse(req.params);
  if (!param.success) {
    throw new ApiError('Invalid category id', 400, true, '', {
      code: 'INVALID_INPUT',
    });
  }
  return param.data.id;
}

export const listCategories = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) throw unauthenticated();

    const { page, limit, search } = getPaginationParams(req.query);
    const cats = await categoriesService.listCategories(page, limit, search);
    res.status(200).json(
      ApiResponse.success('Categories retrieved successfully', {
        categories: cats.items,
        meta: cats.meta,
      }),
    );
  },
);

export const createCategory = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    // created_by references the Better Auth user, which every admin has
    // (the super admin has no employee row, so employee.id is empty).
    const userId = req.employee?.userId;
    if (!userId) throw unauthenticated();

    const parsed = categoryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const cat = await categoriesService.createCategory(parsed.data, {
      userId,
    });
    res
      .status(201)
      .json(
        ApiResponse.success('Category created successfully', { category: cat }),
      );
  },
);

export const updateCategory = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) throw unauthenticated();
    const id = parseCategoryId(req);

    const parsed = categoryPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const cat = await categoriesService.updateCategory(id, parsed.data);
    res
      .status(200)
      .json(
        ApiResponse.success('Category updated successfully', { category: cat }),
      );
  },
);

// DELETE /api/v1/categories/:id
export const deleteCategory = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) throw unauthenticated();
    const id = parseCategoryId(req);

    await categoriesService.deleteCategory(id);
    res
      .status(200)
      .json(ApiResponse.success('Category deleted successfully', { ok: true }));
  },
);
