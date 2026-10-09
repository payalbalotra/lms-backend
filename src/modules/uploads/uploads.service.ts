import crypto from 'node:crypto';
import path from 'node:path';
import ApiError from '../../shared/api-error.ts';
import { logger } from '../../config/logger.ts';
import {
  isStorageConfigured,
  publicUrlFor,
  putObject,
} from '../../lib/storage.ts';

export interface UploadedFile {
  key: string;
  publicUrl: string;
}

/** Folder inside the bucket, picked from the file's mime type. */
function folderFor(mimetype: string): 'images' | 'videos' | 'documents' {
  if (mimetype.startsWith('image/')) return 'images';
  if (mimetype.startsWith('video/')) return 'videos';
  return 'documents';
}

/**
 * Lowercase extension of the original file name, limited to letters and
 * digits so the client-supplied name can never inject odd characters into
 * the storage key (e.g. "evil.<svg>" -> "").
 */
function safeExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

export async function uploadFile(file: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}): Promise<UploadedFile> {
  if (!isStorageConfigured()) {
    logger.error('upload rejected: object storage is not configured');
    throw Object.assign(
      new ApiError('File storage is not configured on the server', 503),
      { errorCode: 'STORAGE_NOT_CONFIGURED' },
    );
  }

  const uniqueId = crypto.randomBytes(8).toString('hex');
  const key = `uploads/${folderFor(file.mimetype)}/${uniqueId}${safeExtension(file.originalname)}`;

  try {
    await putObject(key, file.buffer, file.mimetype);
  } catch (err) {
    // The storage service failed or is unreachable: a gateway error, not a
    // bug in this API. Details go to the log, never to the client.
    logger.error({ err, key }, 'upload to object storage failed');
    throw Object.assign(
      new ApiError('File storage is unavailable, please try again', 502),
      { errorCode: 'STORAGE_UNAVAILABLE' },
    );
  }

  return { key, publicUrl: publicUrlFor(key) };
}
