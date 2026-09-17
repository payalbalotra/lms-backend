import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}


export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 200
      ? incoming
      : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}