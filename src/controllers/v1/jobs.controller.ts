import ApiResponse from '../../shared/utils/ApiResponse.ts';
import ApiError from '../../shared/utils/ApiError.ts';
import type { Request, Response } from 'express';
import {
  jobCreateSchema,
  jobPatchSchema,
} from '../../shared/validations/jobs.schema.ts';
import * as jobService from '../../services/job/job.service.ts';
import catchAsync from '../../shared/utils/catchAsync.ts';

export const listJobs = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const jobs = await jobService.getJobs();
    res
      .status(200)
      .json(ApiResponse.success('Jobs retrieved successfully', { jobs }));
  },
);

export const createJob = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const parsed = jobCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const job = await jobService.createJob(parsed.data);
    res
      .status(201)
      .json(ApiResponse.success('Job created successfully', { job }));
  },
);

export const updateJob = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new ApiError('Missing job id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    const parsed = jobPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const job = await jobService.updateJob(id, parsed.data);
    res
      .status(200)
      .json(ApiResponse.success('Job updated successfully', { job }));
  },
);

export const deleteJob = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new ApiError('Missing job id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    await jobService.deleteJob(id);
    res.status(200).json(ApiResponse.success('Job deleted successfully', null));
  },
);
