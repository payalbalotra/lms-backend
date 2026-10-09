import ApiError from '../../shared/api-error.ts';

import { employees, type Employee } from '../../db/schema/index.ts';
import { auth } from '../../lib/auth.ts';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { hashPassword } from 'better-auth/crypto';
import { db } from '../../db/client.ts';
import { user, account, SUPER_ADMIN_USER_ROLE } from '../../db/schema/index.ts';
import { and, eq } from 'drizzle-orm';
import { sessionEmployee } from '../employees/employees.mapper.ts';

// ============================================================================
// signUpUser
// Creates a Better Auth user and marks the email verified. Returns the
// session cookies Better Auth set, for the controller to forward.
// ============================================================================

export async function signUpUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ setCookies: string[] }> {
  const signUpResponse = await auth.api.signUpEmail({
    body: { email: input.email, password: input.password, name: input.name },
    asResponse: true,
  });

  if (!signUpResponse.ok) {
    const error = await signUpResponse.json().catch(() => ({}));
    throw new ApiError(
      error.message || 'Sign up failed',
      signUpResponse.status || 400,
      true,
      '',
      { code: error.code || 'SIGN_UP_FAILED' },
    );
  }

  await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, input.email));

  // better-auth's getSetCookie() returns an array of strings
  return { setCookies: signUpResponse.headers.getSetCookie() };
}

export interface LoginServiceInput {
  email: string;
  password: string;
}

export interface LoginServiceResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any;
  // Raw session token — client stores and sends as: Authorization: Bearer <token>
  token: string;
  setCookies?: string[];
}

export async function loginUser(
  input: LoginServiceInput,
): Promise<LoginServiceResult> {
  const signInResponse = await auth.api.signInEmail({
    body: { email: input.email, password: input.password },
    asResponse: true,
  });

  if (!signInResponse.ok) {
    const error = await signInResponse.json().catch(() => ({}));
    throw new ApiError(
      error.message || 'Invalid email or password',
      signInResponse.status || 401,
      true,
      '',
      { code: 'INVALID_CREDENTIALS' },
    );
  }

  // better-auth returns { token, user } where token is the raw opaque
  // session token the client can send as: Authorization: Bearer <token>
  const data = await signInResponse.json();
  const token: string | undefined = data?.token;

  if (!token) {
    throw new ApiError('Sign-in failed; please try again.', 401, true, '', {
      code: 'SIGN_IN_FAILED',
    });
  }

  return {
    user: data.user,
    token,
    setCookies: signInResponse.headers.getSetCookie(),
  };
}

// ============================================================================
// getSessionService
// Reads headers from the request, gets the session from Better Auth, and
// retrieves the associated user and employee records.
// ============================================================================

export async function getSessionService(req: Request) {
  const sessionResponse = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  // getSession already loads the user row, so there is no need to query it
  // again here.
  const userRow = sessionResponse?.user;
  const userId = userRow?.id;

  if (!userRow || !userId) {
    throw new ApiError('Session expired or invalid', 401, true, '', {
      code: 'SESSION_INVALID',
    });
  }

  // The user's role and employee record (not present for super admins), in
  // one query.
  const [row] = await db
    .select({ userRole: user.role, employee: employees })
    .from(user)
    .leftJoin(employees, eq(employees.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);
  const employee = row?.employee;

  // Super admins have no employee row - return user-level info. A user with
  // no employee row who is not a super admin (e.g. a self sign-up) gets
  // nothing.
  if (!employee) {
    if (row?.userRole !== SUPER_ADMIN_USER_ROLE) {
      throw new ApiError(
        'You do not have permission to perform this action.',
        403,
        true,
        '',
        { code: 'FORBIDDEN' },
      );
    }
    return {
      user: { id: userRow.id, name: userRow.name, email: userRow.email },
      role: 'super_admin',
    };
  }

  if (employee.status !== 'active') {
    throw new ApiError('Session expired or invalid', 401, true, '', {
      code: 'SESSION_INVALID',
    });
  }

  const deviceMode: 'personal' | 'shared' =
    req.headers['x-device-mode'] === 'shared' ? 'shared' : 'personal';

  return {
    employee: sessionEmployee(employee),
    deviceMode,
  };
}

// ============================================================================
// setPasswordService
// Runs after the employee opened their magic link (so they already have a
// session). Links the Better Auth user to the employee row by email if that
// has not happened yet, stores the password, and activates the employee.
// Returns the updated employee row.
// ============================================================================

export async function setPasswordService(
  sessionUser: { id: string; email: string },
  password: string,
): Promise<Employee> {
  const userId = sessionUser.id;

  // Prefer the employee already linked to this user; otherwise match by the
  // email the invite was sent to.
  const [linked] = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, userId))
    .limit(1);
  const employee =
    linked ??
    (
      await db
        .select()
        .from(employees)
        .where(eq(employees.email, sessionUser.email))
        .limit(1)
    )[0];

  if (!employee) {
    throw new ApiError(
      'No employee record found for this account.',
      404,
      true,
      '',
      { code: 'EMPLOYEE_NOT_FOUND' },
    );
  }

  if (employee.status === 'deactivated') {
    throw new ApiError('This account has been deactivated.', 403, true, '', {
      code: 'EMPLOYEE_DEACTIVATED',
    });
  }

  if (linked && !linked.requirePasswordChange) {
    throw new ApiError('Password has already been set.', 409, true, '', {
      code: 'PASSWORD_ALREADY_SET',
    });
  }

  // Hash with Better Auth's own hasher so /login can verify it.
  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    // A magic-link sign-in creates the user without a credential account,
    // so insert one when it is missing instead of only updating.
    const [existingAccount] = await tx
      .select({ id: account.id })
      .from(account)
      .where(
        and(eq(account.userId, userId), eq(account.providerId, 'credential')),
      )
      .limit(1);

    if (existingAccount) {
      await tx
        .update(account)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(account.id, existingAccount.id));
    } else {
      await tx.insert(account).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await tx
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, userId));

    const [updated] = await tx
      .update(employees)
      .set({ userId, status: 'active', requirePasswordChange: false })
      .where(eq(employees.id, employee.id))
      .returning();

    return updated!;
  });
}

// ============================================================================
// forgotPasswordService
// Delegates to Better Auth's emailOtp plugin:
//   auth.api.requestPasswordResetEmailOTP({ body: { email } })
// Better Auth handles OTP generation, storage in the verification table,
// and triggers sendVerificationOTP (defined in auth.ts) to send the email.
// ============================================================================

export async function forgotPasswordService(email: string): Promise<void> {
  await auth.api.requestPasswordResetEmailOTP({
    body: { email },
  });
}

// ============================================================================
// resetPasswordWithOtpService
// Delegates to Better Auth's emailOTP plugin:
//   auth.api.resetPasswordEmailOTP({ body: { email, otp, newPassword } })
// Better Auth verifies the OTP against the verification table, hashes the
// new password, and updates the credentials account row — all internally.
// Throws if the OTP is invalid or expired.
// ============================================================================

export async function resetPasswordWithOtpService(
  email: string,
  otp: string,
  newPassword: string,
): Promise<void> {
  const response = await auth.api.resetPasswordEmailOTP({
    body: { email, otp, password: newPassword },
    asResponse: true,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.message || 'Invalid or expired reset code.',
      response.status || 400,
      true,
      '',
      { code: error.code || 'INVALID_OTP' },
    );
  }
}
