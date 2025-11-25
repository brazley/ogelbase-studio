import { describe, test, expect } from 'bun:test';
import { createLogger, createRequestLogger } from '../src/logger';

describe('Logger', () => {
  test('creates logger with default level', () => {
    const logger = createLogger();
    expect(logger.level).toBe('info');
  });

  test('creates logger with custom level', () => {
    const logger = createLogger({ level: 'debug' });
    expect(logger.level).toBe('debug');
  });

  test('creates request logger with requestId', () => {
    const baseLogger = createLogger();
    const req = new Request('http://localhost:3000/test');

    const requestLogger = createRequestLogger(baseLogger, req);
    const bindings = requestLogger.bindings();

    expect(bindings.requestId).toBeDefined();
    expect(bindings.method).toBe('GET');
    expect(bindings.path).toBe('/test');
  });

  test('uses x-request-id header if provided', () => {
    const baseLogger = createLogger();
    const req = new Request('http://localhost:3000/test', {
      headers: { 'x-request-id': 'custom-id-123' }
    });

    const requestLogger = createRequestLogger(baseLogger, req);
    const bindings = requestLogger.bindings();

    expect(bindings.requestId).toBe('custom-id-123');
  });
});
