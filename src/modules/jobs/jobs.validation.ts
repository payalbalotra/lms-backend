import { z } from 'zod';

export const jobCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  stationIds: z.array(z.string().uuid()).optional().default([]),
});
export const jobPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  stationIds: z.array(z.string().uuid()).optional(),
});
