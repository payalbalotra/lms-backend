import { Router } from 'express';
import { getProcedure } from '../controllers/library';

// Read-only routes for the public procedure doc view at /procedures/[id].
// Any logged-in employee (cook or admin) can fetch a single procedure by
// slug. Draft visibility for non-creators is currently permissive — a
// status-based gate will come before the editor is opened to cooks.
const router = Router();

router.get('/:slug', getProcedure);

export default router;
