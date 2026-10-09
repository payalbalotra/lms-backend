import ApiResponse from '../../shared/api-response.ts';
import ApiError from '../../shared/api-error.ts';
import type { Request, Response } from 'express';
import {
  subcategoryCreateSchema,
  subcategoryPatchSchema,
} from './subcategories.validation.ts';
import { uuidString } from '../../shared/common.validation.ts';
import * as subcategoriesService from './subcategories.service.ts';
import catchAsync from '../../shared/catch-async.ts';
import { getPaginationParams } from '../../shared/pagination.ts';

/** Reads a uuid route param; missing or malformed values are a 400. */
function uuidParam(req: Request, name: string, label: string): string {
  const value = req.params[name];
  if (!value) throw new ApiError(`Missing ${label}`, 400);
  const parsed = uuidString.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(`Invalid ${label}`, 400, true, '', {
      code: 'INVALID_INPUT',
    });
  }
  return parsed.data;
}

export const listSubcategoriesAdmin = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) throw new ApiError('Not authenticated', 401);
    const categoryId = uuidParam(req, 'categoryId', 'categoryId');

    const { page, limit, search } = getPaginationParams(req.query);

    const items = await subcategoriesService.listSubcategories(
      categoryId,
      page,
      limit,
      search,
    );
    res.status(200).json(
      ApiResponse.success('Subcategories retrieved successfully', {
        subcategories: items.items,
        meta: items.meta,
      }),
    );
  },
);

export const createSubcategoryAdmin = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    // created_by references the Better Auth user (see categories controller).
    const userId = req.employee?.userId;
    if (!userId) throw new ApiError('Not authenticated', 401);
    const categoryId = uuidParam(req, 'categoryId', 'categoryId');

    const parsed = subcategoryCreateSchema.safeParse(req.body);
    if (!parsed.success) throw parsed.error;

    const item = await subcategoriesService.createSubcategory(
      categoryId,
      parsed.data,
      { userId },
    );
    res.status(201).json(
      ApiResponse.success('Subcategory created successfully', {
        subcategory: item,
      }),
    );
  },
);

export const updateSubcategoryAdmin = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) throw new ApiError('Not authenticated', 401);
    const categoryId = uuidParam(req, 'categoryId', 'categoryId');
    const id = uuidParam(req, 'id', 'subcategory id');

    const parsed = subcategoryPatchSchema.safeParse(req.body);
    if (!parsed.success) throw parsed.error;

    const item = await subcategoriesService.updateSubcategory(
      categoryId,
      id,
      parsed.data,
    );
    res.status(200).json(
      ApiResponse.success('Subcategory updated successfully', {
        subcategory: item,
      }),
    );
  },
);

export const deleteSubcategoryAdmin = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) throw new ApiError('Not authenticated', 401);
    const categoryId = uuidParam(req, 'categoryId', 'categoryId');
    const id = uuidParam(req, 'id', 'subcategory id');

    await subcategoriesService.deleteSubcategory(categoryId, id);
    res
      .status(200)
      .json(
        ApiResponse.success('Subcategory deleted successfully', { ok: true }),
      );
  },
);
