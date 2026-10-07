import ApiResponse from '../../shared/utils/ApiResponse.ts';
import ApiError from '../../shared/utils/ApiError.ts';
import type { Request, Response } from 'express';
import {
  statusEnum,
  createSchema,
  patchSchema,
  idParam,
} from '../../shared/validations/employees.schema.ts';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { employees, locations, session } from '../../db/index.ts';
import {
  sendInviteMagicLink,
  createEmployeeTransaction,
} from '../../services/employee/employee.service.ts';

import catchAsync from '../../shared/utils/catchAsync.ts';

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

    const { employee: row } = await createEmployeeTransaction(input, admin.id);

    // Send magic link invite email — Better Auth handles token generation.
    const inviteUrl = await sendInviteMagicLink({
      email: row.email,
      languagePref: row.languagePref,
    });

    res.status(201).json(
      ApiResponse.success('Employee created and invite sent', {
        employee: publicEmployee(row),
        inviteUrl,
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

    // Better Auth automatically invalidates the old token when a new
    // magic link is requested for the same email (verification table
    // entries expire; new one replaces semantics via TTL).
    const inviteUrl = await sendInviteMagicLink({
      email: employee.email,
      languagePref: employee.languagePref,
    });

    res
      .status(200)
      .json(ApiResponse.success('Invite resent successfully', { inviteUrl }));
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
    res.status(200).json(
      ApiResponse.success('Employee deactivated successfully', {
        employee: publicEmployee(updated!),
      }),
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
    res.status(200).json(
      ApiResponse.success('Employee reactivated successfully', {
        employee: publicEmployee(updated!),
      }),
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

    res.status(200).json(
      ApiResponse.success('Employees retrieved successfully', {
        employees: rows.map((r) => ({
          ...publicEmployee(r.employee),
          locationName: r.locationName,
          roleName: r.employee.role,
        })),
      }),
    );
  },
);

// ---------- GET /api/admin/employees/:id -----------------------------------
export const getEmployee = catchAsync(
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

    res.status(200).json(
      ApiResponse.success('Employee retrieved successfully', {
        employee: publicEmployee(employee),
      }),
    );
  },
);

// ---------- PATCH /api/admin/employees/:id ---------------------------------
export const updateEmployee = catchAsync(
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

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const updates = parsed.data;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({
        error: { code: 'NO_UPDATES', message: 'No fields provided to update.' },
      });
      return;
    }

    const [existing] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, param.data.id))
      .limit(1);

    if (!existing) {
      throw new ApiError('Employee not found', 404, true, '', {
        code: 'EMPLOYEE_NOT_FOUND',
      });
    }

    const [updated] = await db
      .update(employees)
      .set({
        ...updates,
      })
      .where(eq(employees.id, existing.id))
      .returning();

    res.status(200).json(
      ApiResponse.success('Employee updated successfully', {
        employee: publicEmployee(updated!),
      }),
    );
  },
);

// ============================================================================
// Shared helpers
// ============================================================================

export function publicEmployee(e: Readonly<typeof employees.$inferSelect>) {
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    employeeCode: e.employeeCode,
    locationId: e.locationId,
    role: e.role,
    jobIds: e.jobIds,
    stationIds: e.stationIds,
    languagePref: e.languagePref,
    status: e.status,
    createdAt: e.createdAt.toISOString(),
    deactivatedAt: e.deactivatedAt ? e.deactivatedAt.toISOString() : null,
  };
}
