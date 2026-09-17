import { Router } from 'express';
import {
  getProcedure,
  listCategoriesPublic,
} from '../controllers/library';

// Read-only routes for the public procedure doc view at /procedures/[id].
// Any logged-in employee (cook or admin) can fetch a single procedure by
// slug OR the active categories at their location. Both routes are mounted
// under requireAuth in routes/index.ts. Draft visibility for non-creators is
// currently permissive — a status-based gate will come before the editor is
// opened to cooks.
//
// IMPORTANT: register /categories BEFORE /:slug — Express matches in order
// and would otherwise route /procedures/categories into the :slug handler.
const router = Router();

router.get('/categories', listCategoriesPublic);
router.get('/:slug', getProcedure);

export default router;
