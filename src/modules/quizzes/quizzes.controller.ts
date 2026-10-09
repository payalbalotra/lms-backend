import type { Request, Response } from 'express';
import catchAsync from '../../shared/catch-async.ts';
import ApiResponse from '../../shared/api-response.ts';
import ApiError from '../../shared/api-error.ts';
import { createQuizInputSchema } from './quizzes.validation.ts';
import { uuidIdParam } from '../../shared/common.validation.ts';
import * as quizzesService from './quizzes.service.ts';
import { getPaginationParams } from '../../shared/pagination.ts';

// POST /api/admin/library/quizzes
export const createQuiz = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    const parsed = createQuizInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const quiz = await quizzesService.createQuiz(parsed.data, {
      userId: req.employee.userId,
    });

    res
      .status(201)
      .json(ApiResponse.success('Quiz created successfully', { quiz }));
  },
);

// GET /api/v1/quizzes/:id
export const getQuiz = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const param = uuidIdParam.safeParse(req.params);
    if (!param.success) {
      throw new ApiError('Invalid quiz id', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    const quiz = await quizzesService.getQuiz(param.data.id);

    res.status(200).json(ApiResponse.success('Quiz fetched', { quiz }));
  },
);

// GET /api/v1/quizzes
export const listQuizzes = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { page, limit, search } = getPaginationParams(req.query);
    const quizzes = await quizzesService.listQuizzes(page, limit, search);

    res.status(200).json(
      ApiResponse.success('Quizzes fetched successfully', {
        quizzes: quizzes.items,
        meta: quizzes.meta,
      }),
    );
  },
);
