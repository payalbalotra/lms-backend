import ApiResponse from '../../shared/utils/ApiResponse.ts';
import ApiError from '../../shared/utils/ApiError.ts';
import type { Request, Response } from 'express';
import {
  statusEnum,
  createSchema,
  idParam,
  slugIdParam,
  stationCreateSchema,
  stationPatchSchema,
  roleCreateSchema,
  rolePatchSchema,
  locationCreateSchema,
  locationPatchSchema,
} from '../../shared/validations/employees.schema.ts';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import {
  employees,
  locations,
  roles,
  session,
  type LanguagePref,
} from '../../db/employee.schema.ts';
import {
  createInvite,
  createEmployeeTransaction,
} from '../../services/employee/employee.service.ts';
import * as stationsService from '../../services/station/stations.service.ts';
import * as rolesService from '../../services/roles/roles.service.ts';
import * as locationsService from '../../services/location/location.service.ts';
import catchAsync from '../../shared/utils/catchAsync.ts';

import config from '../../config/index.ts';

const FRONTEND_BASE_URL = config.frontendBaseUrl;

function buildInviteUrl(languagePref: LanguagePref, token: string): string {
  return `${FRONTEND_BASE_URL}/${languagePref}/activate/${token}`;
}

// ============================================================================
// Employees CRUD (existing)
// ============================================================================

// ---------- POST /api/admin/employees --------------------------------------
export const createEmployee = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const admin = req.employee;
    if (!admin) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const input = parsed.data;

    const { employee: row, invite } = await createEmployeeTransaction(
      input,
      admin.id,
    );

    res.status(201).json(
      ApiResponse.success('Success', {
        employee: publicEmployee(row),
        invite: {
          url: buildInviteUrl(input.languagePref, invite.token),
          code: invite.code,
          expiresAt: invite.expiresAt.toISOString(),
        },
      }),
    );
  },
);

// ---------- POST /api/admin/employees/:id/invites --------------------------
export const resendInvite = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const admin = req.employee;
    if (!admin) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const param = idParam.safeParse(req.params);
    if (!param.success) {
      throw new ApiError('Invalid employee id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, param.data.id))
      .limit(1);
    if (!employee) {
      throw new ApiError('Employee not found', 404, true, '', {
        code: 'EMPLOYEE_NOT_FOUND',
      });
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

    res.status(200).json(
      ApiResponse.success('Success', {
        invite: {
          url: buildInviteUrl(employee.languagePref, invite.token),
          code: invite.code,
          expiresAt: invite.expiresAt.toISOString(),
        },
      }),
    );
  },
);

// ---------- POST /api/admin/employees/:id/deactivate -----------------------
export const deactivate = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const param = idParam.safeParse(req.params);
    if (!param.success) {
      throw new ApiError('Invalid employee id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, param.data.id))
      .limit(1);
    if (!employee) {
      throw new ApiError('Employee not found', 404, true, '', {
        code: 'EMPLOYEE_NOT_FOUND',
      });
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
    res
      .status(200)
      .json(
        ApiResponse.success('Success', { employee: publicEmployee(updated!) }),
      );
  },
);

// ---------- POST /api/admin/employees/:id/reactivate ----------------------
export const reactivate = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const param = idParam.safeParse(req.params);
    if (!param.success) {
      throw new ApiError('Invalid employee id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, param.data.id))
      .limit(1);
    if (!employee) {
      throw new ApiError('Employee not found', 404, true, '', {
        code: 'EMPLOYEE_NOT_FOUND',
      });
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
    res
      .status(200)
      .json(
        ApiResponse.success('Success', { employee: publicEmployee(updated!) }),
      );
  },
);

// ---------- GET /api/admin/employees?status=... ----------------------------
export const listEmployees = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
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

    res.status(200).json(
      ApiResponse.success('Success', {
        employees: rows.map((r) => ({
          ...publicEmployee(r.employee),
          locationName: r.locationName,
          roleName: roleMap.get(r.employee.roleId)?.name ?? null,
        })),
      }),
    );
  },
);

// ============================================================================
// Stations — thin handlers delegate to stationsService
// ============================================================================

// ---------- GET /api/admin/stations ----------------------------------------
export const listStations = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const includeArchived = req.query.includeArchived === 'true';
    const result = await stationsService.listStations({
      includeArchived,
    });
    res.status(200).json(ApiResponse.success('Success', { stations: result }));
  },
);

// ---------- POST /api/admin/stations ---------------------------------------
export const createStation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }
    const parsed = stationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const station = await stationsService.createStation({
      ...parsed.data,
    });
    res.status(201).json(ApiResponse.success('Success', { station }));
  },
);

// ---------- PATCH /api/admin/stations/:id ----------------------------------
export const updateStation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }
    const param = slugIdParam.safeParse(req.params);
    if (!param.success) {
      throw new ApiError('Invalid station id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }
    const patch = stationPatchSchema.safeParse(req.body);
    if (!patch.success) {
      throw patch.error;
    }
    const station = await stationsService.updateStation(
      param.data.id,
      patch.data,
    );
    res.status(200).json(ApiResponse.success('Success', { station }));
  },
);

// ---------- POST /api/admin/stations/:id/archive ---------------------------
export const archiveStation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }
    const param = slugIdParam.safeParse(req.params);
    if (!param.success) {
      throw new ApiError('Invalid station id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }
    const station = await stationsService.archiveStation(param.data.id);
    res.status(200).json(ApiResponse.success('Success', { station }));
  },
);

// ============================================================================
// Roles — thin handlers delegate to rolesService
// ============================================================================

// ---------- GET /api/admin/roles -------------------------------------------
export const listRoles = catchAsync(
  async (_req: Request, res: Response): Promise<void> => {
    const result = await rolesService.listRoles();
    res.status(200).json(ApiResponse.success('Success', { roles: result }));
  },
);

// ---------- POST /api/admin/roles ------------------------------------------
export const createRole = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }
    const parsed = roleCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const role = await rolesService.createRole(parsed.data);
    res.status(201).json(ApiResponse.success('Success', { role }));
  },
);

// ---------- PATCH /api/admin/roles/:id -------------------------------------
export const updateRole = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }
    const param = slugIdParam.safeParse(req.params);
    if (!param.success) {
      throw new ApiError('Invalid role id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }
    const patch = rolePatchSchema.safeParse(req.body);
    if (!patch.success) {
      throw patch.error;
    }
    const role = await rolesService.updateRole(param.data.id, patch.data);
    res.status(200).json(ApiResponse.success('Success', { role }));
  },
);

// ---------- DELETE /api/admin/roles/:id ------------------------------------
export const deleteRole = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }
    const param = slugIdParam.safeParse(req.params);
    if (!param.success) {
      throw new ApiError('Invalid role id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }
    await rolesService.deleteRole(param.data.id);
    res.status(200).json(ApiResponse.success('Success', { ok: true }));
  },
);

// ============================================================================
// Locations — thin handlers delegate to locationsService
// ============================================================================

// ---------- GET /api/admin/locations ---------------------------------------
export const listLocations = catchAsync(
  async (_req: Request, res: Response): Promise<void> => {
    const result = await locationsService.listLocations();
    res.status(200).json(ApiResponse.success('Success', { locations: result }));
  },
);

// ---------- POST /api/admin/locations --------------------------------------
export const createLocation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }
    const parsed = locationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const location = await locationsService.createLocation(parsed.data);
    res.status(201).json(ApiResponse.success('Success', { location }));
  },
);

// ---------- PATCH /api/admin/locations/:id ---------------------------------
export const updateLocation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }
    const param = slugIdParam.safeParse(req.params);
    if (!param.success) {
      throw new ApiError('Invalid location id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }
    const patch = locationPatchSchema.safeParse(req.body);
    if (!patch.success) {
      throw patch.error;
    }
    const location = await locationsService.updateLocation(
      param.data.id,
      patch.data,
    );
    res.status(200).json(ApiResponse.success('Success', { location }));
  },
);

// ---------- DELETE /api/admin/locations/:id --------------------------------
export const deleteLocation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }
    const param = slugIdParam.safeParse(req.params);
    if (!param.success) {
      throw new ApiError('Invalid location id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }
    await locationsService.deleteLocation(param.data.id);
    res.status(200).json(ApiResponse.success('Success', { ok: true }));
  },
);

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
    jobIds: e.jobIds,
    stationIds: e.stationIds,
    languagePref: e.languagePref,
    status: e.status,
    createdAt: e.createdAt.toISOString(),
    deactivatedAt: e.deactivatedAt ? e.deactivatedAt.toISOString() : null,
  };
}
