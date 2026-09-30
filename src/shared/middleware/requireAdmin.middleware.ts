import type { Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { employees } from '../../db/employee.schema.ts';
import type { AuthedRequest } from '../../auth/middleware.ts';
import type { AuthedEmployee } from '../../types/express.ts';

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

  if (req.isSuperAdmin) {
    req.employee = {
      id: req.employee?.id ?? req.session.employeeId,
      name: 'Super Admin',
      locationId: 'global',
      roleId: 'super-admin',
      email: null,
      languagePref: 'en',
      status: 'active',
    };
    return next();
  }

  const [row] = await db
    .select({
      id: employees.id,
      name: employees.name,
      locationId: employees.locationId,
      roleId: employees.roleId,
      email: employees.email,
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

  if (row.status !== 'active') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
    });
    return;
  }

  const safe: AuthedEmployee = {
    id: row.id,
    name: row.name,
    locationId: row.locationId,
    roleId: row.roleId,
    email: row.email,
    languagePref: row.languagePref,
    status: row.status,
  };
  req.employee = safe;
  next();
}
