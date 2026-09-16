import pino, { type Logger, type LoggerOptions } from 'pino';

const isProd = process.env.NODE_ENV === 'production';

// Per-request lines are formatted inline in server.ts (console.log + file);
// pino here covers everything else. See memory: log-preferences.md for the
// hard rules (one record per line, no headers / cookies / JWTs, err stripped
// to { msg, code }).
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
  ...(isProd
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: true,
          },
        },
      }
    : {}),
};

export const logger: Logger = isProd
  ? pino(options)
  : pino(options, pino.destination({ sync: true }));