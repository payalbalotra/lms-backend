import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { employees, type Employee } from '../db/schema';
import { auth } from '../auth/better-auth';
import {
  isLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
} from '../auth/ratelimit';
import { ServiceError } from './errors';

// ============================================================================
// loginEmployee — name + locationId + password → session cookie + employee
// ============================================================================
// Employees sign in with their display name (case-insensitive) plus their
// location, not with an email. We look up the employee first so we can:
//   - refuse deactivated / unknown accounts with a clean error code
//   - derive the synthetic Better Auth email (<employeeId>@lms.internal)
//     because Better Auth's email+password provider only knows about emails
//   - run a per-employee lockout so a leaked password can't be brute-forced
//
// We then ask Better Auth to issue the session — it owns password hashing
// and session creation. We forward the Set-Cookie header back through the
// controller unchanged.
//
// Why a separate service and not the controller?
//   - The lookup + lockout + signInEmail dance is the reusable business rule;
//     other LMS endpoints may want to authenticate without going through HTTP
//     (e.g. test harnesses, future internal RPCs).
//   - Keeps the controller a thin HTTP shell per CLAUDE.md.
// ============================================================================

export interface LoginInput {
  name: string;
  locationId: string;
  password: string;
}

export interface LoginResult {
  employee: PublicEmployeeShape;
  // Raw Set-Cookie header value from Better Auth (may contain multiple
  // cookies joined by ', '). The controller forwards it.
  setCookie: string;
}

export interface PublicEmployeeShape {
  id: string;
  name: string;
  locationId: string;
  roleId: string;
  stationId: string | null;
  clearanceLevel: Employee['clearanceLevel'];
  languagePref: Employee['languagePref'];
}

// Rate limit key is per (locationId, name) so a typo on someone else's name
// doesn't lock them out and a real attack still gets throttled.
function lockKey(locationId: string, name: string): string {
  return `login:${locationId}:${name.trim().toLowerCase()}`;
}

// Treat every non-throwing signInEmail failure as INVALID_CREDENTIALS so
// we don't leak which side was wrong (unknown employee vs. wrong password).
function invalidCredentials(): ServiceError {
  return new ServiceError(
    401,
    'INVALID_CREDENTIALS',
    'Name, location, or password is incorrect.',
  );
}

export async function loginEmployee(input: LoginInput): Promise<LoginResult> {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw invalidCredentials();
  if (!input.locationId) throw invalidCredentials();
  if (!input.password) throw invalidCredentials();

  const key = lockKey(input.locationId, trimmedName);

  // 1. Lock check first — never even look up the row if we're locked.
  const preLock = isLocked(key);
  if (preLock.locked) {
    throw new ServiceError(
      423,
      'ACCOUNT_LOCKED',
      'Too many failed attempts.',
    );
  }

  // 2. Resolve the LMS employee. Login names are case-insensitive — the
  //    schema's unique index is on lower(name) per location.
  const [employee] = await db
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.locationId, input.locationId),
        sql`lower(${employees.name}) = ${trimmedName.toLowerCase()}`,
      ),
    )
    .limit(1);

  if (!employee) {
    // Don't increment the lock for an unknown name — that would let an
    // attacker DoS a real user by spamming logins for their name. Only
    // the real account's key should ever accumulate failures.
    throw invalidCredentials();
  }

  if (employee.status !== 'active') {
    // Deactivated / pending employees get a distinct code so the UI can
    // show "ask your manager" rather than "wrong password".
    throw new ServiceError(
      403,
      'EMPLOYEE_NOT_ACTIVE',
      'This account is not active. Ask your manager to reactivate it.',
    );
  }

  // 3. Hand the credentials to Better Auth. It owns password hashing and
  //    session creation; we just forward the Set-Cookie. signInEmail throws
  //    on bad password, which we catch and convert to INVALID_CREDENTIALS.
  const syntheticEmail = `${employee.id}@lms.internal`;

  let setCookie: string | null = null;
  try {
    const signInResponse = await auth.api.signInEmail({
      body: { email: syntheticEmail, password: input.password },
      asResponse: true,
    });
    setCookie = signInResponse.headers.get('set-cookie');
  } catch {
    const lock = recordFailedLogin(key);
    if (lock.locked) {
      throw new ServiceError(
        423,
        'ACCOUNT_LOCKED',
        'Too many failed attempts.',
      );
    }
    throw invalidCredentials();
  }

  if (!setCookie) {
    // Should be unreachable — signInEmail that doesn't throw but also
    // doesn't set a cookie means the account exists but somehow can't
    // be signed in (e.g. requireEmailVerification is on). Surface a
    // distinct code so we don't pretend login worked.
    throw new ServiceError(
      401,
      'SIGN_IN_FAILED',
      'Sign-in failed; please try again.',
    );
  }

  recordSuccessfulLogin(key);

  return {
    employee: publicEmployeeShape(employee),
    setCookie,
  };
}

export function publicEmployeeShape(e: Employee): PublicEmployeeShape {
  return {
    id: e.id,
    name: e.name,
    locationId: e.locationId,
    roleId: e.roleId,
    stationId: e.stationId,
    clearanceLevel: e.clearanceLevel,
    languagePref: e.languagePref,
  };
}