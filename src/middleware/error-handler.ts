import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';


export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const log = req.log ?? console;

  if (err instanceof ZodError) {
    log.warn({ issues: err.issues }, 'validation error');
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }

  // 2. Body parser — request body exceeded the size limit
  if ((err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
    });
    return;
  }

  // 3. Body parser — malformed JSON
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
    });
    return;
  }

  // 4. Postgres SQLSTATE — five-character code (e.g. 23505 unique violation)
  const maybeCode = (err as { code?: unknown }).code;
  if (typeof maybeCode === 'string' && /^[0-9A-Z]{5}$/.test(maybeCode)) {
    log.error({ pgCode: maybeCode, err }, 'database error');
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'A database error occurred' },
    });
    return;
  }

  // 5. Anything else — generic internal error, full detail in logs only
  log.error({ err }, 'internal error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}