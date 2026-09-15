import type { Request, Response } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { employees, invites, user } from '../../db/schema';
import { auth } from '../../auth/better-auth';
import { validateInviteCode } from '../../auth/invites';
import {
  isLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
} from '../../auth/ratelimit';

// ============================================================================
// POST /api/auth/activate
// ============================================================================
// Validates the 5-digit activation code, provisions a Better Auth user+account
// for the employee, links them, marks the employee active, and signs them in
// (sets the session cookie) — all in one request.
//
// Synthetic email pattern: <employeeId>@lms.internal
//   - never sent anywhere
//   - unique per employee (employeeId is a UUID)
//   - lets Better Auth's email+password provider work without real email
//
// On success the response includes the publicEmployee shape so the frontend
// can skip a follow-up /me call.
// ============================================================================

const activateSchema = z.object({
  token: z.string().min(16).max(128),
  code: z.string().regex(/^\d{5}$/),
  password: z.string().min(8).max(200),
});

export async function activate(req: Request, res: Response): Promise<void> {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid input',
        details: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }

  const { token, code, password } = parsed.data;

  // 1. Validate invite + code (rate-limited on wrong code).
  const validation = await validateInviteCode(token, code);

  if (!validation.ok && validation.reason === 'INVALID_CODE' && validation.inviteId) {
    const lockKey = `invite:${validation.inviteId}`;
    const lock = recordFailedLogin(lockKey);
    if (lock.locked) {
      res.status(423).json({
        error: { code: 'ACCOUNT_LOCKED', message: 'Too many failed attempts.' },
        lockedUntil: lock.lockedUntil,
      });
      return;
    }
    res.status(401).json({
      error: { code: 'INVALID_CODE', message: 'That code does not match.' },
    });
    return;
  }

  if (!validation.ok) {
    let status = 404;
    let errCode: 'INVITE_NOT_FOUND' | 'INVITE_EXPIRED' | 'INVITE_ALREADY_USED' | 'INVITE_CANCELLED' =
      'INVITE_NOT_FOUND';
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
    res.status(status).json({
      error: { code: errCode, message: 'Invite is not usable.' },
    });
    return;
  }

  // Pre-lock check before mutating.
  const lockKey = `invite:${validation.invite.id}`;
  const preLock = isLocked(lockKey);
  if (preLock.locked) {
    res.status(423).json({
      error: { code: 'ACCOUNT_LOCKED', message: 'Too many failed attempts.' },
      lockedUntil: preLock.lockedUntil,
    });
    return;
  }

  // 2. Provision Better Auth user + account. signUpEmail creates both rows
  //    atomically (scrypt password hash, default fields).
  const syntheticEmail = `${validation.employee.id}@lms.internal`;

  // Pre-check: Better Auth's signUpEmail silently no-ops when the email
  // already exists (it does NOT throw and does NOT update the password).
  // That used to leave activation in a half-state where the transaction
  // linked the employee but signInEmail later failed with "Invalid password".
  // Detect the duplicate up front and refuse cleanly with 410.
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, syntheticEmail))
    .limit(1);
  if (existingUser) {
    res.status(410).json({
      error: { code: 'INVITE_ALREADY_USED', message: 'Invite already used.' },
    });
    return;
  }

  try {
    await auth.api.signUpEmail({
      body: {
        email: syntheticEmail,
        password,
        name: validation.employee.name,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    // Defensive: if a race created the user between our pre-check and now,
    // surface it as 410 too rather than failing the activation silently.
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
      res.status(410).json({
        error: { code: 'INVITE_ALREADY_USED', message: 'Invite already used.' },
      });
      return;
    }
    throw err;
  }

  // 3. Link the employee, mark active, mark invite consumed — atomic.
  let employee;
  try {
    employee = await db.transaction(async (tx) => {
      const [u] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, syntheticEmail))
        .limit(1);
      if (!u) throw new Error('USER_NOT_FOUND_AFTER_SIGNUP');

      // Re-check invite is still consumable under the row lock — guards
      // against a parallel activation racing past our earlier check.
      const [inviteRow] = await tx
        .select()
        .from(invites)
        .where(eq(invites.id, validation.invite.id))
        .for('update')
        .limit(1);
      if (!inviteRow) throw new Error('INVITE_NOT_FOUND');
      if (inviteRow.cancelledAt) throw new Error('INVITE_CANCELLED');
      if (inviteRow.usedAt) throw new Error('INVITE_ALREADY_USED');
      if (inviteRow.expiresAt.getTime() <= Date.now()) throw new Error('INVITE_EXPIRED');

      const [updated] = await tx
        .update(employees)
        .set({
          userId: u.id,
          status: 'active',
          mustResetPassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(employees.id, validation.employee.id))
        .returning();
      if (!updated) throw new Error('EMPLOYEE_NOT_FOUND');

      await tx
        .update(invites)
        .set({ usedAt: sql`now()` })
        .where(eq(invites.id, validation.invite.id));

      return updated;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN';
    if (
      message === 'INVITE_ALREADY_USED' ||
      message === 'INVITE_EXPIRED' ||
      message === 'INVITE_CANCELLED' ||
      message === 'INVITE_NOT_FOUND'
    ) {
      res.status(410).json({
        error: { code: message, message: 'Invite is no longer usable.' },
      });
      return;
    }
    throw err;
  }

  recordSuccessfulLogin(lockKey);

  // 4. Sign in to set the session cookie. signInEmail returns a fetch
  //    Response when asResponse:true; forward its Set-Cookie header.
  const signInResponse = await auth.api.signInEmail({
    body: { email: syntheticEmail, password },
    asResponse: true,
  });

  const setCookie = signInResponse.headers.get('set-cookie');
  if (setCookie) {
    // fetch's Headers#get joins multi-value cookies with ', ' — split on
    // commas that are NOT followed by a space then '=' so we don't break
    // cookie attributes that contain commas (e.g.Expires=Wed, 01 Jan...).
    res.setHeader('Set-Cookie', setCookie.split(/,(?=\s*[A-Za-z0-9_-]+=)/));
  } else {
    // No Set-Cookie means signInEmail rejected the credentials. Bail out
    // cleanly rather than returning the employee payload and silently
    // dropping the session — that path leaves the user stuck on /login.
    res.status(401).json({
      error: {
        code: 'SIGN_IN_FAILED',
        message: 'Activation succeeded but sign-in failed; please try again.',
      },
    });
    return;
  }

  res.json({
    employee: {
      id: employee.id,
      name: employee.name,
      locationId: employee.locationId,
      roleId: employee.roleId,
      stationId: employee.stationId,
      clearanceLevel: employee.clearanceLevel,
      languagePref: employee.languagePref,
    },
  });
}
