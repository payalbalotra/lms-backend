import type { Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { employees } from '../db/schema';
import type { AuthedRequest } from '../auth/middleware';
import type { AuthedEmployee } from '../types/express';

// Role id whose members are permitted to hit /admin routes. The seed
// creates 'role-master' as the admin role; everyone else is denied.
// The previous design used a `clearance_level` column on the employee
// row; migration 0015 dropped it because admin authority is just
// role-membership — every employee already has a role, and one of
// those roles IS the admin role. One source of truth.
const ADMIN_ROLE_ID = 'role-master' as const;

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

  if (row.roleId !== ADMIN_ROLE_ID || row.status !== 'active') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin role required',
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
    languagePref: row.languagePref,
    status: row.status,
  };
  req.employee = safe;
  next();
}