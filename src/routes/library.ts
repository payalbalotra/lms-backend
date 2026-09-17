import { Router } from 'express';
import * as libraryController from '../controllers/library';

const router = Router();

// ---- Procedures ------------------------------------------------------------
router.post('/procedures', libraryController.createProcedure);
router.get('/procedures', libraryController.listProcedures);
router.post('/import', libraryController.importProcedure);

// ---- Categories (manager-defined) -----------------------------------------
router.get('/categories', libraryController.listCategoriesAdmin);
router.post('/categories', libraryController.createCategoryAdmin);
router.patch('/categories/:id', libraryController.updateCategoryAdmin);
router.post('/categories/:id/archive', libraryController.archiveCategoryAdmin);

export default router;
