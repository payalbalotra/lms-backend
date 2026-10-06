import { z } from 'zod';
import { categoryTypes } from '../../db/schema.js';

export const categoryCreateSchema = z.object({
  nameEn: z.string().min(1).max(200),
  nameEs: z.string().min(1).max(200),
  categoryType: z.string().min(1).max(100),
  categoryIcon: z.string().min(1).max(100),
});

export const categoryPatchSchema = z.object({
  nameEn: z.string().min(1).max(200).optional(),
  nameEs: z.string().min(1).max(200).optional(),
  categoryType: z.string().min(1).max(100).optional(),
  categoryIcon: z.string().min(1).max(100).optional(),
});
