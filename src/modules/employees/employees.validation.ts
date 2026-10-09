import { z } from 'zod';
import { ROLES } from '../../db/schema/employees.schema.ts';
import { uuidString } from '../../shared/common.validation.ts';

export const roleEnum = z.enum(ROLES);
export const statusEnum = z.enum(['pending', 'active', 'deactivated', 'all']);

// A list of uuids, lowercased and de-duplicated, so [a, a] is stored (and
// validated against the table) as [a].
const uuidList = z
  .array(uuidString)
  .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]);

const employeeFields = {
  name: z.string().trim().min(1).max(120),
  email: z.string().email().toLowerCase(),
  locationId: uuidString,
  role: roleEnum.default('employee'),
  jobIds: uuidList.optional().default([]),
  stationIds: uuidList.optional().default([]),
  languagePref: z.enum(['en', 'es']).optional().default('en'),
};

export const createSchema = z.object({
  ...employeeFields,
  employeeCode: z
    .string()
    .trim()
    .length(6, 'Employee code must be exactly 6 characters')
    .nullable()
    .optional(),
  status: statusEnum.exclude(['all']).optional().default('pending'),
});

// No default for status here: an edit that does not send a status must keep
// the current one (a default of 'pending' would lock active employees out).
export const updateSchema = z.object({
  ...employeeFields,
  status: statusEnum.exclude(['all']).optional(),
});
