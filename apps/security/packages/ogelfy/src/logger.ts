import pino, { Logger } from 'pino';

export interface LoggerOptions {
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  prettyPrint?: boolean;
  redact?: string[];
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const config: any = {
    level: options.level || 'info',
    redact: options.redact || [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'secret'
    ]
  };

  if (options.prettyPrint) {
    config.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
      }
    };
  }

  return pino(config);
}

export function createRequestLogger(baseLogger: Logger, req: Request): Logger {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const url = new URL(req.url);

  return baseLogger.child({
    requestId,
    method: req.method,
    path: url.pathname
  });
}
