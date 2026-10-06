import { sql } from '../src/db/client.ts';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'development.env' });

async function check() {
  try {
    const res = await sql`SELECT * FROM "user" LIMIT 1;`;
    console.log('Success:', res);
  } catch (e) {
    console.error('DB Error:', e.message);
  } finally {
    process.exit(0);
  }
}
check();
