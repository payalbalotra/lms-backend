import * as dotenv from 'dotenv';
dotenv.config({ path: 'development.env' });
import { sql, closeDb } from './src/db/client.ts';

async function check() {
  const jobs = await sql`SELECT * FROM jobs`;
  console.log('Jobs:', jobs);
  await closeDb();
}

check();
