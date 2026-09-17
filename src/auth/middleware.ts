import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { employees } from '../db/schema';
import { auth } from './better-auth';

/**
 * Request shape after `requireAuth` succeeds. `requireAdmin` consumes
 * `session.employeeId` to look up the row and apply the clearance check,
 * so this contract must stay stable.
 */
export interface AuthedRequest extends Request {
  session?: {
    /** Better Auth session id (not the same as the employee id). */
    id: string;
    /** LMS employee id — what requireAdmin and downstream handlers read. */
    employeeId: string;
  };
  /** 'personal' unless the caller sent `X-Device-Mode: shared`. */
  deviceMode?: 'personal' | 'shared';
}

/**
 * Validates the Better Auth session cookie and resolves it to an LMS employee.
 * Attaches a minimal session payload to `req.session` and the device mode.
 * Does NOT populate `req.employee` — that is `requireAdmin`'s job.
 */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // 1. Ask Better Auth if the request carries a valid session cookie.
  //    getSession is DB-backed (or reads from the in-memory cookieCache when
  //    enabled in better-auth.ts). Returns null when there is no cookie,
  //    the cookie is invalid, or the session is expired/revoked.
  //
  //    Express's `req.headers` is an `IncomingHttpHeaders` object whose values
  //    are `string | string[] | undefined`. Better Auth expects the Web Fetch
  //    `Headers` shape, so we convert.
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  const session = await auth.api.getSession({ headers });

  if (!session) {
    res.status(401).json({
      error: { code: 'SESSION_INVALID', message: 'Session expired or invalid' },
    });
    return;
  }

  // 2. Resolve the Better Auth user to an LMS employee. The user↔employee
  //    link is the `employees.userId` FK; employees are 1:1 with users.
  //    We load the columns every controller downstream needs (id, locationId,
  //    roleId) so non-admin routes that only mount requireAuth still see a
  //    populated `req.employee`. requireAdmin re-loads the full row and
  //    overwrites this when it runs.
  const [employee] = await db
    .select({
      id: employees.id,
      status: employees.status,
      locationId: employees.locationId,
      roleId: employees.roleId,
    })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!employee || employee.status !== 'active') {
    // User has a valid Better Auth session but no active employee row
    // (deactivated, deleted, never activated). Treat as no session.
    res.status(401).json({
      error: { code: 'SESSION_INVALID', message: 'Session expired or invalid' },
    });
    return;
  }

  // 3. Attach to the request. Same shape requireAdmin already consumes.
  req.session = {
    id: session.session.id,
    employeeId: employee.id,
  };
  req.employee = {
    id: employee.id,
    locationId: employee.locationId,
    roleId: employee.roleId,
  };
  req.deviceMode =
    req.headers['x-device-mode'] === 'shared' ? 'shared' : 'personal';

  next();
}
