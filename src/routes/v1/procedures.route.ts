import express, { type Router } from 'express';
import {
  createProcedure,
  listProcedures,
  importProcedure,
  getProcedure,
} from '../../controllers/v1/procedures.controller.ts';
import { requireAuth } from '../../auth/middleware.ts';
import { requireAdmin } from '../../shared/middleware/requireAdmin.middleware.ts';

const proceduresRoute: Router = express.Router();
proceduresRoute.use(requireAuth);

// ---- Admin write routes --------------------------------------
proceduresRoute.post('/', requireAdmin, createProcedure);
proceduresRoute.get('/', requireAdmin, listProcedures);
proceduresRoute.post('/import', requireAdmin, importProcedure);

// ---- Public read route (any logged-in employee) --------------
proceduresRoute.get('/:slug', getProcedure);

export default proceduresRoute;
