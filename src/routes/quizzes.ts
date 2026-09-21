import { Router } from 'express';
import * as quizzesController from '../controllers/quizzes';

// Public read for the cook-side procedure reader. Mounted at /api/quizzes
// with requireAuth only (open to any logged-in employee — see
// routes/index.ts). The procedure-level access join upstream decides whether
// the cook is allowed to see the quiz at all; this endpoint just resolves
// `procedure.quizId` to its quiz data.
const router = Router();

router.get('/:id', quizzesController.getQuizPublic);

export default router;
