import type { Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../lib/auth.ts';
import {
  loginUser,
  forgotPasswordService,
  resetPasswordWithOtpService,
  getSessionService,
  setPasswordService,
  signUpUser,
} from './auth.service.ts';
import config from '../../config/env.ts';
import ApiError from '../../shared/api-error.ts';
import ApiResponse from '../../shared/api-response.ts';
import catchAsync from '../../shared/catch-async.ts';
import { publicEmployee } from '../employees/employees.mapper.ts';

export const signUp = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { name, email, password } = req.body;

    const { setCookies } = await signUpUser({ name, email, password });
    if (setCookies.length > 0) {
      res.setHeader('Set-Cookie', setCookies);
    }

    res
      .status(201)
      .json(ApiResponse.success('User signed up successfully', { email }));
  },
);
// ============================================================================
// GET /api/auth/me
// ============================================================================

export const me = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const session = await getSessionService(req);
    res.status(200).json(ApiResponse.success('Session retrieved', session));
  },
);

// ============================================================================
// POST /api/auth/login
// ============================================================================

export const login = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;

    const result = await loginUser({ email, password });

    if (result.setCookies && result.setCookies.length > 0) {
      res.setHeader('Set-Cookie', result.setCookies);
    }

    // Return the token in the body — client stores it and sends it on every
    // subsequent request as:  Authorization: Bearer <token>
    res.status(200).json(
      ApiResponse.success('Login successful', {
        token: result.token,
        user: result.user,
      }),
    );
  },
);

// ============================================================================
// POST /api/auth/set-password
// Called by the employee AFTER clicking the magic link and being redirected
// to /set-password. At this point the employee is already logged in via the
// magic link session. This endpoint:
//  1. Sets their permanent password via Better Auth.
//  2. Marks the employee as active + clears the requirePasswordChange flag.
// ============================================================================

export const setPassword = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { password } = req.body as { password: string };

    // The employee must already have a session from clicking the magic link.
    const cookieSession = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!cookieSession) {
      throw new ApiError(
        'Not authenticated. Click the invite link first.',
        401,
        true,
        '',
        {
          code: 'UNAUTHENTICATED',
        },
      );
    }

    const updated = await setPasswordService(cookieSession.user, password);

    res.status(200).json(
      ApiResponse.success('Password set and account activated', {
        employee: publicEmployee(updated),
        redirectTo: `/${updated.languagePref}/employee/home`,
      }),
    );
  },
);

// ============================================================================
// GET /api/auth/invites/:lang/:token
// A clean redirect endpoint so we don't have to send employees the massive Better Auth verification URL.
export const verifyInvite = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { lang, token } = req.params;
    if (!token || !lang) {
      res.status(400).send('Missing language or token');
      return;
    }

    const betterAuthBaseUrl = config.betterAuthUrl || 'http://localhost:8000';
    const callbackURL = encodeURIComponent(
      `${config.frontendBaseUrl}/${lang}/employee/home`,
    );
    const newUserCallbackURL = encodeURIComponent(
      `${config.frontendBaseUrl}/${lang}/set-password`,
    );

    const invitationUrl = `${betterAuthBaseUrl}/api/auth/magic-link/verify?token=${token}&callbackURL=${callbackURL}&newUserCallbackURL=${newUserCallbackURL}`;

    // Redirect the browser to the Better Auth handler which will set the cookies and redirect to the frontend.
    res.redirect(invitationUrl);
  },
);
// ============================================================================

// ============================================================================
// POST /api/v1/auth/password/forget
// Delegates OTP generation, storage, and email delivery to Better Auth's
// emailOtp plugin via forgotPasswordService.
// ============================================================================

export const forgotPassword = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email: string };

    // Always respond with 200 regardless of whether the email exists
    // (Better Auth already suppresses errors for unknown addresses internally).
    try {
      await forgotPasswordService(email);
    } catch {
      // Swallow silently — prevents account enumeration.
    }

    res.status(200).json(ApiResponse.success('Verification email sent.'));
  },
);

// ============================================================================
// POST /api/v1/auth/password/reset
// Verifies the OTP via Better Auth's emailOtp plugin and updates the password.
// Input: { email, otp, password }
// ============================================================================

export const resetPasswordWithOtp = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { email, otp, password } = req.body as {
      email: string;
      otp: string;
      password: string;
    };

    await resetPasswordWithOtpService(email, otp, password);

    res.status(200).json(ApiResponse.success('Password reset successfully.'));
  },
);
