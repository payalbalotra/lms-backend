import express, { type Router } from 'express';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategoryAdmin,
} from '../../controllers/v1/categories.controller.ts';
import { requireAuth } from '../../config/middleware.ts';
import { requireAdmin } from '../../shared/middleware/requireAdmin.middleware.ts';

import {
  listSubcategoriesAdmin,
  createSubcategoryAdmin,
  updateSubcategoryAdmin,
  deleteSubcategoryAdmin,
} from '../../controllers/v1/subcategories.controller.ts';

const categoriesRoute: Router = express.Router();

// Public read route (any logged-in employee)
categoriesRoute.get('/', requireAuth, listCategories);

// Admin routes for Categories
categoriesRoute.post('/', requireAuth, requireAdmin, createCategory);
categoriesRoute.patch('/:id', requireAuth, requireAdmin, updateCategory);
categoriesRoute.delete('/:id', requireAuth, requireAdmin, deleteCategoryAdmin);

// Admin routes for Subcategories
categoriesRoute.get(
  '/:categoryId/subcategories',
  requireAuth,
  listSubcategoriesAdmin,
);
categoriesRoute.post(
  '/:categoryId/subcategories',
  requireAuth,
  requireAdmin,
  createSubcategoryAdmin,
);
categoriesRoute.patch(
  '/:categoryId/subcategories/:id',
  requireAuth,
  requireAdmin,
  updateSubcategoryAdmin,
);
categoriesRoute.delete(
  '/:categoryId/subcategories/:id',
  requireAuth,
  requireAdmin,
  deleteSubcategoryAdmin,
);

export default categoriesRoute;
