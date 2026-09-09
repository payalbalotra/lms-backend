import type { Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response): void {
  req.log?.warn({ method: req.method, path: req.path }, 'route not found');
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}