import { z } from 'zod';

// Values are trimmed here, so services receive clean input.
export const subcategoryCreateSchema = z.object({
  nameEn: z.string().trim().min(1).max(200),
  nameEs: z.string().trim().min(1).max(200),
});

export const subcategoryPatchSchema = z.object({
  nameEn: z.string().trim().min(1).max(200).optional(),
  nameEs: z.string().trim().min(1).max(200).optional(),
});
