import express, { type Router } from 'express';
import {
  me,
  login,
  activate,
  lookupInviteController,
  signUp,
} from '../../controllers/v1/auth.controller.ts';
import { signInLimiter } from '../../shared/middleware/rateLimit.middleware.ts';

import { validate } from '../../shared/middleware/validate.ts';
import {
  activateSchema,
  signUpSchema,
  loginSchema,
} from '../../shared/validations/auth.schema.ts';

const authRoute: Router = express.Router();

authRoute.get('/me', me);
authRoute.post('/login', signInLimiter, validate(loginSchema), login);
authRoute.post('/activate', signInLimiter, validate(activateSchema), activate);
authRoute.get('/invites/:token', lookupInviteController);
authRoute.post('/sign-up', validate(signUpSchema), signUp);

export default authRoute;
