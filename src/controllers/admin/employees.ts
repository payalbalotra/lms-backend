import type { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { and, eq, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  employees,
  locations,
  roles,
  stations,
  type LanguagePref,
} from '../../db/schema';
import { createInvite } from '../../auth/invites';
import { uniqueEmployeeName } from '../../services/employee-name';

const PUBLIC_WEB_BASE_URL =
  process.env.PUBLIC_WEB_BASE_URL ?? 'http://localhost:3000';

const clearanceEnum = z.enum(['general', 'station', 'confidential', 'master']);
const statusEnum = z.enum(['pending', 'active', 'deactivated', 'all']);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  locationId: z.string().min(1).max(64),
  roleId: z.string().min(1).max(64),
  stationId: z.string().min(1).max(64).nullable().optional(),
  clearanceLevel: clearanceEnum,
  employeeCode: z.string().trim().min(1).max(32).nullable().optional(),
  languagePref: z.enum(['en', 'es']).optional().default('en'),
});

const idParam = z.object({ id: z.string().uuid() });

function buildInviteUrl(languagePref: LanguagePref, token: string): string {
  return `${PUBLIC_WEB_BASE_URL}/${languagePref}/activate/${token}`;
}

// ---------- POST /api/admin/employees --------------------------------------
export async function createEmployee(
  req: Request,
  res: Response,
): Promise<void> {
  const admin = req.employee;
  if (!admin) {
    res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
    });
    return;
  }

  const parsed = createSchema.safeParse(req.body);
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
  const input = parsed.data;

  // Foreign key checks up-front for friendlier 400s.
  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, input.locationId))
    .limit(1);
  if (!loc) {
    res.status(400).json({
      error: { code: 'LOCATION_NOT_FOUND', message: 'Unknown location' },
    });
    return;
  }
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.id, input.roleId))
    .limit(1);
  if (!role) {
    res.status(400).json({
      error: { code: 'ROLE_NOT_FOUND', message: 'Unknown role' },
    });
    return;
  }
  if (input.stationId) {
    const [st] = await db
      .select({ id: stations.id })
      .from(stations)
      .where(eq(stations.id, input.stationId))
      .limit(1);
    if (!st || st.id !== input.stationId) {
      res.status(400).json({
        error: { code: 'STATION_NOT_FOUND', message: 'Unknown station' },
      });
      return;
    }
  }

  // Optional code uniqueness check before insert.
  if (input.employeeCode) {
    const [codeHit] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.employeeCode, input.employeeCode))
      .limit(1);
    if (codeHit) {
      res.status(409).json({
        error: {
          code: 'EMPLOYEE_CODE_TAKEN',
          message: 'That employee code is already in use.',
        },
      });
      return;
    }
  }

  const employeeName = await uniqueEmployeeName(input.locationId, input.name);
  const employeeId = crypto.randomUUID();
  await db.insert(employees).values({
    id: employeeId,
    name: employeeName,
    employeeCode: input.employeeCode ?? null,
    locationId: input.locationId,
    roleId: input.roleId,
    stationId: input.stationId ?? null,
    clearanceLevel: input.clearanceLevel,
    languagePref: input.languagePref,
    status: 'pending',
    passwordHash: null,
    mustResetPassword: false,
  });

  const invite = await createInvite({
    employeeId,
    createdBy: admin.id,
  });

  const [row] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) {
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Inserted employee not found' },
    });
    return;
  }

  res.status(201).json({
    employee: publicEmployee(row),
    invite: {
      url: buildInviteUrl(input.languagePref, invite.token),
      code: invite.code,
      expiresAt: invite.expiresAt.toISOString(),
    },
  });
}

// ---------- POST /api/admin/employees/:id/invites --------------------------
export async function resendInvite(
  req: Request,
  res: Response,
): Promise<void> {
  const admin = req.employee;
  if (!admin) {
    res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
    });
    return;
  }

  const param = idParam.safeParse(req.params);
  if (!param.success) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid employee id' },
    });
    return;
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, param.data.id))
    .limit(1);
  if (!employee) {
    res.status(404).json({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' },
    });
    return;
  }
  if (employee.status !== 'pending') {
    res.status(409).json({
      error: {
        code: 'EMPLOYEE_NOT_PENDING',
        message: 'Only pending employees can be re-invited.',
      },
    });
    return;
  }

  const invite = await createInvite({
    employeeId: employee.id,
    createdBy: admin.id,
  });

  res.json({
    invite: {
      url: buildInviteUrl(employee.languagePref, invite.token),
      code: invite.code,
      expiresAt: invite.expiresAt.toISOString(),
    },
  });
}

// ---------- POST /api/admin/employees/:id/deactivate -----------------------
export async function deactivate(
  req: Request,
  res: Response,
): Promise<void> {
  const param = idParam.safeParse(req.params);
  if (!param.success) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid employee id' },
    });
    return;
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, param.data.id))
    .limit(1);
  if (!employee) {
    res.status(404).json({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' },
    });
    return;
  }
  if (employee.status === 'deactivated') {
    res.status(409).json({
      error: {
        code: 'ALREADY_DEACTIVATED',
        message: 'Employee is already deactivated.',
      },
    });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(employees)
      .set({ status: 'deactivated', deactivatedAt: new Date() })
      .where(eq(employees.id, employee.id));
    await tx.execute(
      sql`update sessions set revoked_at = now() where employee_id = ${employee.id} and revoked_at is null`,
    );
  });

  const [updated] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employee.id))
    .limit(1);
  res.json({ employee: publicEmployee(updated!) });
}

// ---------- POST /api/admin/employees/:id/reactivate ----------------------
export async function reactivate(
  req: Request,
  res: Response,
): Promise<void> {
  const param = idParam.safeParse(req.params);
  if (!param.success) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid employee id' },
    });
    return;
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, param.data.id))
    .limit(1);
  if (!employee) {
    res.status(404).json({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' },
    });
    return;
  }
  if (employee.status !== 'deactivated') {
    res.status(409).json({
      error: {
        code: 'NOT_DEACTIVATED',
        message: 'Employee is not deactivated.',
      },
    });
    return;
  }

  await db
    .update(employees)
    .set({ status: 'active', deactivatedAt: null })
    .where(eq(employees.id, employee.id));

  const [updated] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employee.id))
    .limit(1);
  res.json({ employee: publicEmployee(updated!) });
}

// ---------- GET /api/admin/employees?status=... ----------------------------
export async function listEmployees(
  req: Request,
  res: Response,
): Promise<void> {
  const q = statusEnum.safeParse(req.query.status ?? 'all');
  const status = q.success ? q.data : 'all';

  const conditions: ReturnType<typeof eq>[] = [];
  if (status !== 'all') {
    conditions.push(eq(employees.status, status));
  }

  const rows = await db
    .select({
      employee: employees,
      locationName: locations.name,
    })
    .from(employees)
    .leftJoin(locations, eq(locations.id, employees.locationId))
    .where(conditions.length ? and(...conditions) : undefined);

  const roleIds = [...new Set(rows.map((r) => r.employee.roleId))];
  const roleRows = roleIds.length
    ? await db.select().from(roles).where(inArray(roles.id, roleIds))
    : [];
  const roleMap = new Map(roleRows.map((r) => [r.id, r]));

  res.json({
    employees: rows.map((r) => ({
      ...publicEmployee(r.employee),
      locationName: r.locationName,
      roleClearance: roleMap.get(r.employee.roleId)?.clearanceLevel ?? null,
    })),
  });
}

// ---------- GET /api/admin/roles -------------------------------------------
export async function listRoles(_req: Request, res: Response): Promise<void> {
  const rows = await db.select().from(roles);
  res.json({
    roles: rows.map((r) => ({
      id: r.id,
      clearanceLevel: r.clearanceLevel,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// ---------- GET /api/admin/stations?locationId=... -------------------------
export async function listStations(req: Request, res: Response): Promise<void> {
  const locationId = String(req.query.locationId ?? '');
  if (!locationId) {
    res.status(400).json({
      error: { code: 'LOCATION_ID_REQUIRED', message: 'locationId is required' },
    });
    return;
  }
  const rows = await db
    .select()
    .from(stations)
    .where(eq(stations.locationId, locationId));
  res.json({
    stations: rows.map((s) => ({
      id: s.id,
      locationId: s.locationId,
      sortOrder: s.sortOrder,
      isArchived: s.isArchived,
    })),
  });
}

// ---------- GET /api/admin/locations --------------------------------------
export async function listLocations(_req: Request, res: Response): Promise<void> {
  const rows = await db.select().from(locations);
  res.json({
    locations: rows.map((l) => ({ id: l.id, name: l.name })),
  });
}

// ---------- helpers --------------------------------------------------------
function publicEmployee(e: Readonly<typeof employees.$inferSelect>) {
  return {
    id: e.id,
    name: e.name,
    employeeCode: e.employeeCode,
    locationId: e.locationId,
    roleId: e.roleId,
    stationId: e.stationId,
    clearanceLevel: e.clearanceLevel,
    languagePref: e.languagePref,
    status: e.status,
    createdAt: e.createdAt.toISOString(),
    deactivatedAt: e.deactivatedAt ? e.deactivatedAt.toISOString() : null,
  };
}