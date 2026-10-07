import dotenv from 'dotenv';
dotenv.config({ path: 'development.env' });
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from '../src/shared/utils/r2.ts';

async function run() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12" viewBox="0 0 16 8" preserveAspectRatio="none"><path d="M0 0V2h2V4h2V6h2V8h4V6h2V4h2V2h2V0z" fill="#C24A30"/></svg>`;

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: 'assets/zigzag.svg',
    Body: Buffer.from(svg),
    ContentType: 'image/svg+xml',
    ACL: 'public-read',
  });

  try {
    const s3 = getS3Client();
    await s3.send(command);
    console.log('Successfully uploaded zigzag.svg to R2');
    console.log(`URL: ${process.env.R2_PUBLIC_BASE_URL}/assets/zigzag.svg`);
  } catch (error) {
    console.error('Error uploading:', error);
  }
}

run();
