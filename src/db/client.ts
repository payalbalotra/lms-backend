import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set in .env');
}

const isProd = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Postgres connection pool
// ---------------------------------------------------------------------------
// Tuned for a single-process dev/staging server. For multi-process or higher
// traffic, raise `max` per process and/or run multiple processes behind a
// load balancer.
//
// All timeouts are in seconds — that's what the postgres.js driver expects.
// ---------------------------------------------------------------------------
export const sql = postgres(url, {
  max: isProd ? 20 : 10, // total connections per process
  idle_timeout: 30, // close connections idle longer than this (s)
  connect_timeout: 10, // fail connect() if it takes longer (s)
  max_lifetime: 60 * 30, // recycle connections every 30 min (s) — avoids stale TCP
  // ssl: isProd ? 'require' : false, // uncomment when using managed Postgres
  prepare: false, // disable server-side prepared statements (PgBouncer compat)
});

export const db = drizzle(sql, { schema });
export type Db = typeof db;

/**
 * Graceful pool shutdown. Called from SIGTERM/SIGINT handlers so in-flight
 * queries finish before the process exits.
 */
export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}