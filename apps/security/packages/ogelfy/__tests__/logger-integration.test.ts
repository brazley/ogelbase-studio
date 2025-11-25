import { describe, test, expect } from 'bun:test';
import { Ogelfy } from '../src/index';

describe('Logger Integration', () => {
  test('logger is available in route context', async () => {
    const app = new Ogelfy({
      logger: {
        level: 'info',
        prettyPrint: false
      }
    });

    let capturedLog: any = null;
    let capturedRequestId: string | null = null;

    app.get('/test', async (req, context) => {
      capturedLog = context?.log;
      capturedRequestId = context?.requestId || null;
      return { success: true };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test'
    });

    expect(response.statusCode).toBe(200);
    expect(capturedLog).toBeDefined();
    expect(capturedLog).toHaveProperty('info');
    expect(capturedLog).toHaveProperty('error');
    expect(capturedRequestId).toBeDefined();
    expect(typeof capturedRequestId).toBe('string');
  });

  test('logger respects custom x-request-id header', async () => {
    const app = new Ogelfy({
      logger: {
        level: 'info',
        prettyPrint: false
      }
    });

    let capturedRequestId: string | null = null;

    app.get('/test', async (req, context) => {
      capturedRequestId = context?.requestId || null;
      return { success: true };
    });

    const customRequestId = 'test-request-123';
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-request-id': customRequestId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(capturedRequestId).toBe(customRequestId);
  });

  test('logger works without explicit configuration', async () => {
    const app = new Ogelfy();

    let capturedLog: any = null;

    app.get('/test', async (req, context) => {
      capturedLog = context?.log;
      return { success: true };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test'
    });

    expect(response.statusCode).toBe(200);
    expect(capturedLog).toBeDefined();
    expect(capturedLog.level).toBe('info'); // Default level
  });
});
