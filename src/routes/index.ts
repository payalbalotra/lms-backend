import { Router } from 'express';
import authRouter from './auth';
import { requireAuth } from '../auth/middleware';
import { requireAdmin } from '../middleware/require-admin';
import adminEmployeesRouter from './admin/employees';



const router = Router();

router.use('/auth', authRouter);
router.use('/admin/employees', requireAuth, requireAdmin, adminEmployeesRouter);

export default router;