import { z } from 'zod';

/**
 * Any 8-4-4-4-12 hex id, in either case. Postgres accepts all of these for a
 * `uuid` column, so validating this shape up front turns "invalid input
 * syntax for type uuid" (a 500) into a clean 400.
 */
export const uuidString = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Must be a valid UUID',
  );

/** `req.params` shape for routes with a single `:id` uuid segment. */
export const uuidIdParam = z.object({ id: uuidString });
