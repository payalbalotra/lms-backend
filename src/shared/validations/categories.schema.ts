import { z } from 'zod';
import { categoryTypes } from '../../db/schema.js';

export const categoryCreateSchema = z.object({
  nameEn: z.string().min(1).max(200),
  nameEs: z.string().min(1).max(200),
  categoryType: z.enum(categoryTypes),
  categoryIcon: z.string().optional(),
});

export const categoryPatchSchema = z.object({
  nameEn: z.string().min(1).max(200).optional(),
  nameEs: z.string().min(1).max(200).optional(),
  categoryType: z.enum(categoryTypes).optional(),
  categoryIcon: z.string().optional(),
});

export const subcategoryCreateSchema = z.object({
  nameEn: z.string().min(1).max(200),
  nameEs: z.string().min(1).max(200),
  subcategoryIcon: z.string().optional(),
});

export const subcategoryPatchSchema = z.object({
  nameEn: z.string().min(1).max(200).optional(),
  nameEs: z.string().min(1).max(200).optional(),
  subcategoryIcon: z.string().optional(),
});
