import { config } from 'dotenv';
config();
import { db } from './src/db/client.ts';
import { session } from './src/db/schema.ts';

import { desc } from 'drizzle-orm';

async function run() {
  const s = await db
    .select()
    .from(session)
    .orderBy(desc(session.createdAt))
    .limit(5);
  console.log(s);
  process.exit(0);
}
run();
