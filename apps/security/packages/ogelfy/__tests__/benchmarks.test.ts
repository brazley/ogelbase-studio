import { describe, test, expect } from 'bun:test';
import { Ogelfy } from '../src/index';

describe('Performance Benchmarks', () => {
  test('simple route handles 1000 requests under 100ms', async () => {
    const app = new Ogelfy();
    app.get('/test', async () => ({ ok: true }));

    const start = Date.now();
    const promises = [];

    for (let i = 0; i < 1000; i++) {
      promises.push(app.inject({ method: 'GET', url: '/test' }));
    }

    await Promise.all(promises);
    const duration = Date.now() - start;

    console.log(`1000 requests in ${duration}ms (${Math.round(1000/(duration/1000))} req/sec)`);
    expect(duration).toBeLessThan(100);
  });

  test('memory stays stable over 10k requests', async () => {
    const app = new Ogelfy();
    app.get('/test', async () => ({ data: 'x'.repeat(100) }));

    const baseline = process.memoryUsage().heapUsed;

    for (let i = 0; i < 10000; i++) {
      await app.inject({ method: 'GET', url: '/test' });
    }

    const final = process.memoryUsage().heapUsed;
    const growthMB = (final - baseline) / 1024 / 1024;

    console.log(`Memory growth: ${growthMB.toFixed(2)}MB`);
    expect(growthMB).toBeLessThan(50);
  });
});
