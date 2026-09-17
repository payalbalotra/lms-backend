import type { Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { employees } from '../db/schema';
import type { AuthedRequest } from '../auth/middleware';
import type { AuthedEmployee } from '../types/express';

// Clearance level permitted to hit /admin routes.
const ADMIN_CLEARANCE = 'master' as const;

export async function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.session) {
    res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
    });
    return;
  }

  const [row] = await db
    .select({
      id: employees.id,
      name: employees.name,
      locationId: employees.locationId,
      roleId: employees.roleId,
      stationId: employees.stationId,
      clearanceLevel: employees.clearanceLevel,
      languagePref: employees.languagePref,
      status: employees.status,
    })
    .from(employees)
    .where(eq(employees.id, req.session.employeeId))
    .limit(1);

  if (!row) {
    res.status(401).json({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' },
    });
    return;
  }

  if (row.clearanceLevel !== ADMIN_CLEARANCE || row.status !== 'active') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin clearance required',
      },
    });
    return;
  }

  const safe: AuthedEmployee = {
    id: row.id,
    name: row.name,
    locationId: row.locationId,
    roleId: row.roleId,
    stationId: row.stationId,
    clearanceLevel: row.clearanceLevel,
    languagePref: row.languagePref,
    status: row.status,
  };
  req.employee = safe;
  next();
}