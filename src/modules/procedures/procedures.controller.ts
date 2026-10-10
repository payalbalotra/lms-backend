import ApiResponse from '../../shared/api-response.ts';
import ApiError from '../../shared/api-error.ts';
import type { Request, Response } from 'express';

import * as proceduresService from './procedures.service.ts';
import { getPaginationParams } from '../../shared/pagination.ts';
import {
  procedureStatuses,
  type ProcedureStatus,
} from '../../db/schema/procedures.schema.ts';
import { createProcedureInputSchema } from './procedures.validation.ts';
import catchAsync from '../../shared/catch-async.ts';
import { z } from 'zod';
import { uuidIdParam } from '../../shared/common.validation.ts';

const updateStationSchema = z.object({
  stationId: z.string().uuid().nullable(),
});

function parseProcedureId(req: Request): string {
  if (!req.params.id) {
    throw new ApiError('Missing procedure id', 400, true, '', {
      code: 'INVALID_INPUT',
    });
  }
  const param = uuidIdParam.safeParse(req.params);
  if (!param.success) {
    throw new ApiError('Invalid procedure id', 400, true, '', {
      code: 'INVALID_INPUT',
    });
  }
  return param.data.id;
}

// ============================================================================
// Procedures
// ============================================================================

// POST /api/admin/library/procedures
export const createProcedure = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const parsed = createProcedureInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const procedure = await proceduresService.createProcedure(parsed.data, {
      employeeId: req.employee.id,
      userId: req.employee.userId,
    });
    res
      .status(201)
      .json(
        ApiResponse.success('Procedure created successfully', { procedure }),
      );
  },
);

// PUT /api/v1/procedures/:id
export const updateProcedure = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const id = parseProcedureId(req);

    const parsed = createProcedureInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const procedure = await proceduresService.updateProcedure(id, parsed.data);
    res
      .status(200)
      .json(
        ApiResponse.success('Procedure updated successfully', { procedure }),
      );
  },
);

// PATCH /api/v1/procedures/:id/station (single stationId string, null clears)
export const updateProcedureStation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }
    const id = parseProcedureId(req);
    const parsed = updateStationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const procedure = await proceduresService.updateProcedureStation(
      id,
      parsed.data.stationId,
    );
    res.status(200).json(
      ApiResponse.success('Procedure station updated successfully', {
        procedure,
      }),
    );
  },
);

// GET /api/v1/procedures/assigned
export const getAssignedProcedures = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const { page, limit, search } = getPaginationParams(req.query);
    const stationIds = req.employee.stationIds || [];

    // UI chips: ?scope=all (default, station + direct) | ?scope=mine
    // (only directly-assigned, even outside the employee's stations).
    const scope = req.query.scope === 'mine' ? 'mine' : 'all';

    // Category chip: ?categoryId=<uuid> (single). Invalid UUID -> 400.
    let categoryIds: string[] | undefined;
    const rawCategory = req.query.categoryId;
    if (typeof rawCategory === 'string' && rawCategory.length > 0) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(rawCategory)) {
        throw new ApiError('Invalid category id', 400, true, '', {
          code: 'INVALID_INPUT',
        });
      }
      categoryIds = [rawCategory];
    }

    // If employee has no stations, they shouldn't see any station-specific procedures.
    // We pass a fake UUID so the IN clause finds nothing.
    const effectiveStationIds =
      stationIds.length > 0
        ? stationIds
        : ['00000000-0000-0000-0000-000000000000'];

    const paginatedResult = await proceduresService.listProcedures(
      {
        status: 'published',
        stationIds: effectiveStationIds,
        assignedEmployeeId: req.employee.id,
        assignedOnly: scope === 'mine',
        categoryIds,
        hideAssignUsers: req.employee.role === 'employee',
        search,
      },
      page,
      limit,
    );

    res.status(200).json(
      ApiResponse.success('Assigned procedures retrieved successfully', {
        procedures: paginatedResult.items,
        meta: paginatedResult.meta,
      }),
    );
  },
);

// GET /api/v1/procedures
export const getAllProcedures = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { page, limit, search } = getPaginationParams(req.query);

    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const paginatedResult = await proceduresService.listProcedures(
      { search },
      page,
      limit,
    );
    res.status(200).json(
      ApiResponse.success('Procedures retrieved successfully', {
        procedures: paginatedResult.items,
        meta: paginatedResult.meta,
      }),
    );
  },
);

// GET /api/v1/procedures/filter
export const filterProcedures = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    // -- status filter --
    const raw = req.query.status;
    let status: ProcedureStatus | undefined;
    if (typeof raw === 'string' && raw.length > 0) {
      if (!procedureStatuses.includes(raw as ProcedureStatus)) {
        res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: 'Invalid status filter',
            details: [
              {
                path: 'status',
                message: `Expected one of ${procedureStatuses.join(', ')}`,
              },
            ],
          },
        });
        return;
      }
      status = raw as ProcedureStatus;
    }

    // -- array filters --
    const parseUuidList = (param: unknown): string[] | undefined => {
      const raw = Array.isArray(param) ? param.join(',') : param;
      if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    };

    const stationIds = parseUuidList(req.query.stationIds);
    const subcategoryIds = parseUuidList(req.query.subcategoryIds);
    const categoryIds = parseUuidList(req.query.categoryIds);

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const validateUuids = (ids: string[] | undefined, name: string) => {
      if (ids && ids.some((id) => !uuidRegex.test(id))) {
        return { error: `${name} must be valid UUIDs` };
      }
      return null;
    };

    for (const [ids, name] of [
      [stationIds, 'stationIds'],
      [subcategoryIds, 'subcategoryIds'],
      [categoryIds, 'categoryIds'],
    ] as const) {
      const err = validateUuids(ids, name);
      if (err) {
        res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: err.error,
          },
        });
        return;
      }
    }

    const { page, limit, search } = getPaginationParams(req.query);

    const paginatedResult = await proceduresService.listProcedures(
      {
        status,
        stationIds,
        subcategoryIds,
        categoryIds,
        search,
      },
      page,
      limit,
    );
    res.status(200).json(
      ApiResponse.success('Filtered procedures retrieved successfully', {
        procedures: paginatedResult.items,
        meta: paginatedResult.meta,
      }),
    );
  },
);

// GET /api/procedures/:slug  (public read â€” any logged-in employee)
export const getProcedure = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const slug = req.params.slug;
    if (typeof slug !== 'string' || slug.length === 0) {
      throw new ApiError('Missing procedure slug', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    const procedure = await proceduresService.getProcedureBySlug(slug);
    if (!procedure) {
      throw new ApiError('Procedure not found', 404, true, '', {
        code: 'NOT_FOUND',
      });
    }
    // Shared details endpoint: super_admin sees everything; employees only
    // see published procedures assigned to one of their stations (or directly).
    let visibleProcedure = procedure;
    if (req.employee.role === 'employee') {
      const stationIds = req.employee.stationIds || [];
      const stationMatch =
        procedure.stationId != null && stationIds.includes(procedure.stationId);
      const directMatch =
        procedure.assignUsers != null &&
        procedure.assignUsers.includes(req.employee.id);
      if (procedure.status !== 'published' || (!stationMatch && !directMatch)) {
        throw new ApiError('Procedure not found', 404, true, '', {
          code: 'NOT_FOUND',
        });
      }
      // Employees learn direct assignment via the list flag, not the full list.
      visibleProcedure = { ...procedure, assignUsers: null };
    }
    res.status(200).json(
      ApiResponse.success('Procedure retrieved successfully', {
        procedure: visibleProcedure,
      }),
    );
  },
);
// POST /api/v1/procedures/:id/archive  (super_admin only)
export const archiveProcedure = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const id = parseProcedureId(req);

    const procedure = await proceduresService.archiveProcedure(id);
    res
      .status(200)
      .json(
        ApiResponse.success('Procedure archived successfully', { procedure }),
      );
  },
);

// POST /api/v1/procedures/:id/unarchive  (super_admin only)
export const unarchiveProcedure = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const id = parseProcedureId(req);

    const procedure = await proceduresService.unarchiveProcedure(id);
    res
      .status(200)
      .json(
        ApiResponse.success('Procedure unarchived successfully', { procedure }),
      );
  },
);
