import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { sql } from './db/client.js';

const app = express();

app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Verifies the Postgres connection. Useful during initial setup.
app.get('/health/db', async (_req, res) => {
  try {
    const rows = await sql<{ ok: number }[]>`select 1 as ok`;
    res.json({ ok: true, db: rows[0]?.ok === 1 });
  } catch (err) {
    console.error('[db] connection failed:', err);
    res.status(503).json({
      ok: false,
      error: { code: 'DB_UNREACHABLE', message: 'Database connection failed' },
    });
  }
});

// Centralized error responses — never leak internal details.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
  });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`lms-backend listening on :${port}`);
});