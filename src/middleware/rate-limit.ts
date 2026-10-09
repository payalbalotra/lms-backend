import rateLimit from 'express-rate-limit';
import httpStatus from 'http-status';
import ApiError from '../shared/api-error.ts';
import config from '../config/env.ts';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const createLimiter = (options: {
  limit: number;
  windowMs?: number;
  skipSuccessfulRequests?: boolean;
  message?: string;
}) =>
  rateLimit({
    windowMs: options.windowMs ?? FIFTEEN_MINUTES,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    skip: () => config.env === 'test',
    // Route the rejection through the shared error pipeline so the response
    // shape matches every other error the API emits.
    handler: (_req, _res, next) => {
      next(
        new ApiError(
          options.message ?? 'Too many requests, please try again later.',
          httpStatus.TOO_MANY_REQUESTS,
        ),
      );
    },
  });
