import pino, { type LoggerOptions } from 'pino';

// Per-request lines are formatted inline in server.ts (console.log + file);
// pino here covers everything else. See memory: log-preferences.md for the
// hard rules (one record per line, no headers / cookies / JWTs, err stripped
// to { msg, code }).
// pino-pretty runs in both dev and prod so the wire-format is identical —
// no surprises when promoting a dev repro to a real environment.
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
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: true,
    },
  },
};

export const logger = pino(options);
