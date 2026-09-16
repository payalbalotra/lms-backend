import { S3Client } from '@aws-sdk/client-s3';
import { logger } from '../lib/logger';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

let warnedMissingEnv = false;

function warnMissingEnvOnce(): void {
  if (warnedMissingEnv) return;
  warnedMissingEnv = true;
  logger.warn('r2 client not configured - R2_* env vars missing, uploads will fail');
}

// Lazy so dev boots without R2 configured; the warn fires on first use.
let s3: S3Client | null = null;

export function getS3Client(): S3Client {
  if (s3) return s3;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    warnMissingEnvOnce();
    // Throw so callers can map to a 500; the warn above tells the operator.
    throw new Error('R2 client not configured (R2_* env vars missing)');
  }
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return s3;
}

// <folder>/<yyyy>/<mm>/<uuid>.<ext> — month-sharded for cheap future
// per-month lifecycle policies; uuid leaf to avoid collisions.
// `folder` is one of the allow-listed prefixes the upload service passes
// (e.g. 'images', 'videos'); kept short so the key stays under S3's
// 1024-byte limit even with a deep prefix.
export function buildKey(
  folder: 'images' | 'videos',
  _contentType: string,
  originalName: string,
): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = pickExtension(originalName);
  const uuid = crypto.randomUUID();
  return `${folder}/${yyyy}/${mm}/${uuid}${ext}`;
}

function pickExtension(originalName: string): string {
  const dot = originalName.lastIndexOf('.');
  if (dot === -1 || dot === originalName.length - 1) return '';
  const raw = originalName.slice(dot + 1).toLowerCase();
  // Only allow the same extensions the controller whitelists; fall back
  // to empty so the caller enforces the mime allowlist.
  if (/^[a-z0-9]{1,5}$/.test(raw)) return `.${raw}`;
  return '';
}

export function publicUrlFor(key: string): string {
  const base = process.env.R2_PUBLIC_BASE_URL ?? '';
  return `${base.replace(/\/$/, '')}/${key}`;
}