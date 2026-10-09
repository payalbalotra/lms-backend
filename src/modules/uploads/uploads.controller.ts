import ApiResponse from '../../shared/api-response.ts';
import ApiError from '../../shared/api-error.ts';
import type { Request, Response } from 'express';
import catchAsync from '../../shared/catch-async.ts';
import { uploadFile } from './uploads.service.ts';

// POST /api/v1/uploads  (multipart/form-data, one file in the "file" field)
export const directUpload = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.employee) {
      throw new ApiError('Not authenticated', 401, true, '', {
        code: 'UNAUTHENTICATED',
      });
    }

    if (!req.file) {
      throw new ApiError('No file provided', 400, true, '', {
        code: 'INVALID_INPUT',
      });
    }

    const { key, publicUrl } = await uploadFile(req.file);

    res.status(200).json(
      ApiResponse.success('File uploaded successfully', {
        data: { key, publicUrl },
      }),
    );
  },
);
