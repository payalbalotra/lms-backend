import express, { type Router } from 'express';
import {
  listCategories,
  getCategorySubcategories,
  createCategory,
  createSubcategory,
  updateCategory,
  updateSubcategory,
  deleteCategory,
  deleteSubcategory,
} from '../../controllers/v1/categories.controller.ts';
import { requireAuth } from '../../auth/middleware.ts';
import { requireAdmin } from '../../shared/middleware/requireAdmin.middleware.ts';

const categoriesRoute: Router = express.Router();
categoriesRoute.use(requireAuth);

// ---- Public read routes (any logged-in employee) ----------------------------
categoriesRoute.get('/', listCategories);
categoriesRoute.get('/:id/subcategories', getCategorySubcategories);

// ---- Admin write routes (requireAdmin) --------------------------------------
categoriesRoute.post('/', requireAdmin, createCategory);
categoriesRoute.post('/:id/subcategories', requireAdmin, createSubcategory);
categoriesRoute.patch('/:id', requireAdmin, updateCategory);
categoriesRoute.patch(
  '/:id/subcategories/:subId',
  requireAdmin,
  updateSubcategory,
);
categoriesRoute.delete('/:id', requireAdmin, deleteCategory);
categoriesRoute.delete(
  '/:id/subcategories/:subId',
  requireAdmin,
  deleteSubcategory,
);

export default categoriesRoute;
