type ErrorDetails =
  | Record<string, string[]>
  | { field: string; message: string; reason?: string }[]
  | Record<string, unknown>;

class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;
  errorCode?: string;
  /** Optional machine-readable payload (e.g. field-level validation issues). */
  details?: ErrorDetails;
  constructor(
    message: string,
    statusCode = 500,
    isOperational = true,
    stack = '',
    details?: ErrorDetails,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if (details !== undefined) {
      this.details = details;
    }
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export default ApiError;
