import { Router } from 'express';
import * as libraryController from '../controllers/library';

const router = Router();

router.post('/procedures', libraryController.createProcedure);
router.get('/procedures', libraryController.listProcedures);

export default router;