import type { Request, Response } from 'express';
import catchAsync from '../../shared/utils/catchAsync.ts';
import ApiResponse from '../../shared/utils/ApiResponse.ts';
import ApiError from '../../shared/utils/ApiError.ts';
import { createQuizInputSchema } from '../../db/quiz.schema.ts';
import * as quizzesService from '../../services/quiz/quiz.service.ts';

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
    const { id } = req.params;
    const quizId = Array.isArray(id) ? id[0] : id;
    if (!quizId) {
      throw new ApiError('Quiz ID is required', 400);
    }

    const quiz = await quizzesService.getQuiz(quizId);

    res.status(200).json(ApiResponse.success('Quiz fetched', { quiz }));
  },
);

// GET /api/v1/quizzes
export const listQuizzes = catchAsync(
  async (_req: Request, res: Response): Promise<void> => {
    const quizzes = await quizzesService.listQuizzes();

    res
      .status(200)
      .json(ApiResponse.success('Quizzes fetched successfully', { quizzes }));
  },
);
