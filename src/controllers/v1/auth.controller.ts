import type { Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { employees, user, account } from '../../db/index.ts';
import { session } from '../../db/index.ts';
import { auth } from '../../config/auth.ts';
import {
  loginUser,
  forgotPasswordService,
  resetPasswordWithOtpService,
} from '../../services/auth/auth.service.ts';
import config from '../../config/index.ts';
import bcrypt from 'bcryptjs';

export const signUp = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { name, email, password } = req.body;

    const signUpResponse = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
      asResponse: true,
    });

    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, email));

    const setCookie = signUpResponse.headers.get('set-cookie');
    if (setCookie) {
      res.setHeader('Set-Cookie', setCookie.split(/,(?=\s*[A-Za-z0-9_-]+=)/));
    }

    res
      .status(201)
      .json(
        ApiResponse.success('Super admin signed up successfully', { email }),
      );
  },
);

import ApiError from '../../shared/utils/ApiError.ts';
import ApiResponse from '../../shared/utils/ApiResponse.ts';
import catchAsync from '../../shared/utils/catchAsync.ts';
import type { Employee } from '../../db/index.ts';

// ============================================================================
// Helpers
// ============================================================================

function publicEmployee(e: Employee) {
  return {
    id: e.id,
    name: e.name,
    locationId: e.locationId,
    role: e.role,
    jobIds: e.jobIds,
    stationIds: e.stationIds,
    email: e.email,
    languagePref: e.languagePref,
  };
}

// ============================================================================
// GET /api/auth/me
// ============================================================================

export const me = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    let userId: string | null = null;

    // 1. Try Bearer token from Authorization header first.
    //    better-auth returns the session token in the login response body;
    //    the client stores it and sends it as: Authorization: Bearer <token>
    const authHeader = req.headers['authorization'] ?? '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    if (bearerToken) {
      // Look up the session directly in the DB by token.
      const [sessionRow] = await db
        .select({ userId: session.userId, expiresAt: session.expiresAt })
        .from(session)
        .where(
          and(
            eq(session.token, bearerToken),
            gt(session.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (sessionRow) {
        userId = sessionRow.userId;
      }
    }

    // 2. Fall back to cookie-based session (browser clients).
    if (!userId) {
      const cookieSession = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (cookieSession) {
        userId = cookieSession.user.id;
      }
    }

    if (!userId) {
      throw new ApiError('Session expired or invalid', 401, true, '', {
        code: 'SESSION_INVALID',
      });
    }

    // 3. Load the linked user row.
    const [userRow] = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!userRow) {
      throw new ApiError('Session expired or invalid', 401, true, '', {
        code: 'SESSION_INVALID',
      });
    }

    // 4. Look up the employee record (not present for super admins).
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.userId, userId))
      .limit(1);

    // Super admins have no employee row — return user-level info.
    if (!employee) {
      return void res.status(200).json(
        ApiResponse.success('Session retrieved', {
          user: { id: userRow.id, name: userRow.name, email: userRow.email },
          role: 'super_admin',
        }),
      );
    }

    if (employee.status !== 'active') {
      throw new ApiError('Session expired or invalid', 401, true, '', {
        code: 'SESSION_INVALID',
      });
    }

    const deviceMode: 'personal' | 'shared' =
      req.headers['x-device-mode'] === 'shared' ? 'shared' : 'personal';

    res.status(200).json(
      ApiResponse.success('Session retrieved', {
        employee: publicEmployee(employee),
        deviceMode,
      }),
    );
  },
);

// ============================================================================
// POST /api/auth/login
// ============================================================================

// ============================================================================
// POST /api/auth/login-email
// ============================================================================

export const login = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;

    const result = await loginUser({ email, password });

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

    const bearerToken = (req.headers['authorization'] ?? '')
      .replace(/^Bearer /, '')
      .trim();

    let userId: string | null = cookieSession?.user.id ?? null;

    if (!userId && bearerToken) {
      const [row] = await db
        .select({ userId: session.userId })
        .from(session)
        .where(
          and(
            eq(session.token, bearerToken),
            gt(session.expiresAt, new Date()),
          ),
        )
        .limit(1);
      userId = row?.userId ?? null;
    }

    if (!userId) {
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

    // Find the linked employee.
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.userId, userId))
      .limit(1);

    // If no employee row exists yet, the magic link just created the user but
    // hasn't linked to an employee. Link them now using their email.z
    if (!employee) {
      const [userRow] = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

      if (!userRow)
        throw new ApiError('User not found', 404, true, '', {
          code: 'USER_NOT_FOUND',
        });

      const [emp] = await db
        .select()
        .from(employees)
        .where(eq(employees.email, userRow.email))
        .limit(1);

      if (!emp)
        throw new ApiError(
          'No employee record found for this account.',
          404,
          true,
          '',
          {
            code: 'EMPLOYEE_NOT_FOUND',
          },
        );

      if (emp.status === 'deactivated')
        throw new ApiError(
          'This account has been deactivated.',
          403,
          true,
          '',
          {
            code: 'EMPLOYEE_DEACTIVATED',
          },
        );

      // Hash password and upsert into Better Auth's account table.
      // This is the same bcrypt format Better Auth uses for credential accounts.
      const passwordHash = await bcrypt.hash(password, 10);
      await db
        .insert(account)
        .values({
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: 'credential',
          userId,
          password: passwordHash,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [account.userId, account.providerId],
          set: { password: passwordHash, updatedAt: new Date() },
        });

      await db.transaction(async (tx) => {
        await tx
          .update(employees)
          .set({ userId, status: 'active', requirePasswordChange: false })
          .where(eq(employees.id, emp.id));
        await tx
          .update(user)
          .set({ emailVerified: true })
          .where(eq(user.id, userId!));
      });

      const [updated] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, emp.id))
        .limit(1);
      return void res.status(200).json(
        ApiResponse.success('Password set and account activated', {
          employee: publicEmployee(updated!),
          redirectTo: `/${updated!.languagePref}/employee/home`,
        }),
      );
    }

    // Employee already linked — just update password + clear flag.
    if (!employee.requirePasswordChange) {
      throw new ApiError('Password has already been set.', 409, true, '', {
        code: 'PASSWORD_ALREADY_SET',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(
        and(eq(account.userId, userId), eq(account.providerId, 'credential')),
      );

    await db
      .update(employees)
      .set({ status: 'active', requirePasswordChange: false })
      .where(eq(employees.id, employee.id));

    const [updated] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employee.id))
      .limit(1);
    res.status(200).json(
      ApiResponse.success('Password set and account activated', {
        employee: publicEmployee(updated!),
        redirectTo: `/${updated!.languagePref}/employee/home`,
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
