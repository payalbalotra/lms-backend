import { Router } from 'express';
import * as authController from '../controllers/auth';



const router = Router();

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.me);

export default router;