import { Router } from 'express';
import {
  getProcedure,
  listCategoriesPublic,
  listProceduresForEmployee,
} from '../controllers/library';

// Read-only routes for the public procedure doc view at /procedures/[id].
// Any logged-in employee (cook or admin) can fetch the procedures they're
// allowed to read (location/role/station/employee access join) or the
// active categories at their location. Mounted under requireAuth in
// routes/index.ts — NOT requireAdmin, since cooks are the primary reader.
//
// IMPORTANT: register the static paths (/categories, the list endpoint)
// BEFORE /:slug — Express matches in order and would otherwise route
// /procedures/categories or /procedures (list) into the :slug handler.
const router = Router();

router.get('/categories', listCategoriesPublic);
router.get('/', listProceduresForEmployee);
router.get('/:slug', getProcedure);

export default router;
