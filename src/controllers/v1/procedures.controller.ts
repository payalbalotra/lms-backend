import ApiResponse from '../../shared/utils/ApiResponse.ts';
import ApiError from '../../shared/utils/ApiError.ts';
import type { Request, Response } from 'express';

import * as proceduresService from '../../services/procedures/procedures.service.ts';

import {
  procedureStatuses,
  type ProcedureStatus,
} from '../../db/procedure.schema.ts';
import { createProcedureInputSchema } from '../../db/procedure.schema.ts';
import catchAsync from '../../shared/utils/catchAsync.ts';

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

// GET /api/admin/library/procedures
export const listProcedures = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

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

    const procedures = await proceduresService.listProcedures({ status });
    res.status(200).json(
      ApiResponse.success('Procedures retrieved successfully', {
        procedures,
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
    res
      .status(200)
      .json(
        ApiResponse.success('Procedure retrieved successfully', { procedure }),
      );
  },
);
