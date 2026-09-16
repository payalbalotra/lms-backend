import type { Request, Response } from 'express';
import { z } from 'zod';
import { handleServiceError } from '../lib/handle-service-error';
import { requestDeleteUpload, requestImageUpload, requestVideoUpload } from '../services/uploads';

const presignInputSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  size: z.number().int().positive(),
});

const deleteInputSchema = z.object({
  url: z.string().url(),
});

// POST /api/admin/uploads/image
// Body: { filename, contentType, size }
// Auth: requireAuth + requireAdmin (mount in routes/index.ts).
// Returns: { uploadUrl, key, publicUrl, expiresIn }
export async function presignImageUpload(
  req: Request,
  res: Response,
): Promise<void> {
  await presignHandler(req, res, requestImageUpload);
}

// POST /api/admin/uploads/video
// Body: { filename, contentType, size }
// Auth: requireAuth + requireAdmin. Mirrors presignImageUpload but for
// video MIME types and a 100 MB cap.
export async function presignVideoUpload(
  req: Request,
  res: Response,
): Promise<void> {
  await presignHandler(req, res, requestVideoUpload);
}

// DELETE /api/admin/uploads?url=...
// Auth: requireAuth + requireAdmin. Body (JSON) or query-string carries the
// public URL of an object uploaded through this service; we delete the
// underlying key. Lifecycle rules catch anything we miss; this is the
// happy-path cleanup when the user clicks Remove in the editor.
export async function deleteUploadedAsset(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.employee) {
    res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
    });
    return;
  }

  // Accept the URL either in the JSON body or in `?url=` — DELETE bodies
  // are awkward in some clients, and the editor's helper just spreads a
  // payload into apiRequest either way.
  const fromBody = deleteInputSchema.safeParse(req.body);
  const fromQuery =
    typeof req.query.url === 'string'
      ? deleteInputSchema.safeParse({ url: req.query.url })
      : null;
  const parsed = fromBody.success ? fromBody : fromQuery;
  if (!parsed || !parsed.success) {
    res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid input',
        details: ((parsed ?? fromBody).error?.issues ?? []).map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }

  try {
    const result = await requestDeleteUpload(parsed.data);
    res.status(200).json(result);
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}

async function presignHandler(
  req: Request,
  res: Response,
  service: (input: { filename: string; contentType: string; size: number }) => Promise<{
    uploadUrl: string;
    key: string;
    publicUrl: string;
    expiresIn: number;
  }>,
): Promise<void> {
  if (!req.employee) {
    res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
    });
    return;
  }

  const parsed = presignInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid input',
        details: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }

  try {
    const result = await service(parsed.data);
    res.status(200).json(result);
  } catch (err) {
    if (!handleServiceError(err, res)) throw err;
  }
}
