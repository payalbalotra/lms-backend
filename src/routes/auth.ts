import { Router } from 'express';
import * as authController from '../controllers/auth';
import * as activateController from '../controllers/auth/activate';
import * as invitesLookup from '../controllers/auth/invites-lookup';
import * as loginController from '../controllers/auth/login';

// Login goes through our LMS-shaped route (name + locationId + password) —
// see controllers/auth/login.ts for why we don't use Better Auth's
// /api/auth/sign-in/email directly: our synthetic emails are derived from
// the employee row and never leave the server. Logout also stays LMS-side
// so the controller can clear any LMS-specific state alongside the
// Better Auth session cookie.
const router = Router();

router.get('/me', authController.me);
router.post('/login', loginController.login);
router.post('/activate', activateController.activate);
router.get('/invites/:token', invitesLookup.lookupInviteController);

export default router;