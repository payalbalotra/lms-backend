import { z } from 'zod';

export const stationCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const stationPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});
