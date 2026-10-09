import express, { type Router } from 'express';
import { createQuiz, getQuiz, listQuizzes } from './quizzes.controller.ts';
import { requireAuth } from '../../middleware/require-auth.ts';
import { requireRoles } from '../../middleware/require-roles.ts';

const quizRoute: Router = express.Router();

// Public read routes (any logged-in employee)
quizRoute.get('/', requireAuth, listQuizzes);
quizRoute.get('/:id', requireAuth, getQuiz);

// Admin routes
quizRoute.post('/', requireAuth, requireRoles(['super_admin']), createQuiz);

export default quizRoute;
