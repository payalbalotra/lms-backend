import { Router } from 'express';
import * as authController from '../controllers/auth';
import * as activateController from '../controllers/auth/activate';
import * as invitesLookup from '../controllers/auth/invites-lookup';



const router = Router();

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.me);
router.post('/activate', activateController.activate);
router.get('/invites/:token', invitesLookup.lookupInviteController);

export default router;