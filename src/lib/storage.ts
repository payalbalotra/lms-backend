import {
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import config from '../config/env.ts';

// ============================================================================
// Cloudflare R2 object storage (S3 compatible)
// ============================================================================
// One lazily created client so the app boots without R2 configured; the
// first upload then reports the missing settings instead of crashing.

let client: S3Client | null = null;

/** R2_ENDPOINT if set, otherwise the standard endpoint for R2_ACCOUNT_ID. */
function resolveEndpoint(): string | undefined {
  if (config.r2Endpoint) return config.r2Endpoint;
  if (config.r2AccountId) {
    return `https://${config.r2AccountId}.r2.cloudflarestorage.com`;
  }
  return undefined;
}

/** True when every setting needed to store a file is present. */
export function isStorageConfigured(): boolean {
  return Boolean(
    resolveEndpoint() &&
    config.r2AccessKeyId &&
    config.r2SecretAccessKey &&
    config.r2Bucket,
  );
}

export function getStorageClient(): S3Client {
  if (client) return client;
  const endpoint = resolveEndpoint();
  if (!isStorageConfigured() || !endpoint) {
    throw new Error(
      'Object storage is not configured (need R2_ACCOUNT_ID or R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)',
    );
  }
  client = new S3Client({
    region: 'auto',
    endpoint,
    // Path-style URLs (endpoint/bucket/key) work with R2 and with local
    // S3-compatible servers used in development.
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.r2AccessKeyId!,
      secretAccessKey: config.r2SecretAccessKey!,
    },
  });
  return client;
}

/** Stores `body` under `key` in the configured bucket. */
export async function putObject(
  key: string,
  body: NonNullable<PutObjectCommandInput['Body']>,
  contentType?: string,
): Promise<void> {
  await getStorageClient().send(
    new PutObjectCommand({
      Bucket: config.r2Bucket,
      Key: key,
      Body: body,
      ...(contentType ? { ContentType: contentType } : {}),
    }),
  );
}

/** Public URL of a stored object (R2_PUBLIC_BASE_URL + key). */
export function publicUrlFor(key: string): string {
  const base = (config.r2PublicBaseUrl ?? '').replace(/\/$/, '');
  return `${base}/${key}`;
}
