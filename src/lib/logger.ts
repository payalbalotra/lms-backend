import pino, { type Logger, type LoggerOptions } from 'pino';

const isProd = process.env.NODE_ENV === 'production';

// Hard rules (see memory: log-preferences.md):
//   - one line per record, even when fields are present
//   - never leak req headers, cookies, JWTs, or full Error stacks
//   - default err serializer strips everything except message + code
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
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: true,
          },
        },
      }),
};

// Pin the exported type so call sites don't see a union TypeScript
// can't resolve (which happens when serializers is given inline).
export const logger: Logger = pino(options);