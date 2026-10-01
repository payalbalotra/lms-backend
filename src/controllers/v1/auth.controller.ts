import type { Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { eq, sql, and, gt } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { employees, invites, user } from '../../db/employee.schema.ts';
import { session, account } from '../../db/schema.ts';
import { auth } from '../../auth/betterauth.ts';
import {
  loginUser,
  sendOtpService,
  verifyEmailOtpService,
  forgetPasswordService,
  verifyForgetPasswordOtpService,
  resetPasswordService,
} from '../../services/auth/auth.service.ts';
import {
  validateInviteCode,
  lookupInvite,
} from '../../services/employee/employee.service.ts';
import type {
  SendOtpInput,
  VerifyEmailOtpInput,
  ForgetPasswordInput,
  VerifyForgetPasswordOtpInput,
  ResetPasswordInput,
} from '../../shared/validations/auth.schema.ts';
import httpStatus from 'http-status';

const forwardAuthCookies = (res: Response, headers: Headers): void => {
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies);
  }
};

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
import type { Employee } from '../../db/employee.schema.ts';

// ============================================================================
// Helpers
// ============================================================================

function publicEmployee(e: Employee) {
  return {
    id: e.id,
    name: e.name,
    locationId: e.locationId,
    roleId: e.roleId,
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
// POST /api/auth/activate
// ============================================================================

export const activate = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { token, code, password } = req.body;

    // 1. Validate invite + code (rate-limited on wrong code).
    const validation = await validateInviteCode(token, code);

    if (
      !validation.ok &&
      validation.reason === 'INVALID_CODE' &&
      validation.inviteId
    ) {
      throw new ApiError('That code does not match.', 401, true, '', {
        code: 'INVALID_CODE',
      });
    }

    if (!validation.ok) {
      let status = 404;
      let errCode:
        | 'INVITE_NOT_FOUND'
        | 'INVITE_EXPIRED'
        | 'INVITE_ALREADY_USED'
        | 'INVITE_CANCELLED' = 'INVITE_NOT_FOUND';
      if (validation.reason === 'EXPIRED') {
        status = 410;
        errCode = 'INVITE_EXPIRED';
      } else if (validation.reason === 'USED') {
        status = 410;
        errCode = 'INVITE_ALREADY_USED';
      } else if (validation.reason === 'CANCELLED') {
        status = 410;
        errCode = 'INVITE_CANCELLED';
      }
      throw new ApiError('Invite is not usable.', status, true, '', {
        code: errCode,
      });
    }

    // 2. Provision Better Auth user + account.
    let syntheticEmail =
      validation.employee.email || `${validation.employee.id}@lms.internal`;
    // Better Auth standardizes emails by converting them to lowercase.
    // We must do the same to ensure our database queries match.
    syntheticEmail = syntheticEmail.toLowerCase();

    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, syntheticEmail))
      .limit(1);

    if (existingUser) {
      const [linkedEmployee] = await db
        .select({ status: employees.status })
        .from(employees)
        .where(eq(employees.userId, existingUser.id))
        .limit(1);

      if (linkedEmployee && linkedEmployee.status === 'active') {
        // Employee already fully activated — cannot re-use this invite.
        throw new ApiError(
          'This account is already set up. Please sign in instead.',
          409,
          true,
          '',
          { code: 'EMPLOYEE_ALREADY_ACTIVE' },
        );
      }

      // A user row exists but the employee is still pending. This happens
      // when the admin re-invited an employee whose prior invite was cancelled
      // before they finished activating, or when a previous activation
      // attempt partially failed. We update the password directly in the
      // Better Auth account table (same bcrypt format Better Auth uses) so
      // the new credentials take effect, then fall through to the transaction.
      const newHash = await import('bcryptjs').then((m) =>
        m.hash(password, 10),
      );
      await db
        .update(account)
        .set({ password: newHash })
        .where(
          and(
            eq(account.userId, existingUser.id),
            eq(account.providerId, 'credential'),
          ),
        );
    } else {
      // No user yet — create one fresh.
      await auth.api.signUpEmail({
        body: {
          email: syntheticEmail,
          password,
          name: validation.employee.name,
        },
      });
    }

    // 3. Link the employee, mark active, mark invite consumed — atomic.
    const employee = await db.transaction(async (tx) => {
      const [u] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, syntheticEmail))
        .limit(1);
      if (!u)
        throw new ApiError('User not found after signup', 500, true, '', {
          code: 'USER_NOT_FOUND_AFTER_SIGNUP',
        });

      const [inviteRow] = await tx
        .select()
        .from(invites)
        .where(eq(invites.id, validation.invite.id))
        .for('update')
        .limit(1);
      if (!inviteRow)
        throw new ApiError('Invite not found', 410, true, '', {
          code: 'INVITE_NOT_FOUND',
        });
      if (inviteRow.cancelledAt)
        throw new ApiError('Invite cancelled', 410, true, '', {
          code: 'INVITE_CANCELLED',
        });
      if (inviteRow.usedAt)
        throw new ApiError('Invite already used', 410, true, '', {
          code: 'INVITE_ALREADY_USED',
        });
      if (inviteRow.expiresAt.getTime() <= Date.now())
        throw new ApiError('Invite expired', 410, true, '', {
          code: 'INVITE_EXPIRED',
        });

      const [updated] = await tx
        .update(employees)
        .set({
          userId: u.id,
          status: 'active',
        })
        .where(eq(employees.id, validation.employee.id))
        .returning();
      if (!updated)
        throw new ApiError('Employee not found', 404, true, '', {
          code: 'EMPLOYEE_NOT_FOUND',
        });

      await tx
        .update(invites)
        .set({ usedAt: sql`now()` })
        .where(eq(invites.id, validation.invite.id));

      await tx
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, u.id));

      return updated;
    });

    // 4. Sign in to set the session cookie and retrieve the API token.
    const result = await loginUser({ email: syntheticEmail, password });

    res.status(200).json(
      ApiResponse.success('Account verified and created successfully', {
        employee: publicEmployee(employee),
        token: result.token,
        user: result.user,
      }),
    );
  },
);

// ============================================================================
// GET /api/auth/invites/:token
// ============================================================================

export const lookupInviteController = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const token = String(req.params.token ?? '');
    if (token.length < 16 || token.length > 128) {
      throw new ApiError('Invite not found', 404, true, '', {
        code: 'INVITE_NOT_FOUND',
      });
    }

    const result = await lookupInvite(token);
    if (!result.ok) {
      throw new ApiError('Invite not found', 404, true, '', {
        code: 'INVITE_NOT_FOUND',
        reason: result.reason,
      });
    }

    res.status(200).json(
      ApiResponse.success('Invite retrieved', {
        employeeName: result.lookup.employeeName,
        expiresAt: result.lookup.expiresAt.toISOString(),
        employeeStatus: result.lookup.employeeStatus,
      }),
    );
  },
);

// ============================================================================
// OTP and Password Reset
// ============================================================================

export const sendOtp = catchAsync(async (req: Request, res: Response) => {
  const { data, headers } = await sendOtpService(
    req.body as SendOtpInput,
    fromNodeHeaders(req.headers),
  );
  forwardAuthCookies(res, headers);
  return res
    .status(httpStatus.OK)
    .json(ApiResponse.success('OTP sent successfully', data));
});

export const verifyEmailOtp = catchAsync(
  async (req: Request, res: Response) => {
    const { data, headers } = await verifyEmailOtpService(
      req.body as VerifyEmailOtpInput,
      fromNodeHeaders(req.headers),
    );
    forwardAuthCookies(res, headers);
    return res
      .status(httpStatus.OK)
      .json(ApiResponse.success('Email verified successfully', data));
  },
);

export const forgetPassword = catchAsync(
  async (req: Request, res: Response) => {
    const { data, headers } = await forgetPasswordService(
      req.body as ForgetPasswordInput,
      fromNodeHeaders(req.headers),
    );
    forwardAuthCookies(res, headers);
    return res
      .status(httpStatus.OK)
      .json(ApiResponse.success('Password reset OTP sent successfully', data));
  },
);

export const verifyForgetPasswordOtp = catchAsync(
  async (req: Request, res: Response) => {
    const { data, headers } = await verifyForgetPasswordOtpService(
      req.body as VerifyForgetPasswordOtpInput,
      fromNodeHeaders(req.headers),
    );
    forwardAuthCookies(res, headers);
    return res
      .status(httpStatus.OK)
      .json(
        ApiResponse.success('Password reset OTP verified successfully', data),
      );
  },
);

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const { data, headers } = await resetPasswordService(
    req.body as ResetPasswordInput,
    fromNodeHeaders(req.headers),
  );
  forwardAuthCookies(res, headers);
  return res
    .status(httpStatus.OK)
    .json(ApiResponse.success('Password reset successfully', data));
});
