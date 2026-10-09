// ============================================================================
// Email header assets
//
//   npx tsx scripts/upload-email-assets.ts              upload to R2
//   npx tsx scripts/upload-email-assets.ts --out f.png  write locally instead
//
// Email clients (Gmail, Outlook) do not render SVG or data: URI images, so the
// zigzag edge under the email header is a hosted PNG. Same shape and colour as
// the app's zigzag.svg (16x8 stepped tooth drawn at 24x12), rendered at 2x for
// sharp display on high-density screens.
// ============================================================================

import dotenv from 'dotenv';
dotenv.config({ path: 'development.env' });
import fs from 'node:fs';
import zlib from 'node:zlib';
import { publicUrlFor, putObject } from '../src/lib/storage.ts';

export const EMAIL_ZIGZAG_KEY = 'assets/email/header-zigzag.png';

const COLOR = [0xc2, 0x4a, 0x30]; // #C24A30, the header colour
const SCALE = 3; // 16x8 design units -> 48x24 px tile (24x12 shown at 2x)
const WIDTH = 1040; // shown at 520px, the email width
const HEIGHT = 8 * SCALE;

// Tooth depth per 2-unit column of the 16-unit tile (from zigzag.svg).
const STEPS = [2, 4, 6, 8, 8, 6, 4, 2];

function isFilled(x: number, y: number): boolean {
  const unitX = (x / SCALE) % 16;
  const depth = STEPS[Math.floor(unitX / 2)]!;
  return y / SCALE < depth;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA PNG: teeth in the header colour, transparent elsewhere. */
export function renderZigzagPng(): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < HEIGHT; y++) {
    const row = Buffer.alloc(1 + WIDTH * 4); // leading 0 = no filter
    for (let x = 0; x < WIDTH; x++) {
      if (!isFilled(x, y)) continue;
      row.set([...COLOR, 0xff], 1 + x * 4);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit, RGBA, deflate, no filter, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function run(): Promise<void> {
  const png = renderZigzagPng();
  const outIndex = process.argv.indexOf('--out');
  if (outIndex !== -1) {
    const file = process.argv[outIndex + 1];
    if (!file) throw new Error('--out needs a file path');
    fs.writeFileSync(file, png);
    console.log(`Wrote ${png.length} bytes to ${file}`);
    return;
  }
  await putObject(EMAIL_ZIGZAG_KEY, png, 'image/png');
  console.log(`Uploaded ${EMAIL_ZIGZAG_KEY}`);
  console.log(`URL: ${publicUrlFor(EMAIL_ZIGZAG_KEY)}`);
}

run().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
