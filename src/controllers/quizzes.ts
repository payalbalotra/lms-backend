import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createQuizInputSchema,
  updateQuizInputSchema,
} from '../services/quiz-schema';
import * as quizzesService from '../services/quizzes';
import { handleServiceError } from '../lib/handle-service-error';

// requireAuth + requireAdmin populate req.employee before these run. See
// the matching note in controllers/library.ts.

function actorId(req: Request): string {
  if (!req.employee) {
    throw new Error('actorId called without req.employee — middleware misconfigured');
  }
  return req.employee.id;
}

function invalidInput(
  res: Response,
  issues: z.ZodError['issues'],
): void {
  res.status(400).json({
    error: {
      code: 'INVALID_INPUT',
      message: 'Invalid input',
      details: issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    },
  });
}

// ===========================================================================
// Admin CRUD — mounted at /api/admin/quizzes (requireAuth + requireAdmin)
// ===========================================================================

// ---------- POST /api/admin/quizzes -----------------------------------------
//
// Body: { questions, attached? }. The wizard calls this when the manager
// reaches the quiz step to materialise a Quiz row, then stamps the
// returned id onto `Procedure.quizId`. Auth: admin.
export async function createQuizAdmin(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = createQuizInputSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
    return;
  }
  try {
    const quiz = await quizzesService.createQuiz(parsed.data);
    void actorId(req); // touch the actor — middleware sanity-check on each request
    res.status(201).json({ quiz });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- GET /api/admin/quizzes ------------------------------------------
//
// Returns every quiz in the centralised table, newest-first. The wizard's
// "pick an existing quiz" picker needs the full list. No pagination yet —
// quiz count is small (one per procedure), no need to optimise.
export async function listQuizzesAdmin(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const quizzes = await quizzesService.listQuizzes();
    res.status(200).json({ quizzes });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- GET /api/admin/quizzes/:id --------------------------------------
//
// Auth: admin. Single-quiz read for the admin picker preview / read summary.
export async function getQuizAdmin(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Missing quiz id' },
    });
    return;
  }
  try {
    const quiz = await quizzesService.getQuizById(id);
    if (!quiz) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Quiz not found' },
      });
      return;
    }
    res.status(200).json({ quiz });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ---------- PATCH /api/admin/quizzes/:id -------------------------------------
//
// Body: any of { questions?, attached? }. 400 on empty patch, 404 on unknown
// id. The wizard doesn't call this today; reserved for the future edit-quiz
// surface.
export async function updateQuizAdmin(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Missing quiz id' },
    });
    return;
  }
  const parsed = updateQuizInputSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidInput(res, parsed.error.issues);
    return;
  }
  try {
    const quiz = await quizzesService.updateQuiz(id, parsed.data);
    res.status(200).json({ quiz });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

// ===========================================================================
// Public read — mounted at /api/quizzes (requireAuth only — open to any
// logged-in employee). The cook-side procedure reader resolves
// `procedure.quizId` against this endpoint to render the quiz block.
//
// We do NOT add a per-quiz ACL: the upstream access check on the procedure
// already gates whether the cook sees the row. Permission to read a quiz
// follows from permission to read the procedure that owns it.
// ===========================================================================

export async function getQuizPublic(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Missing quiz id' },
    });
    return;
  }
  try {
    const quiz = await quizzesService.getQuizById(id);
    if (!quiz) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Quiz not found' },
      });
      return;
    }
    res.status(200).json({ quiz });
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}
