import { z } from 'zod';

export const presignInputSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  size: z.number().int().positive(),
});

export const deleteInputSchema = z.object({
  url: z.string().url(),
});
