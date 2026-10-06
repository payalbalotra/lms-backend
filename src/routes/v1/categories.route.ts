import express, { type Router } from 'express';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../../controllers/v1/categories.controller.ts';
import { requireAuth } from '../../config/middleware.ts';
import { requireAdmin } from '../../shared/middleware/requireAdmin.middleware.ts';

import {
  listSubcategoriesAdmin,
  createSubcategoryAdmin,
  updateSubcategoryAdmin,
  deleteSubcategoryAdmin,
} from '../../controllers/v1/subcategories.controller.ts';

import { createLimiter } from '../../shared/middleware/rateLimit.middleware.ts';

const categoriesRoute: Router = express.Router();

// Public read route (any logged-in employee)
categoriesRoute.get('/', requireAuth, listCategories);

// Admin routes for Categories
categoriesRoute.post(
  '/',
  requireAuth,
  requireAdmin,
  createLimiter({
    limit: 20,
    message: 'Too many categories created, please try again later.',
  }),
  createCategory,
);
categoriesRoute.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  createLimiter({
    limit: 30,
    message: 'Too many category updates, please try again later.',
  }),
  updateCategory,
);
categoriesRoute.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  createLimiter({
    limit: 20,
    message: 'Too many category deletions, please try again later.',
  }),
  deleteCategory,
);

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
  createLimiter({
    limit: 20,
    message: 'Too many subcategories created, please try again later.',
  }),
  createSubcategoryAdmin,
);
categoriesRoute.patch(
  '/:categoryId/subcategories/:id',
  requireAuth,
  requireAdmin,
  createLimiter({
    limit: 30,
    message: 'Too many subcategory updates, please try again later.',
  }),
  updateSubcategoryAdmin,
);
categoriesRoute.delete(
  '/:categoryId/subcategories/:id',
  requireAuth,
  requireAdmin,
  createLimiter({
    limit: 20,
    message: 'Too many subcategory deletions, please try again later.',
  }),
  deleteSubcategoryAdmin,
);

export default categoriesRoute;
