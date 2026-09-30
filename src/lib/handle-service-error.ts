import type { Response } from 'express';
import ApiError from '../shared/utils/ApiError.ts';

// Translate ApiError throws from the service layer into a JSON error
// response. Returns true if handled, false if the caller should re-throw.
//
// Usage in a controller:
//   try { ... } catch (err) {
//     if (handleServiceError(err, res)) return;
//     throw err;
//   }
export function handleServiceError(err: unknown, res: Response): boolean {
  // Handle ApiError from the shared services
  if (err instanceof ApiError && err.isOperational) {
    res.status(err.statusCode).json({
      error: {
        code: err.errorCode || 'INTERNAL_ERROR',
        message: err.message,
        details: err.details,
      },
    });
    return true;
  }
  return false;
}
