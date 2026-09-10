import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { sql, closeDb } from './db/client.js';
import { logger } from './lib/logger.js';
import apiRouter from './routes/index.js';
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

app.use(requestId);

app.use(requestId);

app.use(
  pinoHttp({
    logger,
    autoLogging: false,
  }),
);

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

app.get('/health/db', async (req, res) => {
  try {
    const rows = await sql<{ ok: number }[]>`select 1 as ok`;
    res.json({ ok: true, db: rows[0]?.ok === 1 });
  } catch (err) {
    req.log.error({ err }, 'db connection failed');
    res.status(503).json({
      ok: false,
      error: { code: 'DB_UNREACHABLE', message: 'Database connection failed' },
    });
  }
});


app.use('/api', apiRouter);


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
