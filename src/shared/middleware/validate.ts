import { type RequestHandler } from 'express';
import httpStatus from 'http-status';
import type { ZodError, ZodType } from 'zod';
import ApiError from '../utils/ApiError.ts';

export interface ValidationIssue {
  field: string;
  message: string;
  reason?: string;
}

const toIssues = (error: ZodError): ValidationIssue[] =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || '(body)',
    message: issue.message,
    reason: issue.code,
  }));

const validationError = (error: ZodError): ApiError => {
  const err = new ApiError(
    'Validation error',
    httpStatus.BAD_REQUEST,
    true,
    '',
    toIssues(error),
  );
  err.errorCode = 'VALIDATION_ERROR';
  return err;
};

/**
 * Validates `req.body` and replaces it with the parsed result, so downstream
 * handlers see coerced/trimmed values and never the raw client payload.
 */
export const validate =
  (schema: ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    req.body = result.data;
    next();
  };

/**
 * Express 5 exposes `req.query` as a getter, so the parsed value is published
 * on `res.locals.query` instead of being written back onto the request.
 */
export const validateQuery =
  (schema: ZodType): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    res.locals.query = result.data;
    next();
  };

export const validateParams =
  (schema: ZodType): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    res.locals.params = result.data;
    next();
  };
