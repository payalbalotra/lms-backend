import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set in .env');
}

// Single shared client. `max: 1` is fine for CLI / single-process dev.
// Increase for production with a connection pool sized to your workload.
const sql = postgres(url, { max: 10 });

export const db = drizzle(sql);
export type Db = typeof db;
export { sql };