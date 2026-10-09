import ApiResponse from '../../shared/api-response.ts';
import ApiError from '../../shared/api-error.ts';
import type { Request, Response } from 'express';
import {
  statusEnum,
  createSchema,
  updateSchema,
} from './employees.validation.ts';
import { uuidIdParam } from '../../shared/common.validation.ts';
import {
  getPaginationParams,
  formatPaginatedResult,
} from '../../shared/pagination.ts';
import { publicEmployee } from './employees.mapper.ts';
import * as employeeService from './employees.service.ts';

import catchAsync from '../../shared/catch-async.ts';

// ============================================================================
// Helpers
// ============================================================================

function requireAdmin(req: Request) {
  if (!req.employee) {
    throw new ApiError('Not authenticated', 401, true, '', {
      code: 'UNAUTHENTICATED',
    });
  }
  return req.employee;
}

function parseEmployeeId(req: Request): string {
  const param = uuidIdParam.safeParse(req.params);
  if (!param.success) {
    throw new ApiError('Invalid employee id', 400, true, '', {
      code: 'INVALID_INPUT',
    });
  }
  return param.data.id;
}

// Some conflicts keep the older { error: { code, message } } body.
function sendConflict(
  res: Response,
  conflict: { code: string; message: string },
): void {
  res.status(409).json({ error: conflict });
}

// ============================================================================
// Employees CRUD
// ============================================================================

// ---------- POST /api/v1/employees -----------------------------------------
export const createEmployee = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const admin = requireAdmin(req);

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const { employee: row } = await employeeService.createEmployeeTransaction(
      parsed.data,
      admin.id,
    );

    // Send magic link invite email - Better Auth handles token generation.
    const inviteUrl = await employeeService.sendInviteMagicLink({
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

// ---------- POST /api/v1/employees/:id/invites -----------------------------
export const resendInvite = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    requireAdmin(req);
    const result = await employeeService.resendInvite(parseEmployeeId(req));
    if ('conflict' in result) return sendConflict(res, result.conflict);

    res.status(200).json(
      ApiResponse.success('Invite resent successfully', {
        inviteUrl: result.inviteUrl,
      }),
    );
  },
);

// ---------- POST /api/v1/employees/:id/deactivate --------------------------
export const deactivate = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const result = await employeeService.deactivateEmployee(
      parseEmployeeId(req),
    );
    if ('conflict' in result) return sendConflict(res, result.conflict);

    res.status(200).json(
      ApiResponse.success('Employee deactivated successfully', {
        employee: publicEmployee(result.employee),
      }),
    );
  },
);

// ---------- POST /api/v1/employees/:id/reactivate --------------------------
export const reactivate = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const result = await employeeService.reactivateEmployee(
      parseEmployeeId(req),
    );
    if ('conflict' in result) return sendConflict(res, result.conflict);

    res.status(200).json(
      ApiResponse.success('Employee reactivated successfully', {
        employee: publicEmployee(result.employee),
      }),
    );
  },
);

// ---------- GET /api/v1/employees?status=... -------------------------------
export const listEmployees = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { page, limit, offset, search } = getPaginationParams(req.query);
    const q = statusEnum.safeParse(req.query.status ?? 'all');
    const status = q.success ? q.data : 'all';

    const { rows, total } = await employeeService.listEmployees({
      limit,
      offset,
      search,
      status,
    });

    const mappedEmployees = rows.map((r) => ({
      ...publicEmployee(r.employee),
      locationName: r.locationName,
      roleName: r.employee.role,
    }));

    res.status(200).json(
      ApiResponse.success('Employees retrieved successfully', {
        employees: mappedEmployees,
        meta: formatPaginatedResult(mappedEmployees, total, page, limit).meta,
      }),
    );
  },
);

// ---------- GET /api/v1/employees/:id --------------------------------------
export const getEmployee = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const employee = await employeeService.getEmployee(parseEmployeeId(req));

    res.status(200).json(
      ApiResponse.success('Employee retrieved successfully', {
        employee: publicEmployee(employee),
      }),
    );
  },
);

// ---------- PUT /api/v1/employees/:id --------------------------------------
export const updateEmployee = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const admin = requireAdmin(req);
    const id = parseEmployeeId(req);

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const { employee: updated } =
      await employeeService.updateEmployeeTransaction(
        id,
        parsed.data,
        admin.id,
      );

    res.status(200).json(
      ApiResponse.success('Employee updated successfully', {
        employee: publicEmployee(updated),
      }),
    );
  },
);
