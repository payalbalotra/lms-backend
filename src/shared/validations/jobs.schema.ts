import { z } from 'zod';

export const jobCreateSchema = z.object({
  name: z.string().min(1).max(200),
});

export const jobPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});
