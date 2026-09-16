import type { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  employees,
  locations,
  roles,
  session,
  stations,
  type LanguagePref,
} from '../../db/schema';
import { createInvite } from '../../auth/invites';
import { uniqueEmployeeName } from '../../services/employee-name';
import { handleServiceError } from '../../lib/handle-service-error';
import * as stationsService from '../../services/stations';
import * as rolesService from '../../services/roles';
import * as locationsService from '../../services/locations';

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

// Slug ids for stations / roles / locations — lowercase, digits, dashes, 1-64 chars.
// Matches the seeded values (e.g. `loc-main`, `role-general`, `stn-hot-line`).
const slugIdParam = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
});

const stationCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  locationId: z.string().min(1).max(64),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
const stationPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isArchived: z.boolean().optional(),
});

const roleCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  clearanceLevel: clearanceEnum,
});
const rolePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  clearanceLevel: clearanceEnum.optional(),
});

const locationCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
const locationPatchSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

function buildInviteUrl(languagePref: LanguagePref, token: string): string {
  return `${PUBLIC_WEB_BASE_URL}/${languagePref}/activate/${token}`;
}

function invalidInput(
  res: Response,
  issues: z.ZodError['issues'],
): void {
  res.status(400).json({
    error: {
      code: 'INVALID_INPUT',
      message: 'Invalid input',
      details: issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    },
  });
}

function unauthenticated(res: Response): void {
  res.status(401).json({
    error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
  });
}

// ============================================================================
// Employees CRUD (existing)
// ============================================================================

// ---------- POST /api/admin/employees --------------------------------------
export async function createEmployee(
  req: Request,
  res: Response,
): Promise<void> {
  const admin = req.employee;
  if (!admin) {
    unauthenticated(res);
    return;
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
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
    unauthenticated(res);
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
    // Kill every active Better Auth session for this employee. If the
    // employee never activated, employees.userId is null and this is a no-op.
    if (employee.userId) {
      await tx.delete(session).where(eq(session.userId, employee.userId));
    }
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

// ============================================================================
// Stations — thin handlers delegate to stationsService
// ============================================================================

// ---------- GET /api/admin/stations?locationId=... -------------------------
export async function listStations(req: Request, res: Response): Promise<void> {
  const locationId = String(req.query.locationId ?? '');
  if (!locationId) {
    res.status(400).json({
      error: {
        code: 'LOCATION_ID_REQUIRED',
        message: 'locationId is required',
      },
    });
    return;
  }
  const includeArchived = req.query.includeArchived === 'true';
  try {
    const result = await stationsService.listStations({
      locationId,
      includeArchived,
    });
    res.json({ stations: result });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- POST /api/admin/stations ---------------------------------------
export async function createStation(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
  const parsed = stationCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
    return;
  }
  try {
    const station = await stationsService.createStation({
      ...parsed.data,
      sortOrder: parsed.data.sortOrder ?? 0,
    });
    res.status(201).json({ station });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- PATCH /api/admin/stations/:id ----------------------------------
export async function updateStation(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
  const param = slugIdParam.safeParse(req.params);
  if (!param.success) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid station id' },
    });
    return;
  }
  const patch = stationPatchSchema.safeParse(req.body);
  if (!patch.success) {
    invalidInput(res, patch.error.issues);
    return;
  }
  try {
    const station = await stationsService.updateStation(
      param.data.id,
      patch.data,
    );
    res.json({ station });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- POST /api/admin/stations/:id/archive ---------------------------
export async function archiveStation(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
  const param = slugIdParam.safeParse(req.params);
  if (!param.success) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid station id' },
    });
    return;
  }
  try {
    const station = await stationsService.archiveStation(param.data.id);
    res.json({ station });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ============================================================================
// Roles — thin handlers delegate to rolesService
// ============================================================================

// ---------- GET /api/admin/roles -------------------------------------------
export async function listRoles(_req: Request, res: Response): Promise<void> {
  try {
    const result = await rolesService.listRoles();
    res.json({ roles: result });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- POST /api/admin/roles ------------------------------------------
export async function createRole(req: Request, res: Response): Promise<void> {
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
  const parsed = roleCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
    return;
  }
  try {
    const role = await rolesService.createRole(parsed.data);
    res.status(201).json({ role });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- PATCH /api/admin/roles/:id -------------------------------------
export async function updateRole(req: Request, res: Response): Promise<void> {
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
  const param = slugIdParam.safeParse(req.params);
  if (!param.success) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid role id' },
    });
    return;
  }
  const patch = rolePatchSchema.safeParse(req.body);
  if (!patch.success) {
    invalidInput(res, patch.error.issues);
    return;
  }
  try {
    const role = await rolesService.updateRole(param.data.id, patch.data);
    res.json({ role });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- DELETE /api/admin/roles/:id ------------------------------------
export async function deleteRole(req: Request, res: Response): Promise<void> {
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
  const param = slugIdParam.safeParse(req.params);
  if (!param.success) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid role id' },
    });
    return;
  }
  try {
    await rolesService.deleteRole(param.data.id);
    res.json({ ok: true });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ============================================================================
// Locations — thin handlers delegate to locationsService
// ============================================================================

// ---------- GET /api/admin/locations ---------------------------------------
export async function listLocations(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const result = await locationsService.listLocations();
    res.json({ locations: result });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- POST /api/admin/locations --------------------------------------
export async function createLocation(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
  const parsed = locationCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
    return;
  }
  try {
    const location = await locationsService.createLocation(parsed.data);
    res.status(201).json({ location });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- PATCH /api/admin/locations/:id ---------------------------------
export async function updateLocation(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
  const param = slugIdParam.safeParse(req.params);
  if (!param.success) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid location id' },
    });
    return;
  }
  const patch = locationPatchSchema.safeParse(req.body);
  if (!patch.success) {
    invalidInput(res, patch.error.issues);
    return;
  }
  try {
    const location = await locationsService.updateLocation(
      param.data.id,
      patch.data,
    );
    res.json({ location });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- DELETE /api/admin/locations/:id --------------------------------
export async function deleteLocation(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.employee) {
    unauthenticated(res);
    return;
  }
  const param = slugIdParam.safeParse(req.params);
  if (!param.success) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid location id' },
    });
    return;
  }
  try {
    await locationsService.deleteLocation(param.data.id);
    res.json({ ok: true });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ============================================================================
// Shared helpers
// ============================================================================

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