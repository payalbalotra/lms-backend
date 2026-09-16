import { Router } from 'express';
import authRouter from './auth';
import { requireAuth } from '../auth/middleware';
import { requireAdmin } from '../middleware/require-admin';
import adminEmployeesRouter from './admin/employees';
import libraryRouter from './library';
import proceduresRouter from './procedures';

const router = Router();

router.use('/auth', authRouter);
router.use('/admin/employees', requireAuth, requireAdmin, adminEmployeesRouter);
router.use('/admin/library', requireAuth, requireAdmin, libraryRouter);
// Read-only doc view: any logged-in employee, not just admins.
router.use('/procedures', requireAuth, proceduresRouter);

export default router;