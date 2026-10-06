import ApiResponse from '../../shared/utils/ApiResponse.ts';
import ApiError from '../../shared/utils/ApiError.ts';
import type { Request, Response } from 'express';
import {
  slugIdParam,
  jobCreateSchema,
  jobPatchSchema,
} from '../../shared/validations/employees.schema.ts';
import * as jobsService from '../../services/job/jobs.service.ts';
import catchAsync from '../../shared/utils/catchAsync.ts';
import type { Role } from '../../db/index.ts';

export const listJobs = catchAsync(
  async (_req: Request, res: Response): Promise<void> => {
    const result = await jobsService.listJobs();
    res
      .status(200)
      .json(
        ApiResponse.success('Jobs retrieved successfully', { jobs: result }),
      );
  },
);

// GET /api/v1/jobs/with-stations?role=<role>
// Used by the employee form: returns jobs for a role, each with their stations.
// Requires auth (any employee), but NOT admin-only.
export const listJobsWithStations = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const role =
      typeof req.query.role === 'string' ? (req.query.role as Role) : undefined;
    const result = await jobsService.listJobsWithStations(role);
    res
      .status(200)
      .json(
        ApiResponse.success('Jobs with stations retrieved', { jobs: result }),
      );
  },
);

// GET /api/v1/jobs/:id/stations
// Returns only the stations linked to a specific job.
// Useful when the frontend fetches stations on-demand per selected job.
export const getJobStations = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const param = slugIdParam.safeParse(req.params);
    if (!param.success) {
      throw new ApiError('Invalid job id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }
    const stationsList = await jobsService.getJobStations(param.data.id);
    res
      .status(200)
      .json(
        ApiResponse.success('Stations retrieved', { stations: stationsList }),
      );
  },
);

export const createJob = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee)
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    const parsed = jobCreateSchema.safeParse(req.body);
    if (!parsed.success) throw parsed.error;
    const job = await jobsService.createJob(parsed.data);
    res
      .status(201)
      .json(ApiResponse.success('Job created successfully', { job }));
  },
);

export const updateJob = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee)
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    const param = slugIdParam.safeParse(req.params);
    if (!param.success)
      throw new ApiError('Invalid job id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    const patch = jobPatchSchema.safeParse(req.body);
    if (!patch.success) throw patch.error;
    const job = await jobsService.updateJob(param.data.id, patch.data);
    res
      .status(200)
      .json(ApiResponse.success('Job updated successfully', { job }));
  },
);

export const deleteJob = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee)
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    const param = slugIdParam.safeParse(req.params);
    if (!param.success)
      throw new ApiError('Invalid job id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    await jobsService.deleteJob(param.data.id);
    res
      .status(200)
      .json(ApiResponse.success('Job deleted successfully', { ok: true }));
  },
);
