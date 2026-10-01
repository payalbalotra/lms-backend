import type { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { employees, user } from '../db/schema.ts';
import { session as sessionTable } from '../db/schema.ts';
import { auth } from './betterauth.ts';

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
 * Validates the Bearer token (Authorization header) or session cookie and
 * resolves it to an LMS employee. Attaches a minimal session payload to
 * `req.session` and the device mode.
 */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let userId: string | null = null;
  let sessionId: string | null = null;

  const authHeader = req.headers['authorization'] ?? '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  console.log(
    `[Auth Debug] Checking Bearer token: ${bearerToken?.substring(0, 10)}...`,
  );

  if (bearerToken) {
    const [row] = await db
      .select({ userId: sessionTable.userId, id: sessionTable.id })
      .from(sessionTable)
      .where(
        and(
          eq(sessionTable.token, bearerToken),
          gt(sessionTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (row) {
      console.log(
        `[Auth Debug] Found session row in DB! userId: ${row.userId}`,
      );
      userId = row.userId;
      sessionId = row.id;
    } else {
      console.log(`[Auth Debug] Token NOT found in DB, or expired.`);
    }
  }

  // 2. Fall back to cookie-based session (browser clients).
  if (!userId) {
    const cookieSession = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (cookieSession) {
      console.log(`[Auth Debug] Found session via better-auth getSession`);
      userId = cookieSession.user.id;
      sessionId = cookieSession.session.id;
    } else {
      console.log(`[Auth Debug] better-auth getSession also returned null.`);
    }
  }

  if (!userId || !sessionId) {
    console.log(`[Auth Debug] Rejecting request: userId or sessionId is null.`);
    res.status(401).json({
      error: { code: 'SESSION_INVALID', message: 'Session expired or invalid' },
    });
    return;
  }

  // 3. Resolve user to an LMS employee.
  const [employee] = await db
    .select({
      id: employees.id,
      status: employees.status,
      locationId: employees.locationId,
      roleId: employees.roleId,
    })
    .from(employees)
    .where(eq(employees.userId, userId))
    .limit(1);

  if (!employee) {
    const [usr] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (usr && usr.role === 'super_admin') {
      console.log(
        `[Auth Debug] No employee record found. Validated as Super Admin.`,
      );
      req.session = {
        id: sessionId,
        employeeId: 'super-admin', // dummy ID to satisfy types
      };
      req.isSuperAdmin = true;
      req.employee = {
        id: userId,
        userId: userId,
        locationId: 'global',
        roleId: 'super-admin',
      };
      req.deviceMode =
        req.headers['x-device-mode'] === 'shared' ? 'shared' : 'personal';
      return next();
    } else {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'No employee record found for this user.',
        },
      });
      return;
    }
  }

  if (employee.status !== 'active') {
    res.status(401).json({
      error: { code: 'SESSION_INVALID', message: 'Session expired or invalid' },
    });
    return;
  }

  // 4. Attach to the request.
  req.session = {
    id: sessionId,
    employeeId: employee.id,
  };
  req.employee = {
    id: employee.id,
    userId: userId,
    locationId: employee.locationId,
    roleId: employee.roleId,
  };
  req.deviceMode =
    req.headers['x-device-mode'] === 'shared' ? 'shared' : 'personal';

  next();
}
