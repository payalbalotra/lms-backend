import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { employees, type Employee } from '../db/schema';
import { auth } from '../auth/better-auth';

// ============================================================================
// GET /api/auth/me
// ============================================================================
// Reads the Better Auth session cookie and returns the LMS employee record
// attached to that user. Login/logout go through Better Auth's built-in
// endpoints: /api/auth/sign-in/email and /api/auth/sign-out.
//
// 401 SESSION_INVALID when:
//   - no session cookie
//   - cookie is invalid / expired / revoked
//   - session belongs to a Better Auth user with no LMS employee row
//     (deactivated, deleted, or never activated)
//
// The deviceMode is read from the X-Device-Mode header so the frontend can
// switch idle-window behavior without re-issuing a cookie. The /me response
// echoes it back so callers can confirm.
// ============================================================================

export async function me(req: Request, res: Response): Promise<void> {
  // Better Auth's getSession expects fetch Headers, not Express's IncomingHttpHeaders.
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

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!employee || employee.status !== 'active') {
    res.status(401).json({
      error: { code: 'SESSION_INVALID', message: 'Session expired or invalid' },
    });
    return;
  }

  const deviceMode: 'personal' | 'shared' =
    req.headers['x-device-mode'] === 'shared' ? 'shared' : 'personal';

  res.json({
    employee: publicEmployee(employee),
    deviceMode,
  });
}

// ============================================================================
// Helpers
// ============================================================================

function publicEmployee(e: Employee) {
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
