import { z } from 'zod';

export const importInputSchema = z.object({
  publicUrl: z.string().min(1),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  procedureType: z.enum(['recipe', 'station', 'cleaning', 'general']),
});
