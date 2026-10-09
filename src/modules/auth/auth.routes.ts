import express, { type Router } from 'express';
import {
  me,
  login,
  setPassword,
  signUp,
  verifyInvite,
  forgotPassword,
  resetPasswordWithOtp,
} from './auth.controller.ts';
import { createLimiter } from '../../middleware/rate-limit.ts';

import { validate } from '../../middleware/validate.ts';
import {
  setPasswordSchema,
  signUpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordWithOtpSchema,
} from './auth.validation.ts';

const authRoute: Router = express.Router();

authRoute.get('/me', me);
authRoute.post(
  '/login',
  createLimiter({
    limit: 10,
    skipSuccessfulRequests: true,
    message: 'Too many sign in attempts, please try again in 15 minutes.',
  }),
  validate(loginSchema),
  login,
);
authRoute.post(
  '/set-password',
  createLimiter({
    limit: 5,
    message: 'Too many attempts, please try again in 15 minutes.',
  }),
  validate(setPasswordSchema),
  setPassword,
);

authRoute.post('/sign-up', validate(signUpSchema), signUp);
authRoute.get('/invites/:lang/:token', verifyInvite);

// OTP-based password reset flow (2 steps)
authRoute.post(
  '/password/forget',
  createLimiter({
    limit: 5,
    message:
      'Too many password reset requests, please try again in 15 minutes.',
  }),
  validate(forgotPasswordSchema),
  forgotPassword,
);
authRoute.post(
  '/password/reset',
  createLimiter({
    limit: 5,
    message:
      'Too many password reset attempts, please try again in 15 minutes.',
  }),
  validate(resetPasswordWithOtpSchema),
  resetPasswordWithOtp,
);

export default authRoute;
