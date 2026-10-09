import ApiResponse from '../../shared/api-response.ts';
import ApiError from '../../shared/api-error.ts';
import type { Request, Response } from 'express';
import {
  locationCreateSchema,
  locationPatchSchema,
} from './locations.validation.ts';
import { uuidIdParam } from '../../shared/common.validation.ts';
import * as locationsService from './locations.service.ts';
import catchAsync from '../../shared/catch-async.ts';
import { getPaginationParams } from '../../shared/pagination.ts';

export const listLocations = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { page, limit, search } = getPaginationParams(req.query);
    const result = await locationsService.listLocations(page, limit, search);
    res.status(200).json(
      ApiResponse.success('Locations retrieved successfully', {
        locations: result.items,
        meta: result.meta,
      }),
    );
  },
);

export const createLocation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee)
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    const parsed = locationCreateSchema.safeParse(req.body);
    if (!parsed.success) throw parsed.error;
    const location = await locationsService.createLocation(parsed.data);
    res
      .status(201)
      .json(ApiResponse.success('Location created successfully', { location }));
  },
);

export const updateLocation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee)
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    const param = uuidIdParam.safeParse(req.params);
    if (!param.success)
      throw new ApiError('Invalid location id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    const patch = locationPatchSchema.safeParse(req.body);
    if (!patch.success) throw patch.error;
    const location = await locationsService.updateLocation(
      param.data.id,
      patch.data,
    );
    res
      .status(200)
      .json(ApiResponse.success('Location updated successfully', { location }));
  },
);

export const deleteLocation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee)
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    const param = uuidIdParam.safeParse(req.params);
    if (!param.success)
      throw new ApiError('Invalid location id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    await locationsService.deleteLocation(param.data.id);
    res
      .status(200)
      .json(ApiResponse.success('Location deleted successfully', { ok: true }));
  },
);
