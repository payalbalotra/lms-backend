import express, { type Router } from 'express';
import {
  me,
  login,
  setPassword,
  signUp,
  verifyInvite,
  forgotPassword,
  resetPasswordWithOtp,
} from '../../controllers/v1/auth.controller.ts';
import { signInLimiter } from '../../shared/middleware/rateLimit.middleware.ts';

import { validate } from '../../shared/middleware/validate.ts';
import {
  setPasswordSchema,
  signUpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordWithOtpSchema,
} from '../../shared/validations/auth.schema.ts';

const authRoute: Router = express.Router();

authRoute.get('/me', me);
authRoute.post('/login', signInLimiter, validate(loginSchema), login);
authRoute.post(
  '/set-password',
  signInLimiter,
  validate(setPasswordSchema),
  setPassword,
);
authRoute.post('/sign-up', validate(signUpSchema), signUp);
authRoute.get('/invites/:lang/:token', verifyInvite);

// OTP-based password reset flow (2 steps)
authRoute.post(
  '/password/forget',
  signInLimiter,
  validate(forgotPasswordSchema),
  forgotPassword,
);
authRoute.post(
  '/password/reset',
  signInLimiter,
  validate(resetPasswordWithOtpSchema),
  resetPasswordWithOtp,
);

export default authRoute;
