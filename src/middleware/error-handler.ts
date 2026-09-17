import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

/**
 * Express final error handler.
 *
 * Logs one terse line per failure (no req dump, no full stack, no body).
 * The single err serializer in lib/logger.ts already strips Error stacks,
 * so passing { err } here is safe and yields only message + pgCode.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    // Show only the first failing field for log brevity.
    const first = err.issues[0];
    const where = first?.path?.join('.') ?? 'body';
    logger.warn(`validation failed: ${where} - ${first?.message ?? 'invalid'}`);
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

  // Body parser — request body exceeded the size limit
  if ((err as { type?: string }).type === 'entity.too.large') {
    logger.warn('payload too large');
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
    });
    return;
  }

  // Body parser — malformed JSON
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    logger.warn('malformed json');
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
    });
    return;
  }

  // Postgres SQLSTATE — five-character code (e.g. 23505 unique violation)
  const maybeCode = (err as { code?: unknown }).code;
  if (typeof maybeCode === 'string' && /^[0-9A-Z]{5}$/.test(maybeCode)) {
    logger.error({ err }, `database error (${maybeCode})`);
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'A database error occurred' },
    });
    return;
  }

  // Anything else — generic internal error, full detail in logs only
  logger.error({ err }, 'internal error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}