import { Router } from 'express';
import * as libraryController from '../controllers/library';

const router = Router();

// ---- Procedures ------------------------------------------------------------
router.post('/procedures', libraryController.createProcedure);
router.get('/procedures', libraryController.listProcedures);
router.get('/procedures/:id', libraryController.getProcedureAdmin);
router.patch('/procedures/:id', libraryController.updateProcedureAdmin);
router.post('/procedures/:id/archive', libraryController.archiveProcedureAdmin);
router.post('/import', libraryController.importProcedure);

// ---- Categories (manager-defined) -----------------------------------------
router.get('/categories', libraryController.listCategoriesAdmin);
router.post('/categories', libraryController.createCategoryAdmin);
router.patch('/categories/:id', libraryController.updateCategoryAdmin);
router.post('/categories/:id/archive', libraryController.archiveCategoryAdmin);

export default router;
