import express, { type Router } from 'express';
import {
  createProcedure,
  getAllProcedures,
  filterProcedures,
  getProcedure,
  archiveProcedure,
  unarchiveProcedure,
  updateProcedure,
} from '../../controllers/v1/procedures.controller.ts';
import { requireAuth } from '../../config/middleware.ts';
import { requireRoles } from '../../shared/middleware/requireRoles.middleware.ts';
import { createLimiter } from '../../shared/middleware/rateLimit.middleware.ts';

const proceduresRoute: Router = express.Router();

// Filter route (must be before /:slug so 'filter' isn't treated as a slug)
proceduresRoute.get(
  '/filter',
  requireAuth,
  requireRoles(['super_admin']),
  filterProcedures,
);

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

proceduresRoute.put(
  '/:id',
  requireAuth,
  requireRoles(['super_admin']),
  updateProcedure,
);

proceduresRoute.get(
  '/',
  requireAuth,
  requireRoles(['super_admin']),
  getAllProcedures,
);

// Archive / unarchive (super_admin only)
proceduresRoute.post(
  '/:id/archive',
  requireAuth,
  requireRoles(['super_admin']),
  archiveProcedure,
);

proceduresRoute.post(
  '/:id/unarchive',
  requireAuth,
  requireRoles(['super_admin']),
  unarchiveProcedure,
);

export default proceduresRoute;
