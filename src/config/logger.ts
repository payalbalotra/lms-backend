import pino, { type LoggerOptions } from 'pino';
import config from './env.ts';

// Per-request lines are formatted inline in app.ts (console.log); pino here
// covers everything else. Rules: one record per line, never log headers,
// cookies or tokens, and errors are stripped to { msg, code }.
// pino-pretty runs in both dev and prod so the wire-format is identical —
// no surprises when promoting a dev repro to a real environment.
const options: LoggerOptions = {
  level: config.logLevel,
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
