import type { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { employees } from '../db/index.ts';

import { auth } from './auth.ts';

export interface AuthedRequest extends Request {
  session?: {
    id: string;
    employeeId: string;
  };
  deviceMode?: 'personal' | 'shared';
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionResponse = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  const userId = sessionResponse?.user.id;
  const sessionId = sessionResponse?.session.id;

  if (sessionResponse) {
    console.log(`[Auth Debug] Found session via better-auth getSession`);
  } else {
    console.log(`[Auth Debug] better-auth getSession returned null.`);
  }

  if (!userId || !sessionId) {
    console.log(`[Auth Debug] Rejecting request: userId or sessionId is null.`);
    res.status(401).json({
      error: { code: 'SESSION_INVALID', message: 'Session expired or invalid' },
    });
    return;
  }

  const [employee] = await db
    .select({
      id: employees.id,
      status: employees.status,
      locationId: employees.locationId,
      role: employees.role,
    })
    .from(employees)
    .where(eq(employees.userId, userId))
    .limit(1);

  if (!employee) {
    console.log(
      `[Auth Debug] No employee record found for userId=${userId}. Super Admin bypass active — write operations that require a real employee UUID will be blocked.`,
    );
    req.session = {
      id: sessionId,
      employeeId: 'super-admin',
    };
    req.isSuperAdmin = true;
    // IMPORTANT: do NOT use userId here — it is a better-auth nanoid (text),
    // not a uuid. Using it as req.employee.id would corrupt any uuid FK column
    // (e.g. procedures.created_by). Set id to empty string so callers that
    // attempt to write it to the DB get a clear validation error rather than a
    // cryptic postgres "invalid input syntax for type uuid" 500.
    req.employee = {
      id: '',
      userId: userId,
      locationId: 'global',
      role: 'super_admin',
    };
    req.deviceMode =
      req.headers['x-device-mode'] === 'shared' ? 'shared' : 'personal';
    return next();
  }

  if (employee.status !== 'active') {
    res.status(401).json({
      error: { code: 'SESSION_INVALID', message: 'Session expired or invalid' },
    });
    return;
  }

  req.session = {
    id: sessionId,
    employeeId: employee.id,
  };
  req.employee = {
    id: employee.id,
    userId: userId,
    locationId: employee.locationId,
    role: employee.role,
  };
  req.deviceMode =
    req.headers['x-device-mode'] === 'shared' ? 'shared' : 'personal';

  next();
}
