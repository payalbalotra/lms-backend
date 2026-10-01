import ApiResponse from '../../shared/utils/ApiResponse.ts';
import ApiError from '../../shared/utils/ApiError.ts';
import type { Request, Response } from 'express';
import {
  categoryCreateSchema,
  categoryPatchSchema,
  subcategoryCreateSchema,
  subcategoryPatchSchema,
} from '../../shared/validations/categories.schema.ts';
import * as categoriesService from '../../services/categories/categories.service.ts';
import catchAsync from '../../shared/utils/catchAsync.ts';
import type { CategoryType } from '../../db/schema.ts';

export const listCategories = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const categoryType = req.query.categoryType as CategoryType | undefined;
    const cats = await categoriesService.listCategories({ categoryType });
    res.status(200).json(
      ApiResponse.success('Categories retrieved successfully', {
        categories: cats,
        totalCount: cats.length,
      }),
    );
  },
);

export const getCategorySubcategories = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const id = req.params.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new ApiError('Missing category id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    const cat = await categoriesService.getCategoryWithSubcategories(id);
    res.status(200).json(
      ApiResponse.success('Category Subcategories retrieved successfully', {
        category: cat,
      }),
    );
  },
);

export const createCategory = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee?.userId) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const parsed = categoryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const cat = await categoriesService.createCategory(parsed.data, {
      userId: req.employee.userId,
    });
    res
      .status(201)
      .json(
        ApiResponse.success('Category created successfully', { category: cat }),
      );
  },
);

export const createSubcategory = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee?.userId) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const categoryId = req.params.id;
    if (typeof categoryId !== 'string' || categoryId.length === 0) {
      throw new ApiError('Missing category id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    const parsed = subcategoryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const subcat = await categoriesService.createSubcategory(
      categoryId,
      parsed.data,
      {
        userId: req.employee.userId,
      },
    );
    res.status(201).json(
      ApiResponse.success('Subcategory created successfully', {
        subcategory: subcat,
      }),
    );
  },
);

export const updateCategory = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const id = req.params.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new ApiError('Missing category id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

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

export const deleteCategory = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const id = req.params.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new ApiError('Missing category id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    await categoriesService.deleteCategory(id);
    res
      .status(200)
      .json(
        ApiResponse.success('Category deleted successfully', { deleted: true }),
      );
  },
);

export const updateSubcategory = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const subId = req.params.subId;
    if (typeof subId !== 'string' || subId.length === 0) {
      throw new ApiError('Missing subcategory id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    const parsed = subcategoryPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const subcat = await categoriesService.updateSubcategory(
      subId,
      parsed.data,
    );
    res.status(200).json(
      ApiResponse.success('Subcategory updated successfully', {
        subcategory: subcat,
      }),
    );
  },
);

export const deleteSubcategory = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const subId = req.params.subId;
    if (typeof subId !== 'string' || subId.length === 0) {
      throw new ApiError('Missing subcategory id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    await categoriesService.deleteSubcategory(subId);
    res.status(200).json(
      ApiResponse.success('Subcategory deleted successfully', {
        deleted: true,
      }),
    );
  },
);
