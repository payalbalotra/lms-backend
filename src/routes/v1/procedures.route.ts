import express, { type Router } from 'express';
import {
  createProcedure,
  listProcedures,
  importProcedure,
  getProcedure,
} from '../../controllers/v1/procedures.controller.ts';
import { requireAuth } from '../../config/middleware.ts';
import { requireRoles } from '../../shared/middleware/requireRoles.middleware.ts';
import { createLimiter } from '../../shared/middleware/rateLimit.middleware.ts';

const proceduresRoute: Router = express.Router();

// Public read route (any logged-in employee)
proceduresRoute.get('/:slug', requireAuth, getProcedure);

// Admin routes
proceduresRoute.post(
  '/',
  requireAuth,
  requireRoles(['super_admin']),
  createLimiter({
    limit: 20,
    message: 'Too many procedures created, please try again later.',
  }),
  createProcedure,
);

proceduresRoute.get(
  '/',
  requireAuth,
  requireRoles(['super_admin']),
  listProcedures,
);

proceduresRoute.post(
  '/import',
  requireAuth,
  requireRoles(['super_admin']),
  createLimiter({
    limit: 10,
    message: 'Too many procedure imports, please try again later.',
  }),
  importProcedure,
);

export default proceduresRoute;
