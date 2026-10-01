import express, { type Router } from 'express';
import {
  me,
  login,
  activate,
  lookupInviteController,
  signUp,
  sendOtp,
  verifyEmailOtp,
  forgetPassword,
  verifyForgetPasswordOtp,
  resetPassword,
} from '../../controllers/v1/auth.controller.ts';
import { signInLimiter } from '../../shared/middleware/rateLimit.middleware.ts';

import { validate } from '../../shared/middleware/validate.ts';
import {
  activateSchema,
  signUpSchema,
  loginSchema,
  sendOtpSchema,
  verifyEmailOtpSchema,
  forgetPasswordSchema,
  verifyForgetPasswordOtpSchema,
  resetPasswordSchema,
} from '../../shared/validations/auth.schema.ts';

const authRoute: Router = express.Router();

authRoute.get('/me', me);
authRoute.post('/login', signInLimiter, validate(loginSchema), login);
authRoute.post('/activate', signInLimiter, validate(activateSchema), activate);
authRoute.get('/invites/:token', lookupInviteController);
authRoute.post('/sign-up', validate(signUpSchema), signUp);

authRoute.post('/otp/send', validate(sendOtpSchema), sendOtp);
authRoute.post('/verify-email', validate(verifyEmailOtpSchema), verifyEmailOtp);

authRoute.post(
  '/password/forget',
  validate(forgetPasswordSchema),
  forgetPassword,
);
authRoute.post(
  '/password/forget/verify',
  validate(verifyForgetPasswordOtpSchema),
  verifyForgetPasswordOtp,
);
authRoute.post('/password/reset', validate(resetPasswordSchema), resetPassword);

export default authRoute;
