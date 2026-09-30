import { z } from 'zod';

export const categoryCreateSchema = z.object({
  locationId: z.string().min(1),
  slug: z.string().min(1).max(80),
  nameEn: z.string().min(1).max(200),
  nameEs: z.string().min(1).max(200),
});

export const categoryPatchSchema = z.object({
  nameEn: z.string().min(1).max(200).optional(),
  nameEs: z.string().min(1).max(200).optional(),
  isArchived: z.boolean().optional(),
});
