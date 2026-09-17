import type { Response } from 'express';
import { ServiceError } from '../services/errors';

// Translate ServiceError throws from the service layer into a JSON error
// response. Returns true if handled, false if the caller should re-throw.
//
// Usage in a controller:
//   try { ... } catch (err) {
//     if (handleServiceError(err, res)) return;
//     throw err;
//   }
export function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof ServiceError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return true;
  }
  return false;
}