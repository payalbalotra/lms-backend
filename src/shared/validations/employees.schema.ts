import { z } from 'zod';

export const clearanceEnum = z.enum([
  'general',
  'station',
  'confidential',
  'master',
]);
export const statusEnum = z.enum(['pending', 'active', 'deactivated', 'all']);

export const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().toLowerCase().optional(),
  locationId: z.string().min(1).max(64),
  roleId: z.string().min(1).max(64),
  jobIds: z.array(z.string().min(1).max(64)).optional().default([]),
  stationIds: z.array(z.string().min(1).max(64)).optional().default([]),
  employeeCode: z
    .string()
    .trim()
    .length(6, 'Employee code must be exactly 6 characters')
    .nullable()
    .optional(),
  languagePref: z.enum(['en', 'es']).optional().default('en'),
});

export const idParam = z.object({ id: z.string().uuid() });

// Slug ids for stations / roles / locations — lowercase, digits, dashes, 1-64 chars.
// Matches the seeded values (e.g. \`loc-main\`, \`role-general\`, \`stn-hot-line\`).
export const slugIdParam = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
});

export const stationCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const stationPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

export const roleCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const rolePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

export const locationCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const locationPatchSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
