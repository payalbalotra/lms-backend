import ApiResponse from '../../shared/api-response.ts';
import ApiError from '../../shared/api-error.ts';
import type { Request, Response } from 'express';
import {
  stationCreateSchema,
  stationPatchSchema,
} from './stations.validation.ts';
import { uuidIdParam } from '../../shared/common.validation.ts';
import * as stationsService from './stations.service.ts';
import catchAsync from '../../shared/catch-async.ts';
import { getPaginationParams } from '../../shared/pagination.ts';

export const listStations = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { page, limit, search } = getPaginationParams(req.query);
    const result = await stationsService.listStations(page, limit, search);
    res.status(200).json(
      ApiResponse.success('Stations retrieved successfully', {
        stations: result.items,
        meta: result.meta,
      }),
    );
  },
);

export const createStation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee)
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    const parsed = stationCreateSchema.safeParse(req.body);
    if (!parsed.success) throw parsed.error;
    const station = await stationsService.createStation({ ...parsed.data });
    res
      .status(201)
      .json(ApiResponse.success('Station created successfully', { station }));
  },
);

export const updateStation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee)
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    const param = uuidIdParam.safeParse(req.params);
    if (!param.success)
      throw new ApiError('Invalid station id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    const patch = stationPatchSchema.safeParse(req.body);
    if (!patch.success) throw patch.error;
    const station = await stationsService.updateStation(
      param.data.id,
      patch.data,
    );
    res
      .status(200)
      .json(ApiResponse.success('Station updated successfully', { station }));
  },
);

export const deleteStation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee)
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    const param = uuidIdParam.safeParse(req.params);
    if (!param.success)
      throw new ApiError('Invalid station id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    await stationsService.deleteStation(param.data.id);
    res
      .status(200)
      .json(ApiResponse.success('Station deleted successfully', { ok: true }));
  },
);
