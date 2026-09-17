import type { Request, Response } from 'express';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  // One terse line. No req object — pino-http is gone, so we can't
  // accidentally dump headers / cookies here.
  logger.warn(`route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}