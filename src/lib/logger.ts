import pino, { type Logger, type LoggerOptions } from 'pino';

const isProd = process.env.NODE_ENV === 'production';

// Hard rules (see memory: log-preferences.md):
//   - one line per record, even when fields are present
//   - never leak req headers, cookies, JWTs, or full Error stacks
//   - default err serializer strips everything except message + code
//
// pino-pretty is used in BOTH dev and prod so per-request lines are
// readable on the terminal (not raw JSON). `sync: true` inside `options`
// disables the worker-thread transport and writes synchronously through
// the main thread, which is the path that survives tsx-watch's reload
// lifecycle on Windows. `fs.appendFileSync` in server.ts is the safety
// net if the stdout pipe ever drops again.
const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  serializers: {
    err: (err: unknown) => {
      if (err instanceof Error) {
        const code = (err as unknown as { code?: unknown }).code;
        return {
          msg: err.message,
          ...(typeof code === 'string' ? { code } : {}),
        };
      }
      return { msg: String(err) };
    },
  },
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: !isProd,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: true,
      sync: true,
    },
  },
};

// Pin the exported type so call sites don't see a union TypeScript
// can't resolve (which happens when serializers is given inline).
export const logger: Logger = pino(options);