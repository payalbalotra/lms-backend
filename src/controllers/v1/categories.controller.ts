import ApiResponse from '../../shared/utils/ApiResponse.ts';
import ApiError from '../../shared/utils/ApiError.ts';
import type { Request, Response } from 'express';
import {
  categoryCreateSchema,
  categoryPatchSchema,
} from '../../shared/validations/categories.schema.ts';
import * as categoriesService from '../../services/categories/categories.service.ts';
import catchAsync from '../../shared/utils/catchAsync.ts';

// ============================================================================
// Admin routes — mounted under requireAuth + requireAdmin
// ============================================================================

// GET /api/admin/library/categories
export const listCategoriesAdmin = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const cats = await categoriesService.listCategories();
    res.status(200).json(
      ApiResponse.success('Categories retrieved successfully', {
        categories: cats,
      }),
    );
  },
);

// POST /api/admin/library/categories
export const createCategoryAdmin = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const parsed = categoryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const cat = await categoriesService.createCategory(parsed.data, {
      employeeId: req.employee.id,
    });
    res
      .status(201)
      .json(
        ApiResponse.success('Category created successfully', { category: cat }),
      );
  },
);

// PATCH /api/admin/library/categories/:id
export const updateCategoryAdmin = catchAsync(
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

// DELETE /api/admin/library/categories/:id
export const deleteCategoryAdmin = catchAsync(
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
      .json(ApiResponse.success('Category deleted successfully', { ok: true }));
  },
);

// ============================================================================
// Public read — any logged-in employee
// ============================================================================

// GET /api/procedures/categories
export const listCategoriesPublic = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const cats = await categoriesService.listCategories();
    res.status(200).json(
      ApiResponse.success('Categories retrieved successfully', {
        categories: cats,
      }),
    );
  },
);
