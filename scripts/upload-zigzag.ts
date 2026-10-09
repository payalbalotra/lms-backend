import dotenv from 'dotenv';
dotenv.config({ path: 'development.env' });
import { publicUrlFor, putObject } from '../src/lib/storage.ts';

// Uploads the decorative zigzag SVG used by the frontend to R2. Public access
// comes from the bucket's public URL, so no per-object ACL is needed.
async function run() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12" viewBox="0 0 16 8" preserveAspectRatio="none"><path d="M0 0V2h2V4h2V6h2V8h4V6h2V4h2V2h2V0z" fill="#C24A30"/></svg>`;
  const key = 'assets/zigzag.svg';

  try {
    await putObject(key, Buffer.from(svg), 'image/svg+xml');
    console.log('Successfully uploaded zigzag.svg to R2');
    console.log(`URL: ${publicUrlFor(key)}`);
  } catch (error) {
    console.error('Error uploading:', error);
    process.exitCode = 1;
  }
}

run();
