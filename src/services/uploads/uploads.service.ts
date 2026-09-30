import ApiError from '../../shared/utils/ApiError.ts';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  buildKey,
  getS3Client,
  publicUrlFor,
  type UploadFolder,
} from '../../shared/utils/r2.ts';

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
// Document imports for the SOP wizard. PDF + DOCX cover the document
// types a manager typically has on hand; JPG/PNG cover recipe photos
// (Gemini is multimodal so we don't need a separate OCR library for
// v1); text covers plain-text or markdown procedures. Mirrors the
// upload-tile copy under admin.library.new.sidebar.aiImportFormats.
const DOCUMENT_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'text/plain',
  'text/markdown',
]);

const MAX_FILENAME = 255;
const MAX_IMAGE_BYTES = Number(process.env.R2_UPLOAD_MAX_BYTES ?? 10485760);
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
// 20 MB matches the wizard's "up to 20 MB" copy and is large enough
// for any reasonable SOP PDF or recipe photo. Tunable via env so ops
// can raise it without a code change.
const MAX_DOCUMENT_BYTES = Number(
  process.env.R2_DOCUMENT_MAX_BYTES ?? 20971520,
);
const TTL_SECONDS = Number(process.env.R2_UPLOAD_TTL_SECONDS ?? 600);
const BUCKET = process.env.R2_BUCKET ?? '';
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');

// Matches keys produced by buildKey: <folder>/<yyyy>/<mm>/<uuid>.<ext>.
// The uuid leaf guards against callers trying to delete arbitrary paths.
const KEY_RE =
  /^(images|videos|documents)\/\d{4}\/\d{2}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-z0-9]{1,5}$/;

export interface PresignedUpload {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresIn: number;
}

export async function requestImageUpload(input: {
  filename: string;
  contentType: string;
  size: number;
}): Promise<PresignedUpload> {
  return presign({
    folder: 'images',
    input,
    mimeAllowlist: IMAGE_MIME,
    maxBytes: MAX_IMAGE_BYTES,
    tooLargeMessage: `Image must be ${MAX_IMAGE_BYTES} bytes or smaller`,
  });
}

export async function requestVideoUpload(input: {
  filename: string;
  contentType: string;
  size: number;
}): Promise<PresignedUpload> {
  return presign({
    folder: 'videos',
    input,
    mimeAllowlist: VIDEO_MIME,
    maxBytes: MAX_VIDEO_BYTES,
    tooLargeMessage: `Video must be ${MAX_VIDEO_BYTES} bytes or smaller`,
  });
}

// Presigned PUT for a manager's SOP source document (PDF/DOCX/recipe
// photo). The wizard uploads here, then POSTs the publicUrl to
// POST /api/admin/library/import which downloads the object from R2
// again, extracts text, and asks Gemini to populate the procedure
// form fields. Documents have their own bucket folder + size cap so
// a misconfigured client can't dump a 200 MB video into the wrong
// path, and so we can apply different lifecycle rules later (keep
// source documents longer than edit images).
export async function requestDocumentUpload(input: {
  filename: string;
  contentType: string;
  size: number;
}): Promise<PresignedUpload> {
  return presign({
    folder: 'documents',
    input,
    mimeAllowlist: DOCUMENT_MIME,
    maxBytes: MAX_DOCUMENT_BYTES,
    tooLargeMessage: `Document must be ${MAX_DOCUMENT_BYTES} bytes or smaller`,
  });
}

async function presign(args: {
  folder: UploadFolder;
  input: { filename: string; contentType: string; size: number };
  mimeAllowlist: Set<string>;
  maxBytes: number;
  tooLargeMessage: string;
}): Promise<PresignedUpload> {
  const { folder, input, mimeAllowlist, maxBytes, tooLargeMessage } = args;
  if (!input.filename || input.filename.length > MAX_FILENAME) {
    throw Object.assign(new ApiError('Filename missing or too long', 400), {
      errorCode: 'UPLOAD_INVALID_FILENAME',
    });
  }
  if (!mimeAllowlist.has(input.contentType)) {
    throw Object.assign(
      new ApiError(`Unsupported ${folder} type: ${input.contentType}`, 400),
      { errorCode: 'UPLOAD_INVALID_MIME' },
    );
  }
  if (
    !Number.isFinite(input.size) ||
    input.size <= 0 ||
    input.size > maxBytes
  ) {
    throw Object.assign(new ApiError(tooLargeMessage, 413), {
      errorCode: 'UPLOAD_TOO_LARGE',
    });
  }
  if (!BUCKET) {
    throw Object.assign(new ApiError('R2 bucket not configured', 500), {
      errorCode: 'UPLOAD_NOT_CONFIGURED',
    });
  }

  const key = buildKey(folder, input.contentType, input.filename);
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: input.contentType,
    ContentLength: input.size,
  });
  const uploadUrl = await getSignedUrl(getS3Client(), cmd, {
    expiresIn: TTL_SECONDS,
  });
  return {
    uploadUrl,
    key,
    publicUrl: publicUrlFor(key),
    expiresIn: TTL_SECONDS,
  };
}

// Hard-deletes a previously-uploaded object. Called when the user clicks
// Remove in the editor so abandoned drafts and replaces-with-different-file
// don't leave orphan storage in the bucket. Lifecycle rules are the safety
// net for uploads we never clean up; this endpoint is the fast happy-path.
//
// Accepts the public URL (not the raw key) so the frontend doesn't need to
// know R2_PUBLIC_BASE_URL — the controller validates the URL belongs to
// OUR bucket and that the resulting key matches the buildKey shape, so a
// caller can't ask us to delete arbitrary paths.
export async function requestDeleteUpload(input: {
  url: string;
}): Promise<{ ok: true }> {
  if (!PUBLIC_BASE) {
    throw Object.assign(new ApiError('R2 bucket not configured', 500), {
      errorCode: 'UPLOAD_NOT_CONFIGURED',
    });
  }
  if (!input.url.startsWith(`${PUBLIC_BASE}/`)) {
    throw Object.assign(new ApiError('URL is not from this bucket', 404), {
      errorCode: 'UPLOAD_NOT_OWNED',
    });
  }
  const key = input.url.slice(PUBLIC_BASE.length + 1);
  if (!KEY_RE.test(key)) {
    throw Object.assign(
      new ApiError('Key is not from a presigned upload', 400),
      { errorCode: 'UPLOAD_INVALID_KEY' },
    );
  }
  if (!BUCKET) {
    throw Object.assign(new ApiError('R2 bucket not configured', 500), {
      errorCode: 'UPLOAD_NOT_CONFIGURED',
    });
  }
  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  return { ok: true };
}

// Downloads a previously-uploaded object as a Buffer. Used by the
// document-extract pipeline to fetch the file the manager just
// uploaded, parse text out of it, and feed an LLM. Restricted to keys
// produced by buildKey() — refuses arbitrary paths the same way
// requestDeleteUpload does, so the import endpoint can't be used as
// a generic object fetcher.
export interface DownloadedObject {
  body: Buffer;
  contentType: string | undefined;
}

export async function downloadUploadedObject(input: {
  url: string;
}): Promise<DownloadedObject> {
  if (!PUBLIC_BASE) {
    throw Object.assign(new ApiError('R2 bucket not configured', 500), {
      errorCode: 'UPLOAD_NOT_CONFIGURED',
    });
  }
  if (!input.url.startsWith(`${PUBLIC_BASE}/`)) {
    throw Object.assign(new ApiError('URL is not from this bucket', 404), {
      errorCode: 'UPLOAD_NOT_OWNED',
    });
  }
  const key = input.url.slice(PUBLIC_BASE.length + 1);
  if (!KEY_RE.test(key)) {
    throw Object.assign(
      new ApiError('Key is not from a presigned upload', 400),
      { errorCode: 'UPLOAD_INVALID_KEY' },
    );
  }
  if (!BUCKET) {
    throw Object.assign(new ApiError('R2 bucket not configured', 500), {
      errorCode: 'UPLOAD_NOT_CONFIGURED',
    });
  }
  const result = await getS3Client().send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  if (!result.Body) {
    throw Object.assign(new ApiError('Object has no body', 500), {
      errorCode: 'UPLOAD_EMPTY',
    });
  }
  const bytes = await result.Body.transformToByteArray();
  return {
    body: Buffer.from(bytes),
    contentType: result.ContentType,
  };
}
