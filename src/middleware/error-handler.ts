import { type Request, type Response, type NextFunction } from 'express';
import ApiError from '../shared/api-error.ts';
import httpStatus from 'http-status';
import config from '../config/env.ts';
import * as Sentry from '@sentry/node';
import { logger } from '../config/logger.ts';
import multer from 'multer';
import { ZodError } from 'zod';

interface ErrorLike {
  statusCode?: number;
  message?: string;
  stack?: string;
}

const getErrorCode = (statusCode: number): string => {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 429:
      return 'TOO_MANY_REQUESTS';
    default:
      return 'INTERNAL_ERROR';
  }
};

/**
 * Postgres SQLSTATE of a database error. Drizzle wraps driver errors in a
 * DrizzleQueryError and keeps the original on `cause`, so look there too.
 */
const getPgCode = (err: unknown): string | undefined => {
  for (const e of [err, (err as { cause?: unknown })?.cause]) {
    const code = (e as { code?: unknown })?.code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
};

/** SQLSTATEs caused by bad client input, mapped to a 4xx response. */
const PG_CLIENT_ERRORS: Record<
  string,
  { status: number; code: string; message: string }
> = {
  '22P02': { status: 400, code: 'INVALID_INPUT', message: 'Invalid input' },
  '23503': {
    status: 409,
    code: 'CONFLICT',
    message: 'This record is referenced by, or references, other data.',
  },
  '23505': {
    status: 409,
    code: 'CONFLICT',
    message: 'A record with these values already exists.',
  },
};

const errorConverter = (
  err: Error | ErrorLike,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let error: Error | ApiError =
    err instanceof Error ? err : new Error(String(err));
  Sentry.captureException(error);

  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path?.join('.') ?? 'body';
    logger.warn(`validation failed: ${where} - ${first?.message ?? 'invalid'}`);

    const details = err.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));

    error = new ApiError(
      'Invalid input',
      httpStatus.BAD_REQUEST,
      true,
      err.stack,
    );
    (error as ApiError).errorCode = 'VALIDATION_ERROR';
    (error as ApiError).details = details;
  } else if ((err as { type?: string }).type === 'entity.too.large') {
    logger.warn('payload too large');
    error = new ApiError(
      'Request body too large',
      httpStatus.REQUEST_ENTITY_TOO_LARGE,
      true,
      err.stack,
    );
    (error as ApiError).errorCode = 'PAYLOAD_TOO_LARGE';
  } else if ((err as { type?: string }).type === 'entity.parse.failed') {
    logger.warn('malformed json');
    error = new ApiError(
      'Request body is not valid JSON',
      httpStatus.BAD_REQUEST,
      true,
      err.stack,
    );
    (error as ApiError).errorCode = 'INVALID_JSON';
  } else if (getPgCode(err)) {
    const pgCode = getPgCode(err)!;
    const known = PG_CLIENT_ERRORS[pgCode];
    if (known) {
      // Bad input that reached the database (e.g. a non-uuid id). This is a
      // client error, not a server fault. Route-level validation should catch
      // these first; this is the safety net.
      logger.warn(`database rejected input (${pgCode})`);
      error = new ApiError(known.message, known.status, true, err.stack);
      (error as ApiError).errorCode = known.code;
    } else {
      logger.error({ err }, `database error (${pgCode})`);
      error = new ApiError(
        'A database error occurred',
        httpStatus.INTERNAL_SERVER_ERROR,
        false,
        err.stack,
      );
      (error as ApiError).errorCode = 'DATABASE_ERROR';
    }
  } else if (error.name === 'MulterError') {
    const multerError = error as multer.MulterError;
    if (multerError.code === 'LIMIT_UNEXPECTED_FILE') {
      // A file arrived in an unexpected field, or more files than allowed.
      error = new ApiError(
        'Send exactly one file, in the "file" field',
        httpStatus.BAD_REQUEST,
      );
    } else if (multerError.code === 'LIMIT_FILE_SIZE') {
      const maxMb =
        Math.round((config.r2UploadMaxBytes / 1024 / 1024) * 10) / 10;
      error = new ApiError(
        `File size cannot exceed ${maxMb}MB`,
        httpStatus.BAD_REQUEST,
      );
    } else {
      error = new ApiError(multerError.message, httpStatus.BAD_REQUEST);
    }
    (error as ApiError).errorCode = 'VALIDATION_ERROR';
  } else if (!(error instanceof ApiError)) {
    const rawError = error as ErrorLike;
    const statusCode: number =
      typeof rawError.statusCode === 'number'
        ? rawError.statusCode
        : httpStatus.INTERNAL_SERVER_ERROR;
    const message: string =
      (typeof rawError.message === 'string' ? rawError.message : '') ||
      (httpStatus as Record<number, string | undefined>)[statusCode] ||
      'Internal Server Error';
    const stack = typeof rawError.stack === 'string' ? rawError.stack : '';
    error = new ApiError(message, statusCode, false, stack);
  }
  next(error);
};

const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
) => {
  let { statusCode, message } = err;

  if (config.env === 'production' && !err.isOperational) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = httpStatus[httpStatus.INTERNAL_SERVER_ERROR];
  }
  Sentry.captureException(err);

  res.locals.errorMessage = err.message;

  const responseCode = err.errorCode || getErrorCode(statusCode);

  const response = {
    success: false,
    code: responseCode,
    message,
    // Array details (e.g. Zod field-level issues) are nested under `errors`.
    // Plain-object details (e.g. { emailVerified: false }) are spread at the
    // root so the frontend can read them directly (e.g. response.emailVerified).
    ...(Array.isArray(err.details)
      ? { errors: err.details }
      : err.details !== undefined && err.details),
  };

  if (config.env === 'development') {
    logger.error(err);
  }

  res.status(statusCode).send(response);
};

export { errorConverter, errorHandler };
