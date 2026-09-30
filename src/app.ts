import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { appendFileSync } from 'node:fs';
import { toNodeHandler } from 'better-auth/node';
import { sql } from './db/client.ts';
import { logger } from './config/logger.ts';
import router from './routes/v1/index.ts';
import { auth } from './auth/betterauth.ts';
import { requestId } from './shared/middleware/requestId.middleware.ts';
import { notFoundHandler } from './shared/middleware/notFound.middleware.ts';
import {
  errorConverter,
  errorHandler,
} from './shared/middleware/errorHandler.middleware.ts';
import config from './config/index.ts';

const app: Express = express();

// -------------------------
//  Request Logging
// -------------------------
app.use(requestId);

const REQUEST_LOG_FILE = 'backend.log';

function formatTimestamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const url = req.originalUrl ?? req.url;
    const code = res.statusCode;
    const level = code >= 500 ? 'ERROR' : code >= 400 ? 'WARN ' : 'INFO ';
    const line =
      `${formatTimestamp(new Date())} ${level} ` +
      `${req.method} ${url} -> ${code} (${ms}ms)`;
    console.log(line);
    try {
      appendFileSync(REQUEST_LOG_FILE, `${line}\n`);
    } catch {
      /* never throw from logging */
    }
  });
  next();
});

// -------------------------
//  Security & General Middleware
// -------------------------
app.use(
  cors({
    origin: config.cors, // using config file
    credentials: true, // required so the HttpOnly cookie crosses origins
  }),
);

app.use(helmet());
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));

// -------------------------
//  Routes
// -------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    const rows = await sql<{ ok: number }[]>`select 1 as ok`;
    res.json({ ok: true, db: rows[0]?.ok === 1 });
  } catch (err) {
    logger.error({ err }, 'db connection failed');
    res.status(503).json({
      ok: false,
      error: { code: 'DB_UNREACHABLE', message: 'Database connection failed' },
    });
  }
});

app.use('/api', router);

// -------------------------
//  Better Auth
// -------------------------
// Better Auth's built-in endpoints (must be after /api router so custom routes match first)
app.all('/api/auth/{*path}', toNodeHandler(auth));
// -------------------------
//  Error Handling
// -------------------------
app.use(notFoundHandler);
app.use(errorConverter);
app.use(errorHandler);

export default app;
