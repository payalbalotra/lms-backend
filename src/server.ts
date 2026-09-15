import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { sql, closeDb } from './db/client.js';
import { logger } from './lib/logger.js';
import apiRouter from './routes/index.js';
import { auth } from './auth/better-auth.js';
import { requestId } from './middleware/request-id.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();


app.set('trust proxy', 1);

app.use(helmet());

const allowedOrigins =
  process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean) ??
  ['http://localhost:3000'];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // required so the HttpOnly cookie crosses origins
  }),
);


app.use(express.json({ limit: '256kb' }));

// requestId is here only to set the X-Request-Id response header;
// the value itself is never logged (see /DESIGN memory: log-preferences.md).
app.use(requestId);

// One log line per request, written when the response finishes.
// This is the ONLY place request logging happens — pino-http is gone
// so there is no req.log to accidentally dump headers/cookies.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const url = req.originalUrl ?? req.url;
    const line = `${req.method} ${url} -> ${res.statusCode} (${ms}ms)`;
    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.info(line);
  });
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/health/db', async (_req, res) => {
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


app.use('/api', apiRouter);

// Better Auth's built-in endpoints — /api/auth/sign-in/email, /api/auth/sign-out,
// /api/auth/get-session, etc. Mounted AFTER /api so our specific routes
// (/api/auth/me, /api/auth/activate, /api/auth/invites/:token) take precedence:
// when apiRouter's auth router matches a path, it handles the response and does
// not call next(). Otherwise Express falls through to this catch-all.
//
// Express 5 + path-to-regexp 8 require named wildcards — the bare `*` is rejected.
app.all('/api/auth/{*splat}', toNodeHandler(auth));


app.use(notFoundHandler);
app.use(errorHandler);


const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => {
  logger.info({ port }, 'lms-backend listening');
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutdown initiated');

  // Stop accepting new connections; existing requests get to finish.
  server.close(() => logger.info('http server closed'));

  // Close the pool. sql.end() waits for in-flight queries up to its timeout.
  await closeDb();
  logger.info('db pool closed');

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
