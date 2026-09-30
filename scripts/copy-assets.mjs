import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// `tsc` only emits .js for .ts inputs, so non-TS assets that are read at
// runtime (the OpenAPI yaml specs in src/shared/schemas) never reach dist/.
// This mirrors them into dist/ after every build.
const ASSET_EXTENSIONS = ['.yaml', '.yml'];

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const srcDir = path.join(rootDir, 'src');
const outDir = path.join(rootDir, 'dist');

let copied = 0;

const copyAssets = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const from = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      copyAssets(from);
      continue;
    }

    if (!ASSET_EXTENSIONS.includes(path.extname(entry.name))) continue;

    const to = path.join(outDir, path.relative(srcDir, from));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied += 1;
  }
};

copyAssets(srcDir);

// eslint-disable-next-line no-undef
console.log(`Copied ${copied} asset file(s) from src/ to dist/`);
