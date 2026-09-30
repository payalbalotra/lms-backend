import express, { type Router } from 'express';
import {
  createProcedure,
  listProcedures,
  importProcedure,
  getProcedure,
} from '../../controllers/v1/procedures.controller.ts';
import {
  listCategoriesAdmin,
  createCategoryAdmin,
  updateCategoryAdmin,
  archiveCategoryAdmin,
  listCategoriesPublic,
} from '../../controllers/v1/categories.controller.ts';
import { requireAuth } from '../../auth/middleware.ts';
import { requireAdmin } from '../../shared/middleware/requireAdmin.middleware.ts';

const libraryRoute: Router = express.Router();
libraryRoute.use(requireAuth, requireAdmin);

// ---- Admin routes (requireAuth + requireAdmin applied in index.ts) ----------
libraryRoute.post('/procedures', createProcedure);
libraryRoute.get('/procedures', listProcedures);
libraryRoute.post('/import', importProcedure);

libraryRoute.get('/categories', listCategoriesAdmin);
libraryRoute.post('/categories', createCategoryAdmin);
libraryRoute.patch('/categories/:id', updateCategoryAdmin);
libraryRoute.post('/categories/:id/archive', archiveCategoryAdmin);

export default libraryRoute;

// ---- Public read route (any logged-in employee) ----------------------------
// Mounted separately at /api/procedures in routes/v1/index.ts.
export const proceduresPublicRoute: Router = express.Router();

// IMPORTANT: /categories must be registered before /:slug to avoid Express
// routing /procedures/categories into the :slug handler.
proceduresPublicRoute.get('/categories', requireAuth, listCategoriesPublic);
proceduresPublicRoute.get('/:slug', requireAuth, getProcedure);
