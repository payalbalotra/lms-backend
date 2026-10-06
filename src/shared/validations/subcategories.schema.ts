import { z } from 'zod';

export const subcategoryCreateSchema = z.object({
  nameEn: z.string().min(1).max(200),
  nameEs: z.string().min(1).max(200),
});

export const subcategoryPatchSchema = z.object({
  nameEn: z.string().min(1).max(200).optional(),
  nameEs: z.string().min(1).max(200).optional(),
});
