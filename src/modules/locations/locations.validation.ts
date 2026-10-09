import { z } from 'zod';

export const locationCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const locationPatchSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
