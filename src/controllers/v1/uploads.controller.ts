import ApiResponse from '../../shared/utils/ApiResponse.ts';
import ApiError from '../../shared/utils/ApiError.ts';
import type { Request, Response } from 'express';
import catchAsync from '../../shared/utils/catchAsync.ts';
import {
  presignInputSchema,
  deleteInputSchema,
} from '../../shared/validations/uploads.schema.ts';
import {
  requestDeleteUpload,
  requestDocumentUpload,
  requestImageUpload,
  requestVideoUpload,
} from '../../services/uploads/uploads.service.ts';

// POST /api/admin/uploads/image
export const presignImageUpload = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    await presignHandler(req, res, requestImageUpload);
  },
);

// POST /api/admin/uploads/video
export const presignVideoUpload = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    await presignHandler(req, res, requestVideoUpload);
  },
);

// POST /api/admin/uploads/document
export const presignDocumentUpload = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    await presignHandler(req, res, requestDocumentUpload);
  },
);

// DELETE /api/admin/uploads
export const deleteUploadedAsset = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

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

    const result = await requestDeleteUpload(parsed.data);
    res.status(200).json(
      ApiResponse.success('Uploaded Asset deleted successfully', {
        data: result,
      }),
    );
  },
);

async function presignHandler(
  req: Request,
  res: Response,
  service: (input: {
    filename: string;
    contentType: string;
    size: number;
  }) => Promise<{
    uploadUrl: string;
    key: string;
    publicUrl: string;
    expiresIn: number;
  }>,
): Promise<void> {
  if (!req.employee) {
    throw new ApiError('Not authenticated', 401, true, '', {
      code: 'UNAUTHENTICATED',
    });
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

  const result = await service(parsed.data);
  res
    .status(200)
    .json(ApiResponse.success('URL generated successfully', { data: result }));
}
