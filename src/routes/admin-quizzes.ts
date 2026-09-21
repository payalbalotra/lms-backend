import { Router } from 'express';
import * as quizzesController from '../controllers/quizzes';

// Admin CRUD for the centralised quizzes table. Mounted at
// /api/admin/quizzes with requireAuth + requireAdmin (see routes/index.ts).
const router = Router();

router.post('/', quizzesController.createQuizAdmin);
router.get('/', quizzesController.listQuizzesAdmin);
router.get('/:id', quizzesController.getQuizAdmin);
router.patch('/:id', quizzesController.updateQuizAdmin);

export default router;
