import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { s3 } from './S3Client.ts';
import config from '../../config/index.ts';
import crypto from 'crypto';
import path from 'path';

export const Upload = async (
  key: string,
  body: NonNullable<PutObjectCommandInput['Body']>,
  contentType?: string,
) => {
  // Upload a file
  const response = await s3.send(
    new PutObjectCommand({
      Bucket: config.r2Bucket,
      Key: key,
      Body: body,
      ...(contentType ? { ContentType: contentType } : {}),
    }),
  );
  return response;
};

export const Download = async (key: string) => {
  // Download a file
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: config.r2Bucket,
      Key: key,
    }),
  );
  if (!response.Body) {
    throw new Error(`No body returned for key: ${key}`);
  }
  const content = await response.Body.transformToString();
  return content;
};

export const DownloadBuffer = async (key: string): Promise<Buffer> => {
  // Download a file as a raw Buffer (needed for binary data like images)
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: config.r2Bucket,
      Key: key,
    }),
  );
  if (!response.Body) {
    throw new Error(`No body returned for key: ${key}`);
  }
  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
};

export const ListFiles = async (prefix?: string) => {
  // List objects
  const response = await s3.send(
    new ListObjectsV2Command({ Bucket: config.r2Bucket, Prefix: prefix }),
  );
  return response.Contents ?? [];
};

export const genericUpload = async (
  folder: string,
  filename: string,
  buffer: Buffer,
  contentType: string = 'image/png',
) => {
  // Sanitize folder to avoid path traversal, but allow slashes for nested folders
  const safeFolder = folder
    .replace(/[^a-zA-Z0-9_/-]/g, '')
    .replace(/\/+/g, '/') // replace multiple slashes with a single one
    .replace(/^\/|\/$/g, ''); // remove leading and trailing slashes
  const uniqueId = crypto.randomBytes(8).toString('hex'); // 16-character random hex string
  // Discard the original filename entirely — only keep the extension.
  // This prevents dirty or malicious filenames (e.g. "../../passwd") from
  // polluting R2 bucket keys.
  const ext = path
    .extname(filename)
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '');
  const safeFilename = ext ? `${uniqueId}${ext}` : uniqueId;
  const key = safeFolder
    ? `uploads/${safeFolder}/${safeFilename}`
    : `uploads/${safeFilename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.r2Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return `/${key}`;
};
