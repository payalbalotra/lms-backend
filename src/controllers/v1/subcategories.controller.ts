import ApiResponse from '../../shared/utils/ApiResponse.ts';
import ApiError from '../../shared/utils/ApiError.ts';
import type { Request, Response } from 'express';
import {
  subcategoryCreateSchema,
  subcategoryPatchSchema,
} from '../../shared/validations/subcategories.schema.ts';
import * as subcategoriesService from '../../services/categories/subcategories.service.ts';
import catchAsync from '../../shared/utils/catchAsync.ts';

export const listSubcategoriesAdmin = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) throw new ApiError('Not authenticated', 401);
    const { categoryId } = req.params;
    if (!categoryId) throw new ApiError('Missing categoryId', 400);

    const items = await subcategoriesService.listSubcategories(
      categoryId as string,
    );
    res.status(200).json(
      ApiResponse.success('Subcategories retrieved successfully', {
        subcategories: items,
      }),
    );
  },
);

export const createSubcategoryAdmin = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) throw new ApiError('Not authenticated', 401);
    const { categoryId } = req.params;
    if (!categoryId) throw new ApiError('Missing categoryId', 400);

    const parsed = subcategoryCreateSchema.safeParse(req.body);
    if (!parsed.success) throw parsed.error;

    const item = await subcategoriesService.createSubcategory(
      categoryId as string,
      parsed.data,
      { employeeId: req.employee.id },
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
    const { id } = req.params;
    if (!id) throw new ApiError('Missing subcategory id', 400);

    const parsed = subcategoryPatchSchema.safeParse(req.body);
    if (!parsed.success) throw parsed.error;

    const item = await subcategoriesService.updateSubcategory(
      id as string,
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
    const { id } = req.params;
    if (!id) throw new ApiError('Missing subcategory id', 400);

    await subcategoriesService.deleteSubcategory(id as string);
    res
      .status(200)
      .json(
        ApiResponse.success('Subcategory deleted successfully', { ok: true }),
      );
  },
);
