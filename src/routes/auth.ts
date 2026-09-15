import { Router } from 'express';
import * as authController from '../controllers/auth';
import * as activateController from '../controllers/auth/activate';
import * as invitesLookup from '../controllers/auth/invites-lookup';

// Login and logout go through Better Auth's built-in endpoints:
//   POST /api/auth/sign-in/email
//   POST /api/auth/sign-out
// Both are handled by the toNodeHandler catch-all mounted in server.ts.
// Routes here are LMS-specific endpoints that Better Auth doesn't provide.
const router = Router();

router.get('/me', authController.me);
router.post('/activate', activateController.activate);
router.get('/invites/:token', invitesLookup.lookupInviteController);

export default router;