import express, { type Router } from 'express';
import {
  createProcedure,
  listProcedures,
  importProcedure,
  getProcedure,
} from '../../controllers/v1/procedures.controller.ts';
import { requireAuth } from '../../config/middleware.ts';
import { requireAdmin } from '../../shared/middleware/requireAdmin.middleware.ts';

const proceduresRoute: Router = express.Router();

// Public read route (any logged-in employee)
proceduresRoute.get('/:slug', requireAuth, getProcedure);

// Admin routes
proceduresRoute.post('/', requireAuth, requireAdmin, createProcedure);
proceduresRoute.get('/', requireAuth, requireAdmin, listProcedures);
proceduresRoute.post('/import', requireAuth, requireAdmin, importProcedure);

export default proceduresRoute;
