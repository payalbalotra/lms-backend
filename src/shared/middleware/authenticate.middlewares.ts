import { fromNodeHeaders } from 'better-auth/node';
import httpStatus from 'http-status';
import { auth } from '../../config/auth.ts';
import ApiError from '../utils/ApiError.ts';
import catchAsync from '../utils/catchAsync.ts';

import 'express';

declare module 'express' {
  interface Request {
    auth?: typeof auth.$Infer.Session;
  }
}

/**
 * Rejects the request unless a valid better-auth session cookie (or bearer
 * token) is present, and attaches the resolved session to `req.auth`.
 */
export const requireAuth = catchAsync(async (req, _res, next) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    throw new ApiError('Authentication required', httpStatus.UNAUTHORIZED);
  }

  req.auth = session;
  next();
});

/**
 * Same lookup, but never blocks. Use for endpoints that render differently for
 * signed-in users.
 */
export const attachSession = catchAsync(async (req, _res, next) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (session) {
    req.auth = session;
  }
  next();
});

/**
 * Same as requireAuth, but also blocks users who haven't verified their email.
 * Apply this to routes that require full account verification to access.
 */
export const requireVerifiedEmail = catchAsync(async (req, _res, next) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    throw new ApiError('Authentication required', httpStatus.UNAUTHORIZED);
  }

  if (!session.user.emailVerified) {
    throw new ApiError(
      'Please verify your email address to continue',
      httpStatus.FORBIDDEN,
    );
  }

  req.auth = session;
  next();
});

export default requireAuth;
