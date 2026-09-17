// Standalone harness for end-to-end input/output inspection of the
// document-extract pipeline. Calls the internal `extractProcedureFromBuffer`
// entry point with the local file bytes — no R2 round-trip, no auth, no
// HTTP. Driven with DOC_EXTRACT_DUMP=1 so the service prints the prompt
// and raw response.
//
// Usage:  cd lms-backend && DOC_EXTRACT_DUMP=1 \
//         pnpm tsx scripts/test-document-extract.ts ../recipe.txt

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { _internal } from '../src/services/document-extract';

async function main(): Promise<void> {
  const fileArg = process.argv[2];
  if (!fileArg) {
    throw new Error('Usage: tsx scripts/test-document-extract.ts <file-path>');
  }
  const fullPath = resolve(fileArg);
  const body = readFileSync(fullPath);
  const contentType = 'text/plain';

  console.log(`[harness] reading ${fullPath}`);
  console.log(`[harness] body length=${body.length} bytes`);
  console.log(`[harness] content-type=${contentType}`);

  const result = await _internal.extractProcedureFromBuffer(
    body,
    contentType,
    'recipe',
  );

  console.log('[harness] validated extraction:');
  console.log(JSON.stringify(result, null, 2));
  console.log('[harness] block count:', result.blocks?.length ?? 0);
  console.log('[harness] title:', JSON.stringify(result.title));
  console.log('[harness] recipe.ingredients count:', result.recipe?.ingredients?.length ?? 0);
  console.log('[harness] recipe.steps count:', result.recipe?.steps?.length ?? 0);
}

main().catch((err) => {
  console.error('[harness] failed:', err);
  process.exit(1);
});
